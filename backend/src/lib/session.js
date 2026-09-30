import { ensureSchema } from './d1.js';
import { getSecuritySettings } from './system-security-settings.js';

const SESSION_DAYS = 30;
const toHex = bytes => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');

export async function hashSessionToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

export function bearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

export async function createSession(env, user, deviceId = 'unknown', metadata = {}) {
  await ensureSchema(env);
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const tokenHash = await hashSessionToken(token);
  const sessionId = crypto.randomUUID();
  const createdAt = Date.now();
  const expiresAt = createdAt + SESSION_DAYS * 24 * 60 * 60 * 1000;
  await env.BERYL_D1.prepare(
    'INSERT INTO sessions (session_id, token_hash, user_id, device_id, created_at, expires_at, revoked_at, last_seen_at, ip_address, user_agent) ' +
    'VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)'
  ).bind(
    sessionId,
    tokenHash,
    user.id,
    String(deviceId || 'unknown').slice(0, 128),
    createdAt,
    expiresAt,
    createdAt,
    String(metadata.ipAddress || '').slice(0, 64) || null,
    String(metadata.userAgent || '').slice(0, 256) || null
  ).run();
  return { token, expiresAt };
}

export async function refreshSession(env, actor) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const tokenHash = await hashSessionToken(token);
  const now = Date.now();
  const expiresAt = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const result = await env.BERYL_D1.prepare(
    'UPDATE sessions SET token_hash = ?, created_at = ?, expires_at = ? WHERE session_id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > ?'
  ).bind(tokenHash, now, expiresAt, actor.id, actor.userId, now).run();
  if (!Number(result.meta?.changes || 0)) return null;
  return { token, expiresAt };
}

export async function requireSession(request, env) {
  if (!env.BERYL_D1) return { error: 'no-d1-binding', status: 500 };
  await ensureSchema(env);
  const token = bearerToken(request);
  if (!token || token.length > 256) return { error: 'unauthorized', status: 401 };
  const tokenHash = await hashSessionToken(token);
  const now = Date.now();
  const actor = await env.BERYL_D1.prepare(
    'SELECT s.session_id, s.user_id, s.device_id, s.expires_at, s.last_seen_at, u.username, u.display_name, u.role, u.status, ' +
    'u.must_change_password, u.password_updated_at, u.deleted_at ' +
    'FROM sessions s JOIN users u ON u.user_id = s.user_id ' +
    'WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = ? AND u.deleted_at IS NULL'
  ).bind(tokenHash, now, 'active').first();
  if (!actor) return { error: 'unauthorized', status: 401 };
  if (now - Number(actor.last_seen_at || 0) >= 5 * 60 * 1000) {
    await env.BERYL_D1.prepare('UPDATE sessions SET last_seen_at = ? WHERE session_id = ? AND revoked_at IS NULL')
      .bind(now, actor.session_id).run();
  }
  const settings = await getSecuritySettings(env);
  const expiryDays = settings['security.password.expiryDays'];
  const expired = expiryDays > 0 && (!actor.password_updated_at || now - Number(actor.password_updated_at) > expiryDays * 24 * 60 * 60 * 1000);
  return {
    id: actor.session_id,
    userId: actor.user_id,
    deviceId: actor.device_id,
    username: actor.username,
    displayName: actor.display_name,
    role: actor.role,
    mustChangePassword: Boolean(actor.must_change_password) || expired,
    expiresAt: Number(actor.expires_at)
  };
}

export async function revokeSession(env, sessionId) {
  await env.BERYL_D1.prepare('UPDATE sessions SET revoked_at = ? WHERE session_id = ? AND revoked_at IS NULL').bind(Date.now(), sessionId).run();
}

export async function revokeUserSessions(env, userId) {
  await env.BERYL_D1.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(Date.now(), userId).run();
}

export function isAdmin(actor) {
  return actor?.role === 'admin';
}
