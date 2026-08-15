/* ---------- 存储层（平移 v1：localStorage 统一容错封装；阶段 2 迁 IndexedDB） ---------- */
import { dbPut } from './db.ts'

export function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function lsSet(key: string, val: string): boolean {
  try { localStorage.setItem(key, val); return true; }
  catch { return false; }
}

export function safeParse<T>(v: string | null): T | undefined {
  if (v == null) return undefined;
  try { return JSON.parse(v) as T; } catch { return undefined; }
}

const PREFIX = 'b_';

/* 同步引擎写入钩子：store.set 时同步到 fileData + 标记 dirty（由 sync.ts 注册） */
let syncWriteHook: ((key: string, str: string) => void) | null = null;
export function setSyncWriteHook(h: ((key: string, str: string) => void) | null): void { syncWriteHook = h; }

export const store = {
  get<T>(k: string, d: T): T {
    const v = safeParse<T>(lsGet(PREFIX + k));
    return v === undefined ? d : v;
  },
  set(k: string, v: unknown): boolean {
    const str = JSON.stringify(v);
    const ok = lsSet(PREFIX + k, str);
    syncWriteHook?.(PREFIX + k, str);
    // 阶段 2：单键镜像进 IndexedDB + 追加变更日志（失败静默，不阻断主流程）
    void dbPut(PREFIX + k, str);
    return ok;
  }
};

/** 多设备冲突安全 ID（时间戳36进制 + 随机后缀，与 v1 一致） */
export function nextId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
