import { readServerSession, writeServerSession, clearSession, type ServerSession, type ServerUser } from '../auth'
import { apiFetch } from './client'
import { DEVICE_ID } from '../db'
import { SESSION_DAYS } from '../auth'

export type UserAccount = ServerUser & {
  status: 'active' | 'disabled'
  createdAt: number
  lastLoginAt: number | null
  mustChangePassword: boolean
}
export type PasswordPolicy = { minLength: number; maxLength: number; requireUppercase: boolean; requireLowercase: boolean; requireNumber: boolean; requireSymbol: boolean }

async function jsonBody<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw Object.assign(new Error(body.error || `request-failed:${response.status}`), { status: response.status })
  return body
}

function saveLogin(baseUrl: string, body: { token: string; expiresAt: number; mustChangePassword: boolean; user: ServerUser }): ServerSession {
  const session: ServerSession = { ...body, apiOrigin: new URL(baseUrl).origin, validatedAt: Date.now() }
  writeServerSession(session)
  return session
}

export async function login(baseUrl: string, username: string, password: string, challenge?: { challengeId: string; challengeAnswer: string }): Promise<ServerSession> {
  const response = await apiFetch(baseUrl, '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, deviceId: DEVICE_ID, ...challenge })
  })
  return saveLogin(baseUrl, await jsonBody<Parameters<typeof saveLogin>[1]>(response))
}

export async function restoreSession(baseUrl: string): Promise<ServerSession | null> {
  const cached = readServerSession()
  if (!cached) return null
  let origin: string
  try { origin = new URL(baseUrl).origin } catch { clearSession(); return null }
  if (cached.apiOrigin !== origin) { clearSession(); return null }
  try {
    const response = await apiFetch(baseUrl, '/api/auth/session', { method: 'GET' })
    if (response.status === 401) { clearSession(); return null }
    const body = await jsonBody<{ ok: true; expiresAt: number; mustChangePassword: boolean; user: ServerUser }>(response)
    const session = { ...cached, ...body, validatedAt: Date.now() }
    writeServerSession(session)
    return session
  } catch (error) {
    const status = Number((error as { status?: number })?.status)
    if (status === 401) { clearSession(); return null }
    const recent = Date.now() - cached.validatedAt <= SESSION_DAYS * 24 * 60 * 60 * 1000
    if (recent && cached.expiresAt > Date.now()) return cached
    clearSession()
    return null
  }
}

export async function refreshSession(baseUrl: string): Promise<ServerSession> {
  const current = readServerSession()
  if (!current) throw new Error('unauthorized')
  const response = await apiFetch(baseUrl, '/api/auth/refresh', { method: 'POST' })
  const body = await jsonBody<{ ok: true; token: string; expiresAt: number }>(response)
  const refreshed = { ...current, token: body.token, expiresAt: body.expiresAt, validatedAt: Date.now() }
  writeServerSession(refreshed)
  return refreshed
}

export async function logout(baseUrl: string): Promise<void> {
  try { await apiFetch(baseUrl, '/api/auth/logout', { method: 'POST' }) }
  finally { clearSession() }
}

export async function changeLoginPassword(baseUrl: string, currentPassword: string, newPassword: string): Promise<void> {
  const response = await apiFetch(baseUrl, '/api/auth/password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword })
  })
  await jsonBody<{ ok: true }>(response)
  const session = readServerSession()
  if (session) writeServerSession({ ...session, mustChangePassword: false, validatedAt: Date.now() })
}

export async function getPasswordPolicy(baseUrl: string): Promise<PasswordPolicy> {
  const response = await apiFetch(baseUrl, '/api/auth/security-policy')
  return (await jsonBody<{ ok: true; passwordPolicy: PasswordPolicy }>(response)).passwordPolicy
}

export async function getLoginChallenge(baseUrl: string): Promise<{ enabled: boolean; challengeId?: string; question?: string }> {
  const response = await apiFetch(baseUrl, '/api/auth/challenge', { method: 'POST' })
  return jsonBody(response)
}

export async function listUsers(baseUrl: string): Promise<UserAccount[]> {
  const response = await apiFetch(baseUrl, '/api/admin/users')
  return (await jsonBody<{ ok: true; users: UserAccount[] }>(response)).users
}

export async function createUser(baseUrl: string, input: { username: string; displayName: string }): Promise<{ user: UserAccount; temporaryPassword: string }> {
  const response = await apiFetch(baseUrl, '/api/admin/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input)
  })
  return jsonBody(response)
}

export async function setUserStatus(baseUrl: string, userId: string, status: 'active' | 'disabled'): Promise<void> {
  const response = await apiFetch(baseUrl, `/api/admin/users/${encodeURIComponent(userId)}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status })
  })
  await jsonBody<{ ok: true }>(response)
}

export async function resetUserPassword(baseUrl: string, userId: string): Promise<string> {
  const response = await apiFetch(baseUrl, `/api/admin/users/${encodeURIComponent(userId)}/reset-password`, { method: 'POST' })
  return (await jsonBody<{ ok: true; temporaryPassword: string }>(response)).temporaryPassword
}
