/* ---------- 存储层（同步快照 API；启动后优先读取 IndexedDB hydrate 快照） ---------- */
import { dbPut, dbDelete, recordEntityChanges, DEVICE_ID } from './db.ts'

const PREFIX = 'b_'
let persistedCache = new Map<string, string>()
let persistedCacheReady = false

export function lsGet(key: string): string | null {
  if (persistedCacheReady && key.startsWith(PREFIX)) return persistedCache.get(key) ?? null
  try { return localStorage.getItem(key); } catch { return null; }
}
export function lsSet(key: string, val: string, persist = true): boolean {
  const isSyncKey = key.startsWith(PREFIX)
  let localWriteSucceeded = false
  try {
    localStorage.setItem(key, val)
    localWriteSucceeded = true
  } catch { /* hydrated durable cache may still accept the write */ }
  if (persistedCacheReady && isSyncKey) persistedCache.set(key, val)
  if (persist && isSyncKey) void dbPut(key, val)
  // After hydrate, Repository writes remain valid if localStorage is quota-blocked;
  // the durable dbPut path is still attempted, with its existing fallback behavior.
  return localWriteSucceeded || (persistedCacheReady && isSyncKey)
}
export function lsRemove(key: string, persist = true): void {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
  if (persistedCacheReady && key.startsWith(PREFIX)) persistedCache.delete(key)
  if (persist && key.startsWith(PREFIX)) void dbDelete(key)
}

/** 在 app mount 前用 IndexedDB 的 KV 快照初始化同步读缓存。空快照也是有效的持久结果。 */
export function hydrateStoreCache(snapshot?: Record<string, string>): void {
  persistedCache = new Map(Object.entries(snapshot || {}).filter(([key]) => key.startsWith(PREFIX)))
  // 只有读取 IndexedDB 失败（undefined）时才回退 localStorage；空对象表示持久层明确没有业务键。
  if (snapshot === undefined) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(PREFIX) && key !== 'b_db_outbox') {
          const value = localStorage.getItem(key)
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
    const ok = lsSet(fullKey, str);
    if (ok) {
      syncWriteHook?.(fullKey, str);
      // lsSet 已进入 IndexedDB durable outbox；此处只追加实体级变更日志。
      void recordEntityChanges(fullKey, previous, v);
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
