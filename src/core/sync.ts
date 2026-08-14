/* ================================================================
   同步引擎（平移 v1：local / file / cloud / s3 四模式）
   - 机制：内存 fileData + localStorage 双写；0.8s 防抖上传；
     前台 5s 轮询 + 切回/聚焦立即拉取；立即同步（双向）；冲突弹窗
   ================================================================ */
import { reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { lsGet, lsSet, safeParse, setSyncWriteHook } from './storage.ts'
import { SCENES, currentSceneId } from './scenes.ts'

export interface S3Cfg { endpoint: string; bucket: string; region: string; ak: string; sk: string; key: string; updatedAt: number }
export interface S3Input { endpoint: string; bucket: string; region: string; ak: string; sk: string }

export interface SyncState {
  mode: 'local' | 'file' | 'cloud' | 's3'
  cloud: { url: string; key: string; updatedAt: number } | null
  s3: S3Cfg | null
  saved: { cloud: { url: string; key: string } | null; s3: S3Input | null }
  fileData: Record<string, string> | null
  fileName: string
  lastTouch: number
  dirty: boolean
  pendingFile: boolean
  connectedLabel: string
}

export const sync = reactive<SyncState>({
  mode: 'local',
  cloud: null,
  s3: null,
  saved: { cloud: null, s3: null },
  fileData: null,
  fileName: '',
  lastTouch: 0,
  dirty: false,
  pendingFile: false,
  connectedLabel: ''
})

export const SYNC_KEYS = ['b_tasks', 'b_inbox', 'b_habits', 'b_goals', 'b_finance', 'b_diary', 'b_chars', 'b_posts', 'b_pomoTotal', 'b_pomoCount', 'b_scene']

/* 存储挂钩：模块 store.set → fileData + dirty + 防抖写（与 v1 一致） */
setSyncWriteHook((key, str) => {
  if (!sync.fileData) return
  sync.fileData[key] = str
  sync.dirty = true
  scheduleWrite()
})

/* ---------- 数据校验（白名单） ---------- */
const SCHEMA: Record<string, (v: unknown) => boolean> = {
  b_tasks: Array.isArray, b_inbox: Array.isArray, b_habits: Array.isArray, b_goals: Array.isArray,
  b_finance: Array.isArray, b_diary: Array.isArray, b_chars: Array.isArray, b_posts: Array.isArray,
  b_pomoTotal: v => v != null && !isNaN(Number(v)),
  b_pomoCount: v => v != null && !isNaN(Number(v)),
  b_scene: v => {
    if (typeof v !== 'string') return false
    const s = safeParse<string>(v)
    return !!SCENES[s ?? v]
  }
}
function parseSyncData(raw: Record<string, unknown>): { data: Record<string, string> } | { error: string } {
  const out: Record<string, string> = {}
  for (const k of SYNC_KEYS) {
    if (!(k in raw)) continue
    let v = raw[k]
    if (typeof v === 'string') { try { v = JSON.parse(v) } catch { v = undefined } }
    const ok = SCHEMA[k]
    if (!ok || !ok(v)) return { error: k }
    out[k] = typeof raw[k] === 'string' ? raw[k] as string : JSON.stringify(raw[k])
  }
  return { data: out }
}

/* ---------- 写入调度 ---------- */
let writeTimer: number | undefined
export function scheduleWrite() {
  clearTimeout(writeTimer)
  writeTimer = window.setTimeout(() => { void syncWrite() }, 800)
}
async function syncWrite() {
  clearTimeout(writeTimer)
  writeTimer = undefined
  if (sync.mode === 'cloud' && sync.cloud) return cloudWrite()
  if (sync.mode === 's3' && sync.s3) return s3Write()
  if (sync.mode === 'file') return fileWrite()
}

/* ---------- 文件模式 ---------- */
let fileHandle: FileSystemFileHandle | null = null
export function setFileHandle(h: FileSystemFileHandle | null) { fileHandle = h }
export function getFileHandle() { return fileHandle }

async function fileRead(): Promise<{ data: Record<string, string>; mtime: number }> {
  if (!fileHandle) throw new Error('no-handle')
  const f = await fileHandle.getFile()
  sync.fileName = f.name || sync.fileName
  const text = await f.text()
  if (!text.trim()) return { data: {}, mtime: f.lastModified }
  const parsed = parseSyncData(JSON.parse(text))
  if ('error' in parsed) throw new Error('bad-data:' + parsed.error)
  return { data: parsed.data, mtime: f.lastModified }
}
async function fileWrite() {
  if (!fileHandle) return
  const payload = { ...sync.fileData, _meta: { appVersion: 'v2.0.0', savedAt: new Date().toISOString() } }
  try {
    const w = await fileHandle.createWritable()
    await w.write(JSON.stringify(payload, null, 2))
    await w.close()
    sync.lastTouch = Date.now()
    sync.dirty = false
    ElMessage.success('已保存到本地文件 💾')
  } catch (e) { ElMessage.error('⚠️ 写入本地文件失败：' + (e instanceof Error ? e.message : '')) }
}

/* ---------- Cloudflare 模式 ---------- */
const enc = new TextEncoder()
function toHex(bytes: Uint8Array): string { return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('') }
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text))
  return toHex(new Uint8Array(buf))
}
async function cloudRead(): Promise<{ data: Record<string, string>; mtime: number }> {
  if (!sync.cloud) throw new Error('not-connected')
  const res = await fetch(sync.cloud.url + '/api/data', { headers: { Authorization: 'Bearer ' + sync.cloud.key } })
  if (res.status === 401) throw new Error('unauthorized')
  const j = await res.json()
  if (!j || !j.ok) throw new Error('bad-response')
  const parsed = parseSyncData(j.data || {})
  if ('error' in parsed) throw new Error('bad-data')
  return { data: parsed.data, mtime: j.updatedAt || 0 }
}
async function cloudWrite() {
  if (!sync.cloud) return
  const payload = { ...sync.fileData, _meta: { appVersion: 'v2.0.0', savedAt: new Date().toISOString() } }
  try {
    const res = await fetch(sync.cloud.url + '/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sync.cloud.key },
      body: JSON.stringify({ data: payload })
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const j = await res.json()
    sync.lastTouch = Date.now()
    sync.dirty = false
    if (j.updatedAt) sync.cloud.updatedAt = j.updatedAt
    ElMessage.success('已同步到云端 ☁️')
  } catch (e) { ElMessage.error('⚠️ 云端同步失败：' + (e instanceof Error ? e.message : '网络错误')) }
}

/* ---------- S3 模式（SigV4，平移 v1） ---------- */
async function hmacBytes(key: Uint8Array, text: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(text)))
}
async function s3Sign(method: string, url: URL, payload: string, cfg: { ak: string; sk: string; region: string }) {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const amzDate = d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z'
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = await sha256Hex(payload)
  const canonicalHeaders = 'host:' + url.host + '\n' + 'x-amz-content-sha256:' + payloadHash + '\n' + 'x-amz-date:' + amzDate + '\n'
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalRequest = [method, url.pathname, url.search.replace(/^\?/, ''), canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const scope = dateStamp + '/' + cfg.region + '/s3/aws4_request'
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonicalRequest)].join('\n')
  const kDate = await hmacBytes(enc.encode('AWS4' + cfg.sk), dateStamp)
  const kRegion = await hmacBytes(kDate, cfg.region)
  const kService = await hmacBytes(kRegion, 's3')
  const kSigning = await hmacBytes(kService, 'aws4_request')
  const signature = toHex(await hmacBytes(kSigning, stringToSign))
  return {
    'Authorization': 'AWS4-HMAC-SHA256 Credential=' + cfg.ak + '/' + scope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash
  }
}
function s3Url(): URL {
  return new URL((sync.s3!.endpoint).replace(/\/+$/, '') + '/' + sync.s3!.bucket + '/' + sync.s3!.key)
}
async function s3Read(): Promise<{ data: Record<string, string>; mtime: number }> {
  if (!sync.s3) throw new Error('not-connected')
  const url = s3Url()
  const headers = await s3Sign('GET', url, '', sync.s3)
  const res = await fetch(url, { headers })
  if (res.status === 403 || res.status === 401) throw new Error('forbidden')
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const text = await res.text()
  const mtime = Date.parse(res.headers.get('Last-Modified') || '') || 0
  if (!text.trim()) return { data: {}, mtime }
  const parsed = parseSyncData(JSON.parse(text))
  if ('error' in parsed) throw new Error('bad-data')
  return { data: parsed.data, mtime }
}
async function s3Write() {
  if (!sync.s3) return
  const payload = { ...sync.fileData, _meta: { appVersion: 'v2.0.0', savedAt: new Date().toISOString() } }
  const body = JSON.stringify(payload, null, 2)
  try {
    const url = s3Url()
    const headers = await s3Sign('PUT', url, body, sync.s3)
    const res = await fetch(url, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    sync.lastTouch = Date.now()
    sync.dirty = false
    ElMessage.success('已上传到对象存储 🗄️')
  } catch (e) { ElMessage.error('⚠️ 对象存储写入失败：' + (e instanceof Error ? e.message : '')) }
}

/* ---------- 数据应用 ---------- */
export function applySyncData(data: Record<string, string>) {
  sync.fileData = data
  sync.mode = sync.cloud ? 'cloud' : sync.s3 ? 's3' : 'file'
  sync.dirty = false
  for (const k of SYNC_KEYS) if (k in data) lsSet(k, data[k])
  sync.lastTouch = Date.now()
  startPolling()
  renderHomeHook()
}
let renderHomeHook: () => void = () => {}
export function setRenderHomeHook(fn: () => void) { renderHomeHook = fn }

/* ---------- 轮询（前台 5s；切回/聚焦立即） ---------- */
export const POLL_MS = 5000
let pollTimer: number | undefined
export function startPolling() {
  clearInterval(pollTimer)
  if (document.hidden) return
  pollTimer = window.setInterval(() => { void pollCheck() }, POLL_MS)
}
export function stopPolling() {
  clearInterval(pollTimer)
  pollTimer = undefined
}
export async function pollCheck() {
  if (!sync.cloud && !sync.s3 && !fileHandle) return
  if (sync.dirty) return
  try {
    if (sync.mode === 'cloud' && sync.cloud) {
      const r = await cloudRead()
      if (r.data && Object.keys(r.data).length && r.mtime > sync.cloud.updatedAt && r.mtime > sync.lastTouch + 1000) {
        sync.cloud.updatedAt = r.mtime
        applySyncData(r.data)
        ElMessage.success('已同步云端更新 ☁️')
      }
    } else if (sync.mode === 's3' && sync.s3) {
      const r = await s3Read()
      if (r.data && Object.keys(r.data).length && r.mtime > sync.lastTouch + 1500) {
        sync.s3.updatedAt = r.mtime
        applySyncData(r.data)
        ElMessage.success('已同步对象存储更新 🗄️')
      }
    } else if (sync.mode === 'file' && fileHandle) {
      const f = await fileHandle.getFile()
      if (f.lastModified > sync.lastTouch + 1000) {
        const r = await fileRead()
        if (r.data && Object.keys(r.data).length) { applySyncData(r.data); ElMessage.success('已同步其他设备的更新 🔄') }
      }
    }
  } catch { /* 瞬时错误忽略 */ }
}

/* ---------- 立即同步（双向：先拉后推；两端都有改动弹窗选择） ---------- */
export async function syncNow() {
  let remote: { data: Record<string, string>; mtime: number } | null = null
  try {
    if (sync.mode === 'cloud' && sync.cloud) remote = await cloudRead()
    else if (sync.mode === 's3' && sync.s3) remote = await s3Read()
    else if (sync.mode === 'file' && fileHandle) remote = await fileRead()
  } catch (e) {
    ElMessage.error('⚠️ 拉取失败：' + (e instanceof Error ? e.message : ''))
    return
  }
  if (remote) {
    const remoteTime = (sync.cloud && sync.cloud.updatedAt) || (sync.s3 && sync.s3.updatedAt) || sync.lastTouch
    const remoteNewer = remote.mtime > remoteTime
    if (remoteNewer && sync.dirty) {
      // 冲突：让用户选择
      try {
        await ElMessageBox.confirm('本机与远端都有新改动，以哪边为准？', '发现两处数据', {
          confirmButtonText: '使用远端数据（覆盖本机）',
          cancelButtonText: '使用本机数据（覆盖远端）',
          distinguishCancelAndClose: true
        })
        if (sync.cloud) sync.cloud.updatedAt = remote.mtime
        if (sync.s3) sync.s3.updatedAt = remote.mtime
        applySyncData(remote.data)
      } catch (action) {
        if (action === 'cancel' || action === 'close') {
          sync.fileData = buildLocalData()
          sync.dirty = true
          scheduleWrite()
          ElMessage.success('将以本机数据覆盖远端')
        }
      }
      return
    }
    if (remoteNewer) {
      if (sync.cloud) sync.cloud.updatedAt = remote.mtime
      if (sync.s3) sync.s3.updatedAt = remote.mtime
      applySyncData(remote.data)
      ElMessage.success('已拉取远端最新数据 ⬇️')
      return
    }
  }
  if (sync.dirty) await syncWrite()
  else ElMessage.success('已是最新 ✅')
}

function buildLocalData(): Record<string, string> {
  const o: Record<string, string> = {}
  for (const k of SYNC_KEYS) { const v = lsGet(k); if (v != null) o[k] = v }
  return o
}

/* ---------- 连接 ---------- */
export async function cloudConnect(url: string, key: string): Promise<boolean> {
  if (sync.mode === 'file' || sync.mode === 's3') disconnect()
  sync.cloud = { url: url.replace(/\/+$/, ''), key, updatedAt: 0 }
  try {
    const r = await cloudRead()
    sync.cloud.updatedAt = r.mtime
    lsSet('b_cloud', JSON.stringify({ url: sync.cloud.url, key: sync.cloud.key }))
    sync.saved.cloud = { url: sync.cloud.url, key: sync.cloud.key }
    const localHasData = SYNC_KEYS.some(k => lsGet(k) != null)
    if (localHasData && Object.keys(r.data).length) {
      const choose = await askDataSource('云端')
      if (choose === 'remote') applySyncData(r.data)
      else { sync.fileData = buildLocalData(); sync.dirty = true; scheduleWrite() }
    } else {
      applySyncData(r.data)
    }
    return true
  } catch {
    sync.cloud = null
    return false
  }
}
export async function s3Connect(cfg: S3Input): Promise<boolean> {
  if (sync.mode === 'file' || sync.mode === 'cloud') disconnect()
  sync.s3 = { ...cfg, key: 'beryl-data.json', updatedAt: 0 }
  try {
    const r = await s3Read()
    sync.s3.updatedAt = r.mtime
    lsSet('b_s3', JSON.stringify(sync.s3))
    sync.saved.s3 = { ...cfg }
    const localHasData = SYNC_KEYS.some(k => lsGet(k) != null)
    if (localHasData && Object.keys(r.data).length) {
      const choose = await askDataSource('远端')
      if (choose === 'remote') applySyncData(r.data)
      else { sync.fileData = buildLocalData(); sync.dirty = true; scheduleWrite() }
    } else {
      applySyncData(r.data)
    }
    return true
  } catch {
    sync.s3 = null
    return false
  }
}
export async function fileConnect(h: FileSystemFileHandle): Promise<boolean> {
  if (sync.mode === 'cloud' || sync.mode === 's3') disconnect()
  fileHandle = h
  try {
    const r = await fileRead()
    const localHasData = SYNC_KEYS.some(k => lsGet(k) != null)
    if (localHasData && Object.keys(r.data).length) {
      const choose = await askDataSource('文件')
      if (choose === 'remote') applySyncData(r.data)
      else { sync.fileData = buildLocalData(); sync.dirty = true; scheduleWrite() }
    } else {
      applySyncData(r.data)
    }
    return true
  } catch {
    fileHandle = null
    return false
  }
}

function askDataSource(srcName: string): Promise<'remote' | 'local'> {
  return ElMessageBox.confirm(`本机与${srcName}都有数据，以哪边为准？`, '发现两处数据', {
    confirmButtonText: `使用${srcName}数据（覆盖本机）`,
    cancelButtonText: '使用本机数据（覆盖' + srcName + '）',
    distinguishCancelAndClose: true
  }).then(() => 'remote' as const).catch(a => (a === 'cancel' || a === 'close' ? 'local' as const : 'local'))
}

export function disconnect() {
  clearTimeout(writeTimer)
  stopPolling()
  fileHandle = null
  sync.cloud = null
  sync.s3 = null
  sync.mode = 'local'
  sync.fileData = null
  sync.dirty = false
}

/* ---------- 启动恢复（自动重连已保存配置；刷新即同步；成功/失败提示） ---------- */
export async function restoreSync() {
  const cfg = safeParse<{ url: string; key: string }>(lsGet('b_cloud'))
  if (cfg && typeof cfg.url === 'string' && typeof cfg.key === 'string') {
    sync.saved.cloud = { url: cfg.url, key: cfg.key }
    sync.cloud = { url: cfg.url, key: cfg.key, updatedAt: 0 }
    try {
      const r = await cloudRead()
      sync.cloud.updatedAt = r.mtime
      applySyncData(r.data || {})
      ElMessage.success('✅ 已自动同步最新数据')
      return
    } catch {
      sync.cloud = null
      ElMessage.warning('⚠️ 云端自动同步失败：请检查网络或重新配置')
    }
  }
  const s3cfg = safeParse<S3Input>(lsGet('b_s3'))
  if (s3cfg && s3cfg.endpoint && s3cfg.bucket && s3cfg.ak && s3cfg.sk) {
    sync.saved.s3 = { ...s3cfg }
    sync.s3 = { ...s3cfg, key: 'beryl-data.json', updatedAt: 0 }
    try {
      const r = await s3Read()
      if (sync.s3) sync.s3.updatedAt = r.mtime
      applySyncData(r.data || {})
      ElMessage.success('✅ 已自动同步最新数据')
      return
    } catch {
      sync.s3 = null
      ElMessage.warning('⚠️ 对象存储自动同步失败：请检查网络或重新配置')
    }
  }
}

export function currentSceneForSync() { return currentSceneId() }
