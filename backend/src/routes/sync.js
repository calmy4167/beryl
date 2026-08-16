import { authorized } from '../lib/auth.js'
import { ensureSchema, getAuthHash, maxTs } from '../lib/d1.js'

async function guard(request, env) {
  if (!env.BERYL_D1) return { body: { error: 'no-d1-binding' }, status: 500 }
  await ensureSchema(env)
  if (!(await authorized(request, env, getAuthHash))) return { body: { error: 'unauthorized' }, status: 401 }
  return null
}

export async function handleSyncPull(request, env) {
  const denied = await guard(request, env); if (denied) return denied
  let body; try { body = await request.json() } catch { return { body: { error: 'bad-json' }, status: 400 } }
  const since = Number(body?.since) || 0
  const sinceDevice = String(body?.sinceDevice || '')
  const sinceKey = String(body?.sinceKey || '')
  const page = await env.BERYL_D1.prepare(
    'SELECT key, value, ts, device, deleted FROM records ' +
    'WHERE ts > ? OR (ts = ? AND (device > ? OR (device = ? AND key > ?))) ' +
    'ORDER BY ts ASC, device ASC, key ASC LIMIT 501'
  ).bind(since, since, sinceDevice, sinceDevice, sinceKey).all()
  const hasMore = page.results.length > 500
  const results = page.results.slice(0, 500)
  const last = results[results.length - 1]
  return { body: { ok: true, records: results.map(r => ({ key: r.key, value: r.value, ts: r.ts, device: r.device, deleted: !!r.deleted })), nextCursor: last ? { ts: Number(last.ts), device: last.device, key: last.key } : { ts: since, device: sinceDevice, key: sinceKey }, hasMore, maxTs: await maxTs(env) } }
}

export async function handleSyncPush(request, env) {
  const denied = await guard(request, env); if (denied) return denied
  let body; try { body = await request.json() } catch { return { body: { error: 'bad-json' }, status: 400 } }
  const changes = Array.isArray(body?.changes) ? body.changes : []
  if (!changes.length) return { body: { ok: true, maxTs: await maxTs(env) } }
  const stmts = changes.filter(c => c && typeof c.key === 'string' && c.key.startsWith('b_') && typeof c.ts === 'number').map(c => env.BERYL_D1.prepare(
    'INSERT INTO records (key, value, ts, device, deleted) VALUES (?, ?, ?, ?, 0) ' +
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value, ts = excluded.ts, device = excluded.device, deleted = excluded.deleted ' +
    'WHERE excluded.ts > records.ts OR (excluded.ts = records.ts AND excluded.device > records.device)'
  ).bind(c.key, typeof c.value === 'string' ? c.value : JSON.stringify(c.value), c.ts, String(c.device || 'unknown')))
  if (stmts.length) await env.BERYL_D1.batch(stmts)
  return { body: { ok: true, maxTs: await maxTs(env) } }
}

export async function handleEntityPull(request, env) {
  const denied = await guard(request, env); if (denied) return denied
  let body; try { body = await request.json() } catch { return { body: { error: 'bad-json' }, status: 400 } }
  const since = Number(body?.since) || 0
  const sinceDevice = String(body?.sinceDevice || '')
  const sinceEntity = String(body?.sinceEntity || '')
  const sinceEntityId = String(body?.sinceEntityId || '')
  const page = await env.BERYL_D1.prepare(
    'SELECT entity, entity_id, value, updated_at, device, deleted FROM entity_records ' +
    'WHERE updated_at > ? OR (updated_at = ? AND (device > ? OR (device = ? AND (entity > ? OR (entity = ? AND entity_id > ?))))) ' +
    'ORDER BY updated_at ASC, device ASC, entity ASC, entity_id ASC LIMIT 501'
  ).bind(since, since, sinceDevice, sinceDevice, sinceEntity, sinceEntity, sinceEntityId).all()
  const hasMore = page.results.length > 500
  const results = page.results.slice(0, 500)
  const last = results[results.length - 1]
  return { body: { ok: true, records: results.map(r => ({ entity: r.entity, entityId: r.entity_id, value: r.value, updatedAt: Number(r.updated_at), device: r.device, deleted: !!r.deleted })), nextCursor: last ? { ts: Number(last.updated_at), device: last.device, entity: last.entity, entityId: last.entity_id } : { ts: since, device: sinceDevice, entity: sinceEntity, entityId: sinceEntityId }, hasMore } }
}

export async function handleEntityPush(request, env) {
  const denied = await guard(request, env); if (denied) return denied
  let body; try { body = await request.json() } catch { return { body: { error: 'bad-json' }, status: 400 } }
  const changes = Array.isArray(body?.changes) ? body.changes : []
  const stmts = changes.filter(c => c && typeof c.entity === 'string' && typeof c.entityId === 'string' && typeof c.updatedAt === 'number').map(c => env.BERYL_D1.prepare(
    'INSERT INTO entity_records (entity, entity_id, value, updated_at, device, deleted) VALUES (?, ?, ?, ?, ?, ?) ' +
    'ON CONFLICT(entity, entity_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, device = excluded.device, deleted = excluded.deleted ' +
    'WHERE excluded.updated_at > entity_records.updated_at OR (excluded.updated_at = entity_records.updated_at AND excluded.device > entity_records.device)'
  ).bind(c.entity, c.entityId, c.value == null ? null : (typeof c.value === 'string' ? c.value : JSON.stringify(c.value)), c.updatedAt, String(c.device || 'unknown'), c.deleted ? 1 : 0))
  if (stmts.length) await env.BERYL_D1.batch(stmts)
  return { body: { ok: true, accepted: stmts.length } }
}
