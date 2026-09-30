import { apiFetch } from './client'

async function read<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw Object.assign(new Error(body.error || `request-failed:${response.status}`), { status: response.status })
  return body
}
export type SystemRole = { id: string; code: string; name: string; description: string; builtIn: boolean; status: string; permissions: string[] }
export type AdminUser = { id: string; username: string; displayName: string; role: 'admin' | 'user'; status: 'active' | 'disabled'; roles: string[]; mustChangePassword: boolean; createdAt: number; lastLoginAt: number | null; email?: string | null; phone?: string | null; sex?: string | null; remark?: string | null }
export type SecuritySettings = Record<string, number | boolean | string>
export async function capabilities(base: string) { return read<{ ok: true; capabilities: string[]; catalog: string[] }>(await apiFetch(base, '/api/admin/capabilities')) }
export async function users(base: string, filter: { q?: string; status?: string } = {}) { const params = new URLSearchParams({ pageSize: '100' }); if (filter.q) params.set('q', filter.q); if (filter.status) params.set('status', filter.status); return read<{ ok: true; users: AdminUser[]; total: number }>(await apiFetch(base, `/api/admin/users?${params}`)) }
export async function createUser(base: string, input: Record<string, unknown>) { return read<{ ok: true; user: AdminUser; temporaryPassword: string }>(await apiFetch(base, '/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })) }
export async function updateUser(base: string, id: string, input: Record<string, unknown>) { return read(await apiFetch(base, `/api/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })) }
export async function deleteUser(base: string, id: string) { return read(await apiFetch(base, `/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' })) }
export async function userAction(base: string, id: string, action: 'status' | 'roles' | 'unlock' | 'reset-password') {
  if (action === 'unlock') return read(await apiFetch(base, `/api/admin/users/${encodeURIComponent(id)}/unlock`, { method: 'POST' }))
  if (action === 'reset-password') return read<{ ok: true; temporaryPassword: string }>(await apiFetch(base, `/api/admin/users/${encodeURIComponent(id)}/reset-password`, { method: 'POST' }))
  throw new Error('unsupported-user-action')
}
export async function setUserStatus(base: string, id: string, status: 'active' | 'disabled') { return read(await apiFetch(base, `/api/admin/users/${encodeURIComponent(id)}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })) }
export async function setUserRoles(base: string, id: string, roleIds: string[]) { return read(await apiFetch(base, `/api/admin/users/${encodeURIComponent(id)}/roles`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roleIds }) })) }
export async function revokeUserSessions(base: string, id: string) { return read<{ ok: true; revoked: number }>(await apiFetch(base, `/api/admin/users/${encodeURIComponent(id)}/sessions`, { method: 'DELETE' })) }
export async function roles(base: string) { return read<{ ok: true; roles: SystemRole[]; capabilities: string[] }>(await apiFetch(base, '/api/admin/roles')) }
export async function saveRole(base: string, role: Partial<SystemRole> & { name: string; description?: string; permissions: string[] }) { return read(await apiFetch(base, role.id ? `/api/admin/roles/${encodeURIComponent(role.id)}` : '/api/admin/roles', { method: role.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(role) })) }
export async function deleteRole(base: string, id: string) { return read(await apiFetch(base, `/api/admin/roles/${encodeURIComponent(id)}`, { method: 'DELETE' })) }
export async function security(base: string, patch?: SecuritySettings) { return read<{ ok: true; settings: SecuritySettings }>(await apiFetch(base, '/api/admin/security', patch ? { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: patch }) } : undefined)) }
export async function logs(base: string, kind: 'login' | 'operation') { return read<{ ok: true; logs: Record<string, unknown>[] }>(await apiFetch(base, `/api/admin/${kind}-logs?pageSize=100`)) }
export async function sessions(base: string) { return read<{ ok: true; sessions: Record<string, unknown>[] }>(await apiFetch(base, '/api/admin/sessions')) }
export async function revokeSession(base: string, id: string) { return read(await apiFetch(base, `/api/admin/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })) }
