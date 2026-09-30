import { requireSystemCapability, systemCapabilitiesForUser } from '../lib/system-access.js';
import { SYSTEM_CAPABILITIES } from '../lib/system-permissions.js';
import { getSecuritySettings, updateSecuritySettings } from '../lib/system-security-settings.js';
import { writeOperationAudit } from '../lib/system-audit.js';

async function guard(request, env, capability) {
  const actor = await requireSystemCapability(request, env, capability);
  return actor.error ? { body: { error: actor.error }, status: actor.status } : { actor };
}
async function json(request) { try { return await request.json(); } catch { return null; } }
function pagination(url) { return { page: Math.max(1, Math.min(10000, Number(url.searchParams.get('page') || 1) || 1)), size: Math.max(1, Math.min(100, Number(url.searchParams.get('pageSize') || 20) || 20)) }; }

export async function handleCapabilities(request, env) {
  const actor = await (await import('../lib/session.js')).requireSession(request, env);
  if (actor.error) return { body: { error: actor.error }, status: actor.status };
  return { body: { ok: true, capabilities: await systemCapabilitiesForUser(env, actor.userId), catalog: SYSTEM_CAPABILITIES } };
}

export async function handleRoles(request, env) {
  const auth = await guard(request, env, 'system.roles.read'); if (auth.body) return auth;
  const { results = [] } = await env.BERYL_D1.prepare('SELECT role_id, code, name, description, built_in, status FROM roles ORDER BY built_in DESC, name').all();
  const roles = await Promise.all(results.map(async role => {
    const { results: permissions = [] } = await env.BERYL_D1.prepare('SELECT permission_code FROM role_permissions WHERE role_id = ? ORDER BY permission_code').bind(role.role_id).all();
    return { id: role.role_id, code: role.code, name: role.name, description: role.description, builtIn: Boolean(role.built_in), status: role.status, permissions: permissions.map(row => row.permission_code) };
  }));
  return { body: { ok: true, roles, capabilities: SYSTEM_CAPABILITIES } };
}

export async function handleSaveRole(request, env, roleId = '') {
  const auth = await guard(request, env, 'system.roles.manage'); if (auth.body) return auth;
  const body = await json(request); if (!body) return { body: { error: 'bad-json' }, status: 400 };
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 240) : '';
  const permissions = body.permissions;
  if (!name || !Array.isArray(permissions) || permissions.length > SYSTEM_CAPABILITIES.length || permissions.some(code => !SYSTEM_CAPABILITIES.includes(code))) return { body: { error: 'invalid-role' }, status: 400 };
  const now = Date.now();
  if (!roleId) {
    const id = crypto.randomUUID(); const code = `custom.${id}`;
    await env.BERYL_D1.prepare("INSERT INTO roles (role_id, code, name, description, built_in, status, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 'active', ?, ?)").bind(id, code, name, description, now, now).run();
    for (const permission of new Set(permissions)) await env.BERYL_D1.prepare('INSERT INTO role_permissions (role_id, permission_code, created_at) VALUES (?, ?, ?)').bind(id, permission, now).run();
    await writeOperationAudit(env, { actorUserId: auth.actor.userId, action: 'system.roles.create', targetType: 'role', targetId: id, changes: { changedFields: ['name', 'description', 'permissions'] } });
    return { body: { ok: true, roleId: id }, status: 201 };
  }
  const role = await env.BERYL_D1.prepare('SELECT built_in, code FROM roles WHERE role_id = ?').bind(roleId).first();
  if (!role) return { body: { error: 'role-not-found' }, status: 404 };
  if (role.code === 'system.super_admin') return { body: { error: 'super-admin-role-protected' }, status: 403 };
  await env.BERYL_D1.prepare('UPDATE roles SET name = ?, description = ?, updated_at = ? WHERE role_id = ?').bind(name, description, now, roleId).run();
  await env.BERYL_D1.prepare('DELETE FROM role_permissions WHERE role_id = ?').bind(roleId).run();
  for (const permission of new Set(permissions)) await env.BERYL_D1.prepare('INSERT INTO role_permissions (role_id, permission_code, created_at) VALUES (?, ?, ?)').bind(roleId, permission, now).run();
  await writeOperationAudit(env, { actorUserId: auth.actor.userId, action: 'system.roles.update', targetType: 'role', targetId: roleId, changes: { changedFields: ['name', 'description', 'permissions'] } });
  return { body: { ok: true } };
}

export async function handleDeleteRole(request, env, roleId) {
  const auth = await guard(request, env, 'system.roles.manage'); if (auth.body) return auth;
  const role = await env.BERYL_D1.prepare('SELECT built_in, code FROM roles WHERE role_id = ?').bind(roleId).first();
  if (!role) return { body: { error: 'role-not-found' }, status: 404 };
  if (role.built_in || role.code === 'system.super_admin') return { body: { error: 'built-in-role-protected' }, status: 403 };
  await env.BERYL_D1.prepare('DELETE FROM user_roles WHERE role_id = ?').bind(roleId).run();
  await env.BERYL_D1.prepare('DELETE FROM role_permissions WHERE role_id = ?').bind(roleId).run();
  await env.BERYL_D1.prepare('DELETE FROM roles WHERE role_id = ?').bind(roleId).run();
  await writeOperationAudit(env, { actorUserId: auth.actor.userId, action: 'system.roles.delete', targetType: 'role', targetId: roleId, changes: { changedFields: ['deleted'] } });
  return { body: { ok: true } };
}

export async function handleSecuritySettings(request, env, method) {
  const auth = await guard(request, env, method === 'GET' ? 'system.security.read' : 'system.security.manage'); if (auth.body) return auth;
  if (method === 'GET') return { body: { ok: true, settings: await getSecuritySettings(env) } };
  const body = await json(request); const result = await updateSecuritySettings(env, auth.actor.userId, body?.settings);
  if (result.error) return { body: { error: result.error }, status: 400 };
  await writeOperationAudit(env, { actorUserId: auth.actor.userId, action: 'system.security.update', targetType: 'security-settings', changes: { changedFields: Object.keys(body.settings) } });
  return { body: { ok: true, settings: result.values } };
}

export async function handleAuditLogs(request, env, kind) {
  const capability = kind === 'login' ? 'system.login_logs.read' : 'system.operation_logs.read';
  const auth = await guard(request, env, capability); if (auth.body) return auth;
  const url = new URL(request.url); const { page, size } = pagination(url); const before = Number(url.searchParams.get('before') || 0);
  const settings = await getSecuritySettings(env); const cutoff = Date.now() - settings['security.audit.retentionDays'] * 86400000;
  // Retention cleanup touches audit metadata only.
  await env.BERYL_D1.prepare('DELETE FROM login_logs WHERE created_at < ?').bind(cutoff).run();
  await env.BERYL_D1.prepare('DELETE FROM operation_logs WHERE created_at < ?').bind(cutoff).run();
  const table = kind === 'login' ? 'login_logs' : 'operation_logs';
  const filter = before ? 'created_at < ?' : '1 = 1'; const args = before ? [before] : [];
  const total = await env.BERYL_D1.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE ${filter}`).bind(...args).first();
  const columns = kind === 'login'
    ? 'log_id AS id, user_id AS userId, username, outcome, failure_code AS failureCode, ip_address AS ipAddress, device_id AS deviceId, user_agent AS userAgent, created_at AS createdAt'
    : 'log_id AS id, actor_user_id AS actorUserId, action, target_type AS targetType, target_id AS targetId, outcome, changes_json AS changes, created_at AS createdAt';
  const { results = [] } = await env.BERYL_D1.prepare(`SELECT ${columns} FROM ${table} WHERE ${filter} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...args, size, (page - 1) * size).all();
  return { body: { ok: true, logs: results, page, pageSize: size, total: Number(total?.total || 0) } };
}

export async function handleSessions(request, env) {
  const auth = await guard(request, env, 'system.sessions.read'); if (auth.body) return auth;
  const now = Date.now(); const { results = [] } = await env.BERYL_D1.prepare(
    'SELECT s.session_id AS id, s.user_id AS userId, u.username, u.display_name AS displayName, s.device_id AS deviceId, s.created_at AS createdAt, s.last_seen_at AS lastSeenAt, s.expires_at AS expiresAt, s.ip_address AS ipAddress, s.user_agent AS userAgent ' +
    'FROM sessions s JOIN users u ON u.user_id = s.user_id WHERE s.revoked_at IS NULL AND s.expires_at > ? AND u.deleted_at IS NULL ORDER BY s.last_seen_at DESC LIMIT 500'
  ).bind(now).all();
  return { body: { ok: true, sessions: results } };
}

export async function handleRevokeSession(request, env, sessionId) {
  const auth = await guard(request, env, 'system.sessions.revoke'); if (auth.body) return auth;
  const target = await env.BERYL_D1.prepare('SELECT user_id FROM sessions WHERE session_id = ? AND revoked_at IS NULL').bind(sessionId).first();
  if (!target) return { body: { error: 'session-not-found' }, status: 404 };
  await env.BERYL_D1.prepare('UPDATE sessions SET revoked_at = ? WHERE session_id = ? AND revoked_at IS NULL').bind(Date.now(), sessionId).run();
  await writeOperationAudit(env, { actorUserId: auth.actor.userId, action: 'system.sessions.revoke', targetType: 'session', targetId: sessionId, changes: { changedFields: ['revokedAt'] } });
  return { body: { ok: true } };
}

export async function handleRevokeUserSessions(request, env, userId) {
  const auth = await guard(request, env, 'system.sessions.revoke'); if (auth.body) return auth;
  const result = await env.BERYL_D1.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(Date.now(), userId).run();
  await writeOperationAudit(env, { actorUserId: auth.actor.userId, action: 'system.sessions.revoke_user', targetType: 'user', targetId: userId, changes: { changedFields: ['sessionsRevoked'] } });
  return { body: { ok: true, revoked: Number(result.meta?.changes || 0) } };
}
