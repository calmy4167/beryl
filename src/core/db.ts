/* ============ v2 阶段 2：IndexedDB 持久镜像 + 变更日志 ============
 * 目标（对应 v1 文档 §14.2/14.3）：
 *   - kv 表：localStorage 全部 b_* 键的持久镜像（防止 localStorage 被清理丢数据）
 *   - changes 表：append-only 变更日志（{ seq, ts, key, value }，为阶段 3 增量同步铺路）
 *   - meta 表：元数据（最近镜像时间、设备 id）
 * UI 层仍走 localStorage 同步层（快照缓存），IndexedDB 为异步持久层，
 * 启动时全量迁移，运行期 0.8s 防抖增量镜像。IndexedDB 不可用时静默降级。
 */
import { lsGet } from './storage.ts'

const DB_NAME = 'beryl-db'
const DB_VERSION = 1
const KV = 'kv'
const CHANGES = 'changes'
const META = 'meta'

export const DEVICE_ID = 'dev-' + Math.random().toString(36).slice(2, 10)

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
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
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('indexedDB open failed'))
  })
  return dbPromise
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
      if (k && k.startsWith('b_')) keys.push(k)
    }
    const tx = db.transaction([KV, CHANGES, META], 'readwrite')
    const kv = tx.objectStore(KV)
    const changes = tx.objectStore(CHANGES)
    keys.forEach(k => {
      const v = lsGet(k)
      if (v != null) kv.put(v, k)
    })
    const now = Date.now()
    changes.add({ ts: now, key: '*', value: keys.length, device: DEVICE_ID })
    tx.objectStore(META).put(now, 'lastMirrorAt')
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    await pruneChanges()
  } catch {
    /* 镜像失败不阻断主流程 */
  }
}

/** 单键变更（store.set 路径） */
export async function dbPut(key: string, value: string): Promise<void> {
  let db: IDBDatabase
  try {
    db = await openDb()
  } catch {
    return
  }
  try {
    const tx = db.transaction([KV, CHANGES], 'readwrite')
    tx.objectStore(KV).put(value, key)
    tx.objectStore(CHANGES).add({ ts: Date.now(), key, value, device: DEVICE_ID })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    await pruneChanges()
  } catch {
    /* ignore */
  }
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

/** 启动迁移：localStorage → IndexedDB 全量镜像；localStorage 为空而镜像有数据时恢复 */
export function initDb(): void {
  void fullMirror().then(() => { void restoreFromDb() })
}

/** 从 IndexedDB 恢复：localStorage 缺失的 b_* 键写回（防 localStorage 被清理） */
export async function restoreFromDb(): Promise<void> {
  let db: IDBDatabase
  try {
    db = await openDb()
  } catch {
    return
  }
  try {
    const tx = db.transaction(KV, 'readonly')
    const store = tx.objectStore(KV)
    const all = await new Promise<{ key: string; value: string }[]>((resolve, reject) => {
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result as { key: string; value: string }[])
      req.onerror = () => reject(req.error)
    })
    let restored = 0
    all.forEach(({ key, value }) => {
      if (typeof key !== 'string' || !key.startsWith('b_')) return
      try {
        if (localStorage.getItem(key) == null && value != null) {
          localStorage.setItem(key, value)
          restored++
        }
      } catch { /* ignore */ }
    })
    if (restored > 0) console.log('[beryl-db] restored', restored, 'keys from IndexedDB')
  } catch {
    /* ignore */
  }
}

/* ---------- 变更日志读取（阶段 3 增量同步使用） ---------- */

export interface DbChange { seq: number; ts: number; key: string; value: string }

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
    return all.filter(c => c.seq > after).sort((a, b) => a.seq - b.seq).slice(-limit)
  } catch {
    return []
  }
}

/** 变更日志的最大 seq（增量游标） */
export async function maxChangeSeq(): Promise<number> {
  const all = await readChanges(0, 1)
  return all.length ? all[all.length - 1].seq : 0
}
