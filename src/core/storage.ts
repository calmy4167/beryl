/* ---------- 存储层（同步快照 API；启动后优先读取 IndexedDB hydrate 快照） ---------- */
import { dbPut, dbDelete, DEVICE_ID, type EntityWriteContext } from './db.ts'
import { accountStorageKey, accountStoragePrefix, getActiveAccount, unaccountStorageKey } from './account-context.ts'

const PREFIX = 'b_'
let persistedCache = new Map<string, string>()
let persistedCacheReady = false

export function lsGet(key: string): string | null {
  if (key.startsWith(PREFIX) && key !== 'b_theme' && !getActiveAccount()) return null
  if (persistedCacheReady && key.startsWith(PREFIX)) return persistedCache.get(key) ?? null
  try { return localStorage.getItem(accountStorageKey(key)); } catch { return null; }
}
export function lsSet(key: string, val: string, persist = true, entityContext?: EntityWriteContext): boolean {
  const isSyncKey = key.startsWith(PREFIX)
  if (isSyncKey && key !== 'b_theme' && !getActiveAccount()) return false
  let localWriteSucceeded = false
  try {
    localStorage.setItem(accountStorageKey(key), val)
    localWriteSucceeded = true
  } catch { /* hydrated durable cache may still accept the write */ }
  if (persistedCacheReady && isSyncKey) persistedCache.set(key, val)
  if (persist && isSyncKey) void dbPut(key, val, entityContext)
  // After hydrate, Repository writes remain valid if localStorage is quota-blocked;
  // the durable dbPut path is still attempted, with its existing fallback behavior.
  return localWriteSucceeded || (persistedCacheReady && isSyncKey)
}
export function lsRemove(key: string, persist = true): void {
  if (key.startsWith(PREFIX) && key !== 'b_theme' && !getActiveAccount()) return
  try { localStorage.removeItem(accountStorageKey(key)) } catch { /* ignore */ }
  if (persistedCacheReady && key.startsWith(PREFIX)) persistedCache.delete(key)
  if (persist && key.startsWith(PREFIX)) void dbDelete(key)
}

/** 在 app mount 前用 IndexedDB 的 KV 快照初始化同步读缓存。空快照也是有效的持久结果。 */
export function hydrateStoreCache(snapshot?: Record<string, string>): void {
  if (!getActiveAccount()) {
    persistedCache = new Map()
    persistedCacheReady = true
    return
  }
  persistedCache = new Map(Object.entries(snapshot || {}).filter(([key]) => key.startsWith(PREFIX)))
  // 只有读取 IndexedDB 失败（undefined）时才回退 localStorage；空对象表示持久层明确没有业务键。
  if (snapshot === undefined) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const physicalKey = localStorage.key(i)
        const prefix = accountStoragePrefix()
        if (prefix && !physicalKey?.startsWith(prefix)) continue
        const key = physicalKey ? unaccountStorageKey(physicalKey) || physicalKey : null
        if (key?.startsWith(PREFIX) && key !== 'b_db_outbox') {
          const value = physicalKey ? localStorage.getItem(physicalKey) : null
          if (value != null) persistedCache.set(key, value)
        }
      }
    } catch { /* use an empty cache */ }
  }
  persistedCacheReady = true
}

/** 清空同步读缓存；下一次读取回到 localStorage 降级路径。 */
export function resetStoreCache(): void {
  persistedCache.clear()
  persistedCacheReady = false
}

/** 页面挂载后，所有同步读取都来自已恢复的内存快照。 */
export function isStoreCacheReady(): boolean { return persistedCacheReady }

export function listLocalStorageKeys(prefix = PREFIX): string[] {
  if (prefix.startsWith(PREFIX) && !getActiveAccount()) return []
  if (persistedCacheReady) return [...persistedCache.keys()].filter(key => key.startsWith(prefix))
  const keys: string[] = []
  const scopedPrefix = accountStoragePrefix()
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const physical = localStorage.key(i)
      if (!physical) continue
      if (scopedPrefix && !physical.startsWith(scopedPrefix)) continue
      const key = unaccountStorageKey(physical) || physical
      if (key.startsWith(prefix)) keys.push(key)
    }
  } catch { /* return whatever could be read */ }
  return keys
}

export function safeParse<T>(v: string | null): T | undefined {
  if (v == null) return undefined;
  try { return JSON.parse(v) as T; } catch { return undefined; }
}

/* 同步引擎写入钩子：store.set 时同步到 fileData + 标记 dirty（由 sync.ts 注册） */
let syncWriteHook: ((key: string, str: string) => void) | null = null;
export function setSyncWriteHook(h: ((key: string, str: string) => void) | null): void { syncWriteHook = h; }

export const store = {
  get<T>(k: string, d: T): T {
    const v = safeParse<T>(lsGet(PREFIX + k));
    return v === undefined ? d : v;
  },
  set(k: string, v: unknown): boolean {
    const fullKey = PREFIX + k
    const previous = safeParse<unknown>(lsGet(fullKey))
    const str = JSON.stringify(v);
    const ok = lsSet(fullKey, str, true, { before: previous, after: v });
    if (ok) {
      syncWriteHook?.(fullKey, str);
    }
    return ok;
  }
};

/** 多设备冲突安全 ID（时间戳36进制 + 随机后缀，与 v1 一致） */
export function nextId(): string {
  return `${DEVICE_ID}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function fmtDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function todayKey(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
