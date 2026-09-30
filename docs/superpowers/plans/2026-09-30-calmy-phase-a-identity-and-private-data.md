# Calmy Phase A Identity and Private Data Implementation Plan

> **For agentic workers:** Implement inline in this task from top to bottom. Keep the accepted ADR and product design open while working; stop and ask if the current protocol cannot preserve existing data safely.

**Goal:** Replace the shared local-login/global-sync model with admin-provisioned User accounts, server-verified sessions, user-isolated encrypted data, and a safe one-time migration of the existing single-user vault.

**Architecture:** Cloudflare Worker authenticates stable User IDs and issues revocable opaque sessions; D1 enforces per-User sync partitions and stores only ciphertext and opaque control metadata. Each Entity has its own Content Key, wrapped by a client-generated User Key; a separately generated Recovery Key protects the User Key. Vue and IndexedDB load an isolated local data namespace only after authentication.

**Tech Stack:** Vue 3, TypeScript, Cloudflare Workers, D1/SQLite, Web Crypto API, IndexedDB, Wrangler.

**Spec:** [User identity and product access design](../specs/2026-09-29-calmy-user-identity-and-product-access-design.md), [ADR-001](../../adr/ADR-001-content-zero-knowledge-with-visible-access-metadata.md)

## Global Constraints

- No public self-service registration; only an administrator creates Users.
- The first administrator is initialized through an endpoint protected by a Worker environment secret and is accepted only while no User exists.
- User ID is stable and server-generated; username, email, and display name are not authorization foreign keys.
- Login credentials, sessions, Device Keys, User Keys, per-Entity Content Keys, and Recovery Keys are separate.
- D1 must not receive plaintext business content or semantic fields; R2 remains ciphertext-only.
- The server derives the actor from the authenticated session and checks User-scoped authorization on every read and write.
- Existing single-user records are assigned only to the first administrator; unknown legacy sharing remains denied.
- Preserve existing offline/local-first behavior and report local durable save separately from cloud acknowledgement.
- Admin account powers do not grant access to user content or keys.
- Do not deploy, commit, or write to a remote Git branch as part of this plan.

---

## Files and Responsibilities

### Worker and D1

- Create `backend/migrations/0001_identity_and_user_scoped_sync.sql` for Users, sessions, ciphertext-only record storage, opaque key envelopes, indexes, and a one-time legacy ownership marker.
- Create `docs/operations/calmy-user-identity-cutover.md` for setting the Worker secret, applying D1 migrations, bootstrapping the first administrator, and retiring legacy routes.
- Create `backend/src/lib/password.js` for password hashing and verification.
- Create `backend/src/lib/session.js` for random session-token creation, token hashing, expiry, lookup, and revocation.
- Create `backend/src/routes/auth.js` for bootstrap, login, current-session, logout, and password-change endpoints.
- Create `backend/src/routes/users.js` for administrator-only User listing, creation, activation/deactivation, password reset, and session revocation.
- Modify `backend/src/lib/d1.js` to initialize the new schema and expose actor/session and migration helpers without removing legacy tables before migration completes.
- Modify `backend/src/routes/sync.js` so new endpoints derive `userId` from the session and address only that User’s opaque records and Entity rows.
- Modify `backend/src/worker.js` to route identity endpoints before protected sync routes and make legacy global sync endpoints unavailable after cutover.
- Modify `backend/src/lib/http.js` only if browser credential/session headers require a CORS allowlist update.

### Browser identity and key management

- Create `src/core/api/auth.ts` for login, session restoration, logout, and admin account operations.
- Modify `src/core/auth.ts` to remove local `b_auth` as the identity source while retaining an explicit one-time legacy-account migration reader.
- Create `src/core/account-context.ts` to expose the authenticated User ID and initialize/clear a User’s local data context.
- Create `src/core/vault-keys.ts` for random User Key, Device Key, Recovery Key, and per-Entity Content Key generation; wrap the User Key for the active device and recovery package, and wrap each Content Key under the User Key using Web Crypto.
- Modify `src/core/crypto.ts` to accept `CryptoKey`/key-envelope inputs instead of deriving content encryption from the cloud bearer credential.
- Modify `src/core/api/client.ts` to attach the current server session token through one shared request boundary.
- Modify `src/vue/pages/LoginPage.vue` to use server authentication, handle first-login password change, and provision/recover the local Vault key without equating it to the login password.
- Modify `src/views/PassView.vue` and its route integration to handle account-password change only; it must not rotate or derive Vault keys.

### Local data isolation, sync, and migration

- Modify `src/core/db.ts` to namespace KV rows, mutation logs, Entity changes, cursors, and pending writes by authenticated User ID; add explicit account-switch clearing/rehydration operations.
- Modify `src/core/storage.ts` so `b_*` business data reads/writes always target the current User namespace and legacy unscoped keys are visible only to the one-time migration path.
- Modify `src/core/sync.ts` to use session authentication for requests and User/Entity Content Keys for encryption; remove cloud session credentials from the encryption path.
- Modify `src/core/entity-sync.ts` to send opaque Entity IDs plus ciphertext and key envelopes through the User-scoped API; never send semantic names as authorization filters.
- Create `src/core/legacy-user-migration.ts` to preview and migrate local plus global legacy records into the first administrator’s isolated store, preserving IDs and sources and requiring the legacy vault secret when it is needed to decrypt old ciphertext.
- Modify `src/main.ts` and `src/App.vue` so no User data is hydrated or sync restored before a valid server session selects the User namespace.
- Modify `src/core/backup.ts` so import/export stays inside the active User boundary and excludes session credentials, User Keys, Content Keys, and Recovery Keys.
- Audit direct `localStorage` access under `src/` for business-data keys and route it through the User-aware storage layer; preserve explicitly device-wide appearance preferences.

### Product account management

- Create `src/vue/pages/UserAdminPage.vue` for account listing, creation, activation/deactivation, and password reset, visible only to administrators.
- Modify `src/router/route-manifest.ts`, `src/router/index.ts`, and `src/vue/page-registry.ts` to register the account-management route with admin authorization metadata.
- Modify `src/views/AdminView.vue` or the settings navigation to link to account management without mixing it with Person management.
- Modify `src/views/AppShell.vue` and `src/vue/shell/AppShell.vue` to show the signed-in account, provide logout/account switching, and clear the prior User’s active cache before switching.

## Execution Tasks

### Task 1: Establish Worker identity schema and bootstrap

**Files:** `backend/migrations/0001_identity_and_user_scoped_sync.sql`, `backend/src/lib/password.js`, `backend/src/lib/session.js`, `backend/src/lib/d1.js`, `backend/src/routes/auth.js`, `backend/src/worker.js`, `docs/operations/calmy-user-identity-cutover.md`.

- [x] Add schema for stable Users, password hashes, roles, account status, hashed revocable sessions, User-scoped `cipher_records(opaque_id, ciphertext, key_envelope, version, device, deleted)`, User Key recovery envelopes, and a migration marker. Do not include plaintext collection/type/title/owner fields in `cipher_records`.
- [x] Implement password hashing with Web Crypto PBKDF2 and a per-user random salt; reject legacy SHA-256 password records for new accounts.
- [x] Implement session tokens with at least 256 random bits; persist only the token hash, User ID, issue/expiry, Device ID, and revocation status.
- [x] Implement `POST /api/auth/bootstrap`; require `CALMY_BOOTSTRAP_SECRET`, reject if any User already exists, validate username/password, create the first admin, and do not expose a general registration route.
- [x] Implement `POST /api/auth/login`, `GET /api/auth/session`, and `POST /api/auth/logout`; derive actor only from a live server-side session.
- [x] Add local deployment notes for setting/unsetting the Worker secret and applying D1 migrations; never put secret values in `wrangler.toml`.
- [x] Inspect the new control-plane schema to ensure no title, domain, Person, Thing, Scene, filename, or plaintext field is stored.

### Task 2: Add admin-only User management endpoints

**Files:** `backend/src/routes/users.js`, `backend/src/worker.js`, `backend/src/lib/d1.js`.

- [x] Add shared `requireSession(request, env)` that returns `{ userId, role, sessionId }` or a 401 response.
- [x] Add shared `requireAdmin(actor)` that rejects every non-admin actor with 403.
- [x] Implement `GET /api/admin/users` returning only account metadata (ID, username, display label, status, role, created time, last-login time).
- [x] Implement `POST /api/admin/users` creating a stable User ID and a one-time initial login password; do not create content keys on the server.
- [x] Implement status changes and password reset; status changes revoke all sessions, password reset revokes all sessions, and neither operation changes/decrypts the User’s Vault keys.
- [x] Ensure a user cannot escalate role, forge actor IDs, or access another User’s account/data by changing request JSON.

### Task 3: Build browser authentication and first-login flow

**Files:** `src/core/api/auth.ts`, `src/core/auth.ts`, `src/core/account-context.ts`, `src/vue/pages/LoginPage.vue`, `src/views/PassView.vue`, `src/router/index.ts`, `src/main.ts`, `src/App.vue`.

- [x] Store the opaque server session separately from `b_cloud`; session storage must never be passed as a content-encryption key.
- [x] Replace local-only password verification in the active Vue login page with the Worker login API; keep lock/error states and show server errors without leaking account existence.
- [x] On first login, require changing the administrator-issued initial password before opening protected product routes.
- [x] Provision a new User’s Vault entirely in the client: generate a random User Key and Recovery Key, create the Recovery Key package, and require the user to save/confirm it before enabling cloud data sync.
- [x] Display the recovery warning exactly before first Vault activation; explain that losing every trusted device and the recovery package means Calmy cannot restore the data.
- [x] On normal login, restore the session, select that User namespace, unlock the User Key with the local Device Key (or the Recovery Key package on a new device), and only then hydrate IndexedDB or restore sync.
- [x] On logout/expiry/account switch, stop polling and pending cloud writes, clear decrypted in-memory caches, and remove the active User namespace from view before another User is loaded.

### Task 4: Make IndexedDB and local storage User-scoped

**Files:** `src/core/db.ts`, `src/core/storage.ts`, `src/core/account-context.ts`, `src/main.ts`.

- [x] Use User ID as a namespace/key component for `kv`, `changes`, `entity_changes`, `pending_writes`, sync metadata, and outbox rows; store Device Key wrapped key material only in that User’s local metadata.
- [x] Require a selected User context before any business `b_*` read/write; retain device-wide theme/display preferences outside this namespace.
- [x] Hydrate only the selected User’s namespace and invalidate `persistedCache` synchronously before switching users.
- [x] Add an explicit atomic legacy-local-data claim operation that can assign the existing unscoped local dataset once to the first administrator; never copy it automatically into later accounts.
- [x] Ensure account switching cannot reuse the previous User’s search state, cursors, pending mutations, Entity snapshots, or view cache.
- [x] Audit direct `localStorage` business-key reads/writes and migrate them to the account-aware storage adapter.

### Task 5: Separate API sessions from encrypted Entity data

**Files:** `src/core/vault-keys.ts`, `src/core/crypto.ts`, `src/core/sync.ts`, `src/core/entity-sync.ts`, `backend/src/routes/sync.js`, `backend/src/worker.js`.

- [x] Generate a random per-Entity Content Key in the client and encrypt Entity payloads with AES-GCM using a fresh random IV.
- [x] Wrap each Content Key under the client-held User Key; upload only the encrypted payload and opaque key envelope. Keep semantic collection/type/record IDs inside the encrypted payload, not a D1 column or API filter.
- [x] Wrap the User Key into a recovery package using the separately generated Recovery Key; store only the wrapped package in D1 and never send the Recovery Key to the Worker.
- [x] Change Worker sync handlers to derive User ID from the authenticated session and query/write by `(user_id, opaque_id)`; ignore any client-supplied owner or actor field.
- [x] Keep semantic Entity type, title, owner/subject, Person/Thing/Scene/Space/Domain, Relation, search terms, and patch history inside the encrypted payload.
- [x] Make pull responses return only the session User’s ciphertext, matching key envelopes, opaque IDs, version, device, sequence, and deletion metadata.
- [x] Remove the session token from `encryptValue`/`decryptValue` call sites.
- [x] Retire or hard-disable legacy global `/api/data`, `/api/sync/*`, and `/api/entity-sync/*` reads/writes at the cutover boundary so the old shared bearer cannot bypass User isolation.

### Task 6: Migrate the existing single-user dataset safely

**Files:** `src/core/legacy-user-migration.ts`, `src/core/sync.ts`, `backend/src/lib/d1.js`, `backend/src/routes/sync.js`, `src/core/backup.ts`.

- [x] Before migration, make a client-side encrypted backup and show a preview of local keys, cloud records, Entity rows, and unknown legacy sharing references.
- [x] When the first admin exists and migration is pending, disable old shared-Bearer sync routes; expose legacy ciphertext only through an admin-session-gated, read-only migration endpoint.
- [x] On the original trusted device, decrypt legacy payloads using the existing Vault passphrase, preserve stable record/entity IDs and available source metadata, then re-encrypt into per-Entity Content Keys and new envelopes.
- [x] Upload new User-scoped ciphertext in idempotent bounded batches with a durable migration cursor; restart safely after interruption.
- [x] Compare source and destination counts/IDs and verify client-decrypted destination records before marking migration complete.
- [x] Keep unverified legacy participant/member identifiers denied; do not create new User grants from them.
- [x] After client verification, atomically mark legacy migration complete and delete old rows whose keys expose semantic collection names; preserve only an encrypted, time-bounded rollback export if the operator explicitly created one.
- [x] After successful cutover, disable the old global sync credential and endpoints; retain encrypted rollback data only for the documented recovery window.

### Task 7: Add account-management product UI

**Files:** `src/vue/pages/UserAdminPage.vue`, `src/router/route-manifest.ts`, `src/router/index.ts`, `src/vue/page-registry.ts`, `src/views/AdminView.vue`, `src/views/AppShell.vue`, `src/vue/shell/AppShell.vue`.

- [x] Add an admin-only “用户管理” entry separate from People/Person pages.
- [x] Show username/display name, status, role, and created time; do not expose password hashes, sessions, recovery material, or Vault content.
- [x] Provide create-user form with login name, display name, and initial password; require changing the initial password at first login.
- [x] Provide activate/deactivate and login-password reset actions with clear effects; state that these actions do not restore Vault contents.
- [x] Hide the route and navigation for non-admin Users and enforce authorization again in the Worker.
- [x] Show current signed-in username in the shell and provide logout without implying logout destroys local encrypted data.
- [x] Add explicit User↔Person binding to the client-side Person/User profile flow; keep the binding in encrypted semantic data and make binding grant no historical content access.

### Task 8: Cut over, remove local-only identity behavior, and verify the product boundary

**Files:** auth, router, settings, sync, storage, migration, account UI, and deployment documentation listed above.

- [x] Remove default local credentials (`calmy`/`cy2024`) from account bootstrap and prevent `ensureAuth()` from silently creating an identity.
- [x] Ensure account management, login, account disable, password reset, logout, offline behavior, local-save state, and sync-confirmed state match the accepted specification.
- [x] Confirm Today, module views, Search, Graph, Review, Calendar, AI Context, backup, and export read only the active User’s local decrypted dataset; no module may bypass the storage/sync boundary.
- [x] Confirm legacy global API routes cannot expose records after cutover and D1 retains no semantic/plaintext fields.
- [x] Run the production TypeScript/Vite build and inspect the generated API routing/schema changes. Do not deploy or mutate production Cloudflare resources in this task.

## Explicit Phase A limits

- Phase A establishes identity, private per-User data, device/recovery key setup, and encrypted per-Entity sync. It does not yet share Content Keys with other Users; cross-user Permission/Scope sharing, key-envelope recipient grants, and revocation rotation remain Phase B.
- Search, Graph, Review, Calendar, and AI remain client-local over the active User’s decrypted authorized dataset; server semantic queries are out of scope.
- Production bootstrap-secret installation, D1 migration execution, and endpoint cutover require a separately scheduled deployment window; do not run them from development work.
