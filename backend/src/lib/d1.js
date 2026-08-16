let schemaReady = false
let schemaPromise = null
let schemaBinding = null

export async function ensureSchema(env) {
  if (schemaReady && schemaBinding === env.BERYL_D1) return
  if (schemaBinding !== env.BERYL_D1) {
    schemaReady = false
    schemaPromise = null
    schemaBinding = env.BERYL_D1
  }
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await env.BERYL_D1.prepare(
        'CREATE TABLE IF NOT EXISTS records (' +
        'key TEXT PRIMARY KEY, value TEXT NOT NULL, ts INTEGER NOT NULL, ' +
        'device TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)'
      ).run()
      await env.BERYL_D1.prepare(
        'CREATE TABLE IF NOT EXISTS auth (id INTEGER PRIMARY KEY CHECK (id = 1), hash TEXT NOT NULL)'
      ).run()
      await env.BERYL_D1.prepare(
        'CREATE TABLE IF NOT EXISTS entity_records (' +
        'entity TEXT NOT NULL, entity_id TEXT NOT NULL, value TEXT, updated_at INTEGER NOT NULL, ' +
        'device TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (entity, entity_id))'
      ).run()
      schemaReady = true
    })()
  }
  await schemaPromise
}

export async function getAuthHash(env) {
  await ensureSchema(env)
  const row = await env.BERYL_D1.prepare('SELECT hash FROM auth WHERE id = 1').first()
  return row ? row.hash : null
}

export async function maxTs(env) {
  const row = await env.BERYL_D1.prepare('SELECT COALESCE(MAX(ts), 0) AS m FROM records').first()
  return row ? Number(row.m) : 0
}

export async function requireD1(request, env, authorized) {
  if (!env.BERYL_D1) return { response: { error: 'no-d1-binding' }, status: 500 }
  await ensureSchema(env)
  if (!(await authorized(request, env, getAuthHash))) return { response: { error: 'unauthorized' }, status: 401 }
  return null
}
