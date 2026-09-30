CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')) DEFAULT 'active',
  must_change_password INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(user_id),
  device_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON sessions(user_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS login_limits (
  identity_hash TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  failures INTEGER NOT NULL,
  locked_until INTEGER
);

CREATE TABLE IF NOT EXISTS cipher_records (
  user_id TEXT NOT NULL REFERENCES users(user_id),
  opaque_id TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  key_envelope TEXT NOT NULL,
  version INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, opaque_id)
);
CREATE INDEX IF NOT EXISTS idx_cipher_records_user_sequence ON cipher_records(user_id, sequence);

CREATE TABLE IF NOT EXISTS cipher_changes (
  user_id TEXT NOT NULL REFERENCES users(user_id),
  sequence INTEGER NOT NULL,
  opaque_id TEXT NOT NULL,
  ciphertext TEXT,
  key_envelope TEXT,
  version INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, sequence)
);
CREATE INDEX IF NOT EXISTS idx_cipher_changes_user_sequence ON cipher_changes(user_id, sequence);

CREATE TABLE IF NOT EXISTS user_key_envelopes (
  user_id TEXT PRIMARY KEY REFERENCES users(user_id),
  recovery_envelope TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS legacy_migration_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  owner_user_id TEXT REFERENCES users(user_id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'verified', 'complete')),
  cursor TEXT,
  started_at INTEGER,
  completed_at INTEGER
);

INSERT OR IGNORE INTO legacy_migration_state (singleton, status) VALUES (1, 'pending');
