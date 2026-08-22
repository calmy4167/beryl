<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { SCENES, currentSceneId, applySceneTheme } from '@/core/scenes'
import { MODS } from '@/core/modules'
import { store, lsSet, lsRemove } from '@/core/storage'
import { clearSession } from '@/core/auth'
import { clearDb, flushPendingDbWrites, getDbStatus, type DbRuntimeStatus } from '@/core/db'
import { BACKUP_SENSITIVE_KEYS, createDurableBackup, parseBackup } from '@/core/backup'
import { createDurableEntityMigrationPlan, createEntityMigrationPlan, migrationBackupExists, rollbackMigration, saveMigrationBackup, summarizeEntityConflicts, type EntityMigrationPlan } from '@/core/entity-migration'
import { pullEntityChanges, pushEntityChanges } from '@/core/entity-sync'
import { apiFetch } from '@/core/api/client'
import { DEFAULT_API_BASE_URL, preferredCloudUrl, sync, cloudConnect, s3Connect, fileConnect, disconnect, syncNow, diagSync, type SyncDiag } from '@/core/sync'
import { listRealityDocuments } from '@/domain/reality'
import { exportCurrentOpenWorkspace } from '@/core/content/open-workspace'
import { createFileSystemVaultAdapter, type FileSystemDirectoryHandleLike, type VaultAdapter } from '@/core/content/obsidian-adapter'
import { applyVaultSyncPlan, buildVaultSyncPlan, type VaultAssetDecision, type VaultEntityDecision, type VaultFieldDecision, type VaultSyncPlan } from '@/core/content/vault-sync'

const router = useRouter()
const scene = ref(currentSceneId())
const countsVersion = ref(0)
const persistenceStatus = ref<DbRuntimeStatus>(getDbStatus())
const persistenceBusy = ref(false)
let persistenceTimer: number | undefined

const persistenceStatusText = computed(() => {
  const status = persistenceStatus.value
  if (status.state === 'ready') return `IndexedDB 已就绪 · 已恢复 ${status.restoredKeys} 个键`
  if (status.state === 'recovering') return 'IndexedDB 正在恢复本地持久层…'
  if (status.state === 'degraded') return `IndexedDB 暂不可用 · ${status.lastError || '等待下次重试'}`
  return 'IndexedDB 尚未完成初始化'
})

async function retryPersistence() {
  persistenceBusy.value = true
  try {
    await flushPendingDbWrites()
    persistenceStatus.value = getDbStatus()
    if (persistenceStatus.value.pendingWrites === 0 && persistenceStatus.value.available) ElMessage.success('持久层已完成重试')
    else ElMessage.warning(`仍有 ${persistenceStatus.value.pendingWrites} 项等待持久化`)
  } finally { persistenceBusy.value = false }
}

const counts = computed(() => ({
  // 让同步事件和本地操作可显式触发重新读取，而不是依赖非响应式 localStorage。
  _version: countsVersion.value,
  tasks: listRealityDocuments({ types: ['task'] }).length,
  finance: listRealityDocuments({ types: ['transaction'] }).length,
  habits: listRealityDocuments({ types: ['habit'] }).length,
  posts: listRealityDocuments({ types: ['post'] }).length
}))
function refreshCounts() { countsVersion.value++ }

function switchScene(id: string) {
  scene.value = id
  store.set('scene', id)
  applySceneTheme(id)
  ElMessage.success(`已切换至「${SCENES[id].name}」场景`)
  refreshCounts()
}

async function exportData() {
  const out = await createDurableBackup()
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `beryl_${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
  ElMessage.success('数据已导出 📤')
}

function importData(file: File) {
  const reader = new FileReader()
  reader.onload = async () => {
    try {
      const incoming = parseBackup(JSON.parse(String(reader.result)))
      const previous: Record<string, string | null> = {}
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('b_') && !BACKUP_SENSITIVE_KEYS.has(k)) previous[k] = localStorage.getItem(k)
      }
      try {
        Object.keys(previous).filter(k => !(k in incoming)).forEach(k => lsRemove(k))
        for (const [k, v] of Object.entries(incoming)) if (!lsSet(k, v)) throw new Error('write')
        await flushPendingDbWrites()
      } catch (error) {
        Object.keys(previous).forEach(k => {
          const value = previous[k]
          if (value == null) lsRemove(k)
          else lsSet(k, value)
        })
        throw error
      }
      ElMessage.success('导入成功，正在刷新…')
      setTimeout(() => location.reload(), 600)
    } catch {
      ElMessage.error('导入失败：文件格式错误或写入失败')
    }
  }
  reader.readAsText(file)
}

let resetArmed = false
let resetTimer: number | undefined
function resetData() {
  if (!resetArmed) {
    resetArmed = true
    ElMessage.warning('再次点击确认清空所有数据')
    resetTimer = window.setTimeout(() => { resetArmed = false }, 3000)
    return
  }
  clearTimeout(resetTimer)
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('b_')) keys.push(k)
  }
  void (async () => {
    keys.forEach(k => localStorage.removeItem(k))
    await clearDb()
    location.reload()
  })()
}

function logout() {
  clearSession()
  router.replace('/login')
  ElMessage.success('已退出登录')
}

function goPass() {
  router.push({ path: '/pass', query: { mode: 'change' } })
}

function openImport() {
  const el = document.getElementById('file-import') as HTMLInputElement | null
  if (el) el.click()
}

function onImportChange(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (f) importData(f)
  input.value = ''
}

/* ---------- 同步配置 ---------- */
const cloudDlg = ref(false)
const cloudUrl = ref(DEFAULT_API_BASE_URL)
const cloudKey = ref('')
const s3Dlg = ref(false)
const s3Cfg = ref({ endpoint: '', bucket: '', region: '', ak: '', sk: '' })
const connecting = ref(false)

/* 打开对话框时回填已保存的配置（不再每次重新填写） */
function openCloudDlg() {
  if (sync.saved.cloud) {
    cloudUrl.value = preferredCloudUrl(sync.saved.cloud.url)
    cloudKey.value = sync.saved.cloud.key || ''
  } else {
    cloudUrl.value = DEFAULT_API_BASE_URL
  }
  cloudDlg.value = true
}
function openS3Dlg() {
  if (sync.saved.s3) {
    s3Cfg.value = { ...sync.saved.s3 }
  }
  s3Dlg.value = true
}

const syncStatus = computed(() => {
  if (sync.phase === 'syncing') return { color: 'var(--scene)', text: '☁️ 正在同步…', actions: true }
  if (sync.phase === 'dirty') return { color: 'var(--c-warn)', text: '⚠️ 本地有待同步变更', actions: true }
  if (sync.phase === 'offline') return { color: 'var(--c-warn)', text: '⌁ 当前离线，待恢复网络后同步', actions: true }
  if (sync.phase === 'error') return { color: 'var(--c-danger)', text: `⚠️ 同步失败：${sync.lastError || '网络或配置错误'}`, actions: true }
  if (sync.mode === 'cloud' && sync.cloud) return { color: 'var(--c-success)', text: `☁️ 已连接云端（增量同步 + AES-GCM 加密）：${sync.cloud.url}`, actions: true }
  if (sync.mode === 's3' && sync.s3) return { color: 'var(--c-success)', text: `🗄️ 已连接对象存储：${sync.s3.endpoint}/${sync.s3.bucket}`, actions: true }
  if (sync.mode === 'file') return { color: 'var(--c-success)', text: `🔄 已连接本地文件：${sync.fileName || '数据文件'}`, actions: true }
  if (sync.saved.cloud) return { color: 'var(--c-warn)', text: '🟡 已保存 Cloudflare 配置（未连接）', actions: false }
  if (sync.saved.s3) return { color: 'var(--c-warn)', text: '🟡 已保存 S3 配置（未连接）', actions: false }
  return { color: 'var(--c-text-3)', text: '未连接 · 数据仅存于本浏览器', actions: false }
})

async function doCloudConnect() {
  connecting.value = true
  const ok = await cloudConnect(cloudUrl.value.trim(), cloudKey.value)
  connecting.value = false
  if (ok) { cloudDlg.value = false; ElMessage.success('已连接云端 ☁️') }
  else ElMessage.error(`连接失败：${sync.lastError || '请检查地址、同步密码或 Worker 配置'}`)
}
async function doS3Connect() {
  connecting.value = true
  const ok = await s3Connect({ ...s3Cfg.value })
  connecting.value = false
  if (ok) { s3Dlg.value = false; ElMessage.success('已连接对象存储 🗄️') }
  else ElMessage.error('连接失败：请检查配置与 CORS')
}
const fsOk = 'showOpenFilePicker' in window
async function doFileConnect() {
  try {
    const picker = (window as unknown as { showOpenFilePicker?: (o?: object) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker
    if (!picker) return
    const [h] = await picker({ types: [{ description: 'Beryl 数据文件', accept: { 'application/json': ['.json'] } }] })
    const ok = await fileConnect(h)
    if (ok) ElMessage.success('已连接本地文件 🔄')
    else ElMessage.error('连接失败：文件格式不正确')
  } catch { /* 用户取消 */ }
}
function doDisconnect() { disconnect(); ElMessage.success('已断开同步（数据仍在本机）') }

/* ---------- Obsidian Vault 同步 ---------- */
const vaultAdapter = ref<VaultAdapter | null>(null)
const vaultName = ref('')
const vaultPlan = ref<VaultSyncPlan | null>(null)
const vaultDecisions = ref<Record<string, VaultEntityDecision | VaultAssetDecision>>({})
const vaultBusy = ref(false)
const vaultReport = ref('')

function defaultVaultDecisions(plan: VaultSyncPlan): Record<string, VaultEntityDecision | VaultAssetDecision> {
  const decisions: Record<string, VaultEntityDecision | VaultAssetDecision> = {}
  plan.conflicts.forEach(conflict => { decisions[conflict.calmyId] = 'keep-vault' })
  plan.vaultOnlyEntities.forEach(entity => { decisions[entity.calmyId] = 'keep-vault' })
  plan.vaultDeletedEntities.forEach(entity => { decisions[entity.calmyId] = 'keep-vault' })
  plan.assetConflicts.forEach(conflict => { decisions[`asset:${conflict.path}`] = 'keep-vault' })
  plan.vaultOnlyAssets.forEach(asset => { decisions[`asset:${asset.path}`] = 'keep-vault' })
  return decisions
}

async function connectVault() {
  const picker = (window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandleLike> }).showDirectoryPicker
  if (!picker) { ElMessage.warning('当前浏览器不支持 File System Access API'); return }
  try {
    const root = await picker()
    vaultAdapter.value = createFileSystemVaultAdapter(root)
    vaultName.value = (root as unknown as { name?: string }).name || 'Obsidian Vault'
    vaultPlan.value = null
    vaultReport.value = `已连接 ${vaultName.value}，请扫描差异`
    ElMessage.success('已连接 Obsidian Vault')
  } catch { /* 用户取消 */ }
}

async function scanVault() {
  if (!vaultAdapter.value) { ElMessage.warning('请先选择 Obsidian Vault'); return }
  vaultBusy.value = true
  try {
    const plan = await buildVaultSyncPlan(vaultAdapter.value, exportCurrentOpenWorkspace())
    vaultPlan.value = plan
    vaultDecisions.value = defaultVaultDecisions(plan)
    vaultReport.value = plan.issues.length
      ? `扫描被阻断：${plan.issues.join('；')}`
      : `新增 ${plan.addedEntities.length} · 不变 ${plan.unchangedEntities.length} · 冲突 ${plan.conflicts.length} · Vault 独有 ${plan.vaultOnlyEntities.length} · Vault tombstone ${plan.vaultDeletedEntities.length}`
  } catch (error) { vaultReport.value = `扫描失败：${error instanceof Error ? error.message : 'Vault 读取失败'}` }
  finally { vaultBusy.value = false }
}

function conflictMode(id: string): string {
  const decision = vaultDecisions.value[id]
  if (typeof decision === 'object' && decision.mode === 'merge') return 'merge'
  return decision === 'use-local' ? 'use-local' : 'keep-vault'
}

function fieldMode(id: string, key: string): VaultFieldDecision {
  const decision = vaultDecisions.value[id]
  if (typeof decision === 'object' && decision.mode === 'merge') return decision.fields[key] || 'use-local'
  return decision === 'use-local' ? 'use-local' : 'keep-vault'
}

function setConflictMode(id: string, mode: string) {
  if (mode === 'merge') {
    const conflict = vaultPlan.value?.conflicts.find(item => item.calmyId === id)
    vaultDecisions.value[id] = { mode: 'merge', fields: Object.fromEntries((conflict?.fields || []).map(field => [field.key, 'use-local' as const])) }
  } else vaultDecisions.value[id] = mode as VaultEntityDecision
}

function setFieldMode(id: string, key: string, mode: VaultFieldDecision) {
  const current = vaultDecisions.value[id]
  const fields = typeof current === 'object' && current.mode === 'merge' ? { ...current.fields } : {}
  fields[key] = mode
  vaultDecisions.value[id] = { mode: 'merge', fields }
}

async function applyVault() {
  if (!vaultAdapter.value || !vaultPlan.value) { ElMessage.warning('请先连接并扫描 Vault'); return }
  vaultBusy.value = true
  try {
    const result = await applyVaultSyncPlan(vaultAdapter.value, vaultPlan.value, vaultDecisions.value)
    if (result.missingDecisions.length) {
      vaultReport.value = `仍需决策：${result.missingDecisions.join('、')}`
      ElMessage.warning('请先完成所有冲突与删除决策')
    } else if (result.errors.length) {
      vaultReport.value = `写回失败：${result.errors.join('；')}`
      ElMessage.error('Vault 写回失败')
    } else {
      vaultReport.value = `已写回 ${result.sync?.writtenPaths.length || 0} 个文件，未变更 ${result.sync?.unchangedPaths.length || 0} 个，删除 ${result.sync?.deletedPaths.length || 0} 个；实体 tombstone ${result.deletedEntityIds.length} 个`
      ElMessage.success('Vault 同步完成')
      await scanVault()
    }
  } catch (error) { vaultReport.value = `写回失败：${error instanceof Error ? error.message : 'Vault 写入失败'}` }
  finally { vaultBusy.value = false }
}

/* 同步诊断 */
const diag = ref<SyncDiag | null>(null)
const diagLoading = ref(false)
const migrationPlan = ref<EntityMigrationPlan | null>(null)
const migrationBusy = ref(false)
const migrationReport = ref('')
const kvStatus = ref<{ kvCompatEnabled: boolean; kvBound: boolean; legacyKvPresent: boolean; d1Records: number; d1Auth: number } | null>(null)
async function runDiag() {
  diagLoading.value = true
  try { diag.value = await diagSync() }
  catch { diag.value = null }
  diagLoading.value = false
}
async function prepareEntityMigration() {
  migrationBusy.value = true
  try {
    migrationPlan.value = await createDurableEntityMigrationPlan()
    migrationReport.value = `可迁移 ${migrationPlan.value.records.length} 个实体${migrationPlan.value.skipped.length ? `，跳过 ${migrationPlan.value.skipped.length} 项异常数据` : ''}`
  } finally { migrationBusy.value = false }
}
async function scanEntityConflicts() {
  if (!sync.cloud) { ElMessage.warning('请先连接 Cloudflare'); return }
  migrationBusy.value = true
  try {
    const plan = migrationPlan.value || await createDurableEntityMigrationPlan()
    const remote = []
    let cursor = { ts: 0, device: '', entity: '', entityId: '' }
    do {
      const page = await pullEntityChanges(sync.cloud.url, sync.cloud.key, cursor)
      remote.push(...page.records); cursor = page.cursor
      if (!page.hasMore) break
    } while (true)
    const result = summarizeEntityConflicts(plan.records, remote)
    migrationReport.value = `远端 ${remote.length} 个实体，冲突 ${result.conflicts} 个（远端较新 ${result.newerRemote}，本地较新 ${result.newerLocal}）`
  } catch (error) { migrationReport.value = `冲突扫描失败：${error instanceof Error ? error.message : '请求失败'}` }
  finally { migrationBusy.value = false }
}
async function pushEntityMigration() {
  if (!sync.cloud) { ElMessage.warning('请先连接 Cloudflare'); return }
  const plan = migrationPlan.value || createEntityMigrationPlan()
  if (!saveMigrationBackup(plan)) { ElMessage.error('迁移前备份写入失败，已取消'); return }
  migrationBusy.value = true
  try {
    const ok = await pushEntityChanges(sync.cloud.url, sync.cloud.key, plan.records.map(record => ({ id: `${record.device}:${record.updatedAt}:${record.entityId}`, entity: record.entity, entityId: record.entityId, operation: 'create', updatedAt: record.updatedAt, device: record.device, value: record.value })))
    migrationReport.value = ok ? `已加密推送 ${plan.records.length} 个实体；键级同步仍保持不变` : '实体迁移推送失败'
  } catch (error) { migrationReport.value = `实体迁移失败：${error instanceof Error ? error.message : '请求失败'}` }
  finally { migrationBusy.value = false }
}
function rollbackEntityMigration() {
  if (!migrationBackupExists()) { ElMessage.warning('没有可用的迁移前备份'); return }
  if (rollbackMigration()) { migrationReport.value = '已恢复迁移前本地快照；云端实体记录未删除，默认键级同步未切换'; ElMessage.success('本地迁移已回滚') }
  else ElMessage.error('回滚失败，本地快照未能完整恢复')
}
async function runKvStatus() {
  if (!sync.cloud) { ElMessage.warning('请先连接 Cloudflare'); return }
  migrationBusy.value = true
  try {
    const response = await apiFetch(sync.cloud.url, '/api/kv-status', { headers: { Authorization: 'Bearer ' + sync.cloud.key } })
    if (!response.ok) throw new Error(`kv-status:${response.status}`)
    kvStatus.value = await response.json()
    migrationReport.value = kvStatus.value?.legacyKvPresent ? 'KV 仍有遗留数据，暂不能解绑' : 'KV 未发现遗留数据，可进入解绑评估'
  } catch (error) { migrationReport.value = `KV 状态检查失败：${error instanceof Error ? error.message : '请求失败'}` }
  finally { migrationBusy.value = false }
}

const now = new Date()
function onDataSynced() { refreshCounts() }
onMounted(() => {
  applySceneTheme(scene.value)
  window.addEventListener('beryl-data-synced', onDataSynced)
  persistenceTimer = window.setInterval(() => { persistenceStatus.value = getDbStatus() }, 1500)
})
onUnmounted(() => {
  window.removeEventListener('beryl-data-synced', onDataSynced)
  if (persistenceTimer) window.clearInterval(persistenceTimer)
})
</script>

<template>
  <div>
    <div class="head">
      <el-button circle text aria-label="返回工作台" @click="router.push('/app/home')">←</el-button>
      <span class="mod-icon" aria-hidden="true">⚙️</span>
      <h2 class="font-title mod-name">后台管理</h2>
    </div>

    <!-- 数据统计 -->
    <div class="grid4">
      <div class="beryl-card hoverable card"><p class="label">任务数</p><p class="font-title value">{{ counts.tasks }}</p></div>
      <div class="beryl-card hoverable card"><p class="label">财务记录</p><p class="font-title value">{{ counts.finance }}</p></div>
      <div class="beryl-card hoverable card"><p class="label">习惯数</p><p class="font-title value">{{ counts.habits }}</p></div>
      <div class="beryl-card hoverable card"><p class="label">文章数</p><p class="font-title value">{{ counts.posts }}</p></div>
    </div>

    <!-- 场景切换 -->
    <div class="beryl-card hoverable block">
      <h3 class="font-title sec">场景切换</h3>
      <div class="pills">
        <button
          v-for="s in SCENES"
          :key="s.id"
          class="pill"
          :style="scene === s.id ? { color: s.color, borderColor: s.color + '66', background: s.color + '1a' } : {}"
          :aria-pressed="scene === s.id"
          :aria-label="`切换至${s.name}场景`"
          @click="switchScene(s.id)"
        ><span aria-hidden="true">{{ s.icon }}</span> {{ s.name }}</button>
      </div>
      <p class="mods-line">当前场景模块：{{ SCENES[scene].mods.map(m => MODS[m].icon + ' ' + MODS[m].name).join(' · ') }}</p>
    </div>

    <!-- 数据管理 -->
    <div class="beryl-card hoverable block">
      <h3 class="font-title sec">数据管理</h3>
      <div class="btns">
        <el-button @click="exportData">📤 导出</el-button>
        <el-button @click="openImport">📥 导入</el-button>
        <input id="file-import" type="file" accept="application/json,.json" aria-label="选择要导入的 JSON 数据文件" style="display:none" @change="onImportChange" />
        <el-button type="danger" plain @click="resetData">🗑️ 重置</el-button>
      </div>
      <div class="persistence-status" role="status" aria-live="polite" aria-atomic="false" :style="{ color: persistenceStatus.state === 'degraded' ? 'var(--c-danger)' : persistenceStatus.state === 'ready' ? 'var(--c-success)' : 'var(--c-text-2)' }">
        <p id="persistence-status-text" class="info"><span aria-hidden="true">💾</span> {{ persistenceStatusText }}</p>
        <p class="info">待重试写入：{{ persistenceStatus.pendingWrites }} · 最近镜像：{{ persistenceStatus.lastMirrorAt ? new Date(persistenceStatus.lastMirrorAt).toLocaleString() : '暂无' }}</p>
        <el-button size="small" aria-describedby="persistence-status-text" :loading="persistenceBusy" @click="retryPersistence">重试持久化</el-button>
      </div>
    </div>

    <!-- 系统信息 -->
    <div class="beryl-card hoverable block">
      <h3 class="font-title sec">系统信息</h3>
      <p class="info">版本：<span>v2.1.0（阶段 2–5：IndexedDB / 增量同步 / 加密 / PWA）</span></p>
      <p class="info">数据版本：<span>4</span></p>
      <p class="info">当前场景：<span :style="{ color: SCENES[scene].color }">{{ SCENES[scene].icon }} {{ SCENES[scene].name }}</span></p>
      <p class="info">日期：<span>{{ now.getFullYear() }} 年 {{ now.getMonth() + 1 }} 月 {{ now.getDate() }} 日</span></p>
      <div class="btns">
        <el-button @click="goPass">🔑 修改密码</el-button>
        <el-button type="danger" plain @click="logout">🚪 退出登录</el-button>
      </div>
    </div>

    <!-- 数据同步 -->
    <div class="beryl-card hoverable block">
      <h3 class="font-title sec">🔄 数据同步</h3>
      <p class="info" role="status" aria-live="polite" :style="{ color: syncStatus.color }">{{ syncStatus.text }}</p>
      <div class="btns">
        <template v-if="syncStatus.actions">
          <el-button @click="syncNow()">💾 立即同步</el-button>
          <el-button type="danger" plain @click="doDisconnect">断开连接</el-button>
        </template>
        <template v-else>
          <el-button @click="openCloudDlg">☁️ Cloudflare</el-button>
          <el-button @click="openS3Dlg">🗄️ 国内云(S3)</el-button>
          <el-button v-if="fsOk" @click="doFileConnect">📂 本地文件</el-button>
        </template>
      </div>
      <p class="mods-line">本地变更 0.8s 自动上传 · 前台每 5 秒自动拉取 · 切回页面立即拉取 · 云端增量 LWW 合并 + 加密</p>
      <div class="btns" style="margin-top: 8px">
        <el-button size="small" :loading="diagLoading" @click="runDiag">🔍 同步诊断</el-button>
      </div>
      <div v-if="diag" class="diag" role="region" aria-label="同步诊断结果">
        <p class="diag-line">云端地址：{{ diag.url }}</p>
        <p class="diag-line">游标：pull={{ diag.pullCursor }} · localTs={{ diag.localTs }} · push={{ diag.pushCursor }} · dirty={{ diag.dirty }}</p>
        <p class="diag-line">云端记录数：{{ diag.cloudRecords }}（-1=未连接 / -2=旧Worker / -3=请求失败）· 云端maxTs={{ diag.cloudMaxTs }}</p>
        <p class="diag-line">上次推送：{{ diag.lastSync }}</p>
        <p class="diag-line diag-raw">本地 b_inbox 值：{{ diag.localInboxSample }}</p>
      </div>
    </div>

    <!-- Obsidian Vault：显式差异预览与决策后写回 -->
    <div class="beryl-card hoverable block">
      <h3 class="font-title sec">🗃️ Obsidian Vault</h3>
      <p class="info">{{ vaultName ? `当前 Vault：${vaultName}` : '未连接 Vault' }}</p>
      <p class="info">只扫描和写入 Calmy Open Format 文件；Vault 独有实体的删除必须明确选择，并会留下 tombstone。</p>
      <div class="btns">
        <el-button @click="connectVault">选择 Vault</el-button>
        <el-button :disabled="!vaultAdapter" :loading="vaultBusy" @click="scanVault">扫描差异</el-button>
        <el-button type="primary" :disabled="!vaultPlan" :loading="vaultBusy" @click="applyVault">应用同步</el-button>
      </div>
      <p v-if="vaultReport" class="info diag-raw" role="status" aria-live="polite" aria-atomic="true">{{ vaultReport }}</p>
      <div v-if="vaultPlan && vaultPlan.conflicts.length" class="vault-list">
        <p class="mods-line">字段级冲突（可选择保留 Vault、本地版本，或逐字段合并）</p>
        <div v-for="conflict in vaultPlan.conflicts" :key="conflict.calmyId" class="vault-item">
          <div class="vault-item-head">
            <span>{{ conflict.calmyType }} · {{ conflict.calmyId }}</span>
            <el-select :model-value="conflictMode(conflict.calmyId)" :aria-label="`冲突 ${conflict.calmyId} 的处理方式`" size="small" @change="setConflictMode(conflict.calmyId, String($event))">
              <el-option label="保留 Vault" value="keep-vault" />
              <el-option label="使用本地" value="use-local" />
              <el-option label="逐字段合并" value="merge" />
            </el-select>
          </div>
          <div v-if="conflictMode(conflict.calmyId) === 'merge'" class="vault-fields">
            <div v-for="field in conflict.fields" :key="field.key" class="vault-field">
              <span>{{ field.key }}</span>
              <el-select :model-value="fieldMode(conflict.calmyId, field.key)" :aria-label="`冲突 ${conflict.calmyId} 的字段 ${field.key} 处理方式`" size="small" @change="setFieldMode(conflict.calmyId, field.key, String($event) as VaultFieldDecision)">
                <el-option label="Vault" value="keep-vault" />
                <el-option label="本地" value="use-local" />
              </el-select>
            </div>
          </div>
        </div>
      </div>
      <div v-if="vaultPlan && vaultPlan.vaultOnlyEntities.length" class="vault-list">
        <p class="mods-line">Vault 独有实体</p>
        <div v-for="entity in vaultPlan.vaultOnlyEntities" :key="entity.calmyId" class="vault-item vault-item-head">
          <span>{{ entity.calmyType }} · {{ entity.calmyId }}</span>
          <el-select v-model="vaultDecisions[entity.calmyId]" :aria-label="`${entity.calmyId} 的 Vault 独有实体处理方式`" size="small">
            <el-option label="保留 Vault" value="keep-vault" />
            <el-option label="删除并写 tombstone" value="delete-vault" />
          </el-select>
        </div>
      </div>
      <div v-if="vaultPlan && vaultPlan.vaultDeletedEntities.length" class="vault-list">
        <p class="mods-line">Vault 已删除但本地仍存在</p>
        <div v-for="entity in vaultPlan.vaultDeletedEntities" :key="entity.calmyId" class="vault-item vault-item-head">
          <span>{{ entity.calmyType }} · {{ entity.calmyId }}</span>
          <el-select v-model="vaultDecisions[entity.calmyId]" :aria-label="`${entity.calmyId} 的 Vault 删除处理方式`" size="small">
            <el-option label="接受 Vault 删除" value="keep-vault" />
            <el-option label="恢复本地实体" value="use-local" />
          </el-select>
        </div>
      </div>
    </div>

    <!-- 实体同步迁移：默认键级同步不变，必须显式预览/备份后执行 -->
    <div class="beryl-card hoverable block">
      <h3 class="font-title sec">🧬 实体同步迁移（P0）</h3>
      <p class="info">先生成迁移计划和本地回滚快照，再扫描冲突；确认后才会加密推送实体记录。</p>
      <div class="btns">
        <el-button @click="prepareEntityMigration">生成计划</el-button>
        <el-button :loading="migrationBusy" @click="scanEntityConflicts">扫描冲突</el-button>
        <el-button type="primary" :loading="migrationBusy" @click="pushEntityMigration">加密推送</el-button>
        <el-button type="warning" plain @click="rollbackEntityMigration">回滚本地快照</el-button>
        <el-button :loading="migrationBusy" @click="runKvStatus">检查 KV 退役条件</el-button>
      </div>
      <p v-if="migrationPlan" class="mods-line">计划：{{ migrationPlan.records.length }} 个实体 · 创建于 {{ new Date(migrationPlan.createdAt).toLocaleString() }} · 备份{{ migrationBackupExists() ? '已存在' : '未生成' }}</p>
      <p v-if="migrationReport" class="info diag-raw" role="status" aria-live="polite" aria-atomic="true">{{ migrationReport }}</p>
      <p v-if="kvStatus" class="mods-line">D1 records={{ kvStatus.d1Records }} · D1 auth={{ kvStatus.d1Auth }} · KV bound={{ kvStatus.kvBound }} · KV legacy={{ kvStatus.legacyKvPresent }}</p>
    </div>

    <!-- Cloudflare 连接对话框 -->
    <el-dialog v-model="cloudDlg" title="☁️ 连接 Cloudflare 云端" width="92%" style="max-width: 420px">
      <el-input v-model="cloudUrl" aria-label="Cloudflare Worker 地址" placeholder="https://beryl-api.你的子域.workers.dev" class="mb-2" />
      <el-input v-model="cloudKey" aria-label="云端同步密码" type="password" placeholder="同步密码" show-password />
      <template #footer>
        <el-button @click="cloudDlg = false">取消</el-button>
        <el-button type="primary" :loading="connecting" @click="doCloudConnect">连接</el-button>
      </template>
    </el-dialog>

    <!-- S3 连接对话框 -->
    <el-dialog v-model="s3Dlg" title="🗄️ 连接对象存储（S3 兼容）" width="92%" style="max-width: 420px">
      <el-form label-position="top">
        <el-form-item label="Endpoint"><el-input v-model="s3Cfg.endpoint" placeholder="https://oss-cn-hangzhou.aliyuncs.com" /></el-form-item>
        <el-form-item label="Bucket"><el-input v-model="s3Cfg.bucket" /></el-form-item>
        <el-form-item label="Region"><el-input v-model="s3Cfg.region" placeholder="cn-hangzhou / ap-guangzhou" /></el-form-item>
        <el-form-item label="AccessKey ID"><el-input v-model="s3Cfg.ak" /></el-form-item>
        <el-form-item label="Secret Access Key"><el-input v-model="s3Cfg.sk" type="password" show-password /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="s3Dlg = false">取消</el-button>
        <el-button type="primary" :loading="connecting" @click="doS3Connect">连接</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.mod-icon { font-size: 20px; }
.mod-name { font-size: 1.25rem; font-weight: 700; }
.grid4 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
@media (min-width: 768px) { .grid4 { grid-template-columns: repeat(4, 1fr); } }
.card { padding: 16px; }
.label { font-size: 10px; color: var(--c-text-2); letter-spacing: 0.2em; }
.value { font-size: 1.5rem; font-weight: 700; margin-top: 6px; }
.block { padding: 16px; margin-top: 16px; }
.sec { font-size: 12px; color: var(--c-text-2); letter-spacing: 0.15em; margin: 0 0 12px; }
.pills { display: flex; flex-wrap: wrap; gap: 8px; }
.pill { padding: 8px 16px; border-radius: 999px; font-size: 13px; border: 1px solid var(--c-border); color: var(--c-text-2); background: transparent; cursor: pointer; transition: border-color .15s ease, color .15s ease; }
.pill:hover { border-color: var(--scene-border); color: var(--c-text); }
.mods-line { font-size: 10px; color: var(--c-text-3); margin-top: 12px; line-height: 1.6; }
.btns { display: flex; flex-wrap: wrap; gap: 8px; }
.info { font-size: 12px; color: var(--c-text-2); margin: 4px 0; }
.info span { color: var(--c-text); }
.diag {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--c-bg-soft);
  border: 1px solid var(--c-border-soft);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.diag-line { font-size: 10px; color: var(--c-text-2); margin: 2px 0; line-height: 1.6; word-break: break-all; }
.diag-raw { color: var(--c-text); }
.vault-list { margin-top: 12px; display: grid; gap: 8px; }
.vault-item { padding: 10px; border: 1px solid var(--c-border-soft); border-radius: 10px; background: var(--c-bg-soft); }
.vault-item-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 11px; color: var(--c-text-2); }
.vault-fields { display: grid; gap: 6px; margin-top: 8px; }
.vault-field { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 11px; color: var(--c-text-3); }
</style>
