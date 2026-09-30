import { ensureSchema } from '../lib/d1.js';
import { generateTemporaryPassword, hashPassword } from '../lib/password.js';
import { requireSession, revokeUserSessions } from '../lib/session.js';

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

async function authorizedActor(request, env) {
  const actor = await requireSession(request, env);
  if (actor.error) return { error: actor.error, status: actor.status };
  if (actor.mustChangePassword) return { error: 'password-change-required', status: 403 };
  if (actor.role !== 'admin') return { error: 'forbidden', status: 403 };
  return actor;
}

export async function handleCreateUser(request, env) {
  const actor = await authorizedActor(request, env);
  if (actor.error) return { body: { error: actor.error }, status: actor.status };
  const body = await readBody(request);
  if (!body) return { body: { error: 'bad-json' }, status: 400 };
  const username = String(body.username || '').trim();
  const displayName = String(body.displayName || username).trim().slice(0, 80);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/.test(username)) return { body: { error: 'invalid-username' }, status: 400 };
  if (!displayName) return { body: { error: 'invalid-display-name' }, status: 400 };
  const temporaryPassword = generateTemporaryPassword();
  const now = Date.now();
  const userId = crypto.randomUUID();
  try {
    await env.BERYL_D1.prepare(
      'INSERT INTO users (user_id, username, display_name, password_hash, role, status, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)'
    ).bind(userId, username, displayName, await hashPassword(temporaryPassword), 'user', 'active', now, now).run();
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unique')) return { body: { error: 'username-exists' }, status: 409 };
    throw error;
  }
  return { body: { ok: true, user: { id: userId, username, displayName, role: 'user', status: 'active', createdAt: now }, temporaryPassword }, status: 201 };
}

export async function handleListUsers(request, env) {
  const actor = await authorizedActor(request, env);
  if (actor.error) return { body: { error: actor.error }, status: actor.status };
  await ensureSchema(env);
  const { results = [] } = await env.BERYL_D1.prepare(
    'SELECT user_id, username, display_name, role, status, must_change_password, created_at, last_login_at FROM users ORDER BY created_at, username'
  ).all();
  return { body: { ok: true, users: results.map(row => ({ id: row.user_id, username: row.username, displayName: row.display_name, role: row.role, status: row.status, mustChangePassword: Boolean(row.must_change_password), createdAt: Number(row.created_at), lastLoginAt: row.last_login_at == null ? null : Number(row.last_login_at) })) } };
}

export async function handleSetUserStatus(request, env, userId) {
  const actor = await authorizedActor(request, env);
  if (actor.error) return { body: { error: actor.error }, status: actor.status };
  if (userId === actor.userId) return { body: { error: 'cannot-disable-self' }, status: 400 };
  const body = await readBody(request);
  if (!body || !['active', 'disabled'].includes(body.status)) return { body: { error: 'invalid-status' }, status: 400 };
  const user = await env.BERYL_D1.prepare('SELECT user_id, role FROM users WHERE user_id = ?').bind(userId).first();
  if (!user) return { body: { error: 'user-not-found' }, status: 404 };
  if (user.role === 'admin' && body.status === 'disabled') {
    const activeAdmins = await env.BERYL_D1.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'").first();
    if (Number(activeAdmins?.count || 0) <= 1) return { body: { error: 'last-admin' }, status: 409 };
  }
  await env.BERYL_D1.prepare('UPDATE users SET status = ?, updated_at = ? WHERE user_id = ?').bind(body.status, Date.now(), userId).run();
  if (body.status === 'disabled') await revokeUserSessions(env, userId);
  return { body: { ok: true } };
}

export async function handleResetUserPassword(request, env, userId) {
  const actor = await authorizedActor(request, env);
  if (actor.error) return { body: { error: actor.error }, status: actor.status };
  if (userId === actor.userId) return { body: { error: 'use-password-change' }, status: 400 };
  const user = await env.BERYL_D1.prepare('SELECT user_id FROM users WHERE user_id = ?').bind(userId).first();
  if (!user) return { body: { error: 'user-not-found' }, status: 404 };
  const temporaryPassword = generateTemporaryPassword();
  const now = Date.now();
  await env.BERYL_D1.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE user_id = ?')
    .bind(await hashPassword(temporaryPassword), now, userId).run();
  await revokeUserSessions(env, userId);
  return { body: { ok: true, temporaryPassword } };
}
