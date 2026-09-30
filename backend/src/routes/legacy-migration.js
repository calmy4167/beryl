import { ensureSchema } from '../lib/d1.js';
import { requireSession } from '../lib/session.js';

const PAGE_SIZE = 250;

async function legacySourceDigest(env) {
  const [records, entities] = await Promise.all([
    env.BERYL_D1.prepare('SELECT key, ts, device, deleted FROM records ORDER BY key').all(),
    env.BERYL_D1.prepare('SELECT entity, entity_id, updated_at, device, deleted FROM entity_records ORDER BY entity, entity_id').all()
  ]);
  const identifiers = [
    ...records.results.map(row => JSON.stringify(['record', row.key, Number(row.ts), row.device, Boolean(row.deleted)])),
    ...entities.results.map(row => JSON.stringify(['entity', row.entity, row.entity_id, Number(row.updated_at), row.device, Boolean(row.deleted)]))
  ].sort();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(identifiers)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function userDestinationIdDigest(env, userId) {
  const result = await env.BERYL_D1.prepare('SELECT opaque_id FROM cipher_records WHERE user_id = ? ORDER BY opaque_id').bind(userId).all();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(result.results.map(row => row.opaque_id))));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function adminOwner(request, env, allowComplete = false) {
  const actor = await requireSession(request, env);
  if (actor.error) return actor;
  if (actor.mustChangePassword) return { error: 'password-change-required', status: 403 };
  if (actor.role !== 'admin') return { error: 'forbidden', status: 403 };
  await ensureSchema(env);
  const state = await env.BERYL_D1.prepare('SELECT owner_user_id, status FROM legacy_migration_state WHERE singleton = 1').first();
  if (!state || state.owner_user_id !== actor.userId || (state.status !== 'running' && !(allowComplete && state.status === 'complete'))) return { error: 'migration-unavailable', status: 409 };
  return actor;
}

export async function handleLegacyExport(request, env) {
  const actor = await adminOwner(request, env);
  if (actor.error) return { body: { error: actor.error }, status: actor.status };
  const url = new URL(request.url);
  const recordAfter = String(url.searchParams.get('recordAfter') || '');
  const entityAfter = String(url.searchParams.get('entityAfter') || '');
  const entityIdAfter = String(url.searchParams.get('entityIdAfter') || '');
  const [records, entities] = await Promise.all([
    env.BERYL_D1.prepare(
      'SELECT key, value, ts, device, deleted FROM records WHERE key > ? ORDER BY key LIMIT ?'
    ).bind(recordAfter, PAGE_SIZE + 1).all(),
    env.BERYL_D1.prepare(
      'SELECT entity, entity_id, value, updated_at, device, deleted FROM entity_records ' +
      'WHERE entity > ? OR (entity = ? AND entity_id > ?) ORDER BY entity, entity_id LIMIT ?'
    ).bind(entityAfter, entityAfter, entityIdAfter, PAGE_SIZE + 1).all()
  ]);
  const recordHasMore = records.results.length > PAGE_SIZE;
  const entityHasMore = entities.results.length > PAGE_SIZE;
  const recordRows = records.results.slice(0, PAGE_SIZE);
  const entityRows = entities.results.slice(0, PAGE_SIZE);
  return {
    body: {
      ok: true,
      records: recordRows.map(row => ({ key: row.key, value: row.value, ts: Number(row.ts), device: row.device, deleted: Boolean(row.deleted) })),
      entities: entityRows.map(row => ({ entity: row.entity, entityId: row.entity_id, value: row.value, updatedAt: Number(row.updated_at), device: row.device, deleted: Boolean(row.deleted) })),
      recordCursor: recordRows.at(-1)?.key || recordAfter,
      entityCursor: entityRows.length ? { entity: entityRows.at(-1).entity, entityId: entityRows.at(-1).entity_id } : { entity: entityAfter, entityId: entityIdAfter },
      recordHasMore,
      entityHasMore
    }
  };
}

export async function handleLegacyStatus(request, env) {
  const actor = await adminOwner(request, env, true);
  if (actor.error) return { body: { error: actor.error }, status: actor.status };
  const [records, entities, sourceDigest, state] = await Promise.all([
    env.BERYL_D1.prepare('SELECT COUNT(*) AS count FROM records').first(),
    env.BERYL_D1.prepare('SELECT COUNT(*) AS count FROM entity_records').first(),
    legacySourceDigest(env),
    env.BERYL_D1.prepare('SELECT status FROM legacy_migration_state WHERE singleton = 1').first()
  ]);
  return { body: { ok: true, status: state?.status || 'running', recordCount: Number(records?.count || 0), entityCount: Number(entities?.count || 0), sourceDigest } };
}

export async function handleLegacyMigrationComplete(request, env) {
  const actor = await adminOwner(request, env);
  if (actor.error) return { body: { error: actor.error }, status: actor.status };
  let body;
  try { body = await request.json(); } catch { return { body: { error: 'bad-json' }, status: 400 }; }
  if (body?.verified !== true || body?.backupConfirmed !== true) return { body: { error: 'migration-confirmation-required' }, status: 400 };
  const [legacyRecords, legacyEntities, newRecords, serverDestinationIdDigest] = await Promise.all([
    env.BERYL_D1.prepare('SELECT COUNT(*) AS count FROM records').first(),
    env.BERYL_D1.prepare('SELECT COUNT(*) AS count FROM entity_records').first(),
    env.BERYL_D1.prepare('SELECT COUNT(*) AS count FROM cipher_records WHERE user_id = ? AND deleted = 0').bind(actor.userId).first(),
    userDestinationIdDigest(env, actor.userId)
  ]);
  const legacyCount = Number(legacyRecords?.count || 0) + Number(legacyEntities?.count || 0);
  const copiedCount = Number(body.copiedServerRecords);
  const storedCount = Number(newRecords?.count || 0);
  const verifiedDestinationCount = Number(body.verifiedDestinationCount);
  const verifiedSourceIdCount = Number(body.verifiedSourceIdCount);
  const verifiedCursor = Number(body.verifiedCursor);
  const decryptedSampleCount = Number(body.decryptedSampleCount);
  const expectedSourceDigest = await legacySourceDigest(env);
  const suppliedSourceDigest = typeof body.sourceDigest === 'string' ? body.sourceDigest : '';
  const destinationIdDigest = typeof body.destinationIdDigest === 'string' ? body.destinationIdDigest : '';
  const sampleCountValid = Number.isSafeInteger(decryptedSampleCount) && decryptedSampleCount === Math.min(5, verifiedDestinationCount);
  const currentCursorRow = await env.BERYL_D1.prepare('SELECT COALESCE(MAX(sequence), 0) AS cursor FROM cipher_changes WHERE user_id = ?').bind(actor.userId).first();
  const currentCursor = Number(currentCursorRow?.cursor || 0);
  if (!Number.isSafeInteger(copiedCount) || copiedCount !== legacyCount || suppliedSourceDigest !== expectedSourceDigest ||
      !Number.isSafeInteger(verifiedDestinationCount) || verifiedDestinationCount !== storedCount ||
      !Number.isSafeInteger(verifiedSourceIdCount) || verifiedSourceIdCount < 0 ||
      !Number.isSafeInteger(verifiedCursor) || verifiedCursor !== currentCursor ||
      !/^[a-f0-9]{64}$/.test(destinationIdDigest) || destinationIdDigest !== serverDestinationIdDigest || !sampleCountValid) {
    return { body: { error: 'migration-verification-mismatch', legacyCount, copiedCount: Number.isFinite(copiedCount) ? copiedCount : null, storedCount, verifiedDestinationCount: Number.isFinite(verifiedDestinationCount) ? verifiedDestinationCount : null, sourceMatches: suppliedSourceDigest === expectedSourceDigest }, status: 409 };
  }
  const now = Date.now();
  const migrationAudit = JSON.stringify({ legacyCount, copiedCount, sourceDigest: expectedSourceDigest, verifiedDestinationCount, verifiedSourceIdCount, destinationIdDigest, decryptedSampleCount, verifiedCursor });
  const cursorStillMatches = '(SELECT COALESCE(MAX(sequence), 0) FROM cipher_changes WHERE user_id = ?) = ?';
  const results = await env.BERYL_D1.batch([
    env.BERYL_D1.prepare(`DELETE FROM records WHERE ${cursorStillMatches}`).bind(actor.userId, verifiedCursor),
    env.BERYL_D1.prepare(`DELETE FROM entity_records WHERE ${cursorStillMatches}`).bind(actor.userId, verifiedCursor),
    env.BERYL_D1.prepare(`DELETE FROM auth WHERE ${cursorStillMatches}`).bind(actor.userId, verifiedCursor),
    env.BERYL_D1.prepare(`UPDATE legacy_migration_state SET status = ?, cursor = ?, completed_at = ? WHERE singleton = 1 AND owner_user_id = ? AND status = ? AND ${cursorStillMatches}`)
      .bind('complete', migrationAudit, now, actor.userId, 'running', actor.userId, verifiedCursor)
  ]);
  if (!Number(results.at(-1)?.meta?.changes || 0)) return { body: { error: 'vault-changed-during-verification' }, status: 409 };
  return { body: { ok: true, legacyCount, copiedServerRecords: copiedCount, verifiedDestinationCount, completedAt: now } };
}
