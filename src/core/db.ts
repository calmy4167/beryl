/* ============ v2 阶段 2：IndexedDB 持久镜像 + 变更日志 ============
 * 目标（对应 v1 文档 §14.2/14.3）：
 *   - kv 表：localStorage 全部 b_* 键的持久镜像（防止 localStorage 被清理丢数据）
 *   - pending_writes 表：IndexedDB 自身的可恢复写入队列（localStorage 不可用时仍可重放）
 *   - changes 表：append-only 变更日志（{ seq, ts, key, value }，为阶段 3 增量同步铺路）
 *   - meta 表：元数据（最近镜像时间、设备 id）
 * UI 层仍走 localStorage 同步层（同步快照缓存），IndexedDB 为异步持久层，
 * 启动时先恢复再镜像；写入先进入可恢复 outbox，再串行提交到 IndexedDB。
 * IndexedDB 暂不可用时不阻断页面，但会保留 outbox 并在下次启动重试。
 */
const DB_NAME = 'beryl-db'
const DB_VERSION = 3
const KV = 'kv'
const CHANGES = 'changes'
const META = 'meta'
const ENTITY_CHANGES = 'entity_changes'
const OUTBOX = 'b_db_outbox'
const PENDING_WRITES = 'pending_writes'
const DB_INITIALIZED_AT = 'initializedAt'

const DEVICE_STORAGE_KEY = 'beryl_device_id'
const ENTITY_VERSION_STORAGE_KEY = 'beryl_entity_version'

function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_STORAGE_KEY)
    if (existing) return existing
    const id = 'dev-' + crypto.randomUUID()
    localStorage.setItem(DEVICE_STORAGE_KEY, id)
    return id
  } catch {
    return 'dev-' + Math.random().toString(36).slice(2, 10)
  }
}

export const DEVICE_ID = getDeviceId()

export type DbRuntimeState = 'cold' | 'recovering' | 'ready' | 'degraded'

export interface DbRuntimeStatus {
  state: DbRuntimeState
  available: boolean
  pendingWrites: number
  restoredKeys: number
  lastMirrorAt: number | null
  lastError: string | null
}

export interface EntityWriteContext {
  before: unknown
  after: unknown
}

let dbPromise: Promise<IDBDatabase> | null = null
let dbWriteChain: Promise<void> = Promise.resolve()
let entityChangeChain: Promise<void> = Promise.resolve()
let entityChangeNonce = 0
const indexedPendingKeys = new Set<string>()
let dbStatus: DbRuntimeStatus = {
  state: 'cold',
  available: false,
  pendingWrites: 0,
  restoredKeys: 0,
  lastMirrorAt: null,
  lastError: null
}

/** 为实体同步提供跨刷新、同设备单调递增的版本号。 */
export function nextEntityVersion(now = Date.now()): number {
  let previous = 0
  try { previous = Number(localStorage.getItem(ENTITY_VERSION_STORAGE_KEY)) || 0 } catch { /* memory-only fallback */ }
  const next = Math.max(now, previous + 1)
  try { localStorage.setItem(ENTITY_VERSION_STORAGE_KEY, String(next)) } catch { /* memory-only fallback */ }
  return next
}

interface PendingDbWrite { key: string; value?: string; deleted?: boolean; entityChanges?: EntityChange[] }

function readPendingWrites(): PendingDbWrite[] {
  try {
    const raw = localStorage.getItem(OUTBOX)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is PendingDbWrite => Boolean(item) && typeof item === 'object' && typeof item.key === 'string' && (item.deleted === true || typeof item.value === 'string'))
  } catch { return [] }
}

function writePendingWrites(items: PendingDbWrite[]): void {
  dbStatus.pendingWrites = items.length
  try {
    if (items.length) localStorage.setItem(OUTBOX, JSON.stringify(items))
    else localStorage.removeItem(OUTBOX)
  } catch {
    dbStatus.lastError = 'outbox-write-failed'
  }
}

function enqueuePendingWrite(key: string, value?: string, deleted = false, entityChanges?: EntityChange[]): void {
  const items = readPendingWrites()
  const index = items.findIndex(item => item.key === key)
  const next = deleted ? { key, deleted: true } : { key, value, ...(entityChanges?.length ? { entityChanges } : {}) }
  if (index >= 0) items[index] = next
  else items.push(next)
  writePendingWrites(items)
}

function removePendingWrite(key: string, value?: string, deleted = false): void {
  const items = readPendingWrites().filter(item => item.key !== key || item.value !== value || (item.deleted === true) !== deleted)
  writePendingWrites(items)
}

function markDbFailure(error: unknown): void {
  dbStatus.state = 'degraded'
  dbStatus.available = false
  dbStatus.lastError = error instanceof Error ? error.message : String(error || 'indexedDB unavailable')
}

export function getDbStatus(): DbRuntimeStatus {
  return { ...dbStatus, pendingWrites: Math.max(readPendingWrites().length, indexedPendingKeys.size) }
}

function enqueueDbWork(work: () => Promise<void>): Promise<void> {
  const next = dbWriteChain.then(work, work)
  dbWriteChain = next.catch(() => undefined)
  return next
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      markDbFailure('indexedDB unavailable')
      dbPromise = null
      reject(new Error('indexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV)
      if (!db.objectStoreNames.contains(CHANGES)) {
        const s = db.createObjectStore(CHANGES, { keyPath: 'seq', autoIncrement: true })
        s.createIndex('ts', 'ts', { unique: false })
        s.createIndex('key', 'key', { unique: false })
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META)
      if (!db.objectStoreNames.contains(ENTITY_CHANGES)) {
        const s = db.createObjectStore(ENTITY_CHANGES, { keyPath: 'id' })
        s.createIndex('entity', 'entity', { unique: false })
        s.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(PENDING_WRITES)) db.createObjectStore(PENDING_WRITES, { keyPath: 'key' })
    }
    req.onsuccess = () => {
      const opened = req.result
      opened.onclose = () => {
        dbPromise = null
        markDbFailure('indexedDB connection closed')
      }
      dbStatus.available = true
      dbStatus.lastError = null
      resolve(opened)
    }
    req.onerror = () => {
      dbPromise = null
      const error = req.error || new Error('indexedDB open failed')
      markDbFailure(error)
      reject(error)
    }
  })
  return dbPromise
}

function waitForTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('indexedDB transaction aborted'))
  })
}

async function queueIndexedDbWrite(db: IDBDatabase, item: PendingDbWrite): Promise<void> {
  const tx = db.transaction(PENDING_WRITES, 'readwrite')
  tx.objectStore(PENDING_WRITES).put(item)
  await waitForTransaction(tx)
  indexedPendingKeys.add(item.key)
}

async function readIndexedDbWrites(db: IDBDatabase): Promise<PendingDbWrite[]> {
  const tx = db.transaction(PENDING_WRITES, 'readonly')
  const all = await new Promise<PendingDbWrite[]>((resolve, reject) => {
    const req = tx.objectStore(PENDING_WRITES).getAll()
    req.onsuccess = () => resolve(req.result as PendingDbWrite[])
    req.onerror = () => reject(req.error)
  })
  await waitForTransaction(tx)
  const filtered = all.filter(item => Boolean(item) && typeof item.key === 'string' && (item.deleted === true || typeof item.value === 'string'))
  indexedPendingKeys.clear()
  filtered.forEach(item => indexedPendingKeys.add(item.key))
  return filtered
}

async function applyIndexedDbWrite(db: IDBDatabase, item: PendingDbWrite, entityChanges: EntityChange[] = item.entityChanges || []): Promise<void> {
  const stores = entityChanges.length ? [KV, CHANGES, PENDING_WRITES, ENTITY_CHANGES] : [KV, CHANGES, PENDING_WRITES]
  const tx = db.transaction(stores, 'readwrite')
  if (item.deleted) {
    tx.objectStore(KV).delete(item.key)
    tx.objectStore(CHANGES).add({ ts: Date.now(), key: item.key, value: '', device: DEVICE_ID, deleted: true })
  }
  else {
    tx.objectStore(KV).put(item.value, item.key)
    tx.objectStore(CHANGES).add({ ts: Date.now(), key: item.key, value: item.value || '', device: DEVICE_ID })
  }
  if (entityChanges.length) {
    const entityStore = tx.objectStore(ENTITY_CHANGES)
    entityChanges.forEach((change, index) => entityStore.put({ ...change, id: `${change.id}:${index}` }))
  }
  tx.objectStore(PENDING_WRITES).delete(item.key)
  await waitForTransaction(tx)
  indexedPendingKeys.delete(item.key)
}

/** 把当前 localStorage 的全部 b_* 键镜像进 kv，并追加一条变更日志 */
export async function fullMirror(): Promise<void> {
  let db: IDBDatabase
  try {
    db = await openDb()
  } catch {
    return
  }
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('b_') && k !== OUTBOX) keys.push(k)
    }
    const existing = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const req = db.transaction(KV, 'readonly').objectStore(KV).getAllKeys()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const current = new Set(keys)
    const tx = db.transaction([KV, CHANGES, META], 'readwrite')
    const kv = tx.objectStore(KV)
    const changes = tx.objectStore(CHANGES)
    keys.forEach(k => {
      const v = localStorage.getItem(k)
      if (v != null) kv.put(v, k)
    })
    existing.forEach(k => { if (!current.has(String(k))) kv.delete(k) })
    const now = Date.now()
    changes.add({ ts: now, key: '*', value: keys.length, device: DEVICE_ID })
    tx.objectStore(META).put(now, 'lastMirrorAt')
    tx.objectStore(META).put(now, DB_INITIALIZED_AT)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    dbStatus.state = 'ready'
    dbStatus.available = true
    dbStatus.lastMirrorAt = now
    dbStatus.lastError = null
    await pruneChanges()
  } catch {
    markDbFailure('full-mirror-failed')
  }
}

/** 读取 IndexedDB KV 持久快照；失败返回 undefined，让启动层选择 localStorage 降级。 */
export async function readKvSnapshot(): Promise<Record<string, string> | undefined> {
  try {
    const db = await openDb()
    const tx = db.transaction(KV, 'readonly')
    const all = await new Promise<Record<string, string>>((resolve, reject) => {
      const req = tx.objectStore(KV).openCursor()
      const result: Record<string, string> = {}
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) { resolve(result); return }
        if (typeof cursor.key === 'string' && cursor.key.startsWith('b_') && cursor.key !== OUTBOX) result[cursor.key] = String(cursor.value)
        cursor.continue()
      }
      req.onerror = () => reject(req.error)
    })
    return all
  } catch (error) {
    markDbFailure(error)
    return undefined
  }
}

/** 读取不属于业务集合的 durable 元数据；失败时返回 undefined 走兼容回退。 */
export async function readDbMeta<T>(key: string): Promise<T | undefined> {
  try {
    await dbWriteChain
    const db = await openDb()
    const tx = db.transaction(META, 'readonly')
    const value = await new Promise<unknown>((resolve, reject) => {
      const req = tx.objectStore(META).get(key)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    await waitForTransaction(tx)
    return value as T | undefined
  } catch (error) {
    markDbFailure(error)
    return undefined
  }
}

/** 写入并等待 durable 元数据事务完成，调用方据此决定是否推进同步状态。 */
export async function writeDbMeta<T>(key: string, value: T): Promise<boolean> {
  return enqueueDbWork(async () => {
    const db = await openDb()
    const tx = db.transaction(META, 'readwrite')
    tx.objectStore(META).put(value, key)
    await waitForTransaction(tx)
    dbStatus.state = 'ready'
    dbStatus.available = true
    dbStatus.lastError = null
  }).then(() => true, error => {
    markDbFailure(error)
    return false
  })
}

/** 单键变更（store.set 路径） */
export async function dbPut(key: string, value: string, context?: EntityWriteContext): Promise<void> {
  // 先写 outbox，确保 tab 在异步事务完成前关闭时仍有下一次启动可恢复的凭据。
  const entityChanges = context ? buildEntityChanges(key, context.before, context.after) : []
  enqueuePendingWrite(key, value, false, entityChanges)
  await enqueueDbWork(async () => {
    try {
      const db = await openDb()
      const item = { key, value, ...(entityChanges.length ? { entityChanges } : {}) }
      // 先落 IndexedDB pending_writes，再应用 KV；两步之间崩溃也能在下次启动重放。
      await queueIndexedDbWrite(db, item)
      // 业务值、键级日志和实体级日志在同一事务提交，避免值已落盘但实体日志缺失。
      await applyIndexedDbWrite(db, item, entityChanges)
      removePendingWrite(key, value)
      dbStatus.state = 'ready'
      dbStatus.available = true
      dbStatus.lastError = null
      await pruneChanges()
    } catch (error) {
      markDbFailure(error)
      // 留在 outbox，下一次 initDb 或 flushPendingDbWrites 会重试。
    }
  })
}

/** 删除 IndexedDB KV 键并把删除意图留在 outbox，避免启动恢复旧值。 */
export async function dbDelete(key: string): Promise<void> {
  if (!key.startsWith('b_') || key === OUTBOX) return
  enqueuePendingWrite(key, undefined, true)
  await enqueueDbWork(async () => {
    try {
      const db = await openDb()
      const item = { key, deleted: true }
      await queueIndexedDbWrite(db, item)
      await applyIndexedDbWrite(db, item)
      removePendingWrite(key, undefined, true)
      dbStatus.state = 'ready'
      dbStatus.available = true
      dbStatus.lastError = null
    } catch (error) {
      markDbFailure(error)
    }
  })
}

/** 启动恢复前把尚未提交的最新键值写回同步缓存。 */
function restorePendingWritesToLocalStorage(): number {
  let restored = 0
  for (const item of readPendingWrites()) {
    try {
      if (item.deleted) {
        if (localStorage.getItem(item.key) != null) { localStorage.removeItem(item.key); restored++ }
      } else if (localStorage.getItem(item.key) !== item.value) {
        localStorage.setItem(item.key, item.value || '')
        restored++
      }
    } catch { /* ignore */ }
  }
  return restored
}

/** 串行重放 outbox；单项失败不会丢弃后续项目。 */
export async function flushPendingDbWrites(): Promise<void> {
  await enqueueDbWork(async () => {
    try {
      const db = await openDb()
      const merged = new Map<string, PendingDbWrite>()
      for (const item of await readIndexedDbWrites(db)) merged.set(item.key, item)
      // localStorage outbox may contain a newer write made while the IDB queue was unavailable.
      for (const item of readPendingWrites()) merged.set(item.key, item)
      for (const item of merged.values()) {
        await queueIndexedDbWrite(db, item)
        await applyIndexedDbWrite(db, item)
        removePendingWrite(item.key, item.value, item.deleted === true)
      }
      dbStatus.state = 'ready'
      dbStatus.available = true
      dbStatus.lastError = null
    } catch (error) {
      markDbFailure(error)
    }
  })
  await entityChangeChain
}

/** 远端应用专用：只更新持久镜像，不追加本地变更日志，避免把云端数据再次当成本地写入推回。 */
export async function dbMirrorPut(key: string, value: string): Promise<void> {
  try {
    const db = await openDb()
    const tx = db.transaction(KV, 'readwrite')
    tx.objectStore(KV).put(value, key)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch { /* ignore */ }
}

/** 远端应用专用：只删除持久镜像，不追加本地 changes/outbox。 */
export async function dbMirrorDelete(key: string): Promise<void> {
  try {
    const db = await openDb()
    const tx = db.transaction(KV, 'readwrite')
    tx.objectStore(KV).delete(key)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch { /* ignore */ }
}

/** 变更日志只保留最近 1000 条（append-only，但修剪防无限增长） */
async function pruneChanges(): Promise<void> {
  let db: IDBDatabase
  try {
    db = await openDb()
  } catch {
    return
  }
  try {
    const tx = db.transaction(CHANGES, 'readwrite')
    const store = tx.objectStore(CHANGES)
    const all = await new Promise<number[]>((resolve, reject) => {
      const req = store.getAllKeys()
      req.onsuccess = () => resolve(req.result as number[])
      req.onerror = () => reject(req.error)
    })
    const max = Math.max(0, ...all)
    const cutoff = max - 1000
    all.forEach(seq => { if (seq < cutoff) store.delete(seq) })
  } catch {
    /* ignore */
  }
}

let mirrorTimer: number | undefined

/** store.set 后调用：0.8s 防抖镜像（合并连续写入） */
export function scheduleMirror(): void {
  if (mirrorTimer) return
  mirrorTimer = window.setTimeout(() => {
    mirrorTimer = undefined
    void fullMirror()
  }, 800)
}

/** 启动迁移：首次从 localStorage 建立持久层，后续以 IndexedDB 快照恢复同步缓存。 */
export async function initDb(): Promise<void> {
  dbStatus.state = 'recovering'
  dbStatus.restoredKeys = 0
  dbStatus.lastError = null
  // 必须先恢复 outbox 和既有镜像，再镜像当前缓存，否则清空缓存会把空快照写回 IDB。
  restorePendingWritesToLocalStorage()
  await flushPendingDbWrites()
  await restoreFromDb()
  await fullMirror()
  await flushPendingDbWrites()
  if (!dbStatus.available) dbStatus.state = 'degraded'
}

/** 从 IndexedDB 恢复：已初始化后持久快照是权威来源，outbox 键除外。 */
export async function restoreFromDb(): Promise<void> {
  let db: IDBDatabase
  try {
    db = await openDb()
  } catch {
    return
  }
  try {
    const pending = new Map(readPendingWrites().map(item => [item.key, item]))
    const initialized = await new Promise<boolean>((resolve, reject) => {
      const req = db.transaction(META, 'readonly').objectStore(META).get(DB_INITIALIZED_AT)
      req.onsuccess = () => resolve(typeof req.result === 'number')
      req.onerror = () => reject(req.error)
    })
    const tx = db.transaction(KV, 'readonly')
    const store = tx.objectStore(KV)
    const all = await new Promise<{ key: string; value: string }[]>((resolve, reject) => {
      const req = store.openCursor()
      const result: { key: string; value: string }[] = []
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) { resolve(result); return }
        result.push({ key: String(cursor.key), value: String(cursor.value) })
        cursor.continue()
      }
      req.onerror = () => reject(req.error)
    })
    let restored = 0
    all.forEach(({ key, value }) => {
      if (typeof key !== 'string' || !key.startsWith('b_') || key === OUTBOX) return
      if (pending.has(key)) return
      try {
        if (initialized && localStorage.getItem(key) !== value && value != null) {
          localStorage.setItem(key, value)
          restored++
        } else if (!initialized && localStorage.getItem(key) == null && value != null) {
          localStorage.setItem(key, value)
          restored++
        }
      } catch { /* ignore */ }
    })
    if (initialized) {
      const durableKeys = new Set(all.map(item => item.key))
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i)
        if (key?.startsWith('b_') && key !== OUTBOX && !durableKeys.has(key) && !pending.has(key)) {
          localStorage.removeItem(key)
          restored++
        }
      }
    }
    dbStatus.restoredKeys += restored
    if (restored > 0) console.log('[beryl-db] restored', restored, 'keys from IndexedDB')
  } catch {
    markDbFailure('restore-failed')
  }
}

/** 清理本地镜像与变更日志（管理页重置使用，不影响 IndexedDB 不可用的降级路径）。 */
export async function clearDb(): Promise<void> {
  try {
    const db = await openDb()
    const tx = db.transaction([KV, CHANGES, META, ENTITY_CHANGES, PENDING_WRITES], 'readwrite')
    ;[KV, CHANGES, META, ENTITY_CHANGES, PENDING_WRITES].forEach(name => tx.objectStore(name).clear())
    await waitForTransaction(tx)
    try { localStorage.removeItem(OUTBOX) } catch { /* ignore */ }
    indexedPendingKeys.clear()
    dbStatus = { state: 'cold', available: false, pendingWrites: 0, restoredKeys: 0, lastMirrorAt: null, lastError: null }
  } catch { /* ignore */ }
}

/* ---------- 变更日志读取（阶段 3 增量同步使用） ---------- */

export interface DbChange { seq: number; ts: number; key: string; value: string; deleted?: boolean }

/** 本地实体级操作日志；暂不改变既有云端键级协议，作为平滑迁移基础。 */
export interface EntityChange {
  id: string
  entity: string
  entityId: string
  operation: 'create' | 'update' | 'delete'
  updatedAt: number
  device: string
  value?: unknown
}

function buildEntityChanges(key: string, before: unknown, after: unknown): EntityChange[] {
  if (!Array.isArray(after) || !key.startsWith('b_')) return []
  const asMap = (items: unknown[]) => new Map(items
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && (('id' in item && item.id != null) || ('date' in item && item.date != null)))
    .map(item => [String(item.id ?? item.date), item]))
  const previous = asMap(Array.isArray(before) ? before : [])
  const next = asMap(after)
  const changeId = (entityId: string, version: number) => `${DEVICE_ID}:${version}:${entityChangeNonce++}:${entityId}`
  const changes: EntityChange[] = []
  for (const [entityId, value] of next) {
    const old = previous.get(entityId)
    if (!old) { const version = nextEntityVersion(); changes.push({ id: changeId(entityId, version), entity: key.slice(2), entityId, operation: 'create', updatedAt: version, device: DEVICE_ID, value }) }
    else if (JSON.stringify(old) !== JSON.stringify(value)) { const version = nextEntityVersion(); changes.push({ id: changeId(entityId, version), entity: key.slice(2), entityId, operation: 'update', updatedAt: version, device: DEVICE_ID, value }) }
  }
  for (const entityId of previous.keys()) {
    if (!next.has(entityId)) { const version = nextEntityVersion(); changes.push({ id: changeId(entityId, version), entity: key.slice(2), entityId, operation: 'delete', updatedAt: version, device: DEVICE_ID }) }
  }
  return changes
}

async function persistEntityChanges(key: string, before: unknown, after: unknown): Promise<void> {
  const changes = buildEntityChanges(key, before, after)
  if (!changes.length) return
  try {
    const db = await openDb()
    const tx = db.transaction(ENTITY_CHANGES, 'readwrite')
    const store = tx.objectStore(ENTITY_CHANGES)
    changes.forEach((change, i) => store.put({ ...change, id: `${change.id}:${i}` }))
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    await pruneEntityChanges()
  } catch { /* 不阻断旧存储与同步流程 */ }
}

/** 串行排队实体变更日志，避免保存完成时日志仍在并发写入。 */
export function recordEntityChanges(key: string, before: unknown, after: unknown): Promise<void> {
  const next = entityChangeChain.then(() => persistEntityChanges(key, before, after), () => persistEntityChanges(key, before, after))
  entityChangeChain = next.catch(() => undefined)
  return next
}

/** 等待已经排队的实体变更日志完成；不改变旧同步 API 的返回形态。 */
export function flushEntityChanges(): Promise<void> {
  return entityChangeChain
}

async function pruneEntityChanges(): Promise<void> {
  try {
    const db = await openDb()
    const tx = db.transaction(ENTITY_CHANGES, 'readwrite')
    const store = tx.objectStore(ENTITY_CHANGES)
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const req = store.getAllKeys()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const ordered = keys.map(String).sort()
    ordered.slice(0, Math.max(0, ordered.length - 5000)).forEach(key => store.delete(key))
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch { /* ignore */ }
}

export async function readEntityChanges(limit = 500, afterUpdatedAt = 0): Promise<EntityChange[]> {
  try {
    const db = await openDb()
    const tx = db.transaction(ENTITY_CHANGES, 'readonly')
    const req = tx.objectStore(ENTITY_CHANGES).getAll()
    const all = await new Promise<EntityChange[]>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as EntityChange[])
      req.onerror = () => reject(req.error)
    })
    return all.filter(change => change.updatedAt > afterUpdatedAt).sort((a, b) => a.updatedAt - b.updatedAt || a.device.localeCompare(b.device) || a.id.localeCompare(b.id)).slice(0, limit)
  } catch { return [] }
}

/** 读取 seq > after 的变更记录（按 seq 升序） */
export async function readChanges(after: number, limit = 500): Promise<DbChange[]> {
  let db: IDBDatabase
  try {
    db = await openDb()
  } catch {
    return []
  }
  try {
    const tx = db.transaction(CHANGES, 'readonly')
    const store = tx.objectStore(CHANGES)
    const all = await new Promise<DbChange[]>((resolve, reject) => {
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result as DbChange[])
      req.onerror = () => reject(req.error)
    })
    return all.filter(c => c.seq > after).sort((a, b) => a.seq - b.seq).slice(0, limit)
  } catch {
    return []
  }
}

/** 变更日志的最大 seq（增量游标） */
export async function maxChangeSeq(): Promise<number> {
  try {
    const db = await openDb()
    const tx = db.transaction(CHANGES, 'readonly')
    const keys = await new Promise<number[]>((resolve, reject) => {
      const req = tx.objectStore(CHANGES).getAllKeys()
      req.onsuccess = () => resolve(req.result as number[])
      req.onerror = () => reject(req.error)
    })
    return Math.max(0, ...keys)
  } catch { return 0 }
}

/**
 * 撤销误清洗：若某键当前恰好是空数组、且变更日志中最后一条该键记录也是空数组、
 * 但更早存在非空记录 → 恢复为最近的非空值（防止历史数据被误删）。
 * 用户主动清空（最后记录非空→空）与从未有数据（无记录）均不恢复。
 */
export async function recoverIfCleared(key: string): Promise<boolean> {
  try {
    const cur = localStorage.getItem(key)
    if (cur !== '[]') return false // 当前不是空数组，无需恢复
    const changes = await readChanges(0, 2000)
    const hits = changes.filter(c => c.key === key)
    if (!hits.length) return false // 从未写过该键
    const last = hits[hits.length - 1]
    if (last.value !== '[]') return false // 最后写入的是非空数据，正常
    const prev = [...hits].reverse().find(c => c.value !== '[]')
    if (!prev || prev.value == null) return false
    localStorage.setItem(key, prev.value)
    await fullMirror() // 恢复后同步镜像
    return true
  } catch {
    return false
  }
}
