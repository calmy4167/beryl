import { ensureSchema } from '../lib/d1.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { bearerToken, createSession, refreshSession, requireSession, revokeSession } from '../lib/session.js';
import { writeLoginAudit, writeOperationAudit } from '../lib/system-audit.js';
import { getSecuritySettings, publicPasswordPolicy } from '../lib/system-security-settings.js';

const encoder = new TextEncoder();
const DUMMY_HASH = `pbkdf2$210000$${'00'.repeat(16)}$${'00'.repeat(32)}`;
const normalizeUsername = value => String(value || '').trim().toLowerCase();
const validUsername = value => /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/.test(value);

function validPassword(value, settings) {
  if (typeof value !== 'string') return false;
  if (value.length < settings['security.password.minLength'] || value.length > settings['security.password.maxLength']) return false;
  if (settings['security.password.requireUppercase'] && !/[A-Z]/.test(value)) return false;
  if (settings['security.password.requireLowercase'] && !/[a-z]/.test(value)) return false;
  if (settings['security.password.requireNumber'] && !/[0-9]/.test(value)) return false;
  if (settings['security.password.requireSymbol'] && !/[^a-zA-Z0-9]/.test(value)) return false;
  return true;
}

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
}

async function digestHex(value) {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function loginIdentityHashes(username, request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const [identityHash, accountHash] = await Promise.all([
    digestHex(`${username}\u0000${ip}`),
    digestHex(username)
  ]);
  return { identityHash, accountHash, ip };
}

async function recordLoginFailure(env, { identityHash, accountHash }, settings) {
  const now = Date.now();
  const windowMs = settings['security.login.windowSeconds'] * 1000;
  const lockMs = settings['security.login.lockSeconds'] * 1000;
  const maxFailures = settings['security.login.maxFailures'];
  await env.BERYL_D1.prepare(
    'INSERT INTO login_limits (identity_hash, account_hash, window_started_at, failures, locked_until) VALUES (?, ?, ?, 1, NULL) ' +
    'ON CONFLICT(identity_hash) DO UPDATE SET account_hash = excluded.account_hash, ' +
    'failures = CASE WHEN excluded.window_started_at - login_limits.window_started_at >= ? THEN 1 ELSE login_limits.failures + 1 END, ' +
    'locked_until = CASE WHEN (CASE WHEN excluded.window_started_at - login_limits.window_started_at >= ? THEN 1 ELSE login_limits.failures + 1 END) >= ? THEN excluded.window_started_at + ? ELSE NULL END, ' +
    'window_started_at = CASE WHEN excluded.window_started_at - login_limits.window_started_at >= ? THEN excluded.window_started_at ELSE login_limits.window_started_at END'
  ).bind(identityHash, accountHash, now, windowMs, windowMs, maxFailures, lockMs, windowMs).run();
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

async function consumeChallenge(env, challengeId, answer) {
  if (typeof challengeId !== 'string' || typeof answer !== 'string') return false;
  const now = Date.now();
  const row = await env.BERYL_D1.prepare(
    'SELECT answer_hash FROM login_challenges WHERE challenge_id = ? AND consumed_at IS NULL AND expires_at > ?'
  ).bind(challengeId, now).first();
  if (!row) return false;
  const consumed = await env.BERYL_D1.prepare(
    'UPDATE login_challenges SET consumed_at = ? WHERE challenge_id = ? AND consumed_at IS NULL AND expires_at > ?'
  ).bind(now, challengeId, now).run();
  if (Number(consumed.meta?.changes || 0) !== 1) return false;
  const expected = await digestHex(`${challengeId}:${answer.trim().toUpperCase()}`);
  return safeEqual(expected, row.answer_hash);
}

export async function handlePublicSecurityPolicy(_request, env) {
  if (!env.BERYL_D1) return { body: { error: 'no-d1-binding' }, status: 500 };
  await ensureSchema(env);
  const settings = await getSecuritySettings(env);
  return { body: { ok: true, passwordPolicy: publicPasswordPolicy(settings) } };
}

export async function handleCreateLoginChallenge(_request, env) {
  if (!env.BERYL_D1) return { body: { error: 'no-d1-binding' }, status: 500 };
  await ensureSchema(env);
  const settings = await getSecuritySettings(env);
  if (!settings['security.login.captchaEnabled']) return { body: { enabled: false } };
  const left = 2 + crypto.getRandomValues(new Uint8Array(1))[0] % 18;
  const right = 2 + crypto.getRandomValues(new Uint8Array(1))[0] % 18;
  const challengeId = crypto.randomUUID();
  const answer = String(left + right);
  const now = Date.now();
  await env.BERYL_D1.prepare('DELETE FROM login_challenges WHERE expires_at <= ? OR consumed_at IS NOT NULL').bind(now).run();
  await env.BERYL_D1.prepare(
    'INSERT INTO login_challenges (challenge_id, answer_hash, created_at, expires_at, consumed_at) VALUES (?, ?, ?, ?, NULL)'
  ).bind(challengeId, await digestHex(`${challengeId}:${answer}`), now, now + 3 * 60 * 1000).run();
  return { body: { enabled: true, challengeId, question: `${left} + ${right} = ?`, expiresAt: now + 3 * 60 * 1000 } };
}

export async function handleBootstrap(request, env) {
  if (!env.BERYL_D1) return { body: { error: 'no-d1-binding' }, status: 500 };
  if (!env.CALMY_BOOTSTRAP_SECRET) return { body: { error: 'bootstrap-disabled' }, status: 503 };
  await ensureSchema(env);
  if (!safeEqual(bearerToken(request), env.CALMY_BOOTSTRAP_SECRET)) return { body: { error: 'unauthorized' }, status: 401 };
  if (await env.BERYL_D1.prepare('SELECT user_id FROM users WHERE deleted_at IS NULL LIMIT 1').first()) return { body: { error: 'already-initialized' }, status: 409 };
  const body = await readBody(request);
  if (!body) return { body: { error: 'bad-json' }, status: 400 };
  const username = String(body.username || '').trim();
  const displayName = String(body.displayName || username).trim().slice(0, 80);
  const settings = await getSecuritySettings(env);
  if (!validUsername(username)) return { body: { error: 'invalid-username' }, status: 400 };
  if (!displayName) return { body: { error: 'invalid-display-name' }, status: 400 };
  if (!validPassword(body.password, settings)) return { body: { error: 'weak-password' }, status: 400 };
  const now = Date.now();
  const user = { id: crypto.randomUUID(), username, displayName, role: 'admin' };
  const passwordHash = await hashPassword(body.password);
  const result = await env.BERYL_D1.prepare(
    'INSERT INTO users (user_id, username, display_name, password_hash, role, status, must_change_password, created_at, updated_at, password_updated_at) ' +
    'SELECT ?, ?, ?, ?, ?, ?, 0, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM users WHERE deleted_at IS NULL)'
  ).bind(user.id, user.username, user.displayName, passwordHash, user.role, 'active', now, now, now).run();
  if (!Number(result.meta?.changes || 0)) return { body: { error: 'already-initialized' }, status: 409 };
  await env.BERYL_D1.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)')
    .bind(user.id, 'system.super_admin', now).run();
  await env.BERYL_D1.prepare('UPDATE legacy_migration_state SET owner_user_id = ?, status = ? WHERE singleton = 1 AND status = ?')
    .bind(user.id, 'running', 'pending').run();
  return { body: { ok: true, user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role }, migrationPending: true }, status: 201 };
}

export async function handleLogin(request, env) {
  if (!env.BERYL_D1) return { body: { error: 'no-d1-binding' }, status: 500 };
  await ensureSchema(env);
  const body = await readBody(request);
  if (!body) return { body: { error: 'bad-json' }, status: 400 };
  const username = normalizeUsername(body.username).slice(0, 64);
  const settings = await getSecuritySettings(env);
  if (settings['security.login.captchaEnabled'] && !(await consumeChallenge(env, body.challengeId, body.challengeAnswer))) {
    return { body: { error: 'invalid-challenge' }, status: 400 };
  }
  const hashes = await loginIdentityHashes(username, request);
  const now = Date.now();
  const limit = await env.BERYL_D1.prepare('SELECT locked_until FROM login_limits WHERE identity_hash = ?').bind(hashes.identityHash).first();
  const user = username ? await env.BERYL_D1.prepare(
    'SELECT user_id, username, display_name, password_hash, role, status, must_change_password, password_updated_at ' +
    'FROM users WHERE username = ? AND deleted_at IS NULL'
  ).bind(username).first() : null;
  if (Number(limit?.locked_until || 0) > now) {
    await writeLoginAudit(env, { userId: user?.user_id, username, outcome: 'locked', failureCode: 'rate-limited', ipAddress: hashes.ip, deviceId: body.deviceId, userAgent: request.headers.get('User-Agent') });
    return { body: { error: 'invalid-credentials' }, status: 429 };
  }
  const password = typeof body.password === 'string' && body.password.length <= 256 ? body.password : '';
  const valid = await verifyPassword(password, user?.password_hash || DUMMY_HASH);
  if (!user || user.status !== 'active' || !valid) {
    const locked = await recordLoginFailure(env, { ...hashes, userId: user?.user_id }, settings);
    await writeLoginAudit(env, { userId: user?.user_id, username, outcome: locked ? 'locked' : 'failure', failureCode: 'invalid-credentials', ipAddress: hashes.ip, deviceId: body.deviceId, userAgent: request.headers.get('User-Agent') });
    return { body: { error: 'invalid-credentials' }, status: locked ? 429 : 401 };
  }
  await env.BERYL_D1.prepare('DELETE FROM login_limits WHERE account_hash = ?').bind(hashes.accountHash).run();
  await env.BERYL_D1.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE user_id = ?').bind(now, now, user.user_id).run();
  const session = await createSession(env, { id: user.user_id }, body.deviceId, { ipAddress: hashes.ip, userAgent: request.headers.get('User-Agent') });
  const expiryDays = settings['security.password.expiryDays'];
  const passwordExpired = expiryDays > 0 && (!user.password_updated_at || now - Number(user.password_updated_at) > expiryDays * 24 * 60 * 60 * 1000);
  await writeLoginAudit(env, { userId: user.user_id, username, outcome: 'success', ipAddress: hashes.ip, deviceId: body.deviceId, userAgent: request.headers.get('User-Agent') });
  return {
    body: {
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      mustChangePassword: Boolean(user.must_change_password) || passwordExpired,
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
  const settings = await getSecuritySettings(env);
  if (!validPassword(body.newPassword, settings)) return { body: { error: 'weak-password' }, status: 400 };
  const row = await env.BERYL_D1.prepare('SELECT password_hash FROM users WHERE user_id = ? AND deleted_at IS NULL').bind(actor.userId).first();
  if (!row || !(await verifyPassword(String(body.currentPassword || ''), row.password_hash))) return { body: { error: 'invalid-credentials' }, status: 401 };
  const now = Date.now();
  const hash = await hashPassword(body.newPassword);
  await env.BERYL_D1.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, password_updated_at = ?, updated_at = ? WHERE user_id = ?')
    .bind(hash, now, now, actor.userId).run();
  await env.BERYL_D1.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND session_id <> ? AND revoked_at IS NULL')
    .bind(now, actor.userId, actor.id).run();
  await writeOperationAudit(env, { actorUserId: actor.userId, action: 'auth.password.change', targetType: 'user', targetId: actor.userId, outcome: 'success', changes: { changedFields: ['password'] } });
  return { body: { ok: true } };
}
