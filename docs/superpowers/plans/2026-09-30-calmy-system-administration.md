# Calmy 系统管理模块实施计划

> **For agentic workers:** Use the executing-plans workflow task-by-task. Keep the existing uncommitted worktree changes intact.

**Goal:** 将 Calmy 现有 admin/user 二级账号管理扩展为独立系统管理模块，覆盖系统角色权限、可配置登录安全、用户治理、审计日志和会话管理；不引入部门表或岗位表。

**Architecture:** 延续 Vue + Cloudflare Worker + D1。D1 保存用户身份、后台 RBAC、认证安全配置和不含业务内容的审计元数据；Worker 对每个后台 API 执行角色 capability 校验。Calmy 的 Space、Person、Relation、SceneParticipant、Owner/Steward 与 Permission/Scope 继续表达现实组织、上下文角色和业务数据权限，不与后台 SystemRole 合并。

**Tech Stack:** Vue 3, TypeScript, Cloudflare Worker (ES modules), Cloudflare D1/SQLite, Web Crypto PBKDF2-SHA256。

**Spec:** `docs/superpowers/specs/2026-09-30-calmy-system-administration-design.md`

## Global Constraints

- 不新增全局 Department/Position/Job 表，也不把 Space 成员、Person 关系或 SceneParticipant 身份映射为登录账号权限。
- 密码默认最小长度 6、最大长度 256，默认不强制字符组合；必须允许用户设置 `123456`，仍仅存 PBKDF2-SHA256 + 独立随机盐哈希。
- 首次登录和管理员重置后的强制改密不可绕过；普通密码默认不过期；登录验证码默认关闭。
- Worker 必须执行与前端一致的系统管理 RBAC 检查；未经授权的后台 API 默认拒绝。
- SystemRole 只授权系统管理能力，不读取、导出、解密或授权其他用户 Vault 内容。
- 日志不得记录密码、令牌、恢复密钥、解密密钥或业务 Entity 内容。
- 保留稳定 userId、User/Person 分离、每用户 Vault 隔离和已接受的内容零知识边界。
- 不部署 Worker、不迁移生产 D1、不改写远端分支；保留当前工作区已有未提交更改。

---

## Implementation Map

**Backend files:**

- `backend/migrations/0002_system_administration.sql` — D1 schema migration.
- `backend/wrangler.toml` — D1 migration directory declaration.
- `backend/src/lib/d1.js` — local/runtime schema readiness for the new tables and indexes.
- `backend/src/lib/system-permissions.js` — stable capability catalog and built-in role definitions.
- `backend/src/lib/system-access.js` — authenticated capability guard and role resolution.
- `backend/src/lib/system-audit.js` — redacted login/operation audit writes.
- `backend/src/lib/system-security-settings.js` — validated defaults and settings read/write.
- `backend/src/lib/password.js` — preserve PBKDF2 format; temporary passwords remain random.
- `backend/src/lib/session.js` — activity metadata, session query/revoke, token hashing.
- `backend/src/routes/auth.js` — configurable password/login failure rules, login logs, optional one-time challenge verification.
- `backend/src/routes/users.js` — profile CRUD, role assignment, account state, password reset and unlock.
- `backend/src/routes/system-admin.js` — role, security setting, audit log and online session handlers.
- `backend/src/worker.js` — route registration and bootstrap seeding.

**Frontend files:**

- `src/core/api/system-admin.ts` — typed admin API client.
- `src/core/api/auth.ts` — update account/security types and password operations.
- `src/router/route-manifest.ts` — system management route definitions and capability metadata.
- `src/router/index.ts` — route guard integration and old `/app/users` compatibility redirect.
- `src/vue/shell/AppShell.vue` — capability-aware system management navigation.
- `src/vue/pages/SystemAdminPage.vue` — shared system management shell and local section navigation.
- `src/vue/components/system-admin/UserManagementPanel.vue` — user list, create/edit, roles, status, reset and unlock.
- `src/vue/components/system-admin/RoleManagementPanel.vue` — system role and capability editor.
- `src/vue/components/system-admin/SecuritySettingsPanel.vue` — password, lock, captcha and expiry settings.
- `src/vue/components/system-admin/LoginLogPanel.vue` — login events and unlock actions.
- `src/vue/components/system-admin/OperationLogPanel.vue` — admin mutation audit list.
- `src/vue/components/system-admin/OnlineSessionsPanel.vue` — active sessions and revoke actions.
- `src/vue/pages/PassPage.vue` — align client-side password validation with server policy.

**Operational documentation:** `docs/operations/calmy-system-administration.md` — schema migration, default capability map, password policy and deployment procedure. No production deployment is part of this plan.

## Task 1: Add D1 schema and built-in role seed

**Files:**
- Create: `backend/migrations/0002_system_administration.sql`
- Modify: `backend/wrangler.toml`
- Modify: `backend/src/lib/d1.js`
- Modify: `backend/src/worker.js`

1. Add tables `roles`, `user_roles`, `role_permissions`, `system_settings`, `login_logs`, `operation_logs`, and `login_challenges`; add indexes for user-role lookup, log filters, challenge expiry, and active sessions.
2. Add user profile fields `email`, `phone`, `avatar`, `sex`, `remark`, `deleted_at`, and `password_updated_at`; add session `last_seen_at`, `ip_address`, and `user_agent` fields. Preserve the existing user `role` column during compatibility migration.
3. Add D1 `migrations_dir = "migrations"`; keep `ensureSchema` limited to safe bootstrap table creation and schema readiness. Existing-database column changes belong in the numbered migration, not implicit request-time `ALTER TABLE` calls.
4. Seed built-in role codes `system.super_admin`, `system.user_admin`, `system.security_admin`, `system.audit_reader`, and `system.basic_user`; seed existing `admin` users to Super Administrator and existing `user` users to Basic User.
5. Seed security defaults: minimum 6, maximum 256, no composition requirement, 5 failed attempts per 30-second window, 30-second lock, captcha disabled, first-login/reset password change required, ordinary password expiry disabled.
6. Confirm no DDL or data-writing command targets the configured production D1 during local implementation.

## Task 2: Add backend SystemRole capability enforcement

**Files:**
- Create: `backend/src/lib/system-permissions.js`
- Create: `backend/src/lib/system-access.js`
- Modify: `backend/src/routes/users.js`
- Modify: `backend/src/worker.js`

1. Define capability constants: `system.users.read`, `system.users.create`, `system.users.update`, `system.users.disable`, `system.users.delete`, `system.users.reset_password`, `system.users.unlock`, `system.roles.read`, `system.roles.manage`, `system.security.read`, `system.security.manage`, `system.login_logs.read`, `system.operation_logs.read`, `system.sessions.read`, and `system.sessions.revoke`.
2. Grant Super Administrator all capabilities; User Administrator account CRUD/reset/unlock; Security Administrator security configuration/session revoke; Audit Reader login/operation logs and read-only sessions; Basic User none.
3. Implement `requireSystemCapability(request, env, capability)` returning the session actor only when active and authorized; deny when the capability code is unknown or the role assignment is absent.
4. Replace `actor.role === 'admin'` checks in admin endpoints with the capability guard while preserving `mustChangePassword` restrictions.
5. Guard both list and mutation APIs; do not rely on route visibility or client-supplied role/actor IDs.
6. Protect the built-in Super Administrator role and last active Super Administrator from deletion, disablement, or loss of all administrative capability.

## Task 3: Upgrade user account management APIs

**Files:**
- Modify: `backend/src/routes/users.js`
- Modify: `backend/src/worker.js`
- Modify: `backend/src/lib/system-audit.js`

1. Add paginated/filterable user listing by username, display name, status, creation time, and last login; exclude logically deleted accounts unless explicitly requested by a permitted operation.
2. Add create/update operations for username, display name, email, phone, sex, avatar, and remark; validate uniqueness and length on the Worker; never accept a request-supplied `userId` as the acting identity.
3. Add assigning/removing multiple SystemRoles for a target user; reject assigning the Super Administrator role except through the protected bootstrap/admin flow.
4. Keep administrator-created users on random one-time temporary credentials and enforce change on first login. Resetting another user's password revokes that user's active sessions and enforces change on next login.
5. Add account lock-unlock separately from active/disabled status; disabling a user revokes all their sessions.
6. Add soft deletion with guards against deleting the current account or last active Super Administrator; preserve stable userId references in historical records.
7. Record each admin mutation through `writeOperationAudit(env, { actorUserId, action, targetType, targetId, outcome, changes })`, dropping sensitive fields before persistence.

## Task 4: Make password and login rules configurable

**Files:**
- Create: `backend/src/lib/system-security-settings.js`
- Modify: `backend/src/lib/session.js`
- Modify: `backend/src/routes/auth.js`
- Modify: `backend/src/worker.js`
- Modify: `backend/src/lib/password.js`
- Modify: `src/vue/pages/PassPage.vue`

1. Implement validated settings accessors with the seeded defaults and bounds: password minimum 6–256, lock threshold 1–100, lock window 10–3600 seconds, lock duration 10–86400 seconds, and password expiry 0–3650 days where 0 disables expiry.
2. Change bootstrap and password-change validation from a hardcoded 12-character minimum to the active settings; retain the 256-character upper bound and existing PBKDF2-SHA256 format.
3. Apply configurable login failure windows and lock duration; retain uniform public error messages and the dummy-hash verification for unknown usernames.
4. Update `password_updated_at` only after a successful password change; enforce first-login/reset requirement and configured expiry behavior in `backend/src/lib/session.js` for protected routes.
5. Add optional one-time challenge creation/verification using expiring D1 challenge records; when captcha is disabled, the existing username/password login request remains compatible.
6. Make the password page fetch active policy and validate on client for usability; server validation remains authoritative.

## Task 5: Add login/operation logs and online session APIs

**Files:**
- Create: `backend/src/lib/system-audit.js`
- Create: `backend/src/routes/system-admin.js`
- Modify: `backend/src/lib/session.js`
- Modify: `backend/src/routes/auth.js`
- Modify: `backend/src/worker.js`

1. Record every successful and failed login with normalized account identifier, outcome category, timestamp, and necessary IP/device metadata; never store request bodies, passwords, tokens, challenge answers, or business payloads.
2. Expose paginated login-log queries under `system.login_logs.read`; allow `system.users.unlock` to clear lock state for the corresponding account without changing active/disabled status.
3. Expose paginated operation logs under `system.operation_logs.read`; ensure `changes` output is allow-listed and redacted.
4. Store session creation metadata and update `last_seen_at` during authenticated requests; list only active, unexpired sessions under `system.sessions.read`.
5. Add revoking one session and all sessions for a user under `system.sessions.revoke`; token plaintext is returned only at session creation and only token hash is stored.
6. Add log retention cleanup entry points and document the configured retention period; cleanup must not delete user data, identity rows, or Vault envelopes.

## Task 6: Add the system management frontend and route permissions

**Files:**
- Create: `src/core/api/system-admin.ts`
- Create: `src/vue/pages/SystemAdminPage.vue`
- Create: `src/vue/components/system-admin/UserManagementPanel.vue`
- Create: `src/vue/components/system-admin/RoleManagementPanel.vue`
- Create: `src/vue/components/system-admin/SecuritySettingsPanel.vue`
- Create: `src/vue/components/system-admin/LoginLogPanel.vue`
- Create: `src/vue/components/system-admin/OperationLogPanel.vue`
- Create: `src/vue/components/system-admin/OnlineSessionsPanel.vue`
- Modify: `src/core/api/auth.ts`
- Modify: `src/router/route-manifest.ts`
- Modify: `src/router/index.ts`
- Modify: `src/vue/shell/AppShell.vue`

1. Add child routes `/app/system/users`, `/app/system/roles`, `/app/system/security`, `/app/system/login-logs`, `/app/system/operation-logs`, and `/app/system/sessions`; keep `/app/users` as a compatibility redirect to `/app/system/users`.
2. Add capability metadata to system routes and navigation; hide unauthorized entries for usability while relying on Worker guards for enforcement.
3. Build the user panel with search, status, edit, role assignment, create/reset temporary credential one-time display, unlock, disable, and safe delete confirmations.
4. Build role editing against the Worker capability catalog; do not render Calmy product role templates as system roles.
5. Build security settings with server validation feedback and explanatory values; display that a 6-character password is accepted by current policy.
6. Build login/operation log tables with filters and redacted fields; build session list with single-session and account-wide revoke actions.
7. Use current Calmy control styles, responsive tables, loading/empty/error states, and avoid exposing `Space`, `Person`, or `SceneParticipant` as account department/job fields.

## Task 7: Document migration and local operations

**Files:**
- Create: `docs/operations/calmy-system-administration.md`
- Modify: `docs/README.md`
- Modify: `docs/operations/calmy-user-identity-cutover.md`

1. Document built-in role/capability mapping, password and lock defaults, account lifecycle, audit fields, and Calmy contextual-role boundaries.
2. Document local D1 migration and Worker startup commands separately from production deployment; include a backup and rollback procedure for the migration.
3. State that changing password policy in code does not change any already-deployed Worker until a separately authorized deployment.
4. Document how to set an individual account password to `123456` after the policy feature is deployed: authenticate as permitted admin, use the normal password reset/change path, and do not put the password in source control or logs.

## Task 8: Final implementation review

1. Read the full implementation diff and confirm only files belonging to this feature changed in addition to pre-existing worktree edits.
2. Compare each acceptance criterion in the specification with the corresponding backend route, UI, migration, or operations note.
3. Inspect every logged payload and API response for password, token, recovery key, Vault ciphertext, and user content leakage.
4. Inspect role guards on every system management endpoint and confirm route metadata is not the only enforcement layer.
5. Confirm there are no `departments`, `posts`, global job fields, or mappings from Space/SceneParticipant into SystemRole.
6. Keep production D1 and Worker deployment untouched; report remaining deployment-only actions separately.

---

## Implementation status — 2026-09-30

- Tasks 1–7 implemented in the local worktree: migration/schema, capability-based Worker guards, user lifecycle and SystemRole assignment, configurable authentication policy, redacted audit/session APIs, system-management pages/navigation, and operations documentation.
- Task 8 source review completed for route guards, sensitive logging, product-role separation, and production boundaries.
- Verification: `npm run build` passed; `node --check` passed for the modified Worker route/library files; `git diff --check` reported no whitespace errors. Automated tests were not run.
- Deployment remains separate: apply `0002_system_administration.sql` to the intended D1 after backup, then deploy Worker/frontend. No D1 migration or deployment was performed as part of this implementation.
