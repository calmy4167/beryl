# Calmy Phase B 单 Entity 只读分享实施计划

> **For agentic workers:** 按任务顺序执行。Task 0 的独立密码学审查与威胁模型决策是硬门槛；ADR-002 未接受前，不实现 recipient key exchange、grant API、Envelope 写入或分享 UI。遵守 accepted ADR-001 和产品访问设计；不要部署、提交或写入远端分支。

**Goal:** 实现一位 Entity 拥有者向一位已启用 User 分享一条 Entity 的只读访问，并确保 Worker 以认证 Session 强制执行授权、客户端独立解密、撤权后拒绝线上读取。

**Architecture:** 拥有者原 Entity 和唯一事实继续留在其 User 分区。D1 保存不透明单 Entity grant 和面向 recipient 的加密 Content Key envelope；Worker 只在 Session、owner、recipient、grant 与 key version 全部匹配时返回密文。初始界面仅集成 Matter/Thing 详情，recipient 仅通过独立“分享给我”只读页面读取；其他类型、全局模块集成和写权限留待后续设计。

**Tech Stack:** Vue 3、TypeScript、Cloudflare Workers、D1/SQLite、Web Crypto API 或独立审查接受的 HPKE 库、Vitest、Node test runner。

**Spec:** [Phase B 单 Entity 只读分享设计](../specs/2026-09-30-calmy-phase-b-single-entity-readonly-sharing-design.md), [ADR-002（Proposed）](../../adr/ADR-002-recipient-key-envelope-protocol.md), [独立密码学审查委托](../../security/CALMY_PHASE_B_CRYPTO_REVIEW_REQUEST.md)

## Global Constraints

- ADR-002 必须由独立密码学审查后接受，且收件人公钥目录威胁模型与浏览器/OS 支持矩阵必须先定；不得用本计划替代审查。
- 第一实现限制为一位 owner、一位 recipient、一条 Matter/Thing Entity、`view` 权限；首版不支持评论、编辑、转授权、Scope、Scene、Space 或多接收者。
- Owner、recipient、actor 均由 Worker 按当前 Session/服务端记录确定；不信任请求体声明。
- grant、recipient key envelope 和 ciphertext 必须原子授权；少任一项、状态含糊或版本不符都默认拒绝。
- D1/API/log 不得写入业务标题、Entity 类型、Person/Thing/Scene/Space/Domain/Relation 语义、Scope 条件、明文或解密密钥。
- 归档/场景结束不隐式撤权；明确 owner revoke 或 Entity deletion tombstone 才终止共享读取。
- 撤权不能远程删除已下载的离线副本；UI 必须显示最近授权确认时间并说明限制。
- Shared-with-me 数据不得混入 recipient 自有 Entity、全局搜索/Graph/AI/日历、常规备份或 Portable Vault。
- 默认导航保持关闭；密码学审查、实现验收、真实用户试点和隐私评审全部通过前不得默认上线。
- 不部署、不提交、不推送或修改远端资源。

## Files and Responsibilities

### Backend and D1

- Create `backend/migrations/0002_entity_shares.sql` for authenticated User sharing-public-key versions, share grants, and immutable minimal control-plane audit rows.
- Modify `backend/src/lib/d1.js` to initialize the same schema for existing local/test flows, matching the SQL migration.
- Create `backend/src/routes/shares.js` for own public-key publish, active recipient-key lookup, grant create/list/read/revoke; every handler derives actor from `requireSession`.
- Modify `backend/src/worker.js` to register only the explicit authenticated share routes.
- Create `backend/test/shares.test.mjs` using the existing Node test-runner style and fake D1 binding to exercise route authorization and fail-closed behavior.

### Client cryptography, API and cache

- Create `src/core/share-keys.ts` for recipient public/private key lifecycle and Content Key envelope wrap/unwrap using only the ADR-002 reviewed protocol; no crypto suite/library may be selected by an implementer.
- Create `src/core/api/shares.ts` for owner create/list/revoke and recipient list/read calls through `apiFetch`.
- Create `src/core/shares.ts` to coordinate Matter/Thing share commands, local recipient projection cache, owner/source attribution and last server authorization time.
- Modify `src/core/db.ts` only if a distinct User-namespaced share projection store is required; share projection keys must include the authenticated recipient User ID and grant ID.
- Modify `src/core/vault-keys.ts` only for reviewed User sharing-key storage, recovery and version migration. Existing local Device Key/User Key behavior must remain compatible.

### Vue first vertical slice

- Create `src/vue/components/ShareMatterDialog.vue` for choosing an explicitly User-bound Person, reviewing the single Entity and fixed read-only action, verifying the recipient key, confirming/retrying/canceling, and revoking.
- Create `src/vue/pages/SharedWithMePage.vue` for listing/reading currently authorized Matter/Thing content and showing unavailable/offline-confirmation states.
- Modify `src/vue/pages/MatterDetailPage.vue` to expose owner-only sharing and the current share state for the selected Matter/Thing.
- Modify `src/router/route-manifest.ts`, `src/router/index.ts`, `src/vue/page-registry.ts`, and `src/App.vue` for the gated `/app/shared-with-me` page; do not add it to default sidebar navigation.
- Add focused client coverage under `src/__tests__/share-keys.test.ts`, `src/__tests__/shares.test.ts`, and `src/__tests__/shared-with-me-page.test.ts`.

## Execution Tasks

### Task 0: Clear the security and product preflight gate

**Files:** `docs/adr/ADR-002-recipient-key-envelope-protocol.md`, `docs/security/CALMY_PHASE_B_CRYPTO_REVIEW_REQUEST.md`, and this plan.

- [ ] Assign an independent reviewer and obtain the dated written report required by the review request.
- [ ] Record the selected directory threat model; the current candidate is B, manual out-of-band key verification on first share and key change.
- [ ] Accept ADR-002 only after resolving all blocker and must-fix review findings; pin the exact crypto library/suite, key identity verification, envelope/AAD format, and recovery/rotation behavior in that ADR.
- [ ] Decide the response to a copied Recovery Key plus copied old recovery envelope; rewrapping the same User Key does not invalidate that old pair, so assess whether User Key and affected Entity Content Keys must rotate.
- [x] Record the product-approved sharing support policy: Windows 11 latest/previous stable major Chrome and Edge; macOS latest/previous stable major Safari and Chrome; iOS latest/previous stable major Safari; Android latest/previous stable major Chrome. Firefox is outside the initial sharing support scope. Record concrete versions and compatibility results during Task 7 release verification.
- [ ] Confirm the first UI integration remains Matter/Thing and one recipient; if the reviewed protocol requires a different data path, revise this plan and design before coding.

**Gate:** Until every checkbox above is satisfied, stop before Task 1. Documentation work may continue, but no share schema/API/client crypto/UI code is authorized by this plan before the gate.

### Task 1: Add opaque share grant persistence

**Files:** Create `backend/migrations/0002_entity_shares.sql`, modify `backend/src/lib/d1.js`, create `backend/test/shares.test.mjs`.

**Interface:** A public-key record has `user_id`, `key_id`, `protocol_id`, `public_key`, monotonic `key_version`, status and timestamps; key history/rotation follows accepted ADR-002. A grant record has `grant_id`, `owner_user_id`, `recipient_user_id`, `opaque_entity_id`, fixed action `view`, `status`, `recipient_key_id`, `content_key_version`, reviewed envelope payload, `version`, `created_at`, `updated_at`, and nullable `revoked_at`. Add an invariant that one owner Entity has at most one active recipient grant in this first slice.

- [ ] Add a failing schema regression that verifies grant uniqueness, required columns, allowed status/action values, and owner/recipient foreign keys.
- [ ] Add parity coverage proving `ensureSchema` creates the same grant schema as migration `0002_entity_shares.sql`.
- [ ] Implement migration and D1 schema initialization with no plaintext Entity type, title, Scope, Person, Thing, Scene, Space, Domain or Relation columns.
- [ ] Verify rejected duplicate active grants and invalid action/status values leave existing grant state unchanged.

### Task 2: Implement Worker authorization handlers

**Files:** Create `backend/src/routes/shares.js`, modify `backend/src/worker.js`, extend `backend/test/shares.test.mjs`.

**Interfaces:**

- `handlePublishShareKey(request, env)` accepts only the Session User's reviewed protocol public key and monotonic key version; it never accepts private key material.
- `handleGetRecipientShareKey(request, env, userId)` returns the current public key/version for one explicit known recipient ID; it returns no directory listing.
- `handleCreateShare(request, env)` reads `{ recipientUserId, opaqueEntityId, recipientKeyId, contentKeyVersion, envelope, verification, commandId }`; derives owner from Session and accepts only a live owner record and active recipient.
- `handleListOwnedShares(request, env)` returns current owner grants with opaque IDs/actions/states only.
- `handleListReceivedShares(request, env)` returns only active grants for the Session User.
- `handleReadShare(request, env, grantId)` returns source ciphertext plus the envelope for this recipient only.
- `handleRevokeShare(request, env, grantId)` is owner-only, idempotently revokes the grant and blocks subsequent recipient reads.

**Routes:** `PUT /api/shares/key`, `GET /api/shares/recipient-key/:userId`, `POST /api/shares`, `GET /api/shares`, `GET /api/shares/with-me`, `GET /api/shares/with-me/:grantId`, `DELETE /api/shares/:grantId`.

- [ ] Write failing route tests for unauthenticated actor, first-login password change, forged owner/actor, publishing another User's key, private-key fields in publish body, key-version rollback, recipient key lookup, non-owner grant, disabled recipient, unknown/deleted Entity, duplicate idempotent create, read by intended recipient, read by unrelated User, and recipient attempting write.
- [ ] Register all listed Worker routes; run `actorFor`-equivalent session and must-change-password checks for every handler.
- [ ] Allow a User to publish only their own public key and allow lookup only by one explicit known ID, with no user directory/search endpoint.
- [ ] On create, validate the owner Entity exists in `(session.userId, opaque_entity_id)` and is not tombstoned; confirm recipient account is active without exposing a directory list.
- [ ] Atomically persist grant plus reviewed recipient envelope; only return success after the D1 operation confirms both.
- [ ] On read, derive recipient from Session, query only active grant, match the exact key version, then fetch the owner's current `cipher_records` row and return ciphertext and the recipient envelope. Return the same not-found response for absent and unrelated grants.
- [ ] On revoke, verify Session owner, update status once, append a minimal opaque audit event, and ensure every read path denies the grant immediately.
- [ ] Confirm route handlers never echo request-body actor/owner fields into authorization decisions or logs.

### Task 3: Implement the reviewed recipient key lifecycle

**Files:** Create `src/core/share-keys.ts`, modify `src/core/vault-keys.ts`, create `src/__tests__/share-keys.test.ts`.

**Interface:** `ensureOwnShareKey(userId)`, `createRecipientEnvelope(userId, recipientPublicKey, entityContentKey, context)`, and `openRecipientEnvelope(userId, envelope, context)` use only accepted ADR-002 types. Envelope open returns a Content Key only after protocol, recipient key ID, grant ID, opaque Entity ID and key version context checks succeed. Exact shapes must match accepted ADR-002.

- [ ] Add failing tests from the accepted ADR vectors for successful round trip, wrong recipient private key, altered grant/entity/key version context, malformed envelope, unsupported protocol version, and key rotation.
- [ ] Implement key generation, protected private-key persistence, User-Key wrapping, own public-key publication and recipient envelope operations using only the accepted maintained implementation.
- [ ] Ensure login password reset cannot derive, replace or unlock the sharing private key; recovery uses only the reviewed User Key/Recovery Key path.
- [ ] Add recovery/multi-device tests and migration logic for older local keyring versions without replacing an existing key on failure.
- [ ] Check selected APIs/library against the approved browser/OS matrix; unsupported clients must fail before showing a share success state.

### Task 4: Add client share application/API boundary

**Files:** Create `src/core/api/shares.ts`, create `src/core/shares.ts`, modify `src/core/db.ts` only for the separate per-User projection cache, and create `src/__tests__/shares.test.ts`.

**Interfaces:** `createMatterShare({ matterId, recipientUserId, commandId })`, `listOwnedShares(matterId)`, `listSharedWithMe()`, `readSharedMatter(grantId)`, and `revokeMatterShare(grantId, commandId)` all return typed states distinguishing pending, active, revoked and unavailable. All requests use the shared `apiFetch` session boundary.

- [ ] Add failing client tests proving a Person without `linkedUserId` cannot be selected, a linked User still receives no data before explicit owner action, duplicate command IDs are idempotent, and failures never emit `active`.
- [ ] Implement `publishOwnShareKey()`, `getRecipientShareKey(userId)`, and share API calls with session-derived auth only; never pass session token to crypto functions.
- [ ] Resolve the Matter ID to its existing canonical EntityRef/opaque ID through the current single Matter/Thing repository; do not create a second Matter/Thing record.
- [ ] Let the Worker validate the bound recipient User is active at share creation; do not expose a general user directory to non-admin Users.
- [ ] Persist recipient projections only in a distinct recipient-User-scoped cache keyed by grant ID; cache only authorized encrypted payload and decoded in-memory view state, never write it as recipient-owned Entity data.
- [ ] Store and display last server authorization confirmation time; clear active decrypted memory on logout/account switch while preserving only the encrypted offline cache according to existing per-User isolation.

### Task 5: Add gated owner and recipient UI

**Files:** Create `src/vue/components/ShareMatterDialog.vue`, create `src/vue/pages/SharedWithMePage.vue`, modify `src/vue/pages/MatterDetailPage.vue`, `src/router/route-manifest.ts`, `src/router/index.ts`, `src/vue/page-registry.ts`, and `src/App.vue`; add `src/__tests__/shared-with-me-page.test.ts`.

- [ ] Add failing component coverage for fixed read-only permission, owner-only control, unavailable recipient, verification skipped/mismatch, pending server acknowledgement, retry/cancel, and revoked state.
- [ ] Add a share entry to Matter detail only; select a Person only when `linkedUserId` exists and label it as a linked account, then explicitly confirm sharing the one Matter.
- [ ] Require the accepted out-of-band key verification flow before posting grant/envelope; changed recipient key invalidates prior local verification.
- [ ] Add `/app/shared-with-me` as a gated direct route with a “分享给我” list/read view; do not add it to default navigation or global Search/Graph/AI/Calendar.
- [ ] Render only decrypted Matter/Thing content; show owner provenance, offline cache timestamp, unavailable/tombstone status, and no mutation/share controls.
- [ ] Add localized accessible labels/status/error messages and ensure server rejection does not reveal unrelated recipient/entity existence.

### Task 6: Implement revoke, version rotation and offline state

**Files:** Extend `backend/src/routes/shares.js`, `src/core/share-keys.ts`, `src/core/shares.ts`, the share UI, and corresponding backend/client tests.

- [ ] Add failing regressions for revoke racing a pull, revoked cursor replay, stale envelope version, owner write while rotation pending, retry after partial failure, offline recipient view and re-login as another User.
- [ ] Revoke server access first and confirm future recipient reads return not-found; keep the prior offline cache explicitly marked as last-confirmed/unavailable after reconnection.
- [ ] Rotate the Entity Content Key before owner publishes a post-revoke content version; re-encrypt the canonical current Entity and update only the owner's key envelope.
- [ ] Make rotation retryable and idempotent; while owner sync still has the old key version, block publishing a new shared version and preserve the local draft visibly.
- [ ] Ensure Entity deletion tombstones invalidate the grant view, but archived/finished state alone leaves the grant unchanged.
- [ ] Verify owner backup/export still includes only owner data; recipient share cache remains out of standard backup/Vault exports.

### Task 7: Complete security verification and keep rollout gated

**Files:** Extend backend/client tests, update `docs/product/OPEN_WORK.md`, and add pilot outcome records only after a real pilot occurs.

- [ ] Execute the approved automated cases for cross-User isolation, body actor/owner forgery, duplicate/partial transaction, unauthorized pull, recipient write, revoked read, key mismatch/replay/downgrade, account disable, offline cache and data deletion.
- [ ] Inspect D1 rows and Worker request/error logs to confirm only approved control metadata, opaque IDs, ciphertext and envelopes appear.
- [ ] Complete supported browser/OS verification and record results against the independent review's required vectors.
- [ ] Keep navigation feature flag off until independent review blockers, security acceptance cases, real-user comprehension pilot and privacy review are all recorded complete.
- [ ] Update OW-14 with exact evidence and limitations; do not mark it complete based on build, unit tests or encrypted sync alone.

## Stop Conditions

- Independent reviewer unavailable, ADR-002 not accepted, or key identity verification unresolved: stop before Task 1.
- Supported browser/OS matrix cannot run the reviewed protocol: stop before enabling recipient envelopes and revise the support/crypto decision.
- D1 cannot atomically confirm grant and envelope, Worker cannot deny by authenticated recipient, or any semantic data must become plaintext to authorize: stop and revise design.
- Offline revoke causes silent data loss or UI cannot explain cached-copy limits: stop release and preserve owner/recipient data for recovery.
- Real-user pilot users misunderstand who can read, the view-only action, public-key verification or revoke limits: keep the feature gated and revise UX.

## Completion Evidence

The plan is complete only when Tasks 0–7 have recorded evidence, the authorized real-user pilot and privacy review pass, and OW-14 is updated. The current working tree contains none of the Phase B implementation described above; this plan does not claim tests, code, cryptographic review, deployment, or pilot results exist.
