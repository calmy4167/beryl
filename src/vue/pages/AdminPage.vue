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
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbPanel from '@/vue/liubai/LbPanel.vue'
import LbCollapsible from '@/vue/liubai/LbCollapsible.vue'
import LbStatGrid from '@/vue/liubai/LbStatGrid.vue'
import type { LbStat } from '@/vue/liubai/types'

// 页面自带头部（参考稿里 .slide-head 属于页面自身），外壳因此不再渲染第二行标题。
useOwnSlideHead()

const router = useRouter()
const currentSession = readServerSession()
const settingsSection = ref<'appearance' | 'data' | 'sync'>('appearance')
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

/** 「留白」统计卡：四个集合的实时条目数（HUD 第 3 档收起） */
const stats = computed<LbStat[]>(() => [
  { label: '任务', value: counts.value.tasks, unit: ' 条' },
  { label: '财务记录', value: counts.value.finance, unit: ' 条' },
  { label: '习惯', value: counts.value.habits, unit: ' 个' },
  { label: '文章', value: counts.value.posts, unit: ' 篇' },
])

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
  plan.conflicts.forEach(conflict => { decisions[conflict.identityKey] = 'keep-vault' })
  plan.vaultOnlyEntities.forEach(entity => { decisions[entity.identityKey] = 'keep-vault' })
  plan.vaultDeletedEntities.forEach(entity => { decisions[entity.identityKey] = 'keep-vault' })
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
    const conflict = vaultPlan.value?.conflicts.find(item => item.identityKey === id)
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
  <header class="slide-head">
    <div class="head-main">
      <p class="hint">设置 · Settings</p>
      <div class="head-title-row">
        <h2>本机数据、同步与外观。</h2>
        <span class="info" tabindex="0" data-tip="外观、数据管理、Vault 同步与系统信息都在这一页。H 收起辅助信息，⌘K 跳到任意页面。" aria-label="设置说明">i</span>
      </div>
    </div>
  </header>

  <nav class="admin-section-nav" aria-label="设置分组">
    <button type="button" class="chip" :class="{ on: settingsSection === 'appearance' }" :aria-pressed="settingsSection === 'appearance'" @click="settingsSection = 'appearance'">外观</button>
    <button type="button" class="chip" :class="{ on: settingsSection === 'data' }" :aria-pressed="settingsSection === 'data'" @click="settingsSection = 'data'">数据与账户</button>
    <button type="button" class="chip" :class="{ on: settingsSection === 'sync' }" :aria-pressed="settingsSection === 'sync'" @click="settingsSection = 'sync'">同步与迁移</button>
  </nav>

  <div v-show="settingsSection === 'appearance'" class="admin-section">
  <LbPanel title="外观" :note="appearanceMode === 'dark' ? '深色外观' : '浅色外观'">
    <div class="seg" role="group" aria-label="选择要编辑的外观">
      <button type="button" :class="{ on: appearanceMode === 'light' }" :aria-pressed="appearanceMode === 'light'" @click="switchAppearanceMode('light')">浅色</button>
      <button type="button" :class="{ on: appearanceMode === 'dark' }" :aria-pressed="appearanceMode === 'dark'" @click="switchAppearanceMode('dark')">深色</button>
    </div>
    <div class="appearance-controls">
      <label>背景颜色
        <input v-model="appearanceColor" type="color" aria-label="选择页面背景颜色" @input="previewAppearanceColor" />
      </label>
      <label>HEX 色值
        <input v-model="appearanceColor" type="text" inputmode="text" maxlength="7" placeholder="#F1F7EF" aria-label="背景颜色 HEX 色值" @input="previewAppearanceColor" />
      </label>
      <button class="chip" type="button" @click="applyAppearanceColor">应用背景</button>
      <button class="chip" type="button" @click="restoreAppearanceColor">恢复默认</button>
    </div>
    <div class="appearance-presets" role="group" aria-label="背景颜色预设">
      <button
        v-for="preset in BACKGROUND_COLOR_PRESETS[appearanceMode]"
        :key="preset.value"
        type="button"
        :aria-label="`预览${preset.name}`"
        :aria-pressed="appearanceColor.toLowerCase() === preset.value"
        :title="preset.name"
        :style="{ backgroundColor: preset.value, borderColor: appearanceColor.toLowerCase() === preset.value ? 'var(--accent)' : 'var(--line)' }"
        @click="selectAppearancePreset(preset.value)"
      />
    </div>
    <div class="appearance-preview" :style="{ backgroundColor: appearanceColor, color: appearancePalette.primary }" aria-label="页面背景实时预览">
      <b>页面背景预览</b><span :style="{ color: appearancePalette.secondary }">标题和正文会自动选择可读文字颜色</span>
      <small :style="{ color: appearancePalette.muted }">{{ appearancePreview ? '预览中 · 尚未保存' : '更改将在点击应用后保存' }}</small>
    </div>
    <p class="appearance-status" role="status" aria-live="polite">{{ appearanceStatus }}</p>
  </LbPanel>
  </div>

  <div v-show="settingsSection === 'data'" class="admin-section">
  <LbCollapsible block="adminStats" :rank="3">
    <LbPanel title="数据统计">
      <LbStatGrid :stats="stats" />
    </LbPanel>
  </LbCollapsible>

  <LbCollapsible block="adminScene" :rank="2">
    <LbPanel title="场景切换" :note="SCENES[scene].name">
      <div class="detail-chips">
        <button
          v-for="s in SCENES"
          :key="s.id"
          type="button"
          class="chip"
          :class="{ on: scene === s.id }"
          :style="scene === s.id ? { borderColor: s.color, color: s.color } : {}"
          :aria-pressed="scene === s.id"
          :aria-label="`切换至${s.name}场景`"
          @click="switchScene(s.id)"
        ><span aria-hidden="true">{{ s.icon }}</span> {{ s.name }}</button>
      </div>
      <p class="mods-line">当前场景模块：{{ SCENES[scene].mods.map(m => MODS[m].name).join(' · ') }}</p>
    </LbPanel>
  </LbCollapsible>

  <LbPanel title="数据管理" note="导出、导入与本地持久层">
    <div class="detail-chips">
      <button class="chip" type="button" @click="exportData">导出加密备份</button>
      <button class="chip" type="button" @click="openImport">导入加密备份</button>
      <input id="file-import" type="file" accept="application/json,.json" aria-label="选择要导入的 JSON 数据文件" style="display:none" @change="onImportChange" />
      <button class="chip danger" type="button" @click="resetData">重置</button>
    </div>
    <div class="persistence-status" role="status" aria-live="polite" aria-atomic="false" :style="{ color: persistenceStatus.state === 'degraded' ? 'var(--danger)' : persistenceStatus.state === 'ready' ? 'var(--accent)' : 'var(--muted)' }">
      <p id="persistence-status-text" class="status-copy">{{ persistenceStatusText }}</p>
      <p class="status-copy">待重试写入：{{ persistenceStatus.pendingWrites }} · 最近镜像：{{ persistenceStatus.lastMirrorAt ? new Date(persistenceStatus.lastMirrorAt).toLocaleString() : '暂无' }}</p>
      <button class="chip" type="button" :disabled="persistenceBusy" aria-describedby="persistence-status-text" @click="retryPersistence">{{ persistenceBusy ? '重试中…' : '重试持久化' }}</button>
    </div>
  </LbPanel>

  <LbCollapsible block="adminSystem" :rank="3">
    <LbPanel title="系统信息">
      <ul class="ov-list">
        <li><b>版本</b><span class="right">v2.2.0 · 用户身份 / Vault 密钥隔离 / 私有密文同步</span></li>
        <li><b>数据版本</b><span class="right">4</span></li>
        <li><b>当前场景</b><span class="right" :style="{ color: SCENES[scene].color }">{{ SCENES[scene].name }}</span></li>
        <li><b>日期</b><span class="right">{{ now.getFullYear() }} 年 {{ now.getMonth() + 1 }} 月 {{ now.getDate() }} 日</span></li>
      </ul>
      <div class="detail-chips">
        <button class="chip" type="button" @click="goPass">修改密码</button>
        <button class="chip danger" type="button" @click="logout">退出登录</button>
      </div>
    </LbPanel>
  </LbCollapsible>
  </div>

  <div v-show="settingsSection === 'sync'" class="admin-section">
  <LbCollapsible block="adminVaultSync" :rank="2">
    <LbPanel title="Vault 同步" :note="vaultSyncBusy ? '同步中…' : '登录后自动同步'">
      <p class="status-copy" role="status" aria-live="polite">{{ vaultSyncStatus }}</p>
      <div class="detail-chips">
        <button class="chip" type="button" :disabled="vaultSyncBusy" @click="syncVaultNow">{{ vaultSyncBusy ? '同步中…' : '立即同步' }}</button>
      </div>
      <p class="mods-line">内容使用随机实体密钥加密；服务器只保存密文、随机 ID、版本和同步游标。登录凭据不参与内容加密。</p>
    </LbPanel>
  </LbCollapsible>

  <!-- Obsidian Vault：显式差异预览与决策后写回 -->
  <LbCollapsible block="adminObsidian" :rank="2">
    <LbPanel title="Obsidian Vault" :note="vaultRestoreNeeded ? `已记住 Vault：${vaultName} · 需要重新授权` : vaultName ? `当前 Vault：${vaultName}` : '未连接 Vault'">
      <p class="status-copy">只扫描和写入 Calmy Open Format 文件；Vault 独有实体的删除必须明确选择，并会留下 tombstone。</p>
      <div class="detail-chips">
        <button class="chip" type="button" @click="connectVault">选择 Vault</button>
        <button v-if="vaultRestoreNeeded" class="chip" type="button" @click="restoreVaultPermission">恢复 Vault 授权</button>
        <button v-if="vaultHandleStored" class="chip" type="button" @click="disconnectVault">断开 Vault</button>
        <button class="chip" type="button" :disabled="!vaultAdapter || vaultBusy" @click="scanVault">{{ vaultBusy ? '处理中…' : '扫描差异' }}</button>
        <button class="chip on" type="button" :disabled="!vaultPlan || vaultBusy" @click="applyVault">应用同步</button>
      </div>
      <p v-if="vaultReport" class="status-copy diag-raw" role="status" aria-live="polite" aria-atomic="true">{{ vaultReport }}</p>
      <div v-if="vaultPlan && vaultPlan.conflicts.length" class="vault-list">
        <p class="mods-line">字段级冲突（可选择保留 Vault、本地版本，或逐字段合并）</p>
        <div v-for="conflict in vaultPlan.conflicts" :key="conflict.identityKey" class="vault-item">
          <div class="vault-item-head">
            <span>{{ conflict.calmyType }} · {{ conflict.calmyId }}</span>
            <el-select :model-value="conflictMode(conflict.identityKey)" :aria-label="`冲突 ${conflict.calmyType} ${conflict.calmyId} 的处理方式`" size="small" @change="setConflictMode(conflict.identityKey, String($event))">
              <el-option label="保留 Vault" value="keep-vault" />
              <el-option label="使用本地" value="use-local" />
              <el-option label="逐字段合并" value="merge" />
            </el-select>
          </div>
          <div v-if="conflictMode(conflict.identityKey) === 'merge'" class="vault-fields">
            <div v-for="field in conflict.fields" :key="field.key" class="vault-field">
              <span>{{ field.key }}</span>
              <el-select :model-value="fieldMode(conflict.identityKey, field.key)" :aria-label="`冲突 ${conflict.calmyType} ${conflict.calmyId} 的字段 ${field.key} 处理方式`" size="small" @change="setFieldMode(conflict.identityKey, field.key, String($event) as VaultFieldDecision)">
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
        <div v-for="entity in vaultPlan.vaultOnlyEntities" :key="entity.identityKey" class="vault-item vault-item-head">
          <span>{{ entity.calmyType }} · {{ entity.calmyId }}</span>
          <el-select v-model="vaultDecisions[entity.identityKey]" :aria-label="`${entity.calmyType} ${entity.calmyId} 的 Vault 独有实体处理方式`" size="small">
            <el-option label="保留 Vault" value="keep-vault" />
            <el-option label="删除并写 tombstone" value="delete-vault" />
          </el-select>
        </div>
      </div>
      <div v-if="vaultPlan && vaultPlan.vaultDeletedEntities.length" class="vault-list">
        <p class="mods-line">Vault 已删除但本地仍存在</p>
        <div v-for="entity in vaultPlan.vaultDeletedEntities" :key="entity.identityKey" class="vault-item vault-item-head">
          <span>{{ entity.calmyType }} · {{ entity.calmyId }}</span>
          <el-select v-model="vaultDecisions[entity.identityKey]" :aria-label="`${entity.calmyType} ${entity.calmyId} 的 Vault 删除处理方式`" size="small">
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
    </LbPanel>
  </LbCollapsible>

  <LbCollapsible v-if="currentSession?.user.role === 'admin'" block="adminMigration" :rank="2">
    <LbPanel title="历史数据迁移" note="需要管理员确认归属">
      <LegacyLocalMigrationPanel />
      <LegacyServerMigrationPanel />
      <p class="mods-line">旧浏览器数据与旧版 D1 数据会保留，不会自动归入当前用户。浏览器本地迁移和旧版 D1 迁移均需管理员在专用向导中确认归属、备份和解密方式。</p>
      <p class="mods-line">用户数据备份使用当前 Vault 密钥加密；恢复时需先在当前账号解锁 Vault。不要手动清理旧数据。</p>
    </LbPanel>
  </LbCollapsible>
  </div>
</template>

<style scoped>
/* 页面局部排版。颜色一律取「留白」令牌（--fg / --muted / --line / --panel-2），
   不再引用旧主题的 --c-* 变量，这样六个主题下都与外壳同族且可读。 */
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.btns { display: flex; flex-wrap: wrap; gap: 6px; }
/* 危险动作（重置 / 退出登录）沿用 chip 的形状，但走 danger 色 */
.chip.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 45%, transparent); }
.chip.danger:hover { color: var(--danger); border-color: var(--danger); }
/* .seg 的分段按钮在参考稿里 flex:1 铺满容器；设置页给它一个合理宽度，免得「浅色/深色」各占半屏 */
.seg { max-width: min(360px, 100%); }
.admin-section-nav { position: sticky; top: 8px; z-index: 5; display: flex; flex-wrap: wrap; gap: 8px; width: fit-content; max-width: 100%; padding: 5px; border: 1px solid var(--line); border-radius: 12px; background: var(--workspace-glass, var(--panel)); }
.admin-section-nav .chip { min-width: 112px; }
.admin-section { display: grid; gap: clamp(8px, 1.2vh, 14px); min-width: 0; }
.mods-line { font-size: .7rem; color: var(--muted); margin-top: 12px; line-height: 1.7; }
.status-copy { color: var(--muted); }
.info span { color: var(--fg); }
.persistence-status { margin-top: 12px; display: grid; gap: 4px; justify-items: start; }
.appearance-controls { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 14px; margin-top: 14px; }
.appearance-controls label { display: grid; gap: 6px; color: var(--muted); font-size: .7rem; }
.appearance-controls input[type='color'] { width: 72px; min-height: 38px; padding: 4px; }
.appearance-controls input[type='text'] { width: 132px; min-height: 38px; padding: 8px 10px; color: var(--fg); font: inherit; }
.appearance-presets { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 13px; }
.appearance-presets button { width: 28px; height: 28px; min-height: 28px; padding: 0; border: 2px solid var(--line); border-radius: 50%; cursor: pointer; }
.appearance-presets button[aria-pressed='true'] { outline: 2px solid var(--accent); outline-offset: 2px; }
.appearance-preview { display: grid; gap: 4px; margin-top: 15px; padding: 15px 17px; border: 1px solid var(--line); border-radius: 11px; }
.appearance-preview b { font-size: .9rem; }
.appearance-preview span { font-size: .78rem; }
.appearance-preview small { font-size: .7rem; }
.appearance-status { min-height: 17px; margin: 9px 0 0; color: var(--muted); font-size: .7rem; }
.vault-list { margin-top: 12px; display: grid; gap: 8px; }
.vault-item { padding: 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-2); }
.vault-item-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: .7rem; color: var(--muted); }
.vault-fields { display: grid; gap: 6px; margin-top: 8px; }
.vault-field { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: .7rem; color: var(--muted); }
.diag-raw { color: var(--fg); }
@media (max-width: 620px) {
  .appearance-controls { align-items: stretch; flex-direction: column; }
  .admin-section-nav { position: static; width: 100%; }
  .admin-section-nav .chip { min-width: 0; flex: 1 1 auto; }
}
</style>
