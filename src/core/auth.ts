/* ---------- 认证与安全（平移 v1：PBKDF2 哈希 + 失败锁定 + 会话） ---------- */
import { safeParse } from './storage.ts'

/** Retained only to read/migrate old local records; never used to authenticate users. */
export interface AuthRecord {
  u: string
  salt: string
  hash: string
  iter: number
  _d?: boolean
}

export interface ServerUser {
  id: string
  username: string
  displayName: string
  role: 'admin' | 'user'
}

export interface ServerSession {
  token: string
  apiOrigin: string
  expiresAt: number
  user: ServerUser
  mustChangePassword: boolean
  validatedAt: number
}

const legacyEncoder = new TextEncoder()
function legacyHex(bytes: Uint8Array): string { return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('') }
function legacyBytes(hex: string): Uint8Array { return Uint8Array.from(hex.match(/.{2}/g) || [], value => Number.parseInt(value, 16)) }
async function legacyPasswordHash(password: string, salt: string, iterations: number): Promise<string> {
  const input = await crypto.subtle.importKey('raw', legacyEncoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: legacyBytes(salt), iterations, hash: 'SHA-256' }, input, 256)
  return legacyHex(new Uint8Array(bits))
}

export async function createAuthRecord(u: string, password: string, isDefault = false): Promise<AuthRecord> {
  const salt = legacyHex(crypto.getRandomValues(new Uint8Array(16)))
  const result: AuthRecord = { u, salt, hash: await legacyPasswordHash(password, salt, 100_000), iter: 100_000 }
  if (isDefault) result._d = true
  return result
}

export async function verifyPassword(record: AuthRecord, password: string): Promise<boolean> {
  try { return Boolean(record?.salt && record.iter && await legacyPasswordHash(password, record.salt, record.iter) === record.hash) }
  catch { return false }
}

/** Local-only identity is retired; authentication must come from the Worker. */
export async function ensureAuth(): Promise<AuthRecord> {
  throw new Error('server-auth-required')
}

/* ---------- 会话（记住登录 30 天） ---------- */
export const SESSION_DAYS = 30

export function writeSession(_u: string): void { clearSession() }

export function writeServerSession(session: Omit<ServerSession, 'validatedAt'> & { validatedAt?: number }): void {
  const value: ServerSession = { ...session, validatedAt: session.validatedAt || Date.now() }
  try { sessionStorage.setItem('b_session', JSON.stringify(value)) } catch { /* The token must stay tab-local. */ }
}
export function clearSession(): void {
  try { sessionStorage.removeItem('b_session') } catch { /* ignore */ }
  try { localStorage.removeItem('b_session') } catch { /* remove the retired shared-tab token when possible */ }
}
export function readServerSession(): ServerSession | null {
  let raw: string | null = null
  try { raw = sessionStorage.getItem('b_session') } catch { /* ignore */ }
  if (!raw) {
    // One-time compatibility bridge from the former shared localStorage token.
    // New writes remain isolated to this tab so another account cannot replace it.
    raw = localStorageValue('b_session')
    if (raw) {
      try { sessionStorage.setItem('b_session', raw); localStorage.removeItem('b_session') } catch { /* session remains readable for this call */ }
    }
  }
  const s = safeParse<ServerSession>(raw)
  if (!s || typeof s.token !== 'string' || !s.token || typeof s.apiOrigin !== 'string' || !s.apiOrigin || typeof s.user?.id !== 'string' || !s.user.id || !Number.isFinite(s.expiresAt)) return null
  return s
}
function localStorageValue(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
export function readSession(): ({ u: string; ts: number } & Partial<ServerSession>) | null {
  const server = readServerSession()
  if (server) return { u: server.user.username, ts: server.validatedAt, ...server }
  // Local-only credentials belonged to the retired single-user prototype.
  // They must never authorize access to a server-managed account.
  return null
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
