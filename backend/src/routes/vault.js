import { ensureSchema } from '../lib/d1.js';
import { requireSession } from '../lib/session.js';

const MAX_PULL = 250;
const MAX_SNAPSHOT = 250;
const MAX_PUSH = 50;
const MAX_CIPHERTEXT = 2_000_000;
const MAX_ENVELOPE = 128_000;
const MAX_BATCH_BYTES = 8_000_000;
const OPAQUE_ID = /^[A-Za-z0-9_-]{16,128}$/;

async function actorFor(request, env) {
  const actor = await requireSession(request, env);
  if (actor.error) return actor;
  if (actor.mustChangePassword) return { error: 'password-change-required', status: 403 };
  return actor;
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

function encodePayload(value, maxLength) {
  if (typeof value === 'string') return value.length <= maxLength ? value : null;
  if (!value || typeof value !== 'object') return null;
  const encoded = JSON.stringify(value);
  return encoded.length <= maxLength ? encoded : null;
}

export async function handleGetUserKey(request, env) {
  const actor = await actorFor(request, env);
  if (actor.error) return { body: { error: actor.error }, status: actor.status };
  const envelope = await env.BERYL_D1.prepare('SELECT recovery_envelope, version, updated_at FROM user_key_envelopes WHERE user_id = ?').bind(actor.userId).first();
  if (!envelope) return { body: { ok: true, initialized: false } };
  return { body: { ok: true, initialized: true, recoveryEnvelope: envelope.recovery_envelope, version: Number(envelope.version), updatedAt: Number(envelope.updated_at) } };
}

export async function handlePutUserKey(request, env) {
  const actor = await actorFor(request, env);
  if (actor.error) return { body: { error: actor.error }, status: actor.status };
  const body = await readBody(request);
  const recoveryEnvelope = body && encodePayload(body.recoveryEnvelope, MAX_ENVELOPE);
  const version = Number(body?.version);
  if (!recoveryEnvelope || !Number.isSafeInteger(version) || version < 1) return { body: { error: 'invalid-key-envelope' }, status: 400 };
  const result = await env.BERYL_D1.prepare(
    'INSERT INTO user_key_envelopes (user_id, recovery_envelope, version, updated_at) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(user_id) DO NOTHING'
  ).bind(actor.userId, recoveryEnvelope, version, Date.now()).run();
  if (!Number(result.meta?.changes || 0)) return { body: { error: 'vault-already-initialized' }, status: 409 };
  return { body: { ok: true, version } };
}

export async function handleVaultPull(request, env) {
  const actor = await actorFor(request, env);
  if (actor.error) return { body: { error: actor.error }, status: actor.status };
  const body = await readBody(request);
  if (!body) return { body: { error: 'bad-json' }, status: 400 };
  const after = Number(body.after) || 0;
  if (!Number.isSafeInteger(after) || after < 0) return { body: { error: 'invalid-cursor' }, status: 400 };
  const result = await env.BERYL_D1.prepare(
    'SELECT sequence, opaque_id, ciphertext, key_envelope, version, device_id, deleted FROM cipher_changes ' +
    'WHERE user_id = ? AND sequence > ? ORDER BY sequence LIMIT ?'
  ).bind(actor.userId, after, MAX_PULL + 1).all();
  const hasMore = result.results.length > MAX_PULL;
  const changes = result.results.slice(0, MAX_PULL).map(row => ({
    sequence: Number(row.sequence), opaqueId: row.opaque_id, ciphertext: row.ciphertext,
    keyEnvelope: row.key_envelope, version: Number(row.version), deviceId: row.device_id, deleted: Boolean(row.deleted)
  }));
  return { body: { ok: true, changes, cursor: changes.at(-1)?.sequence || after, hasMore } };
}

export async function handleVaultSnapshot(request, env) {
  const actor = await actorFor(request, env);
  if (actor.error) return { body: { error: actor.error }, status: actor.status };
  const url = new URL(request.url);
  const after = String(url.searchParams.get('after') || '');
  const cursorBefore = Number((await env.BERYL_D1.prepare('SELECT COALESCE(MAX(sequence), 0) AS cursor FROM cipher_changes WHERE user_id = ?').bind(actor.userId).first())?.cursor || 0);
  const result = await env.BERYL_D1.prepare(
    'SELECT opaque_id, ciphertext, key_envelope, version, sequence, device_id, deleted FROM cipher_records ' +
    'WHERE user_id = ? AND opaque_id > ? ORDER BY opaque_id LIMIT ?'
  ).bind(actor.userId, after, MAX_SNAPSHOT + 1).all();
  const cursorAfter = Number((await env.BERYL_D1.prepare('SELECT COALESCE(MAX(sequence), 0) AS cursor FROM cipher_changes WHERE user_id = ?').bind(actor.userId).first())?.cursor || 0);
  if (cursorBefore !== cursorAfter) return { body: { error: 'vault-changed-during-snapshot' }, status: 409 };
  const hasMore = result.results.length > MAX_SNAPSHOT;
  const rows = result.results.slice(0, MAX_SNAPSHOT);
  return {
    body: {
      ok: true,
      records: rows.map(row => ({ opaqueId: row.opaque_id, ciphertext: row.ciphertext, keyEnvelope: row.key_envelope, version: Number(row.version), sequence: Number(row.sequence), deviceId: row.device_id, deleted: Boolean(row.deleted) })),
      nextAfter: rows.at(-1)?.opaque_id || after,
      hasMore,
      cursor: cursorBefore
    }
  };
}

export async function handleVaultPush(request, env) {
  const actor = await actorFor(request, env);
  if (actor.error) return { body: { error: actor.error }, status: actor.status };
  const body = await readBody(request);
  if (!body) return { body: { error: 'bad-json' }, status: 400 };
  if (!Array.isArray(body.changes) || body.changes.length > MAX_PUSH) return { body: { error: 'invalid-change-batch' }, status: 400 };
  const statements = [];
  const now = Date.now();
  let totalBytes = 0;
  for (const change of body.changes) {
    const opaqueId = String(change?.opaqueId || '');
    const version = Number(change?.version);
    const deviceId = String(change?.deviceId || actor.deviceId || 'unknown').slice(0, 128);
    const deleted = change?.deleted === true;
    const ciphertext = deleted ? '' : encodePayload(change?.ciphertext, MAX_CIPHERTEXT);
    const keyEnvelope = deleted ? '' : encodePayload(change?.keyEnvelope, MAX_ENVELOPE);
    totalBytes += opaqueId.length + (ciphertext?.length || 0) + (keyEnvelope?.length || 0) + 128;
    if (totalBytes > MAX_BATCH_BYTES) return { body: { error: 'change-batch-too-large' }, status: 413 };
    if (!OPAQUE_ID.test(opaqueId) || !Number.isSafeInteger(version) || version < 1 || (!deleted && (!ciphertext || !keyEnvelope))) {
      return { body: { error: 'invalid-change' }, status: 400 };
    }
    statements.push(env.BERYL_D1.prepare(
      'INSERT INTO cipher_changes (user_id, sequence, opaque_id, ciphertext, key_envelope, version, device_id, deleted, created_at) ' +
      'SELECT ?, COALESCE(MAX(sequence), 0) + 1, ?, ?, ?, ?, ?, ?, ? FROM cipher_changes WHERE user_id = ?'
    ).bind(actor.userId, opaqueId, ciphertext, keyEnvelope, version, deviceId, deleted ? 1 : 0, now, actor.userId));
    statements.push(env.BERYL_D1.prepare(
      'INSERT INTO cipher_records (user_id, opaque_id, ciphertext, key_envelope, version, sequence, device_id, deleted, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, (SELECT MAX(sequence) FROM cipher_changes WHERE user_id = ?), ?, ?, ?) ' +
      'ON CONFLICT(user_id, opaque_id) DO UPDATE SET ciphertext = excluded.ciphertext, key_envelope = excluded.key_envelope, ' +
      'version = excluded.version, sequence = excluded.sequence, device_id = excluded.device_id, deleted = excluded.deleted, updated_at = excluded.updated_at ' +
      'WHERE excluded.version > cipher_records.version OR (excluded.version = cipher_records.version AND excluded.device_id > cipher_records.device_id)'
    ).bind(actor.userId, opaqueId, ciphertext, keyEnvelope, version, actor.userId, deviceId, deleted ? 1 : 0, now));
  }
  if (statements.length) await env.BERYL_D1.batch(statements);
  const cursor = await env.BERYL_D1.prepare('SELECT COALESCE(MAX(sequence), 0) AS cursor FROM cipher_changes WHERE user_id = ?').bind(actor.userId).first();
  return { body: { ok: true, accepted: body.changes.length, cursor: Number(cursor?.cursor || 0) } };
}
