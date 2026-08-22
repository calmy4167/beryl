/* ================================================================
   同步引擎（平移 v1：local / file / cloud / s3 四模式）
   - 机制：内存 fileData + localStorage 双写；0.8s 防抖上传；
     前台 5s 轮询 + 切回/聚焦立即拉取；立即同步（双向）；冲突弹窗
   - v2 阶段 3/4：Cloudflare 模式升级为【增量 LWW + AES-GCM 加密】
     （/api/sync/pull + /api/sync/push，D1 存储）；旧 Worker（KV 全量）
     自动回退（404 检测）；S3 / 文件模式保持全量快照语义
   ================================================================ */
import { reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { lsGet, lsRemove, lsSet, safeParse, setSyncWriteHook } from './storage.ts'
import { SCENES, currentSceneId } from './scenes.ts'
import { readChanges, DEVICE_ID, dbMirrorDelete, dbMirrorPut } from './db.ts'
import { encryptValue, decryptValue } from './crypto.ts'
import { apiFetch } from './api/client.ts'
import { syncEntityData } from './entity-sync'

export interface S3Cfg { endpoint: string; bucket: string; region: string; ak: string; sk: string; key: string; updatedAt: number }
export interface S3Input { endpoint: string; bucket: string; region: string; ak: string; sk: string }
export type SyncPhase = 'idle' | 'dirty' | 'syncing' | 'offline' | 'conflict' | 'error'

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
  phase: SyncPhase
  lastError: string
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
  , phase: 'idle'
  , lastError: ''
})

export const SYNC_KEYS = ['b_tasks', 'b_inbox', 'b_habits', 'b_goals', 'b_finance', 'b_diary', 'b_chars', 'b_posts', 'b_cases', 'b_caseRelations', 'b_moments', 'b_pomoTotal', 'b_pomoCount', 'b_scene']
const ENTITY_SYNC_KEYS = new Set(['b_tasks', 'b_inbox', 'b_habits', 'b_goals', 'b_finance', 'b_diary', 'b_chars', 'b_posts', 'b_cases', 'b_caseRelations', 'b_moments'])

/** Pages 构建时注入的独立 Worker 地址；未设置时仍可在后台手动填写。 */
export const DEFAULT_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')

/**
 * 从 Pages 合体模式迁移：旧配置若正好指向当前 Pages 站点，自动改用构建时指定的
 * 独立 Worker。手动填写的其他地址始终保持不变。
 */
export function preferredCloudUrl(savedUrl = ''): string {
  const saved = savedUrl.trim().replace(/\/+$/, '')
  if (!DEFAULT_API_BASE_URL || typeof window === 'undefined') return saved || DEFAULT_API_BASE_URL
  const currentPage = window.location.origin.replace(/\/+$/, '')
  return saved === currentPage ? DEFAULT_API_BASE_URL : (saved || DEFAULT_API_BASE_URL)
}

/* 存储挂钩：模块 store.set → fileData + dirty + 防抖写（与 v1 一致） */
setSyncWriteHook((key, str) => {
  if (!sync.fileData) return
  sync.fileData[key] = str
  const versions = safeParse<Record<string, number>>(lsGet('b_sync_ts')) || {}
  versions[key] = Math.max(Number(versions[key]) || 0, Date.now())
  lsSet('b_sync_ts', JSON.stringify(versions))
  sync.dirty = true
  sync.phase = 'dirty'
  scheduleWrite()
})

/* ---------- 数据校验（白名单） ---------- */
const SCHEMA: Record<string, (v: unknown) => boolean> = {
  b_tasks: Array.isArray, b_inbox: Array.isArray, b_habits: Array.isArray, b_goals: Array.isArray,
  b_finance: Array.isArray, b_diary: Array.isArray, b_chars: Array.isArray, b_posts: Array.isArray,
  b_cases: Array.isArray, b_caseRelations: Array.isArray, b_moments: Array.isArray,
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

/* ================================================================
   Cloudflare 模式：v2 阶段 3/4（增量 LWW + AES-GCM 加密，D1 后端）
   - pull 游标 b_pull_cursor：云端时间线三元组 (ts,device,key)
   - 本地时间线 b_sync_ts：按键保存的最后本地版本
   - 推送游标 b_push_cursor：IndexedDB 变更日志 seq 位置
   - 旧 Worker（无 /api/sync/*，返回 404）自动回退全量快照协议
   ================================================================ */
const enc = new TextEncoder()
function toHex(bytes: Uint8Array): string { return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('') }
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text))
  return toHex(new Uint8Array(buf))
}

function getNum(k: string): number { return Number(lsGet(k) || 0) || 0 }
interface SyncCursor { ts: number; device: string; key: string }
function getCursor(): SyncCursor {
  const raw = safeParse<SyncCursor | number>(lsGet('b_pull_cursor'))
  if (typeof raw === 'number') return { ts: raw, device: '', key: '' }
  return raw && typeof raw.ts === 'number' ? raw : { ts: 0, device: '', key: '' }
}
const pullCursor = () => getCursor()
const setPullCursor = (v: SyncCursor) => lsSet('b_pull_cursor', JSON.stringify(v))
function localVersions(): Record<string, number> {
  const raw = safeParse<Record<string, number> | number>(lsGet('b_sync_ts'))
  return typeof raw === 'number' ? { '*': raw } : (raw || {})
}
const localTs = (key?: string) => {
  const versions = localVersions()
  return key ? Number(versions[key] || versions['*'] || 0) : Math.max(0, ...Object.values(versions).map(Number))
}
function setLocalTs(value: number, key?: string) {
  const versions = localVersions()
  if (key) versions[key] = Math.max(Number(versions[key]) || 0, value)
  else versions['*'] = Math.max(Number(versions['*']) || 0, value)
  lsSet('b_sync_ts', JSON.stringify(versions))
}

interface PullRecord { key: string; value: unknown; ts: number; device?: string; deleted?: boolean }

/**
 * 解密一条云端记录值：
 * - 对象密文（{v:2,...}）→ 解密
 * - 字符串：先尝试 JSON.parse——若是密文格式（Worker 存储时 JSON.stringify 过）→ 解密；
 *   否则视为旧明文原样返回
 * - 其他（非密文对象）→ null
 */
async function decryptRecordValue(password: string, value: unknown): Promise<string | null> {
  if (typeof value === 'string') {
    // 可能是 Worker JSON.stringify 存储的密文，也可能是旧明文
    let parsed: unknown = null
    try { parsed = JSON.parse(value) } catch { /* 非 JSON：明文 */ }
    if (parsed && typeof parsed === 'object' && (parsed as { v?: unknown }).v === 2) {
      const plain = await decryptValue(password, parsed)
      if (plain !== null) return plain
       return null // v2 密文解密失败绝不能当作业务明文写回
    }
    return value // 明文
  }
  if (value && typeof value === 'object' && (value as { v?: unknown }).v === 2) {
    const plain = await decryptValue(password, value)
    if (plain !== null) return plain
  }
  return null
}

/**
 * 增量合并（LWW）：只取 ts 大于本地时间线的记录（自己推的跳过），
 * 解密后返回应写入本地的键值。纯函数（依赖 crypto 解密），可单测。
 */
export async function applyIncremental(
  records: PullRecord[],
  password: string,
  lts: number | Record<string, number>
): Promise<Record<string, string>> {
  const incoming: Record<string, string> = {}
  for (const rec of records) {
    if (rec.deleted || !rec.key || !rec.key.startsWith('b_')) continue
    const localVersion = typeof lts === 'number' ? lts : Number(lts[rec.key] || lts['*'] || 0)
    if (rec.ts <= localVersion) continue // 自己推的 / 不比自己新的，跳过（不覆盖本地新数据）
    const plain = await decryptRecordValue(password, rec.value)
    if (plain !== null) incoming[rec.key] = plain
  }
  return incoming
}

/** 返回仍然新于本地时间线的键级 tombstone。 */
export function incomingDeletedKeys(records: PullRecord[], lts: number | Record<string, number>): string[] {
  return records.filter(rec => {
    if (!rec.deleted || !rec.key || !rec.key.startsWith('b_')) return false
    const localVersion = typeof lts === 'number' ? lts : Number(lts[rec.key] || lts['*'] || 0)
    return rec.ts > localVersion
  }).map(rec => rec.key)
}

/** 增量拉取；404 → 旧 Worker（返回 null，调用方回退） */
async function cloudPull(since: SyncCursor): Promise<{ records: PullRecord[]; nextCursor: SyncCursor; hasMore: boolean; maxTs: number } | null> {
  if (!sync.cloud) throw new Error('not-connected')
  const res = await apiFetch(sync.cloud.url, '/api/sync/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sync.cloud.key },
    body: JSON.stringify({ since: since.ts, sinceDevice: since.device, sinceKey: since.key })
  })
  if (res.status === 404) return null
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const j = await res.json()
  if (!j || !j.ok || !Array.isArray(j.records)) throw new Error('bad-response')
  const records = j.records as PullRecord[]
  const last = records[records.length - 1]
  const nextCursor = j.nextCursor && typeof j.nextCursor.ts === 'number'
    ? j.nextCursor as SyncCursor
    : last ? { ts: last.ts, device: last.device || '', key: last.key } : since
  return { records, nextCursor, hasMore: Boolean(j.hasMore), maxTs: Number(j.maxTs) || 0 }
}

/** 拉完所有分页后再推进游标，避免单页 maxTs 造成记录跳过。 */
async function cloudPullAll(since: SyncCursor): Promise<{ records: PullRecord[]; nextCursor: SyncCursor; maxTs: number } | null> {
  let cursor = since
  const records: PullRecord[] = []
  let maxTs = 0
  for (let page = 0; page < 100; page++) {
    const result = await cloudPull(cursor)
    if (result === null) return null
    records.push(...result.records)
    maxTs = Math.max(maxTs, result.maxTs)
    if (!result.hasMore || !result.records.length) return { records, nextCursor: result.nextCursor, maxTs }
    if (result.nextCursor.ts === cursor.ts && result.nextCursor.device === cursor.device && result.nextCursor.key === cursor.key) {
      throw new Error('sync-cursor-stalled')
    }
    cursor = result.nextCursor
  }
  throw new Error('sync-page-limit')
}

function markIncomingVersions(records: PullRecord[], acceptedKeys?: Set<string>) {
  records.forEach(rec => {
    if (rec.key.startsWith('b_') && (!acceptedKeys || acceptedKeys.has(rec.key))) setLocalTs(rec.ts, rec.key)
  })
}

/** 增量推送；false = 旧 Worker（需回退全量） */
async function cloudPush(changes: { key: string; ts: number; device: string; value: unknown; deleted?: boolean }[]): Promise<boolean> {
  if (!sync.cloud) throw new Error('not-connected')
  const res = await apiFetch(sync.cloud.url, '/api/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sync.cloud.key },
    body: JSON.stringify({ changes })
  })
  if (res.status === 404) return false
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const j = await res.json()
  if (!j || !j.ok) throw new Error('bad-response')
  return true
}

/** 解密记录 → 本地键值（密文解密；旧明文直通） */
async function decryptRecords(records: PullRecord[], password: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const rec of records) {
    if (rec.deleted || !rec.key || !rec.key.startsWith('b_')) continue
    const plain = await decryptRecordValue(password, rec.value)
    if (plain !== null) out[rec.key] = plain
  }
  return out
}

/**
 * 检测本地疑似密文残留。历史实现会直接删除，这里只报告数量，避免在无法确认密码/云端状态时造成数据丢失。
 */
export function purgeCorruptedEncryptedKeys(): number {
  let removed = 0
  for (const k of SYNC_KEYS) {
    const raw = lsGet(k)
    if (!raw) continue
    try {
      const p = JSON.parse(raw)
      if (p && typeof p === 'object' && !Array.isArray(p) && p.v === 2) removed++
    } catch { /* 明文/普通字符串，保留 */ }
  }
  return removed
}

/** 收集本地变更：优先 IndexedDB 变更日志增量；只有显式首次连接时才生成全量快照。 */
let forceFullSnapshot = false
async function collectLocalChanges(): Promise<{ key: string; ts: number; device: string; value: string; deleted?: boolean; lastSeq: number }[]> {
  const cursor = getNum('b_push_cursor')
  const changes = await readChanges(cursor, 500)
  if (changes.length) {
    const latest = new Map<string, (typeof changes)[number]>()
    let maxSeq = cursor
    changes.filter(c => c.key.startsWith('b_')).forEach(c => { latest.set(c.key, c); if (c.seq > maxSeq) maxSeq = c.seq })
    if (latest.size) return Array.from(latest.values()).filter(c => !ENTITY_SYNC_KEYS.has(c.key)).map(c => ({ key: c.key, ts: c.ts, device: DEVICE_ID, value: c.value, deleted: c.deleted, lastSeq: maxSeq }))
  }
  if (!forceFullSnapshot) return []
  const out: { key: string; ts: number; device: string; value: string; lastSeq: number }[] = []
  let ts = Date.now()
  for (const k of SYNC_KEYS.filter(key => !ENTITY_SYNC_KEYS.has(key))) {
    const v = lsGet(k)
    if (v != null) out.push({ key: k, ts: ts++, device: DEVICE_ID, value: v, lastSeq: 0 })
  }
  return out
}

function buildLocalData(): Record<string, string> {
  const o: Record<string, string> = {}
  for (const k of SYNC_KEYS) { const v = lsGet(k); if (v != null) o[k] = v }
  return o
}

async function cloudWrite() {
  if (!sync.cloud) return
  sync.phase = 'syncing'
  sync.lastError = ''
  try {
    const changes = await collectLocalChanges()
    if (!changes.length) {
      await syncEntityData(sync.cloud.url, sync.cloud.key)
      sync.dirty = false; sync.phase = 'idle'; return
    }
    const encChanges: { key: string; ts: number; device: string; value: unknown; deleted?: boolean }[] = []
    let maxSeq = 0
    for (const c of changes) {
      if (c.lastSeq > maxSeq) maxSeq = c.lastSeq
       if (c.deleted) encChanges.push({ key: c.key, ts: c.ts, device: c.device, value: null, deleted: true })
       else {
         const v = await encryptValue(sync.cloud.key, c.value)
         if (!v) throw new Error('encrypt-failed')
         encChanges.push({ key: c.key, ts: c.ts, device: c.device, value: v })
       }
    }
    const ok = await cloudPush(encChanges)
    if (!ok) { await cloudWriteLegacy(); await syncEntityData(sync.cloud.url, sync.cloud.key); return }
     if (maxSeq) lsSet('b_push_cursor', String(maxSeq))
     changes.forEach(c => setLocalTs(c.ts, c.key))
     forceFullSnapshot = false
    sync.dirty = false
    sync.phase = 'idle'
    sync.lastTouch = Date.now()
    await syncEntityData(sync.cloud.url, sync.cloud.key)
    markLastSync(true)
    ElMessage.success('已同步到云端 ☁️')
  } catch (e) {
    sync.phase = navigator.onLine ? 'error' : 'offline'
    sync.lastError = e instanceof Error ? e.message : '网络错误'
    markLastSync(false, e instanceof Error ? e.message : '网络错误')
    ElMessage.error('⚠️ 云端同步失败：' + (e instanceof Error ? e.message : '网络错误'))
  }
}

/* 旧 Worker（KV 全量快照）回退 */
async function cloudReadLegacy(): Promise<{ data: Record<string, string>; mtime: number }> {
  if (!sync.cloud) throw new Error('not-connected')
  const res = await apiFetch(sync.cloud.url, '/api/data', { headers: { Authorization: 'Bearer ' + sync.cloud.key } })
  if (res.status === 401) throw new Error('unauthorized')
  const j = await res.json()
  if (!j || !j.ok) throw new Error('bad-response')
  const parsed = parseSyncData(j.data || {})
  if ('error' in parsed) throw new Error('bad-data')
  return { data: parsed.data, mtime: j.updatedAt || 0 }
}
async function cloudWriteLegacy() {
  if (!sync.cloud) return
  const payload = { ...(sync.fileData || buildLocalData()), _meta: { appVersion: 'v2.0.0', savedAt: new Date().toISOString() } }
  try {
    const res = await apiFetch(sync.cloud.url, '/api/data', {
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
export function applySyncData(data: Record<string, string>, deletedKeys: string[] = []) {
  const next = { ...data }
  deletedKeys.forEach(key => { delete next[key] })
  sync.fileData = next
  sync.mode = sync.cloud ? 'cloud' : sync.s3 ? 's3' : 'file'
  sync.dirty = false
  for (const k of SYNC_KEYS) {
    if (k in next) {
      if (lsSet(k, next[k], false)) void dbMirrorPut(k, next[k])
    } else if (deletedKeys.includes(k)) {
      lsRemove(k, false)
      void dbMirrorDelete(k)
    }
  }
  sync.lastTouch = Date.now()
  startPolling()
  renderHomeHook()
  // 通知当前页面重新读取存储（模块组件重建，新数据上屏）
  try { window.dispatchEvent(new CustomEvent('beryl-data-synced')) } catch { /* ignore */ }
}
let renderHomeHook: () => void = () => {}
export function setRenderHomeHook(fn: () => void) { renderHomeHook = fn }

/* ---------- 轮询（前台 5s；切回/聚焦立即） ---------- */
export const POLL_MS = 5000
let pollTimer: number | undefined
let pollInFlight: Promise<void> | null = null
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
  if (pollInFlight) return pollInFlight
  pollInFlight = (async () => { try {
    if (sync.mode === 'cloud' && sync.cloud) {
      const r = await cloudPullAll(pullCursor())
      if (r === null) {
        // 旧 Worker：全量快照
        const r2 = await cloudReadLegacy()
        if (r2.data && Object.keys(r2.data).length && r2.mtime > sync.cloud.updatedAt && r2.mtime > sync.lastTouch + 1000) {
          sync.cloud.updatedAt = r2.mtime
          applySyncData(r2.data)
          ElMessage.success('已同步云端更新 ☁️')
        }
      } else if (r.records.length) {
        const lts = localVersions()
        const incoming = await applyIncremental(r.records, sync.cloud.key, lts)
        const deletedKeys = incomingDeletedKeys(r.records, lts)
        markIncomingVersions(r.records, new Set([...Object.keys(incoming), ...deletedKeys]))
        setPullCursor(r.nextCursor)
        if (Object.keys(incoming).length || deletedKeys.length) {
          applySyncData({ ...buildLocalData(), ...incoming }, deletedKeys)
          ElMessage.success('已同步云端更新 ☁️')
        }
      } else {
        setPullCursor(r.nextCursor)
      }
      await syncEntityData(sync.cloud.url, sync.cloud.key)
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
  } catch { /* 瞬时错误忽略 */ } })()
  try { await pollInFlight } finally { pollInFlight = null }
}

/* ---------- 立即同步（双向：先拉后推；两端都有改动弹窗选择） ---------- */
export async function syncNow() {
  try {
    if (sync.mode === 'cloud' && sync.cloud) {
      const r = await cloudPullAll({ ts: 0, device: '', key: '' })
      if (r !== null) {
        const lts = localVersions()
        const incoming = await applyIncremental(r.records, sync.cloud.key, lts)
        const deletedKeys = incomingDeletedKeys(r.records, lts)
        const remoteNew = Object.keys(incoming).length > 0 || deletedKeys.length > 0
        if (remoteNew && sync.dirty) {
          try {
            await ElMessageBox.confirm('本机与远端都有新改动，以哪边为准？', '发现两处数据', {
              confirmButtonText: '使用远端数据（覆盖本机）',
              cancelButtonText: '使用本机数据（覆盖远端）',
              distinguishCancelAndClose: true
            })
            applySyncData({ ...buildLocalData(), ...incoming }, deletedKeys)
            markIncomingVersions(r.records, new Set([...Object.keys(incoming), ...deletedKeys]))
            setPullCursor(r.nextCursor)
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
        if (remoteNew) {
          applySyncData({ ...buildLocalData(), ...incoming }, deletedKeys)
          markIncomingVersions(r.records, new Set([...Object.keys(incoming), ...deletedKeys]))
          setPullCursor(r.nextCursor)
          ElMessage.success('已拉取远端最新数据 ⬇️')
          return
        }
        setPullCursor(r.nextCursor)
      } else {
        // 旧 Worker 回退
        const r2 = await cloudReadLegacy()
        const remoteNewer = r2.mtime > (sync.cloud.updatedAt || 0)
        if (remoteNewer && sync.dirty) {
          try {
            await ElMessageBox.confirm('本机与远端都有新改动，以哪边为准？', '发现两处数据', {
              confirmButtonText: '使用远端数据（覆盖本机）',
              cancelButtonText: '使用本机数据（覆盖远端）',
              distinguishCancelAndClose: true
            })
            sync.cloud.updatedAt = r2.mtime
            applySyncData(r2.data)
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
          sync.cloud.updatedAt = r2.mtime
          applySyncData(r2.data)
          ElMessage.success('已拉取远端最新数据 ⬇️')
          return
        }
      }
    } else {
      let remote: { data: Record<string, string>; mtime: number } | null = null
      try {
        if (sync.mode === 's3' && sync.s3) remote = await s3Read()
        else if (sync.mode === 'file' && fileHandle) remote = await fileRead()
      } catch (e) {
        ElMessage.error('⚠️ 拉取失败：' + (e instanceof Error ? e.message : ''))
        return
      }
      if (remote) {
        const remoteTime = (sync.s3 && sync.s3.updatedAt) || sync.lastTouch
        const remoteNewer = remote.mtime > remoteTime
        if (remoteNewer && sync.dirty) {
          try {
            await ElMessageBox.confirm('本机与远端都有新改动，以哪边为准？', '发现两处数据', {
              confirmButtonText: '使用远端数据（覆盖本机）',
              cancelButtonText: '使用本机数据（覆盖远端）',
              distinguishCancelAndClose: true
            })
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
          if (sync.s3) sync.s3.updatedAt = remote.mtime
          applySyncData(remote.data)
          ElMessage.success('已拉取远端最新数据 ⬇️')
          return
        }
      }
    }
  } catch (e) {
    ElMessage.error('⚠️ 拉取失败：' + (e instanceof Error ? e.message : ''))
    return
  }
  if (sync.mode === 'cloud' && sync.cloud) await syncEntityData(sync.cloud.url, sync.cloud.key)
  if (sync.dirty) await syncWrite()
  else ElMessage.success('已是最新 ✅')
}

/* ---------- 连接 ---------- */
export async function cloudConnect(url: string, key: string): Promise<boolean> {
  if (sync.mode === 'file' || sync.mode === 's3') disconnect()
  sync.cloud = { url: url.replace(/\/+$/, ''), key, updatedAt: 0 }
  sync.phase = 'syncing'
  sync.lastError = ''
  try {
    const r = await cloudPullAll({ ts: 0, device: '', key: '' })
    if (r !== null) {
      const lts = localVersions()
      const data = await decryptRecords(r.records, key)
      const deletedKeys = incomingDeletedKeys(r.records, lts)
      sync.cloud.updatedAt = r.maxTs
      setPullCursor(r.nextCursor)
      lsSet('b_cloud', JSON.stringify({ url: sync.cloud.url, key: sync.cloud.key }))
      sync.saved.cloud = { url: sync.cloud.url, key: sync.cloud.key }
      const localHasData = SYNC_KEYS.some(k => lsGet(k) != null)
      const remoteHasData = Object.keys(data).length > 0 || deletedKeys.length > 0
      if (localHasData && remoteHasData) {
        const choose = await askDataSource('云端')
        if (choose === 'remote') {
          applySyncData(data, deletedKeys)
          markIncomingVersions(r.records, new Set([...Object.keys(data), ...deletedKeys]))
        }
        else {
          sync.mode = 'cloud' // ← 必须设置，否则推送/轮询永远不会触发
          sync.fileData = buildLocalData()
          sync.dirty = true
          forceFullSnapshot = true
          scheduleWrite()
        }
      } else if (remoteHasData) {
        applySyncData(data, deletedKeys)
        markIncomingVersions(r.records, new Set([...Object.keys(data), ...deletedKeys]))
      } else if (localHasData) {
        sync.mode = 'cloud' // ← 同上
        sync.fileData = buildLocalData()
        sync.dirty = true
        forceFullSnapshot = true
        scheduleWrite()
      }
      await syncEntityData(sync.cloud.url, sync.cloud.key)
      sync.phase = 'idle'
      return true
    }
    // 旧 Worker 回退
    const r2 = await cloudReadLegacy()
    sync.cloud.updatedAt = r2.mtime
    lsSet('b_cloud', JSON.stringify({ url: sync.cloud.url, key: sync.cloud.key }))
    sync.saved.cloud = { url: sync.cloud.url, key: sync.cloud.key }
    const localHasData = SYNC_KEYS.some(k => lsGet(k) != null)
    if (localHasData && Object.keys(r2.data).length) {
      const choose = await askDataSource('云端')
      if (choose === 'remote') applySyncData(r2.data)
      else { sync.mode = 'cloud'; sync.fileData = buildLocalData(); sync.dirty = true; forceFullSnapshot = true; scheduleWrite() }
    } else {
      applySyncData(r2.data)
    }
    await syncEntityData(sync.cloud.url, sync.cloud.key)
    sync.phase = 'idle'
    return true
  } catch (e) {
    sync.phase = navigator.onLine ? 'error' : 'offline'
    sync.lastError = e instanceof Error ? e.message : '连接失败'
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
      else { sync.mode = 's3'; sync.fileData = buildLocalData(); sync.dirty = true; scheduleWrite() }
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
      else { sync.mode = 'file'; sync.fileData = buildLocalData(); sync.dirty = true; scheduleWrite() }
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
  sync.phase = 'idle'
  sync.lastError = ''
}

/* ---------- 启动恢复（自动重连已保存配置；刷新即同步） ---------- */
export async function restoreSync() {
  const cfg = safeParse<{ url: string; key: string }>(lsGet('b_cloud'))
  if (cfg && typeof cfg.url === 'string' && typeof cfg.key === 'string') {
    const apiUrl = preferredCloudUrl(cfg.url)
    if (apiUrl !== cfg.url) lsSet('b_cloud', JSON.stringify({ ...cfg, url: apiUrl }))
    sync.saved.cloud = { url: apiUrl, key: cfg.key }
    sync.cloud = { url: apiUrl, key: cfg.key, updatedAt: 0 }
    try {
       const r = await cloudPullAll({ ts: 0, device: '', key: '' })
      if (r !== null) {
        sync.mode = 'cloud' // ← 连上即云端模式，推送/轮询/立即同步全部生效
        // 刷新自动重连：增量 LWW 合并，绝不覆盖本地更新的数据
         const lts = localVersions()
         const incoming = await applyIncremental(r.records, cfg.key, lts)
         const deletedKeys = incomingDeletedKeys(r.records, lts)
         markIncomingVersions(r.records, new Set([...Object.keys(incoming), ...deletedKeys]))
         setPullCursor(r.nextCursor)
        if (Object.keys(incoming).length || deletedKeys.length) {
          applySyncData({ ...buildLocalData(), ...incoming }, deletedKeys)
        }
        // 把本地新数据推上云端（首次连接 / 上次未推成功的增量）
         if (Object.keys(buildLocalData()).length && getNum('b_push_cursor') === 0) {
           sync.fileData = buildLocalData()
           sync.dirty = true
           forceFullSnapshot = true
           scheduleWrite()
        }
        ElMessage.success('✅ 已自动同步最新数据')
        return
      }
      const r2 = await cloudReadLegacy()
      sync.cloud.updatedAt = r2.mtime
      applySyncData(r2.data || {})
      ElMessage.success('✅ 已自动同步最新数据')
      return
    } catch (e) {
      sync.cloud = null
      const msg = e instanceof Error ? e.message : ''
      if (msg === 'unauthorized') {
        ElMessage.warning('⚠️ 云端同步失败：同步密码不匹配（若为新部署，需先在 Worker 上执行一次 /api/setup 设置同步密码）')
      } else {
        ElMessage.warning('⚠️ 云端自动同步失败：' + (msg || '网络错误'))
      }
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

/* ---------- 同步诊断（排查"连上但不同步"问题） ---------- */
export interface SyncDiag {
  url: string
  pullCursor: number
  localTs: number
  pushCursor: number
  dirty: boolean
  lastSync: string
  cloudRecords: number  // -1 未连接 / -2 旧Worker / -3 请求失败
  cloudMaxTs: number
  localInboxSample: string
}

export async function diagSync(): Promise<SyncDiag> {
  const d: SyncDiag = {
    url: sync.cloud?.url || sync.saved.cloud?.url || '(未配置)',
    pullCursor: pullCursor().ts,
    localTs: localTs(),
    pushCursor: getNum('b_push_cursor'),
    dirty: sync.dirty,
    lastSync: lsGet('b_last_sync') || '从未同步过',
    cloudRecords: -1,
    cloudMaxTs: 0,
    localInboxSample: (lsGet('b_inbox') || '(空)').slice(0, 150)
  }
  if (sync.cloud) {
    try {
      const r = await cloudPullAll(pullCursor())
      if (r !== null) { d.cloudRecords = r.records.length; d.cloudMaxTs = r.maxTs }
      else d.cloudRecords = -2
    } catch {
      d.cloudRecords = -3
    }
  }
  return d
}

/* 记录最近一次推送结果（后台显示用） */
function markLastSync(ok: boolean, extra = '') {
  try {
    lsSet('b_last_sync', new Date().toLocaleTimeString() + (ok ? ' 推送成功' : ' 推送失败') + (extra ? ' ' + extra : ''))
  } catch { /* ignore */ }
}
