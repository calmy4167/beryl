import { ensureSchema } from '../lib/d1.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { bearerToken, createSession, refreshSession, requireSession, revokeSession } from '../lib/session.js';

const encoder = new TextEncoder();
const DUMMY_HASH = `pbkdf2$210000$${'00'.repeat(16)}$${'00'.repeat(32)}`;
const normalizeUsername = value => String(value || '').trim().toLowerCase();
const validUsername = value => /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/.test(value);
const validPassword = value => typeof value === 'string' && value.length >= 12 && value.length <= 256;

async function loginIdentityHash(username, request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${username}\u0000${ip}`));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

async function recordLoginFailure(env, identityHash) {
  const now = Date.now();
  await env.BERYL_D1.prepare(
    'INSERT INTO login_limits (identity_hash, window_started_at, failures, locked_until) VALUES (?, ?, 1, NULL) ' +
    'ON CONFLICT(identity_hash) DO UPDATE SET ' +
    'failures = CASE WHEN excluded.window_started_at - login_limits.window_started_at >= 30000 THEN 1 ELSE login_limits.failures + 1 END, ' +
    'locked_until = CASE WHEN (CASE WHEN excluded.window_started_at - login_limits.window_started_at >= 30000 THEN 1 ELSE login_limits.failures + 1 END) >= 5 THEN excluded.window_started_at + 30000 ELSE NULL END, ' +
    'window_started_at = CASE WHEN excluded.window_started_at - login_limits.window_started_at >= 30000 THEN excluded.window_started_at ELSE login_limits.window_started_at END'
  ).bind(identityHash, now).run();
  const row = await env.BERYL_D1.prepare('SELECT locked_until FROM login_limits WHERE identity_hash = ?').bind(identityHash).first();
  return Number(row?.locked_until || 0) > now;
}

function safeEqual(left, right) {
  const a = encoder.encode(String(left || ''));
  const b = encoder.encode(String(right || ''));
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) difference |= (a[index] || 0) ^ (b[index] || 0);
  return difference === 0;
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

export async function handleBootstrap(request, env) {
  if (!env.BERYL_D1) return { body: { error: 'no-d1-binding' }, status: 500 };
  if (!env.CALMY_BOOTSTRAP_SECRET) return { body: { error: 'bootstrap-disabled' }, status: 503 };
  await ensureSchema(env);
  if (!safeEqual(bearerToken(request), env.CALMY_BOOTSTRAP_SECRET)) return { body: { error: 'unauthorized' }, status: 401 };
  if (await env.BERYL_D1.prepare('SELECT user_id FROM users LIMIT 1').first()) return { body: { error: 'already-initialized' }, status: 409 };
  const body = await readBody(request);
  if (!body) return { body: { error: 'bad-json' }, status: 400 };
  const username = String(body.username || '').trim();
  const displayName = String(body.displayName || username).trim().slice(0, 80);
  if (!validUsername(username)) return { body: { error: 'invalid-username' }, status: 400 };
  if (!validPassword(body.password)) return { body: { error: 'weak-password' }, status: 400 };
  const now = Date.now();
  const user = { id: crypto.randomUUID(), username, displayName, role: 'admin' };
  const passwordHash = await hashPassword(body.password);
  const result = await env.BERYL_D1.prepare(
    'INSERT INTO users (user_id, username, display_name, password_hash, role, status, must_change_password, created_at, updated_at) ' +
    'SELECT ?, ?, ?, ?, ?, ?, 0, ?, ? WHERE NOT EXISTS (SELECT 1 FROM users)'
  ).bind(user.id, user.username, user.displayName, passwordHash, user.role, 'active', now, now).run();
  if (!Number(result.meta?.changes || 0)) return { body: { error: 'already-initialized' }, status: 409 };
  await env.BERYL_D1.prepare('UPDATE legacy_migration_state SET owner_user_id = ?, status = ? WHERE singleton = 1 AND status = ?')
    .bind(user.id, 'running', 'pending').run();
  return { body: { ok: true, user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role }, migrationPending: true }, status: 201 };
}

export async function handleLogin(request, env) {
  if (!env.BERYL_D1) return { body: { error: 'no-d1-binding' }, status: 500 };
  await ensureSchema(env);
  const body = await readBody(request);
  if (!body) return { body: { error: 'bad-json' }, status: 400 };
  const username = normalizeUsername(body.username);
  const identityHash = await loginIdentityHash(username.slice(0, 64), request);
  const now = Date.now();
  const limit = await env.BERYL_D1.prepare('SELECT locked_until FROM login_limits WHERE identity_hash = ?').bind(identityHash).first();
  if (Number(limit?.locked_until || 0) > now) return { body: { error: 'invalid-credentials' }, status: 429 };
  const user = username ? await env.BERYL_D1.prepare(
    'SELECT user_id, username, display_name, password_hash, role, status, must_change_password FROM users WHERE username = ?'
  ).bind(username).first() : null;
  const password = typeof body.password === 'string' && body.password.length <= 256 ? body.password : '';
  const valid = await verifyPassword(password, user?.password_hash || DUMMY_HASH);
  if (!user || user.status !== 'active' || !valid) {
    const locked = await recordLoginFailure(env, identityHash);
    return { body: { error: 'invalid-credentials' }, status: locked ? 429 : 401 };
  }
  await env.BERYL_D1.prepare('DELETE FROM login_limits WHERE identity_hash = ?').bind(identityHash).run();
  await env.BERYL_D1.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE user_id = ?').bind(now, now, user.user_id).run();
  const session = await createSession(env, { id: user.user_id }, body.deviceId);
  return {
    body: {
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      mustChangePassword: Boolean(user.must_change_password),
      user: { id: user.user_id, username: user.username, displayName: user.display_name, role: user.role }
    }
  };
}

export async function handleCurrentSession(request, env) {
  const actor = await requireSession(request, env);
  if (actor.error) return { body: { error: actor.error }, status: actor.status };
  return { body: { ok: true, expiresAt: actor.expiresAt, mustChangePassword: actor.mustChangePassword, user: { id: actor.userId, username: actor.username, displayName: actor.displayName, role: actor.role } } };
}

export async function handleRefresh(request, env) {
  const actor = await requireSession(request, env);
  if (actor.error) return { body: { error: actor.error }, status: actor.status };
  if (actor.mustChangePassword) return { body: { error: 'password-change-required' }, status: 403 };
  const session = await refreshSession(env, actor);
  if (!session) return { body: { error: 'unauthorized' }, status: 401 };
  return { body: { ok: true, token: session.token, expiresAt: session.expiresAt } };
}

export async function handleLogout(request, env) {
  const actor = await requireSession(request, env);
  if (actor.error) return { body: { error: actor.error }, status: actor.status };
  await revokeSession(env, actor.id);
  return { body: { ok: true } };
}

export async function handlePasswordChange(request, env) {
  const actor = await requireSession(request, env);
  if (actor.error) return { body: { error: actor.error }, status: actor.status };
  const body = await readBody(request);
  if (!body) return { body: { error: 'bad-json' }, status: 400 };
  if (!validPassword(body.newPassword)) return { body: { error: 'weak-password' }, status: 400 };
  const row = await env.BERYL_D1.prepare('SELECT password_hash FROM users WHERE user_id = ?').bind(actor.userId).first();
  if (!row || !(await verifyPassword(String(body.currentPassword || ''), row.password_hash))) return { body: { error: 'invalid-credentials' }, status: 401 };
  const now = Date.now();
  const hash = await hashPassword(body.newPassword);
  await env.BERYL_D1.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE user_id = ?').bind(hash, now, actor.userId).run();
  await env.BERYL_D1.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND session_id <> ? AND revoked_at IS NULL').bind(now, actor.userId, actor.id).run();
  return { body: { ok: true } };
}
