-- System administration and configurable authentication policy.
-- This migration changes identity metadata only; it does not touch Vault payloads or key envelopes.

ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN avatar TEXT;
ALTER TABLE users ADD COLUMN sex TEXT;
ALTER TABLE users ADD COLUMN remark TEXT;
ALTER TABLE users ADD COLUMN deleted_at INTEGER;
ALTER TABLE users ADD COLUMN password_updated_at INTEGER;

ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER;
ALTER TABLE sessions ADD COLUMN ip_address TEXT;
ALTER TABLE sessions ADD COLUMN user_agent TEXT;

ALTER TABLE login_limits ADD COLUMN account_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_login_limits_account_hash ON login_limits(account_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_active_user_expiry ON sessions(user_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS roles (
  role_id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  built_in INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')) DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(user_id),
  role_id TEXT NOT NULL REFERENCES roles(role_id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id, user_id);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(role_id),
  permission_code TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS login_logs (
  log_id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(user_id),
  username TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'locked')),
  failure_code TEXT,
  ip_address TEXT,
  device_id TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_logs_created ON login_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_logs_user_created ON login_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_logs_username_created ON login_logs(username, created_at DESC);

CREATE TABLE IF NOT EXISTS operation_logs (
  log_id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL REFERENCES users(user_id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
  changes_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_operation_logs_created ON operation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_logs_actor_created ON operation_logs(actor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS login_challenges (
  challenge_id TEXT PRIMARY KEY,
  answer_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_login_challenges_expiry ON login_challenges(expires_at);

INSERT OR IGNORE INTO roles (role_id, code, name, description, built_in, status, created_at, updated_at)
VALUES
  ('system.super_admin', 'system.super_admin', '超级管理员', '所有系统管理权限；不可删除或停用', 1, 'active', unixepoch() * 1000, unixepoch() * 1000),
  ('system.user_admin', 'system.user_admin', '用户管理员', '管理用户账号及其状态', 1, 'active', unixepoch() * 1000, unixepoch() * 1000),
  ('system.security_admin', 'system.security_admin', '安全管理员', '管理登录安全设置和会话', 1, 'active', unixepoch() * 1000, unixepoch() * 1000),
  ('system.audit_reader', 'system.audit_reader', '审计查看员', '只读查看登录及操作审计', 1, 'active', unixepoch() * 1000, unixepoch() * 1000),
  ('system.basic_user', 'system.basic_user', '普通用户', '不含系统管理权限', 1, 'active', unixepoch() * 1000, unixepoch() * 1000);

INSERT OR IGNORE INTO role_permissions (role_id, permission_code, created_at)
SELECT 'system.super_admin', permission_code, unixepoch() * 1000 FROM (
  SELECT 'system.users.read' AS permission_code UNION ALL SELECT 'system.users.create' UNION ALL SELECT 'system.users.update' UNION ALL
  SELECT 'system.users.disable' UNION ALL SELECT 'system.users.delete' UNION ALL SELECT 'system.users.reset_password' UNION ALL
  SELECT 'system.users.unlock' UNION ALL SELECT 'system.users.assign_roles' UNION ALL SELECT 'system.roles.read' UNION ALL SELECT 'system.roles.manage' UNION ALL
  SELECT 'system.security.read' UNION ALL SELECT 'system.security.manage' UNION ALL SELECT 'system.login_logs.read' UNION ALL
  SELECT 'system.operation_logs.read' UNION ALL SELECT 'system.sessions.read' UNION ALL SELECT 'system.sessions.revoke'
);

INSERT OR IGNORE INTO role_permissions (role_id, permission_code, created_at)
VALUES
  ('system.user_admin', 'system.users.read', unixepoch() * 1000),
  ('system.user_admin', 'system.users.create', unixepoch() * 1000),
  ('system.user_admin', 'system.users.update', unixepoch() * 1000),
  ('system.user_admin', 'system.users.disable', unixepoch() * 1000),
  ('system.user_admin', 'system.users.delete', unixepoch() * 1000),
  ('system.user_admin', 'system.users.reset_password', unixepoch() * 1000),
  ('system.user_admin', 'system.users.unlock', unixepoch() * 1000),
  ('system.user_admin', 'system.users.assign_roles', unixepoch() * 1000),
  ('system.user_admin', 'system.roles.read', unixepoch() * 1000),
  ('system.security_admin', 'system.security.read', unixepoch() * 1000),
  ('system.security_admin', 'system.security.manage', unixepoch() * 1000),
  ('system.security_admin', 'system.users.unlock', unixepoch() * 1000),
  ('system.security_admin', 'system.sessions.read', unixepoch() * 1000),
  ('system.security_admin', 'system.sessions.revoke', unixepoch() * 1000),
  ('system.audit_reader', 'system.login_logs.read', unixepoch() * 1000),
  ('system.audit_reader', 'system.operation_logs.read', unixepoch() * 1000),
  ('system.audit_reader', 'system.sessions.read', unixepoch() * 1000);

INSERT OR IGNORE INTO user_roles (user_id, role_id, created_at)
SELECT user_id, CASE WHEN role = 'admin' THEN 'system.super_admin' ELSE 'system.basic_user' END, created_at
FROM users
WHERE deleted_at IS NULL;

INSERT OR IGNORE INTO system_settings (setting_key, setting_value, updated_at) VALUES
  ('security.password.minLength', '6', unixepoch() * 1000),
  ('security.password.maxLength', '256', unixepoch() * 1000),
  ('security.password.requireUppercase', 'false', unixepoch() * 1000),
  ('security.password.requireLowercase', 'false', unixepoch() * 1000),
  ('security.password.requireNumber', 'false', unixepoch() * 1000),
  ('security.password.requireSymbol', 'false', unixepoch() * 1000),
  ('security.password.expiryDays', '0', unixepoch() * 1000),
  ('security.login.maxFailures', '5', unixepoch() * 1000),
  ('security.login.windowSeconds', '30', unixepoch() * 1000),
  ('security.login.lockSeconds', '30', unixepoch() * 1000),
  ('security.login.captchaEnabled', 'false', unixepoch() * 1000),
  ('security.login.captchaType', 'arithmetic', unixepoch() * 1000),
  ('security.audit.retentionDays', '180', unixepoch() * 1000);
