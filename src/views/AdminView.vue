<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { SCENES, currentSceneId, applySceneTheme } from '@/core/scenes'
import { MODS } from '@/core/modules'
import { store, lsSet } from '@/core/storage'
import { clearSession } from '@/core/auth'
import { DEFAULT_API_BASE_URL, preferredCloudUrl, sync, cloudConnect, s3Connect, fileConnect, disconnect, syncNow, diagSync, type SyncDiag } from '@/core/sync'

const router = useRouter()
const scene = ref(currentSceneId())

const counts = computed(() => ({
  tasks: store.get<any[]>('tasks', []).length,
  finance: store.get<any[]>('finance', []).length,
  habits: store.get<any[]>('habits', []).length,
  posts: store.get<any[]>('posts', []).length
}))
function refreshCounts() { void counts.value }

function switchScene(id: string) {
  scene.value = id
  store.set('scene', id)
  applySceneTheme(id)
  ElMessage.success(`已切换至「${SCENES[id].name}」场景`)
  refreshCounts()
}

function exportData() {
  const out: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('b_')) out[k] = localStorage.getItem(k) || ''
  }
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
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result))
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('bad')
      const ok = Object.keys(data).every(k => k.startsWith('b_') && typeof data[k] === 'string')
      if (!ok) throw new Error('bad')
      Object.entries(data as Record<string, string>).forEach(([k, v]) => lsSet(k, v))
      ElMessage.success('导入成功，正在刷新…')
      setTimeout(() => location.reload(), 600)
    } catch {
      ElMessage.error('导入失败：文件格式错误')
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
  keys.forEach(k => localStorage.removeItem(k))
  location.reload()
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

/* 同步诊断 */
const diag = ref<SyncDiag | null>(null)
const diagLoading = ref(false)
async function runDiag() {
  diagLoading.value = true
  try { diag.value = await diagSync() }
  catch { diag.value = null }
  diagLoading.value = false
}

const now = new Date()
onMounted(() => applySceneTheme(scene.value))
</script>

<template>
  <div>
    <div class="head">
      <el-button circle text @click="router.push('/app/home')">←</el-button>
      <span class="mod-icon">⚙️</span>
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
          @click="switchScene(s.id)"
        >{{ s.icon }} {{ s.name }}</button>
      </div>
      <p class="mods-line">当前场景模块：{{ SCENES[scene].mods.map(m => MODS[m].icon + ' ' + MODS[m].name).join(' · ') }}</p>
    </div>

    <!-- 数据管理 -->
    <div class="beryl-card hoverable block">
      <h3 class="font-title sec">数据管理</h3>
      <div class="btns">
        <el-button @click="exportData">📤 导出</el-button>
        <el-button @click="openImport">📥 导入</el-button>
        <input id="file-import" type="file" accept="application/json,.json" style="display:none" @change="onImportChange" />
        <el-button type="danger" plain @click="resetData">🗑️ 重置</el-button>
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
      <p class="info" :style="{ color: syncStatus.color }">{{ syncStatus.text }}</p>
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
      <div v-if="diag" class="diag">
        <p class="diag-line">云端地址：{{ diag.url }}</p>
        <p class="diag-line">游标：pull={{ diag.pullCursor }} · localTs={{ diag.localTs }} · push={{ diag.pushCursor }} · dirty={{ diag.dirty }}</p>
        <p class="diag-line">云端记录数：{{ diag.cloudRecords }}（-1=未连接 / -2=旧Worker / -3=请求失败）· 云端maxTs={{ diag.cloudMaxTs }}</p>
        <p class="diag-line">上次推送：{{ diag.lastSync }}</p>
        <p class="diag-line diag-raw">本地 b_inbox 值：{{ diag.localInboxSample }}</p>
      </div>
    </div>

    <!-- Cloudflare 连接对话框 -->
    <el-dialog v-model="cloudDlg" title="☁️ 连接 Cloudflare 云端" width="92%" style="max-width: 420px">
      <el-input v-model="cloudUrl" placeholder="https://beryl-api.你的子域.workers.dev" class="mb-2" />
      <el-input v-model="cloudKey" type="password" placeholder="同步密码" show-password />
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
</style>
