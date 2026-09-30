import { ensureSchema } from '../lib/d1.js';
import { generateTemporaryPassword, hashPassword } from '../lib/password.js';
import { requireSystemCapability } from '../lib/system-access.js';
import { revokeUserSessions } from '../lib/session.js';
import { writeOperationAudit } from '../lib/system-audit.js';

const BASIC_ROLE = 'system.basic_user';
const USER_FIELDS = ['displayName', 'email', 'phone', 'avatar', 'sex', 'remark'];
const COLUMNS = { displayName: 'display_name', email: 'email', phone: 'phone', avatar: 'avatar', sex: 'sex', remark: 'remark' };
async function readBody(request) { try { return await request.json(); } catch { return null; } }
async function guard(request, env, capability) {
  const actor = await requireSystemCapability(request, env, capability);
  return actor.error ? { body: { error: actor.error }, status: actor.status } : { actor };
}
function clip(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }

export async function handleCreateUser(request, env) {
  const auth = await guard(request, env, 'system.users.create'); if (auth.body) return auth;
  const body = await readBody(request); if (!body) return { body: { error: 'bad-json' }, status: 400 };
  const username = clip(body.username, 64);
  const displayName = clip(body.displayName || username, 80);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/.test(username)) return { body: { error: 'invalid-username' }, status: 400 };
  if (!displayName) return { body: { error: 'invalid-display-name' }, status: 400 };
  const profile = {};
  for (const field of USER_FIELDS) if (body[field] !== undefined) profile[field] = clip(body[field], field === 'remark' ? 500 : 160);
  if (profile.sex && !['unknown', 'male', 'female', 'other'].includes(profile.sex)) return { body: { error: 'invalid-sex' }, status: 400 };
  const temporaryPassword = generateTemporaryPassword(); const now = Date.now(); const userId = crypto.randomUUID();
  try {
    await env.BERYL_D1.prepare(
      'INSERT INTO users (user_id, username, display_name, password_hash, role, status, must_change_password, created_at, updated_at, email, phone, avatar, sex, remark, password_updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, NULL)'
    ).bind(userId, username, displayName, await hashPassword(temporaryPassword), 'user', 'active', now, now, profile.email || null, profile.phone || null, profile.avatar || null, profile.sex || null, profile.remark || null).run();
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unique')) return { body: { error: 'username-exists' }, status: 409 };
    throw error;
  }
  await env.BERYL_D1.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)').bind(userId, BASIC_ROLE, now).run();
  await writeOperationAudit(env, { actorUserId: auth.actor.userId, action: 'system.users.create', targetType: 'user', targetId: userId, changes: { changedFields: ['username', ...Object.keys(profile)] } });
  return { body: { ok: true, user: { id: userId, username, displayName, role: 'user', status: 'active', createdAt: now }, temporaryPassword }, status: 201 };
}

export async function handleListUsers(request, env) {
  const auth = await guard(request, env, 'system.users.read'); if (auth.body) return auth;
  await ensureSchema(env);
  const url = new URL(request.url); const q = clip(url.searchParams.get('q') || '', 80); const status = url.searchParams.get('status');
  const page = Math.max(1, Math.min(10000, Number(url.searchParams.get('page') || 1) || 1));
  const pageSize = Math.max(1, Math.min(100, Number(url.searchParams.get('pageSize') || 20) || 20));
  const where = ['deleted_at IS NULL']; const values = [];
  if (q) { where.push('(username LIKE ? OR display_name LIKE ?)'); values.push(`%${q}%`, `%${q}%`); }
  if (['active', 'disabled'].includes(status)) { where.push('status = ?'); values.push(status); }
  const clause = where.join(' AND ');
  const total = await env.BERYL_D1.prepare(`SELECT COUNT(*) AS total FROM users WHERE ${clause}`).bind(...values).first();
  const { results = [] } = await env.BERYL_D1.prepare(
    `SELECT user_id, username, display_name, role, status, must_change_password, created_at, last_login_at, email, phone, avatar, sex, remark FROM users WHERE ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(...values, pageSize, (page - 1) * pageSize).all();
  const users = await Promise.all(results.map(async row => {
    const { results: roles = [] } = await env.BERYL_D1.prepare('SELECT role_id FROM user_roles WHERE user_id = ? ORDER BY role_id').bind(row.user_id).all();
    return { id: row.user_id, username: row.username, displayName: row.display_name, role: row.role, status: row.status, roles: roles.map(item => item.role_id), mustChangePassword: Boolean(row.must_change_password), createdAt: Number(row.created_at), lastLoginAt: row.last_login_at == null ? null : Number(row.last_login_at), email: row.email, phone: row.phone, avatar: row.avatar, sex: row.sex, remark: row.remark };
  }));
  return { body: { ok: true, users, page, pageSize, total: Number(total?.total || 0) } };
}

export async function handleUpdateUser(request, env, userId) {
  const auth = await guard(request, env, 'system.users.update'); if (auth.body) return auth;
  const body = await readBody(request); if (!body) return { body: { error: 'bad-json' }, status: 400 };
  const user = await env.BERYL_D1.prepare('SELECT user_id FROM users WHERE user_id = ? AND deleted_at IS NULL').bind(userId).first();
  if (!user) return { body: { error: 'user-not-found' }, status: 404 };
  const assignments = []; const values = []; const changed = [];
  if (body.username !== undefined) {
    const username = clip(body.username, 64); if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/.test(username)) return { body: { error: 'invalid-username' }, status: 400 };
    assignments.push('username = ?'); values.push(username); changed.push('username');
  }
  for (const field of USER_FIELDS) if (body[field] !== undefined) {
    const value = clip(body[field], field === 'remark' ? 500 : 160);
    if (field === 'sex' && value && !['unknown', 'male', 'female', 'other'].includes(value)) return { body: { error: 'invalid-sex' }, status: 400 };
    assignments.push(`${COLUMNS[field]} = ?`); values.push(value || null); changed.push(field);
  }
  if (body.displayName !== undefined) {
    const name = clip(body.displayName, 80); if (!name) return { body: { error: 'invalid-display-name' }, status: 400 };
    assignments.push('display_name = ?'); values.push(name); changed.push('displayName');
  }
  if (!changed.length) return { body: { error: 'no-changes' }, status: 400 };
  try { await env.BERYL_D1.prepare(`UPDATE users SET ${assignments.join(', ')}, updated_at = ? WHERE user_id = ?`).bind(...values, Date.now(), userId).run(); }
  catch (error) { if (String(error?.message || '').toLowerCase().includes('unique')) return { body: { error: 'username-exists' }, status: 409 }; throw error; }
  await writeOperationAudit(env, { actorUserId: auth.actor.userId, action: 'system.users.update', targetType: 'user', targetId: userId, changes: { changedFields: changed } });
  return { body: { ok: true } };
}

export async function handleSetUserStatus(request, env, userId) {
  const body = await readBody(request); if (!body || !['active', 'disabled'].includes(body.status)) return { body: { error: 'invalid-status' }, status: 400 };
  const auth = await guard(request, env, body.status === 'disabled' ? 'system.users.disable' : 'system.users.update'); if (auth.body) return auth;
  if (userId === auth.actor.userId && body.status === 'disabled') return { body: { error: 'cannot-disable-self' }, status: 400 };
  const user = await env.BERYL_D1.prepare('SELECT user_id, role FROM users WHERE user_id = ? AND deleted_at IS NULL').bind(userId).first();
  if (!user) return { body: { error: 'user-not-found' }, status: 404 };
  if (user.role === 'admin' && body.status === 'disabled') {
    const active = await env.BERYL_D1.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active' AND deleted_at IS NULL").first();
    if (Number(active?.count || 0) <= 1) return { body: { error: 'last-admin' }, status: 409 };
  }
  const now = Date.now(); await env.BERYL_D1.prepare('UPDATE users SET status = ?, updated_at = ? WHERE user_id = ?').bind(body.status, now, userId).run();
  if (body.status === 'disabled') await revokeUserSessions(env, userId);
  await writeOperationAudit(env, { actorUserId: auth.actor.userId, action: `system.users.${body.status}`, targetType: 'user', targetId: userId, changes: { changedFields: ['status'] } });
  return { body: { ok: true } };
}

export async function handleResetUserPassword(request, env, userId) {
  const auth = await guard(request, env, 'system.users.reset_password'); if (auth.body) return auth;
  if (userId === auth.actor.userId) return { body: { error: 'use-password-change' }, status: 400 };
  const user = await env.BERYL_D1.prepare('SELECT user_id FROM users WHERE user_id = ? AND deleted_at IS NULL').bind(userId).first();
  if (!user) return { body: { error: 'user-not-found' }, status: 404 };
  const temporaryPassword = generateTemporaryPassword(); const now = Date.now();
  await env.BERYL_D1.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, password_updated_at = NULL, updated_at = ? WHERE user_id = ?').bind(await hashPassword(temporaryPassword), now, userId).run();
  await revokeUserSessions(env, userId);
  await writeOperationAudit(env, { actorUserId: auth.actor.userId, action: 'system.users.reset_password', targetType: 'user', targetId: userId, changes: { changedFields: ['password', 'mustChangePassword'] } });
  return { body: { ok: true, temporaryPassword } };
}

export async function handleDeleteUser(request, env, userId) {
  const auth = await guard(request, env, 'system.users.delete'); if (auth.body) return auth;
  if (userId === auth.actor.userId) return { body: { error: 'cannot-delete-self' }, status: 400 };
  const user = await env.BERYL_D1.prepare('SELECT user_id, role FROM users WHERE user_id = ? AND deleted_at IS NULL').bind(userId).first();
  if (!user) return { body: { error: 'user-not-found' }, status: 404 };
  if (user.role === 'admin') { const n = await env.BERYL_D1.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active' AND deleted_at IS NULL").first(); if (Number(n?.count || 0) <= 1) return { body: { error: 'last-admin' }, status: 409 }; }
  const now = Date.now(); await env.BERYL_D1.prepare('UPDATE users SET deleted_at = ?, status = ?, updated_at = ? WHERE user_id = ?').bind(now, 'disabled', now, userId).run();
  await revokeUserSessions(env, userId);
  await writeOperationAudit(env, { actorUserId: auth.actor.userId, action: 'system.users.delete', targetType: 'user', targetId: userId, changes: { changedFields: ['deletedAt', 'status'] } });
  return { body: { ok: true } };
}

export async function handleSetUserRoles(request, env, userId) {
  const auth = await guard(request, env, 'system.users.assign_roles'); if (auth.body) return auth;
  const body = await readBody(request); const roleIds = body?.roleIds;
  if (!Array.isArray(roleIds) || roleIds.length > 20 || roleIds.some(id => typeof id !== 'string')) return { body: { error: 'invalid-roles' }, status: 400 };
  if (roleIds.includes('system.super_admin')) return { body: { error: 'super-admin-assignment-protected' }, status: 403 };
  const user = await env.BERYL_D1.prepare('SELECT user_id FROM users WHERE user_id = ? AND deleted_at IS NULL').bind(userId).first();
  if (!user) return { body: { error: 'user-not-found' }, status: 404 };
  if (roleIds.length) { const qs = roleIds.map(() => '?').join(','); const count = await env.BERYL_D1.prepare(`SELECT COUNT(*) AS count FROM roles WHERE role_id IN (${qs}) AND status = 'active'`).bind(...roleIds).first(); if (Number(count?.count || 0) !== new Set(roleIds).size) return { body: { error: 'invalid-roles' }, status: 400 }; }
  const now = Date.now(); await env.BERYL_D1.prepare('DELETE FROM user_roles WHERE user_id = ? AND role_id <> ?').bind(userId, 'system.super_admin').run();
  for (const roleId of roleIds) await env.BERYL_D1.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)').bind(userId, roleId, now).run();
  await env.BERYL_D1.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)').bind(userId, BASIC_ROLE, now).run();
  await writeOperationAudit(env, { actorUserId: auth.actor.userId, action: 'system.users.roles', targetType: 'user', targetId: userId, changes: { changedFields: ['roles'] } });
  return { body: { ok: true } };
}

export async function handleUnlockUser(request, env, userId) {
  const auth = await guard(request, env, 'system.users.unlock'); if (auth.body) return auth;
  const user = await env.BERYL_D1.prepare('SELECT username FROM users WHERE user_id = ? AND deleted_at IS NULL').bind(userId).first();
  if (!user) return { body: { error: 'user-not-found' }, status: 404 };
  const bytes = new TextEncoder().encode(user.username.toLowerCase()); const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const accountHash = Array.from(digest, value => value.toString(16).padStart(2, '0')).join('');
  await env.BERYL_D1.prepare('DELETE FROM login_limits WHERE account_hash = ?').bind(accountHash).run();
  await writeOperationAudit(env, { actorUserId: auth.actor.userId, action: 'system.users.unlock', targetType: 'user', targetId: userId, changes: { changedFields: ['loginLock'] } });
  return { body: { ok: true } };
}
