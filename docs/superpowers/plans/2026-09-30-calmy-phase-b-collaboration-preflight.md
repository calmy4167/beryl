# Calmy Phase B Collaboration Preflight Plan

> **For agentic workers:** This is a staged plan, not authorization to expose sharing in the product. Before implementing key delivery or revocation, complete the cryptographic protocol review described in Task 1. Keep ADR-001 and the accepted identity design open. Do not deploy, commit, or write to a remote Git branch.

**Goal:** Prepare a safe, reviewable path from private per-User Vaults to explicit cross-User sharing without weakening the zero-knowledge boundary or granting access from Person, Scene, or Space membership alone.

**Architecture:** Keep semantic Owner, Subject, Scope definitions, and sharing explanations encrypted on clients. The Worker enforces only confirmed opaque grants and returns ciphertext plus a key envelope addressed to an authenticated recipient. Start with one Entity and one recipient; add Scene and Space flows only after the single-Entity path, revocation, and offline behavior are proven.

**Tech Stack:** Vue 3, TypeScript, Cloudflare Workers, D1/SQLite, Web Crypto API, IndexedDB.

**Spec:** [User identity and product access design](../specs/2026-09-29-calmy-user-identity-and-product-access-design.md), [ADR-001](../../adr/ADR-001-content-zero-knowledge-with-visible-access-metadata.md), [OW-14](../../product/OPEN_WORK.md#ow-14-共享空间与关系能力试点)

## Global Constraints

- Person binding, Scene participation, and Space membership do not by themselves grant digital access.
- No matching grant means deny; explicit deny overrides direct and inherited allow.
- The Worker derives the actor from the authenticated session and does not evaluate semantic Scope predicates.
- D1, API logs, and telemetry must not receive business plaintext, semantic Scope conditions, or private names.
- Sharing is not shown as successful until both the grant and recipient key envelope are confirmed by the Worker.
- Revocation blocks future reads and syncs after server confirmation; it cannot recall plaintext already downloaded, copied, or exported.
- Ordinary app navigation must not expose sharing by default before real-user pilots and privacy review pass.
- Do not deploy, commit, or write to a remote Git branch.

## Current Evidence and Prerequisites

- Phase A identity, User-scoped ciphertext sync, User Key / Device Key / Recovery Key setup, and legacy migration are implemented in the checked Phase A plan.
- Core Person, Thing, Scene, Space, Domain, Relation, Ownership, Scope, Permission, and history projections exist; `OPEN_WORK.md` records that they have not been wired to real remote authorization or sharing UI.
- Phase A stores the recipient-independent Content Key envelope under the sender's User Key. The inspected code does not yet implement authenticated recipient device public keys or a recipient-specific envelope exchange.
- The Recovery Key unwraps the User Key recovery envelope. The inspected Worker endpoint creates that envelope once and rejects later writes; no recovery-package rotation flow was found. Sharing-key recovery inherits this boundary if its private key is wrapped under the User Key.
- The root app has no declared HPKE dependency; Vite's `es2020` syntax target is not a browser-compatibility guarantee. The product-approved sharing support policy is recorded in the single-Entity design and ADR-002. Record concrete versions at review/release time; compatibility testing remains outstanding, and the independent reviewer must assess candidate libraries against this policy before ADR-002 is accepted.
- The identity design §13 explicitly requires browser compatibility validation and an independent cryptographic review of envelope delivery, device changes, recovery, and revocation rotation before implementation.
- The reviewer handoff and blank result template are prepared at `docs/security/CALMY_PHASE_B_CRYPTO_REVIEW_REQUEST.md` and `docs/security/ADR-002_INDEPENDENT_REVIEW_TEMPLATE.md`; no reviewer is assigned and no review has been performed.
- The first product slice is documented at `docs/superpowers/specs/2026-09-30-calmy-phase-b-single-entity-readonly-sharing-design.md`; it is a user-approved design draft, not implementation approval or a security review result.
- Therefore implementation is gated on a reviewed protocol decision. No key exchange primitive or recipient identity-binding scheme is selected by this plan.

## Files and Responsibilities

- `docs/adr/ADR-002-*.md`: hold the protocol proposal as `Proposed` for independent review; change it to `Accepted` only after the review findings are resolved.
- `backend/migrations/`: add only opaque grant, recipient-key, and audit structures required by the reviewed protocol; do not store Scope semantics or content names.
- `backend/src/routes/`: enforce grant creation, retrieval, revocation, and version checks from the authenticated actor; return no key envelope to an ungranted recipient.
- `src/core/`: implement reviewed recipient envelope operations and client-side explanation using decrypted Owner/Scope/Permission semantics.
- `src/vue/`: add single-Entity share/revoke flows only after the core protocol and Worker authorization pass review; Scene and Space flows remain separate follow-up slices.
- `docs/product/OPEN_WORK.md`: record evidence and keep OW-14 open until the real pilot and privacy gates are met.

## Execution Tasks

### Task 1: Resolve and review the recipient key protocol

**Files:** Maintain `docs/adr/ADR-002-recipient-key-envelope-protocol.md`; reference ADR-001 and the identity design §6.1–6.2 and §13.

- [ ] Product owner designates an independent cryptography reviewer who did not author the protocol proposal or implementation; record the reviewer, relevant experience, independence statement, review scope, and the exact document/code revision to be reviewed. Do not send materials or make commitments on the user's behalf.
- [ ] Give the reviewer the completed scope packet in `docs/security/CALMY_PHASE_B_CRYPTO_REVIEW_REQUEST.md` and a copy of `docs/security/ADR-002_INDEPENDENT_REVIEW_TEMPLATE.md`; request a dated report saved as `docs/security/ADR-002_INDEPENDENT_REVIEW-YYYY-MM-DD.md`.
- [ ] Track each report finding by ID in the report and implementation plan; do not mark a finding resolved until its code/document change and verification evidence are recorded. Preserve the report as the decision evidence when changing ADR-002 status.
- [ ] Specify how a recipient User's authenticated device key is discovered and how its association with the User is verified.
- [ ] Record the product threat-model decision for the public-key directory: trust the service for first contact, require out-of-band safety-code verification, or operate key transparency with independent witnesses; do not claim protection stronger than the selected option provides.
- [ ] Review the proposed first-slice assumption that Cloudflare Pages/browser client delivery and the user endpoint are trusted; ciphertext encryption cannot protect plaintext from modified code running in the client. If the product requires resisting active code-delivery compromise, stop and design/verify a separate client-integrity mechanism before implementation.
- [ ] Specify the standard cryptographic primitives and exact envelope fields/versions; state which private key material stays on-device and what recovery can restore.
- [ ] Specify multi-device delivery, device replacement, account password reset independence, replay protection, and envelope rotation after grant revocation.
- [ ] Analyze the consequences of long-term recipient sharing-key compromise for previously stored envelopes; specify what key rotation, grant revocation, and server-side history deletion can and cannot protect.
- [ ] Decide whether compromised Recovery Key / recovery-package rotation is a pre-implementation blocker; specify client proof, server update semantics, concurrent-device behavior, and lost-device/account-takeover handling.
- [ ] Threat-review forged recipient keys, replaced devices, compromised authorized devices, stale grants, malicious ciphertext/envelopes, and offline clients.
- [ ] Document visible metadata and limits: grant existence/timing, opaque Entity counts, stale offline copies, and inability to recall plaintext.
- [ ] Require independent cryptographic review and supported-browser checks before marking ADR-002 Accepted.

**Gate:** Do not add recipient-key registration or cross-User key envelopes until the public-key directory threat model is decided, the protocol decision is accepted, and the independent review findings are resolved.

### Task 2: Define opaque authorization records and invariants

**Files:** After Task 1, update `backend/migrations/` and backend D1 helpers; document exact schemas in ADR-002.

- [ ] Define opaque grant ID, opaque Entity ID, recipient User ID, permitted actions, grant version/status, issuer, timestamps, and audit linkage; prohibit plaintext Entity type/title/Scope conditions.
- [ ] Define recipient-device envelope references using the reviewed envelope format; enforce uniqueness/version rules for `(grant, recipient device, envelope version)`.
- [ ] Specify server transitions for proposed, confirmed, revoked, and rotated grants; a failed partial write must never become readable.
- [ ] Specify index and retention requirements for deletion, audit records, and idempotent retries.
- [ ] Confirm every query is scoped by session-derived actor and opaque IDs, not client-provided owner or semantic data.

### Task 3: Implement single-Entity grant and retrieval path

**Files:** `backend/src/routes/` grant handlers, `backend/src/worker.js`, `src/core/api/`, and focused authorization boundary modules identified by the implementation review.

- [ ] Add a failing authorization regression for owner grant, recipient read, unrelated User read, forged actor, forged owner, absent envelope, and revoked grant.
- [ ] Implement the minimal Worker checks from the accepted protocol; default-deny every unconfirmed or ambiguous state.
- [ ] Implement sender-side recipient envelope creation and recipient-side verification/unwrapping using only the accepted protocol APIs.
- [ ] Ensure successful UI state is gated on Worker acknowledgement of both grant metadata and the recipient envelope.
- [ ] Confirm list, pull, and attachment paths exclude ciphertext and envelopes for every ungranted User.

### Task 4: Implement revocation, key rotation, and offline conflict behavior

**Files:** Reviewed backend grant/sync routes, `src/core/` key and sync flows, and associated UI state.

- [ ] Add regressions proving revoked recipients cannot fetch later ciphertext, later envelopes, or new versions after the revocation is confirmed.
- [ ] Rotate the affected Entity Content Key and issue envelopes only to the remaining confirmed recipients; retain prior already-downloaded data as an explicit unavoidable limit.
- [ ] Preserve unsent local edits from disconnected devices as visible conflicts; do not silently regrant access or discard edits.
- [ ] Make retries idempotent and ensure a partial rotation remains unavailable until all required server-side authorization state is confirmed.
- [ ] Explain why access ended without revealing hidden Entity names or existence to unrelated Users.

### Task 5: Add a single-Entity sharing UI behind a feature gate

**Files:** `src/vue/` share/revoke UI, route/feature configuration, and OW-14 documentation.

- [ ] Allow selecting only an existing active User; Person names or Scene/Space membership alone cannot be selected as a recipient account.
- [ ] Show the Entity's owner/steward and requested actions in client-readable language before confirmation.
- [ ] Keep local-save, pending-server-confirmation, confirmed, failed, and revoked states distinct.
- [ ] Hide or disable the entry when recipient key verification, server acknowledgement, or protocol version checks are unavailable.
- [ ] Keep the feature gated from default navigation pending real-user pilot and privacy review.

### Task 6: Extend to Scene Participant invitation and explicit Space Scope

**Files:** `src/core/` Scene/Space application flows, Worker opaque-grant routes, and relevant Vue pages.

- [ ] Scene invitation first creates or links a real User explicitly, then asks which Scene data and actions to share; a SceneParticipant record alone grants nothing.
- [ ] Space sharing requires the user to explicitly select the Space as audience and confirm the affected Entities/actions; membership alone remains non-authorizing.
- [ ] Client resolves encrypted Scope semantics into explicit per-Entity opaque grant changes; the Worker never evaluates Person/Domain/Thing/Scene/Space predicates.
- [ ] Make scope changes produce reviewable grant additions/removals; any unresolved Entity or permission state defaults to no grant.
- [ ] Keep Scene and Space UX as separate follow-up rollouts after Task 5 has passed its acceptance gate.

### Task 7: Pilot, privacy review, and release decision

**Files:** Update `docs/product/OPEN_WORK.md` and add a pilot protocol/results document under `docs/product/` before exposing sharing as a default capability.

- [ ] Exercise two-User owner/recipient, unrelated User, explicit deny, disabled User, removed participant, revoked grant, account switch, offline edit, and stale-device scenarios.
- [ ] Verify D1/API/logging samples contain only approved opaque control metadata and ciphertext/envelopes.
- [ ] Run the documented real-user pilot and privacy review; record comprehension of recipient, actions, metadata visibility, stale offline copies, and revocation limits.
- [ ] Promote the default product entry only if all privacy and comprehension gates pass; otherwise retain explicit, gated experimental access or stop the rollout.
- [ ] Keep OW-14 open until pilot evidence, withdrawal behavior, and deletion/history behavior meet its acceptance criteria.

## Verification Boundary

The current task has only prepared this plan and audited existing files. Implementation-specific regression tests, browser compatibility checks, cryptographic review, remote authorization tests, and user pilots have not been run here. Do not interpret the Phase A build result as evidence for Phase B sharing.
