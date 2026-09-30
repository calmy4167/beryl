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
      await env.BERYL_D1.prepare(
        'CREATE TABLE IF NOT EXISTS users (' +
        'user_id TEXT PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE, display_name TEXT NOT NULL, ' +
        'password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN (\'admin\', \'user\')), ' +
        'status TEXT NOT NULL CHECK (status IN (\'active\', \'disabled\')) DEFAULT \'active\', ' +
        'must_change_password INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_login_at INTEGER)'
      ).run()
      await env.BERYL_D1.prepare(
        'CREATE TABLE IF NOT EXISTS sessions (' +
        'session_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES users(user_id), ' +
        'device_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER)'
      ).run()
      await env.BERYL_D1.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON sessions(user_id, revoked_at, expires_at)').run()
      await env.BERYL_D1.prepare(
        'CREATE TABLE IF NOT EXISTS login_limits (' +
        'identity_hash TEXT PRIMARY KEY, window_started_at INTEGER NOT NULL, failures INTEGER NOT NULL, locked_until INTEGER)'
      ).run()
      await env.BERYL_D1.prepare(
        'CREATE TABLE IF NOT EXISTS roles (' +
        'role_id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT \'\', ' +
        'built_in INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT \'active\', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)'
      ).run()
      await env.BERYL_D1.prepare(
        'CREATE TABLE IF NOT EXISTS user_roles (' +
        'user_id TEXT NOT NULL REFERENCES users(user_id), role_id TEXT NOT NULL REFERENCES roles(role_id), created_at INTEGER NOT NULL, ' +
        'PRIMARY KEY (user_id, role_id))'
      ).run()
      await env.BERYL_D1.prepare(
        'CREATE TABLE IF NOT EXISTS role_permissions (' +
        'role_id TEXT NOT NULL REFERENCES roles(role_id), permission_code TEXT NOT NULL, created_at INTEGER NOT NULL, ' +
        'PRIMARY KEY (role_id, permission_code))'
      ).run()
      await env.BERYL_D1.prepare(
        'CREATE TABLE IF NOT EXISTS system_settings (' +
        'setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT REFERENCES users(user_id))'
      ).run()
      await env.BERYL_D1.prepare(
        'CREATE TABLE IF NOT EXISTS login_logs (' +
        'log_id TEXT PRIMARY KEY, user_id TEXT, username TEXT NOT NULL, outcome TEXT NOT NULL, failure_code TEXT, ' +
        'ip_address TEXT, device_id TEXT, user_agent TEXT, created_at INTEGER NOT NULL)'
      ).run()
      await env.BERYL_D1.prepare(
        'CREATE TABLE IF NOT EXISTS operation_logs (' +
        'log_id TEXT PRIMARY KEY, actor_user_id TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT, ' +
        'outcome TEXT NOT NULL, changes_json TEXT, created_at INTEGER NOT NULL)'
      ).run()
      await env.BERYL_D1.prepare(
        'CREATE TABLE IF NOT EXISTS login_challenges (' +
        'challenge_id TEXT PRIMARY KEY, answer_hash TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER)'
      ).run()
      await env.BERYL_D1.prepare('CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id, user_id)').run()
      await env.BERYL_D1.prepare('CREATE INDEX IF NOT EXISTS idx_login_logs_created ON login_logs(created_at DESC)').run()
      await env.BERYL_D1.prepare('CREATE INDEX IF NOT EXISTS idx_operation_logs_created ON operation_logs(created_at DESC)').run()
      await env.BERYL_D1.prepare('CREATE INDEX IF NOT EXISTS idx_login_challenges_expiry ON login_challenges(expires_at)').run()
      await env.BERYL_D1.prepare(
        'CREATE TABLE IF NOT EXISTS cipher_records (' +
        'user_id TEXT NOT NULL REFERENCES users(user_id), opaque_id TEXT NOT NULL, ciphertext TEXT NOT NULL, ' +
        'key_envelope TEXT NOT NULL, version INTEGER NOT NULL, sequence INTEGER NOT NULL, device_id TEXT NOT NULL, ' +
        'deleted INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, opaque_id))'
      ).run()
      await env.BERYL_D1.prepare('CREATE INDEX IF NOT EXISTS idx_cipher_records_user_sequence ON cipher_records(user_id, sequence)').run()
      await env.BERYL_D1.prepare(
        'CREATE TABLE IF NOT EXISTS cipher_changes (' +
        'user_id TEXT NOT NULL REFERENCES users(user_id), sequence INTEGER NOT NULL, opaque_id TEXT NOT NULL, ' +
        'ciphertext TEXT, key_envelope TEXT, version INTEGER NOT NULL, device_id TEXT NOT NULL, ' +
        'deleted INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, sequence))'
      ).run()
      await env.BERYL_D1.prepare('CREATE INDEX IF NOT EXISTS idx_cipher_changes_user_sequence ON cipher_changes(user_id, sequence)').run()
      await env.BERYL_D1.prepare(
        'CREATE TABLE IF NOT EXISTS user_key_envelopes (' +
        'user_id TEXT PRIMARY KEY REFERENCES users(user_id), recovery_envelope TEXT NOT NULL, version INTEGER NOT NULL, updated_at INTEGER NOT NULL)'
      ).run()
      await env.BERYL_D1.prepare(
        'CREATE TABLE IF NOT EXISTS legacy_migration_state (' +
        'singleton INTEGER PRIMARY KEY CHECK (singleton = 1), owner_user_id TEXT REFERENCES users(user_id), ' +
        'status TEXT NOT NULL CHECK (status IN (\'pending\', \'running\', \'verified\', \'complete\')), ' +
        'cursor TEXT, started_at INTEGER, completed_at INTEGER)'
      ).run()
      await env.BERYL_D1.prepare("INSERT OR IGNORE INTO legacy_migration_state (singleton, status) VALUES (1, 'pending')").run()
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

export async function legacySyncEnabled(env) {
  await ensureSchema(env)
  const row = await env.BERYL_D1.prepare('SELECT user_id FROM users LIMIT 1').first()
  return !row
}

export async function requireD1(request, env, authorized) {
  if (!env.BERYL_D1) return { response: { error: 'no-d1-binding' }, status: 500 }
  await ensureSchema(env)
  if (!(await authorized(request, env, getAuthHash))) return { response: { error: 'unauthorized' }, status: 401 }
  return null
}
