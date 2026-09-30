<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { SCENES, currentSceneId, applySceneTheme } from '@/core/scenes'
import { MODS } from '@/core/modules'
import { store, lsGet, lsSet, lsRemove, listLocalStorageKeys } from '@/core/storage'
import { logout as serverLogout } from '@/core/api/auth'
import { apiBaseUrl } from '@/core/api/base-url'
import { readServerSession } from '@/core/auth'
import { clearDb, flushPendingDbWrites, getDbStatus, type DbRuntimeStatus } from '@/core/db'
import { BACKUP_SENSITIVE_KEYS, createDurableBackup, parseBackup } from '@/core/backup'
import { decryptEntityContent, encryptEntityContent, loadUserKey } from '@/core/vault-keys'
import { syncVaultEntityData } from '@/core/entity-sync'
import { clearFeishuCache } from '@/core/feishu/cache'
import { listRealityDocuments } from '@/domain/reality'
import { exportCurrentOpenWorkspace } from '@/core/content/open-workspace'
import { createFileSystemVaultAdapter, type VaultAdapter } from '@/core/content/obsidian-adapter'
import { clearVaultHandle, loadVaultHandle, queryVaultHandlePermission, requestVaultHandlePermission, saveVaultHandle, type PersistableVaultDirectoryHandle } from '@/core/content/vault-handle-store'
import { applyVaultSyncPlan, buildVaultSyncPlan, formatVaultSyncSummary, type VaultAssetDecision, type VaultEntityDecision, type VaultFieldDecision, type VaultSyncPlan } from '@/core/content/vault-sync'
import LegacyLocalMigrationPanel from '@/vue/components/LegacyLocalMigrationPanel.vue'
import LegacyServerMigrationPanel from '@/vue/components/LegacyServerMigrationPanel.vue'
import { BACKGROUND_COLOR_PRESETS, applyBackgroundPreferences, getCanvasTextPalette, getDefaultBackgroundColor, getThemeMode, previewBackgroundColor, readBackgroundPreferences, resetBackgroundColor, saveBackgroundColor, setThemeMode, type ThemeMode } from '@/ui/theme-preferences'

const router = useRouter()
const currentSession = readServerSession()
const scene = ref(currentSceneId())
const appearanceMode = ref<ThemeMode>(getThemeMode())
const appearanceColor = ref(readBackgroundPreferences()[appearanceMode.value] || getDefaultBackgroundColor(appearanceMode.value))
const appearanceStatus = ref('背景颜色只保存在本机，不会进入数据导出或同步。')
const appearancePreview = ref(false)
const appearancePalette = computed(() => getCanvasTextPalette(appearanceColor.value))
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

function switchAppearanceMode(mode: ThemeMode) {
  appearanceMode.value = mode
  setThemeMode(mode)
  appearanceColor.value = readBackgroundPreferences()[mode] || getDefaultBackgroundColor(mode)
  appearancePreview.value = false
  appearanceStatus.value = mode === 'dark' ? '正在编辑深色外观背景。' : '正在编辑浅色外观背景。'
}

function previewAppearanceColor() {
  const result = previewBackgroundColor(appearanceMode.value, appearanceColor.value)
  if (!result.ok) {
    if (getThemeMode() === appearanceMode.value) applyBackgroundPreferences(appearanceMode.value)
    appearancePreview.value = false
    appearanceStatus.value = result.reason === 'invalid-format'
      ? '请输入 #RRGGBB 格式的颜色。'
      : '该颜色无法为普通文字提供足够对比度，请换一个颜色。'
    return
  }
  appearancePreview.value = true
  appearanceStatus.value = '正在预览，点击“应用背景”后才会保存。'
}

function applyAppearanceColor() {
  const result = saveBackgroundColor(appearanceMode.value, appearanceColor.value)
  if (!result.ok) {
    appearanceStatus.value = result.reason === 'invalid-format'
      ? '请输入 #RRGGBB 格式的颜色。'
      : result.reason === 'insufficient-contrast'
        ? '该颜色无法为普通文字提供足够对比度，请换一个颜色。'
        : '本机暂时无法保存外观偏好，请检查浏览器存储权限。'
    return
  }
  appearancePreview.value = false
  appearanceStatus.value = '背景颜色已应用并保存在本机。'
}

function restoreAppearanceColor() {
  if (!resetBackgroundColor(appearanceMode.value)) {
    appearanceStatus.value = '恢复默认失败，请检查浏览器存储权限。'
    return
  }
  appearanceColor.value = getDefaultBackgroundColor(appearanceMode.value)
  applyBackgroundPreferences(appearanceMode.value)
  appearancePreview.value = false
  appearanceStatus.value = '当前主题的背景已恢复默认。'
}

function selectAppearancePreset(color: string) {
  appearanceColor.value = color
  previewAppearanceColor()
}

async function exportData() {
  const session = readServerSession()
  if (!session) { ElMessage.error('请先登录后再导出数据'); return }
  const out = await createDurableBackup()
  const userKey = await loadUserKey(session.user.id)
  const payload = await encryptEntityContent(userKey, out)
  const blob = new Blob([JSON.stringify({ format: 'calmy-encrypted-backup-v1', exportedAt: new Date().toISOString(), encryption: 'AES-GCM with the current Calmy User Key', payload }, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `calmy-encrypted-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
  ElMessage.success('数据已导出')
}

function importData(file: File) {
  const reader = new FileReader()
  reader.onload = async () => {
    try {
      const fileData: unknown = JSON.parse(String(reader.result))
      if (!fileData || typeof fileData !== 'object' || (fileData as { format?: unknown }).format !== 'calmy-encrypted-backup-v1') throw new Error('backup-format-invalid')
      const session = readServerSession()
      if (!session) throw new Error('server-auth-required')
      const userKey = await loadUserKey(session.user.id)
      const backupData = fileData as { payload?: { v?: number; iv?: string; ciphertext?: string } }
      if (!backupData.payload || backupData.payload.v !== 1 || typeof backupData.payload.iv !== 'string' || typeof backupData.payload.ciphertext !== 'string') throw new Error('backup-payload-invalid')
      const decrypted = await decryptEntityContent(userKey, backupData.payload as { v: 1; iv: string; ciphertext: string })
      const incoming = parseBackup(decrypted)
      const previous: Record<string, string | null> = {}
      for (const k of listLocalStorageKeys()) if (!BACKUP_SENSITIVE_KEYS.has(k)) previous[k] = lsGet(k)
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
  const keys = listLocalStorageKeys()
  void (async () => {
    try {
      await clearFeishuCache()
      await clearVaultHandle()
      await clearDb()
      keys.forEach(k => lsRemove(k))
      location.reload()
    } catch {
      resetArmed = false
      ElMessage.error('本地数据未能完整清空，请检查浏览器存储权限后重试。')
    }
  })()
}

async function logout() {
  try { await serverLogout(apiBaseUrl()) } finally {
    window.location.hash = '#/login'
    window.location.reload()
  }
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

/* ---------- 用户密文同步 ---------- */
const vaultSyncBusy = ref(false)
const vaultSyncStatus = ref('登录后自动同步加密实体；服务端只接收随机 ID 和密文。')
async function syncVaultNow() {
  vaultSyncBusy.value = true
  try {
    const result = await syncVaultEntityData(apiBaseUrl())
    vaultSyncStatus.value = `同步完成 · 收到 ${result.pulled} 项 · 发送 ${result.pushed} 项 · ${new Date().toLocaleTimeString()}`
  } catch (error) {
    vaultSyncStatus.value = `同步暂不可用：${error instanceof Error ? error.message : '网络错误'}；本机待同步数据会保留。`
  } finally { vaultSyncBusy.value = false }
}

/* ---------- Obsidian Vault 同步 ---------- */
const vaultAdapter = shallowRef<VaultAdapter | null>(null)
const vaultHandle = shallowRef<PersistableVaultDirectoryHandle | null>(null)
const vaultHandleStored = ref(false)
const vaultRestoreNeeded = ref(false)
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
  const picker = (window as unknown as { showDirectoryPicker?: () => Promise<PersistableVaultDirectoryHandle> }).showDirectoryPicker
  if (!picker) { ElMessage.warning('当前浏览器不支持 File System Access API'); return }
  try {
    const root = await picker()
    await saveVaultHandle(root)
    vaultHandle.value = root
    vaultHandleStored.value = true
    vaultRestoreNeeded.value = false
    vaultAdapter.value = createFileSystemVaultAdapter(root)
    vaultName.value = root.name || 'Obsidian Vault'
    vaultPlan.value = null
    vaultReport.value = `已连接 ${vaultName.value}，请扫描差异`
    ElMessage.success('已连接 Obsidian Vault')
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      vaultReport.value = `Vault 连接未保存：${error instanceof Error ? error.message : '浏览器存储不可用'}`
      ElMessage.error('Vault 连接未保存到本机')
    }
  }
}

async function restoreSavedVault() {
  try {
    const saved = await loadVaultHandle()
    if (!saved) return
    vaultHandle.value = saved.handle
    vaultHandleStored.value = true
    vaultName.value = saved.name
    const permission = await queryVaultHandlePermission(saved.handle)
    if (permission === 'granted') {
      vaultAdapter.value = createFileSystemVaultAdapter(saved.handle)
      vaultRestoreNeeded.value = false
      vaultReport.value = `已恢复 ${saved.name} 的连接，请扫描差异`
    } else {
      vaultRestoreNeeded.value = true
      vaultReport.value = permission === 'denied'
        ? `${saved.name} 的目录访问被拒绝，可重新授权或断开 Vault`
        : `${saved.name} 需要重新授权；Calmy 不会自动弹出权限请求`
    }
  } catch (error) {
    vaultReport.value = `无法恢复 Vault 连接：${error instanceof Error ? error.message : '本地句柄读取失败'}`
  }
}

async function restoreVaultPermission() {
  if (!vaultHandle.value) return
  try {
    const permission = await requestVaultHandlePermission(vaultHandle.value)
    if (permission !== 'granted') {
      vaultReport.value = `${vaultName.value} 的目录权限尚未恢复`
      return
    }
    vaultAdapter.value = createFileSystemVaultAdapter(vaultHandle.value)
    vaultRestoreNeeded.value = false
    vaultPlan.value = null
    vaultReport.value = `已恢复 ${vaultName.value} 的连接，请扫描差异`
    ElMessage.success('Vault 授权已恢复')
  } catch (error) {
    vaultReport.value = `恢复授权失败：${error instanceof Error ? error.message : '浏览器拒绝访问'}`
  }
}

async function disconnectVault() {
  try {
    await clearVaultHandle()
    vaultAdapter.value = null
    vaultHandle.value = null
    vaultHandleStored.value = false
    vaultRestoreNeeded.value = false
    vaultName.value = ''
    vaultPlan.value = null
    vaultDecisions.value = {}
    vaultReport.value = '已断开 Vault；本地数据未受影响'
    ElMessage.success('已断开 Vault')
  } catch (error) {
    vaultReport.value = `断开失败：${error instanceof Error ? error.message : '本地句柄清除失败'}`
    ElMessage.error('未能清除本机保存的 Vault 句柄')
  }
}

async function scanVault() {
  if (!vaultAdapter.value) { ElMessage.warning('请先选择 Obsidian Vault'); return }
  vaultBusy.value = true
  try {
    const plan = await buildVaultSyncPlan(vaultAdapter.value, exportCurrentOpenWorkspace())
    vaultPlan.value = plan
    vaultDecisions.value = defaultVaultDecisions(plan)
    vaultReport.value = formatVaultSyncSummary(plan)
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

const now = new Date()
function onDataSynced() { refreshCounts() }
onMounted(() => {
  applySceneTheme(scene.value)
  window.addEventListener('beryl-data-synced', onDataSynced)
  persistenceTimer = window.setInterval(() => { persistenceStatus.value = getDbStatus() }, 1500)
  void restoreSavedVault()
})
onUnmounted(() => {
  window.removeEventListener('beryl-data-synced', onDataSynced)
  if (persistenceTimer) window.clearInterval(persistenceTimer)
})
</script>

<template>
  <div class="admin-view">
    <div class="head">
      <el-button circle text aria-label="返回工作台" @click="router.push('/app/home')">←</el-button>
      <div>
        <p class="head-kicker">WORKSPACE CONTROL</p>
        <h2 class="font-title mod-name">设置</h2>
        <p class="head-description">管理本机数据、同步连接、Vault 与实体迁移。</p>
      </div>
    </div>

    <section class="beryl-card hoverable block appearance-settings" aria-labelledby="appearance-title">
      <div class="appearance-heading">
        <div><h3 id="appearance-title" class="font-title sec">外观</h3><p>分别为浅色和深色外观设置页面背景。</p></div>
        <div class="appearance-mode" role="group" aria-label="选择要编辑的外观">
          <button type="button" :aria-pressed="appearanceMode === 'light'" @click="switchAppearanceMode('light')">浅色</button>
          <button type="button" :aria-pressed="appearanceMode === 'dark'" @click="switchAppearanceMode('dark')">深色</button>
        </div>
      </div>
      <div class="appearance-controls">
        <label class="appearance-color-picker">背景颜色
          <input v-model="appearanceColor" type="color" aria-label="选择页面背景颜色" @input="previewAppearanceColor" />
        </label>
        <label class="appearance-hex">HEX 色值
          <input v-model="appearanceColor" type="text" inputmode="text" maxlength="7" placeholder="#F1F7EF" aria-label="背景颜色 HEX 色值" @input="previewAppearanceColor" />
        </label>
        <div class="appearance-actions">
          <el-button type="primary" @click="applyAppearanceColor">应用背景</el-button>
          <el-button @click="restoreAppearanceColor">恢复默认</el-button>
        </div>
      </div>
      <div class="appearance-presets" role="group" aria-label="背景颜色预设">
        <button v-for="preset in BACKGROUND_COLOR_PRESETS[appearanceMode]" :key="preset.value" type="button" :aria-label="`预览${preset.name}`" :aria-pressed="appearanceColor.toLowerCase() === preset.value" :title="preset.name" :style="{ backgroundColor: preset.value }" @click="selectAppearancePreset(preset.value)"></button>
      </div>
      <div class="appearance-preview" :style="{ backgroundColor: appearanceColor, color: appearancePalette.primary }" aria-label="页面背景实时预览">
        <b>页面背景预览</b><span :style="{ color: appearancePalette.secondary }">标题和正文会自动选择可读文字颜色</span>
        <small :style="{ color: appearancePalette.muted }">{{ appearancePreview ? '预览中 · 尚未保存' : '更改将在点击应用后保存' }}</small>
      </div>
      <p class="appearance-status" role="status" aria-live="polite">{{ appearanceStatus }}</p>
    </section>

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
      <p class="mods-line">当前场景模块：{{ SCENES[scene].mods.map(m => MODS[m].name).join(' · ') }}</p>
    </div>

    <!-- 数据管理 -->
    <div class="beryl-card hoverable block">
      <h3 class="font-title sec">数据管理</h3>
      <div class="btns">
        <el-button @click="exportData">导出加密备份</el-button>
        <el-button @click="openImport">导入加密备份</el-button>
        <input id="file-import" type="file" accept="application/json,.json" aria-label="选择要导入的 JSON 数据文件" style="display:none" @change="onImportChange" />
        <el-button type="danger" plain @click="resetData">重置</el-button>
      </div>
      <div class="persistence-status" role="status" aria-live="polite" aria-atomic="false" :style="{ color: persistenceStatus.state === 'degraded' ? 'var(--c-danger)' : persistenceStatus.state === 'ready' ? 'var(--c-success)' : 'var(--c-text-2)' }">
        <p id="persistence-status-text" class="info">{{ persistenceStatusText }}</p>
        <p class="info">待重试写入：{{ persistenceStatus.pendingWrites }} · 最近镜像：{{ persistenceStatus.lastMirrorAt ? new Date(persistenceStatus.lastMirrorAt).toLocaleString() : '暂无' }}</p>
        <el-button size="small" aria-describedby="persistence-status-text" :loading="persistenceBusy" @click="retryPersistence">重试持久化</el-button>
      </div>
    </div>

    <!-- 系统信息 -->
    <div class="beryl-card hoverable block">
      <h3 class="font-title sec">系统信息</h3>
      <p class="info">版本：<span>v2.2.0（用户身份 / Vault 密钥隔离 / 私有密文同步）</span></p>
      <p class="info">数据版本：<span>4</span></p>
      <p class="info">当前场景：<span :style="{ color: SCENES[scene].color }">{{ SCENES[scene].name }}</span></p>
      <p class="info">日期：<span>{{ now.getFullYear() }} 年 {{ now.getMonth() + 1 }} 月 {{ now.getDate() }} 日</span></p>
      <div class="btns">
        <el-button @click="goPass">修改密码</el-button>
        <el-button type="danger" plain @click="logout">退出登录</el-button>
      </div>
    </div>

    <!-- 用户密文同步 -->
    <div class="beryl-card hoverable block">
      <h3 class="font-title sec">Vault 同步</h3>
      <p class="info" role="status" aria-live="polite">{{ vaultSyncStatus }}</p>
      <div class="btns">
        <el-button type="primary" :loading="vaultSyncBusy" @click="syncVaultNow">立即同步</el-button>
      </div>
      <p class="mods-line">内容使用随机实体密钥加密；服务器只保存密文、随机 ID、版本和同步游标。登录凭据不参与内容加密。</p>
    </div>

    <!-- Obsidian Vault：显式差异预览与决策后写回 -->
    <div class="beryl-card hoverable block">
      <h3 class="font-title sec">Obsidian Vault</h3>
      <p class="info" role="status" aria-live="polite">{{ vaultRestoreNeeded ? `已记住 Vault：${vaultName} · 需要重新授权` : vaultName ? `当前 Vault：${vaultName}` : '未连接 Vault' }}</p>
      <p class="info">只扫描和写入 Calmy Open Format 文件；Vault 独有实体的删除必须明确选择，并会留下 tombstone。</p>
      <div class="btns">
        <el-button @click="connectVault">选择 Vault</el-button>
        <el-button v-if="vaultRestoreNeeded" @click="restoreVaultPermission">恢复 Vault 授权</el-button>
        <el-button v-if="vaultHandleStored" @click="disconnectVault">断开 Vault</el-button>
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
      <div v-if="vaultPlan && vaultPlan.assetConflicts.length" class="vault-list">
        <p class="mods-line">附件内容冲突（需明确选择保留哪一份）</p>
        <div v-for="conflict in vaultPlan.assetConflicts" :key="conflict.path" class="vault-item vault-item-head">
          <span>附件 · {{ conflict.path }}</span>
          <el-select v-model="vaultDecisions[`asset:${conflict.path}`]" :aria-label="`附件 ${conflict.path} 的冲突处理方式`" size="small">
            <el-option label="保留 Vault" value="keep-vault" />
            <el-option label="使用本地" value="use-local" />
          </el-select>
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
      <div v-if="vaultPlan && vaultPlan.vaultOnlyAssets.length" class="vault-list">
        <p class="mods-line">Vault 独有附件</p>
        <div v-for="asset in vaultPlan.vaultOnlyAssets" :key="asset.path" class="vault-item vault-item-head">
          <span>附件 · {{ asset.path }}</span>
          <el-select v-model="vaultDecisions[`asset:${asset.path}`]" :aria-label="`Vault 独有附件 ${asset.path} 的处理方式`" size="small">
            <el-option label="保留 Vault" value="keep-vault" />
            <el-option label="删除并记录" value="delete-vault" />
          </el-select>
        </div>
      </div>
    </div>

    <LegacyLocalMigrationPanel v-if="currentSession?.user.role === 'admin'" />
    <LegacyServerMigrationPanel v-if="currentSession?.user.role === 'admin'" />

    <!-- 历史数据迁移 -->
    <div class="beryl-card hoverable block">
      <h3 class="font-title sec">旧数据迁移</h3>
      <p class="info">旧浏览器数据与旧版 D1 数据会保留，不会自动归入当前用户。浏览器本地迁移和旧版 D1 迁移均需管理员在专用向导中确认归属、备份和解密方式。</p>
      <p class="mods-line">用户数据备份使用当前 Vault 密钥加密；恢复时需先在当前账号解锁 Vault。不要手动清理旧数据。</p>
    </div>

  </div>
</template>

<style scoped>
.admin-view { max-width: 1040px; margin: 0 auto; padding-bottom: 48px; }
.head { display: flex; align-items: flex-start; gap: 12px; margin: 6px 0 24px; }
.mod-icon { font-size: 20px; }
.head-kicker { margin: 1px 0 5px; color: var(--scene); font-size: 9px; font-weight: 700; letter-spacing: .15em; }
.mod-name { font-size: clamp(28px, 4vw, 38px); line-height: 1; font-weight: 700; margin: 0; letter-spacing: -.04em; }
.head-description { margin: 9px 0 0; color: var(--c-text-2); font-size: 12px; }
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
.appearance-settings { padding: 18px; }
.appearance-heading, .appearance-controls { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.appearance-heading .sec { margin-bottom: 4px; }
.appearance-heading p { margin: 0; color: var(--c-text-2); font-size: 11px; }
.appearance-mode, .appearance-actions, .appearance-presets { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.appearance-mode button { min-height: 40px; padding: 8px 14px; border: 1px solid var(--c-border); border-radius: 9px; background: var(--c-card); color: var(--c-text-2); cursor: pointer; }
.appearance-mode button[aria-pressed="true"] { border-color: var(--scene); background: var(--scene-soft); color: var(--scene); }
.appearance-controls { justify-content: flex-start; flex-wrap: wrap; margin-top: 16px; }
.appearance-controls label { display: grid; gap: 6px; color: var(--c-text-2); font-size: 11px; }
.appearance-color-picker input { width: 72px; min-height: 40px; padding: 4px; border: 1px solid var(--c-border); border-radius: 8px; background: var(--c-card); }
.appearance-hex input { width: 132px; min-height: 40px; padding: 8px 10px; border: 1px solid var(--c-border); border-radius: 8px; background: var(--c-card); color: var(--c-text); font: inherit; }
.appearance-presets { margin-top: 13px; }
.appearance-presets button { width: 30px; height: 30px; min-height: 30px; padding: 0; border: 2px solid var(--c-border); border-radius: 50%; cursor: pointer; }
.appearance-presets button[aria-pressed="true"] { outline: 2px solid var(--scene); outline-offset: 2px; }
.appearance-preview { display: grid; gap: 4px; margin-top: 15px; padding: 15px 17px; border: 1px solid var(--c-border-soft); border-radius: 11px; }
.appearance-preview b { font-size: 14px; }
.appearance-preview span { font-size: 12px; }
.appearance-preview small { font-size: 10px; }
.appearance-status { min-height: 17px; margin: 9px 0 0; color: var(--c-text-2); font-size: 11px; }
.appearance-settings :deep(button:focus-visible), .appearance-settings :deep(input:focus-visible) { outline: 2px solid var(--scene); outline-offset: 2px; }
@media (max-width: 620px) {
  .appearance-heading, .appearance-controls { align-items: stretch; flex-direction: column; }
  .appearance-mode { align-self: flex-start; }
  .appearance-actions > * { flex: 1; }
}
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
