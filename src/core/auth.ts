/* ---------- 认证与安全（平移 v1：PBKDF2 哈希 + 失败锁定 + 会话） ---------- */
import { lsGet, lsSet, safeParse } from './storage.ts'

export interface AuthRecord {
  u: string
  salt: string
  hash: string
  iter: number
  _d?: boolean // 默认凭据标记（首次登录强制改密）
}

const enc = new TextEncoder()
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}
function fromHex(s: string): Uint8Array {
  const a = new Uint8Array(s.length / 2)
  for (let i = 0; i < a.length; i++) a[i] = parseInt(s.substr(i * 2, 2), 16)
  return a
}

async function pbkdf2(password: string, saltHex: string, iter: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(saltHex), iterations: iter, hash: 'SHA-256' },
    key, 256
  )
  return toHex(new Uint8Array(bits))
}

export async function createAuthRecord(u: string, p: string, isDefault: boolean): Promise<AuthRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const rec: AuthRecord = { u, salt: toHex(salt), hash: await pbkdf2(p, toHex(salt), 100000), iter: 100000 }
  if (isDefault) rec._d = true
  return rec
}

/** 确保存在认证记录；旧版明文格式自动升级为默认凭据 */
export async function ensureAuth(): Promise<AuthRecord> {
  let rec = safeParse<AuthRecord>(lsGet('b_auth'))
  if (!rec || typeof rec.hash !== 'string') {
    rec = await createAuthRecord('calmy', 'cy2024', true)
    lsSet('b_auth', JSON.stringify(rec))
  }
  return rec
}

export async function verifyPassword(rec: AuthRecord, p: string): Promise<boolean> {
  if (!rec || !rec.salt || !rec.iter) return false
  try { return (await pbkdf2(p, rec.salt, rec.iter)) === rec.hash } catch { return false }
}

/* ---------- 会话（记住登录 30 天） ---------- */
export const SESSION_DAYS = 30

export function writeSession(u: string): void {
  lsSet('b_session', JSON.stringify({ u, ts: Date.now() }))
}
export function clearSession(): void {
  lsSet('b_session', '')
}
export function readSession(): { u: string; ts: number } | null {
  const s = safeParse<{ u: string; ts: number }>(lsGet('b_session'))
  if (!s || !s.u) return null
  if (Date.now() - (s.ts || 0) > SESSION_DAYS * 86400000) { clearSession(); return null }
  return s
}

/* ---------- 失败锁定（5 次 30 秒） ---------- */
const MAX_FAILS = 5
const LOCK_MS = 30000
let failCount = 0
let lockUntil = 0

export function isLocked(): boolean { return Date.now() < lockUntil }
export function lockRemainSec(): number { return Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000)) }
export function registerFail(): number {
  failCount++
  if (failCount >= MAX_FAILS) {
    failCount = 0
    lockUntil = Date.now() + LOCK_MS
    return LOCK_MS
  }
  return 0
}
export function resetFails(): void { failCount = 0 }
