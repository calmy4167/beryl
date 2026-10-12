# Calmy 多人场景与数据共享完整实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 严格完成《Calmy 多人场景、模块关系与数据共享核心设计方案.md》§1–45 的全部产品、数据、权限、生命周期、视图和验收要求；所有章节具备实现和验收证据后才算完成。

**Architecture:** 以原文 §44 的七阶段为实施顺序，复用现有 User/Person、Thing/Matter、Scene、Space、Core Entity、Relation、Ownership、Scope、Permission 及 Repository，不创建第二事实源。先完成不依赖跨用户加密分享的模块关系、归属呈现、Scene 生命周期与沉淀，再在独立密码学审查通过后交付授权、共享和按人过滤的 View。

**Tech Stack:** Vue 3、TypeScript、现有同步/异步 Collection Repository、IndexedDB durable queue、现有 Open Format/JSON Backup/实体同步、Vitest、Worker/D1。

**Spec:** [多人场景模型的产品层收口设计](../specs/2026-10-01-calmy-social-model-product-integration-design.md)；最终验收合同为仓库根目录的 `Calmy-多人场景-模块关系与数据共享核心设计方案.md`。

## Global Constraints

- 原始设计方案 §1–45 是最终范围；不得以本文阶段拆分缩小目标。
- 必须逐模块确认 Entity Type、Domain、Relation、View 或 Reality Object 的归类及唯一事实源。
- User 与 Person 分离；未绑定的现实参与者不获得数字访问权。
- Thing 与 Matter 保持同一稳定 ID 和单一事实源；Scene 与 Cycle 分开；Space 不自动授权。
- 同一内容可属于多个上下文但只保存一份；关系由受定义约束的稳定 ID 表达。
- 所有新写入经异步 Repository；旧 ID、历史字段、存储键、Open Format 和备份保持兼容并可回滚。
- Space/Scene/Participant/Domain 关系本身不构成访问权；不允许默认扩权。
- ADR-002 独立密码学审查通过且协议接受前，不实现或开放跨用户公钥、grant/envelope、邀请授权和分享 UI。
- 当前工作区已有未提交修改；仅修改本计划列出的多人模型相关文件，不覆盖、清理或提交其他改动，不执行远端写入。

## File Map

| File | Responsibility |
|---|---|
| `src/domain/unified/model.ts` | 规范对象、归属、隐私范围、RelationDefinition 与状态契约 |
| `src/domain/unified/repository.ts` | 统一对象验证、转换、异步读写和权限边界 |
| `src/domain/graph/query.ts` | 可查询的节点/关系/上下文投影 |
| `src/vue/pages/GraphPage.vue` | 用户创建、浏览和解释受定义约束的关系 |
| `src/vue/pages/MasterDataPage.vue` | Domain 与可复用主数据管理入口 |
| `src/vue/pages/PeoplePage.vue` | 现实人物、User 绑定提示及归属上下文 |
| `src/vue/pages/MattersPage.vue` / `src/vue/pages/MatterDetailPage.vue` | Thing 与 Scene 入口、生命周期和沉淀 |
| `src/domain/migration/reality-model-audit.ts` | 扩展只读模型/归属/关系一致性审计 |
| `src/core/content/open-format.ts` | 新字段和类型的可读导入/导出兼容 |
| `src/core/backup.ts` / `src/core/entity-sync.ts` | 新实体和关系的备份、同步登记 |
| `src/__tests__/vue-graph-typed-relations.test.ts` | Graph UI 按 RelationDefinition 限制端点和方向 |
| `src/__tests__/domain-module-catalog.test.ts` | 模块与 Domain/Entity/View/Reality Object 分类稳定性 |
| `src/__tests__/ownership-privacy-compatibility.test.ts` | Created By/Owner/Subject/Steward、隐私范围和旧记录兼容 |
| `src/__tests__/scene-settlement.test.ts` | Scene 完成、沉淀、归档和关系结束的数据保留 |
| `src/__tests__/contextual-view.test.ts` | 同一数据在 Thing/Scene/Domain/Person 视图中的单事实源与过滤 |

## Stage A — Core Objects and Reality Semantics (§2–8, §20)

### Task 1: Complete the §1–45 Traceability Baseline

**Files:**
- Modify: `docs/superpowers/specs/2026-10-01-calmy-social-model-product-integration-design.md`
- Modify: `docs/product/OPEN_WORK.md`
- Create: `docs/product/CALMY_SOCIAL_MODEL_TRACEABILITY_2026-10-01.md`

- [x] Record every original section and each numbered requirement in a traceability row with current implementation evidence, missing behavior, plan task, and acceptance evidence.
- [x] Verify the matrix explicitly includes the §38 hospital scenario and the full §40–41 MVP user flow.
- [x] Mark existing model-only coverage as partial whenever a user flow, migration, history, backup, or authorization boundary is not verified.
- [x] Keep the overall objective open until all rows pass; record ADR-002 review as an external blocking prerequisite, not a waived requirement.

## Stage B — Module, Entity, Domain, and View Classification (§12–16, §42)

### Task 2: Define a Stable Module Catalog

**Files:**
- Create: `src/domain/unified/module-catalog.ts`
- Modify: `src/domain/unified/index.ts`
- Test: `src/__tests__/domain-module-catalog.test.ts`

- [x] Add a typed catalog for every user-visible module with its canonical data types, source repository, supported Domain assignment, supported Reality Object references, and view role.
- [x] Classify each route module as a View and separately classify canonical Entity Types, Domain concepts, and Reality Objects; never classify a presentation-only module as a second data store.
- [x] Reject duplicate module keys, unknown entity types, and references to noncanonical repositories.
- [x] Cover every current route and map each data type to one canonical repository and stable ID field. This is inventory/validation; broad Domain and context-picker UI remains in later tasks.

### Task 3: Add Domain Management and Safe Entity Assignment

**Files:**
- Create: `src/vue/components/DomainPicker.vue`
- Create: `src/vue/components/DomainManagerPanel.vue`
- Modify: `src/vue/pages/MasterDataPage.vue`
- Modify: `src/domain/unified/model.ts`
- Modify: `src/domain/unified/repository.ts`
- Test: `src/__tests__/vue-domain-picker.test.ts`
- Test: `src/__tests__/domain-relation.test.ts`

- [x] Manage Domain names and active/retired state through the existing `Domain` Core Entity repository.
- [x] Let a user omit Domain; do not require classification before creating or editing an existing record.
- [ ] Attach Domain to records through stable typed Relation, not copied display text. The picker covers Person, Thing/Matter, canonical Action/Record, legacy Finance, Diary, Post and Goal entries by their original IDs; Goal and Post remain in their existing collections and carry their original payloads plus Domain/Time Relations through Open Format. Other eligible Core Entity/legacy module flows and legacy Ownership remain open.
- [x] Retiring a Domain preserves existing Relations and historical labels; deleting/renaming a Domain must not silently rewrite linked entities. No destructive Domain delete is exposed; rename keeps its stable ID.
- [x] Keep Domain entities in current Open Format, backup, and sync paths and test round-trip behavior.

### Task 4: Establish Multi-Context Entity References

**Files:**
- Modify: `src/domain/unified/model.ts`
- Modify: `src/domain/unified/repository.ts`
- Modify: `src/domain/graph/query.ts`
- Modify: per-module repositories identified by Task 1 (`action`, `record`, `resource`, `asset`, `finance` only where supported)
- Modify: `src/vue/pages/TasksPage.vue`, `src/vue/pages/ReviewPage.vue`, `src/vue/pages/MatterDetailPage.vue`, and supported record/entity detail views to attach Domain/context Relations
- Modify: `src/core/content/open-format.ts`
- Tests: add typed repository, graph projection, and Open Format compatibility coverage beside each affected domain test.

- [ ] Add only the original design's verified stable-ID references: Person, Thing, Scene, Space, Domain, and time context. Finance, Diary, Post, Goal, Library Resource/Asset/Seed/Insight, Review Action/Record, Tasks Action, Today/Cycle Action, Pomo completion Record, Matter Thing, and People Person/ImportantDate now expose typed Relations by canonical IDs; Goal keeps its original `goals.id`, Post its original `posts.id`, and both retain their legacy collection identity in Open Format. Content-to-Person uses `subject_of`, context links use `context_of`, and Matter uses its existing Thing/Scene reference without duplicate edges. Remaining eligible module context pickers, Goal Ownership/history, noncanonical module history, and full Person/Space view acceptance stay open.
- [ ] Ensure one record can have multiple typed Relations without duplicating its payload or creating a parallel Entity store.
- [ ] Preserve existing Action→Matter and Record→Matter fields as compatibility inputs/projections until a lossless migration is accepted.
- [ ] Add relation add/remove/update through domain commands with revision checks and idempotent command IDs. Domain assignment, Time links, Graph relations, People Person/ImportantDate, and Goal context links use stable command IDs; Goal endpoints are checked against the canonical legacy repository, and Open Format export/import retains the original Goal plus its relations. Removing then re-adding a context restores the existing Relation by expectedRevision instead of replaying the old create command. Remaining module-specific context mutations, Goal Ownership/history coverage, noncanonical module history, and full backup/sync/migration coverage stay open.
- [ ] Include every added field in import/export, backup, sync allowlists, and migration audit before exposing UI. Open Format covers multi-context Finance Relations to Person/Domain/Thing/Scene/Space/Time; JSON Backup/Restore and Core Entity Sync now verify multiple typed Relations retain stable IDs, direction, and endpoints. The full eligible-module field audit and migration audit remain open.

## Stage C — Typed Relations (§17–18)

### Task 5: Make Graph Relation Creation Definition-Driven

**Files:**
- Modify: `src/vue/pages/GraphPage.vue`
- Modify: `src/domain/unified/model.ts` only if registry data required by the UI is missing
- Test: `src/__tests__/vue-graph-typed-relations.test.ts`
- Regression: `src/__tests__/graph-query.test.ts`, `src/__tests__/domain-relation.test.ts`

- [x] Replace the hardcoded relation type list with `RELATION_DEFINITIONS` and localized labels.
- [x] Select relation semantic first; constrain source and destination nodes to registered endpoint types.
- [x] Honor directed/either, inverse, and cardinality constraints in both UI and repository validation. Definitions now declare inverse types and one-to-one/one-to-many/many-to-one/many-to-many cardinality; Repository rejects exceeded cardinality and GraphPage removes exhausted endpoints. Existing definitions use zero minimum cardinality.
- [x] Disable submission and explain why when no valid endpoint pair exists; preserve selections and show a useful error after failed saves.
- [x] Keep imported legacy relations readable without offering invalid legacy types for new writes.

## Stage D — Ownership, Privacy, and History (§19–20, §26–30, §37)

### Task 6: Complete Ownership Principals and Privacy Scopes

**Files:**
- Modify: `src/domain/unified/model.ts`
- Modify: `src/domain/unified/repository.ts`
- Modify: `src/core/content/open-format.ts`
- Modify: `src/core/backup.ts`
- Modify: `src/core/entity-sync.ts`
- Test: `src/__tests__/ownership-privacy-compatibility.test.ts`
- Regression: `src/__tests__/ownership-permission.test.ts`, `src/__tests__/reality-model-open-format.test.ts`, `src/__tests__/reality-model-backup.test.ts`

- [x] Represent Created By, Owner, Subject, and Steward independently, including `organization` as an ownership principal; include additional owners for joint ownership.
- [x] Represent the original four visibility choices in the model: Private, Restricted, Scene, and Space. Recipient selection and permission enforcement remain in Stage E.
- [x] Keep absent legacy ownership as unspecified; never infer shared ownership from Scene/Space membership.
- [x] Support common ownership and Space ownership as data semantics without treating them as grants.
- [ ] Round-trip all new principal and privacy fields through Open Format, backup, sync, and legacy compatibility. Core/Matter/Action/Record, Finance, Goal, Post and DailyState ownership now round-trip in Open Format; signed-in Finance, Goal and DailyState records default to the active Server User as Private, with DailyState ownership editable in Calendar. Post ownership/history, Finance creation/content/ownership snapshots and DailyState ownership now pass their applicable Open Format, Backup and Entity Sync round-trip checks; additional legacy-module coverage remains open.

### Task 7: Complete Permission Precedence and Human-Readable Explanations

**Files:**
- Modify: `src/domain/permission/policy.ts`
- Modify: `src/domain/unified/model.ts`
- Create: `src/domain/permission/explanation.ts` if explanation projection is not already separable
- Test: `src/__tests__/ownership-permission.test.ts`

- [x] Evaluate Entity > Scope > Scene > Space rules with explicit deny > explicit allow > inherited allow > default deny. A table now covers Entity allow/deny against inherited Scope/Scene/Space allow/deny, inherited deny against allows across all context levels, and the matched level in allow/deny explanations; inherited selection follows Scope > Scene > Space.
- [x] Confirm entity-private rules override every broader inherited grant; Restricted similarly requires an explicit Entity permission. Recorded Owners retain their own data access; Subject identity never grants access.
- [x] Return the matched principal, scope/context, action, decisive rule, and readable reason in the pure decision projection. Reality Context translates owner, explicit allow, and inherited Scope/Scene/Space allows into user-facing explanations with the allowed action and matched context; OwnershipEditor explains each privacy boundary. Hidden entity names and counts remain undisclosed, and the Context View uses a generic denied/empty explanation.
- [ ] Test unbound Person, disabled User, missing/stale relationship, conflicting grants, and legacy records with no privacy metadata. Unbound User, conflicts, private and visibility-boundary cases are covered; disabled/stale server identity is blocked on real auth integration.
- [ ] Do not activate any cross-User server behavior in this task; pure policy remains default-deny until Stage E.

### Task 8: Complete Provenance and Version History Coverage

**Files:**
- Modify: existing repository mutation/history adapters in `src/domain/unified`, `src/domain/matter`, `src/domain/action`, `src/domain/record`, `src/domain/capture`
- Modify: `src/domain/graph/query.ts` or a dedicated history projection module
- Test: `src/__tests__/reality-history-compatibility.test.ts` and per-repository history tests

- [ ] Provide created/updated actor, source, revision/version, and retrievable history for each in-scope Entity without conflating Reality Records with object mutations. Durable `listRealityActivityAsync` covers Thing/Action/Core mutations, Finance creation/content/ownership mutations with prior/current snapshots, collaboration audit, separate RealityRecord facts, Record revision snapshots, Diary content/ownership snapshots, Goal content/ownership snapshots, and Post content/ownership/archive snapshots; Today DailyState creation and update uses Core mutation actor/source/revision. Canonical ImportantDate creation and revisions also project by stable ID, and the authorized read-only history view supports ImportantDate after the document passes its permission filter. Finance stores created/updated actor, time, source and revision on new canonical rows; Core mutation projection matches both entity type and stable ID so imported ID collisions cannot mix histories. Diary, Goal, Post, Finance and DailyState snapshots are visible or retained through the applicable authorized read-only projections and round-trip through Open Format; Finance history also passes Backup and Entity Sync checks. Capture and Suggestion now keep actor/source/revision/time and before/after snapshots in their existing canonical collections; Open Format, Backup, and Entity Sync preserve Capture history, and legacy imports do not synthesize local creation events. Legacy Habits now records created/updated history with complete before/after snapshots in the original collection; Portable Open Format, JSON Backup and Entity Sync preserve it without changing its canonical collection identity, and a legacy row without history is not given a fabricated creation event when first edited. Legacy Inbox removal/conversion now writes source/actor/time and the deleted source snapshot to an append-only history collection that round-trips through Backup and Entity Sync; earlier edits are not reconstructable, and Portable Open Format plus the authorized history projection are still open. Other noncanonical module histories remain open.
- [ ] Preserve original IDs, timestamps, source IDs, revisions, and prior values during edits and migrations.
- [x] Add a read-only audit view/projection; `/app/reality-context` loads history on demand only for visible, authorized documents and does not write or repair history.

## Stage E — Sharing and Access (§21–30, §35, §40–41)

### Task 9: Clear the Independent Cryptography Review Gate

**Files:**
- Update only after external review: `docs/security/CALMY_PHASE_B_CRYPTO_REVIEW_REQUEST.md`, `docs/security/ADR-002_INDEPENDENT_REVIEW_TEMPLATE.md`, `docs/adr/ADR-002-recipient-key-envelope-protocol.md`
- External prerequisite: named independent cryptography reviewer and a dated signed report.

- [ ] Obtain independent review covering first-contact public key authenticity, selected protocol/library/suite, AAD and replay/downgrade protection, Recovery Key/User Key rotation, revocation atomicity, browser support, and client-code delivery trust boundary.
- [ ] Resolve every blocker and must-fix; record accepted residual risks and the exact reviewed revision.
- [ ] Accept ADR-002 only after the report and product/privacy decisions are complete.
- [ ] Until this gate passes, do not add public-key registration, cross-User grant/envelope APIs, invitations, share controls, or claim the full design complete.

### Task 10: Implement Secure Single-Entity and Scope Sharing After Gate

**Files:**
- Add Worker migrations/routes under `backend/migrations/` and `backend/src/routes/` only as defined by accepted ADR-002
- Add crypto operations under `src/core/` only using the accepted maintained library and exact suite
- Add share flows under `src/vue/pages/` and domain use cases under `src/application/use-cases/`
- Add focused Worker, crypto-vector, repository, and UI tests before each implementation

- [ ] Implement owner-controlled single Entity sharing with one explicitly bound recipient and recipient key verification.
- [ ] Implement Scope sharing only after single-Entity grant/revoke/rotation passes security review; keep Scene/Space scopes separately reviewable.
- [ ] Enforce server authorization from session identity and active grant state; return indistinguishable not-found responses for unrelated resources.
- [ ] Make grant/envelope persistence, revoke, content-key rotation, retry, offline cache, account switch, and deletion behavior atomic or explicitly recoverable.
- [ ] Show user-readable visibility and permission reasons; preserve private records inside shared Scenes.

### Task 11: Implement Scene Invitation and Delivery Layer After Gate

**Files:**
- Add Scene participant/share use cases in `src/domain/social/` or `src/application/use-cases/`
- Add Scene detail/invitation components under `src/vue/pages/`
- Add focused authorization and UI tests

- [ ] Invite only an explicitly bound User after selecting a real Person; Participant membership alone grants nothing.
- [ ] Preview exactly which Entities are shared and which private content stays hidden before confirmation.
- [ ] Support View/Comment/Edit/Manage with least privilege and explainable access reasons.
- [ ] Keep page/link delivery separate from entity data and authorization facts.

## Stage F — Scene/Space Lifecycle and Settlement (§31–35, §38)

### Task 12: Build Real Scene and Space Lifecycle Workflows

**Files:**
- Create: `src/vue/pages/RealityScenesPage.vue` or the canonical route chosen by existing router conventions
- Modify: `src/vue/pages/MatterDetailPage.vue`
- Modify: `src/domain/unified/repository.ts`
- Preserve: `src/core/scenes.ts` and its theme selection behavior
- Test: `src/__tests__/scene-settlement.test.ts`, `src/__tests__/scene-participant.test.ts`, `src/__tests__/scene-config-compatibility.test.ts`

- [x] Create and manage real Scene instances separately from static presentation `SCENES` through `/app/reality-scenes`; keep `/scene` theme selection unchanged.
- [x] Support Thing with zero or multiple ordered Scenes; keep Cycle/Stage distinct. Stable order is stored, new Scenes append after existing Scenes, Thing detail aggregates by order, and the real Scene page supports revision-checked, idempotent up/down writes with best-effort compensation and refresh when the second row conflicts. `vue-reality-scenes-real-repository.test.ts` verifies a reorder persists through the async repository and survives a full page remount; Matter detail coverage verifies it displays multiple Scenes in the saved order.
- [x] Support Draft/Active/Paused/Completed/Archived transitions and Participant join/leave timestamps through the async unified Repository. All 25 status pairs are checked against the transition contract; Scene status actions pass expectedRevision, a status/revision-derived idempotent commandId, actor, and source provenance. `vue-reality-scenes-real-repository.test.ts` now drives Draft→Active→Paused→Active→Completed→Archived through the page, checks every durable state, verifies the full create/update revision 1–6 history, and confirms Archived survives a page remount.
- [x] Close/archive Space without deleting its Scene references; status changes use expectedRevision and idempotent command IDs, and durable integration covers a closed Space with retained Thing, Scene, Resource, and typed Relation rows.
- [x] Create and edit a Space from the real Scene workflow; manage active Person memberships with revision-checked writes, preserve opaque prior member IDs, and explain that membership alone never grants access. Repository rejects missing canonical Person and Relationship references; Contextual View tests the no-Permission denial case.
- [ ] Preserve owner/privacy access semantics when a participant leaves; membership now only stores leftAt and does not grant access; cross-User revoke waits for Stage E.

### Task 13: Implement “What Should We Keep?” Settlement

**Files:**
- Create: `src/application/use-cases/settle-reality-context.ts`
- Create: `src/vue/components/RealitySettlementPanel.vue`
- Modify: `src/vue/pages/MatterDetailPage.vue` and the real Scene detail page
- Test: `src/__tests__/scene-settlement.test.ts`

- [ ] On Thing/Scene completion, let the user review existing files, health records, expenses, relationships, important dates, and reflections relevant to that context. Candidate discovery now recognizes active `used_in` and `context_of` links; keep reuses an existing typed relation, while retire/reassociate archives prior active links with revision checks and stable command IDs. Completed Scene settlement and archived Thing settlement offer linked Finance entries, relationship changes, ImportantDate objects, and Insight reflections alongside Action/Record/Resource/Asset. Full user restoration and scenario acceptance remain open.
- [ ] Let the user keep, retire, or re-associate existing stable-ID records; never copy their payload into a new settlement Entity. Scene and archived Thing flows support Finance entries, relationship changes, and Insight reflections with Action/Record/Resource/Asset, persist decisions on the existing Scene/Matter, create/archive typed Relations, and leave source payload and ID untouched.
- [ ] Record the settlement decision and source history; allow the context to be reopened without losing prior settlement. Scene settlement decisions are revisioned mutation history and have Open Format, Backup store, and entity-sync payload coverage; the UI can reopen the selection list without erasing earlier decisions, while full durable restore acceptance remains open.
- [x] Verify archived context data remains findable and can be related to a later Scene; `vue-reality-settlement-panel.test.ts` starts from an archived Thing, finds its linked Resource through the real durable projection, re-associates the same Resource ID to a later Scene, and verifies the archived Thing, old Relation tombstone, new Relation, and settlement decision persist.

## Stage G — Contextual Views and End-to-End Acceptance (§15–16, §36, §38–45)

### Task 14: Build Contextual Views Over One Data Set

**Files:**
- Create: `src/domain/reality/contextual-view.ts`
- Create: `src/vue/pages/RealityContextPage.vue`
- Modify: `src/domain/graph/query.ts`
- Test: `src/__tests__/contextual-view.test.ts`

- [ ] Build Thing and Scene views by querying existing Person, Entity, Domain, Relation, time, and history references; do not copy records into view-specific stores. `RealityContextPage` lets users select combined Person/Domain/Thing/Scene/Space/Time contexts over the shared RealityDocument projection, and `buildContextualView` returns original document references; typed Time filters only linked data and does not grant permission. Thing/Scene selection now adds a read-only object overview: Thing Scenes follow persisted order, active participant People are listed, and only permission-filtered canonical RealityDocuments appear in content groups. `vue-reality-context.test.ts` covers ordering, participants, allowed task display, and exclusion of another owner's private note. Complete histories, distinct role interactions, and full original hospital UI scenario remain open.
- [x] Filter content by the current user's resolved Permissions; absent or unknown permissions default to hidden in the contextual projection. Server-resolved grants and account state still await Stage E integration.
- [ ] Render distinct owner, invited participant, and subject-person views with only their permitted actions and content. The local view now distinguishes User or bound Person owners, bound subject People, active recorded Scene participants with permission, and other authorized viewers; it no longer calls every non-owner an invitee. PeoplePage now lets a signed-in User bind their own account to one active Person and confirm unbinding; it neither binds other Users nor creates access grants. Invite identity, complete role-specific actions/content and subject-person scenario acceptance still require Stage E/G.
- [ ] Support the original contexts: person, Scene, Domain, device-size presentation, and current task/role; presentation differences never change stored facts.

### Task 15: Complete the Original Hospital Scenario and Release Acceptance

**Files:**
- Modify: `docs/product/CALMY_SOCIAL_MODEL_TRACEABILITY_2026-10-01.md`
- Modify: `docs/product/OPEN_WORK.md`
- Add end-to-end coverage in `src/__tests__/` and user-facing acceptance records under `docs/product/`

- [ ] Execute the original “爸爸住院” scenario from Thing/Scene/Participants through Domain/Relations/Ownership, private note, invitation, permission explanation, completion, settlement, archive, and reuse in a new Scene. A local model integration acceptance test now verifies Health/Finance Domain links, shared medical expense, private expense and note filtering, and stable object references; invitation, leave/revoke, settlement/reuse and UI flow remain open.
- [ ] Confirm sibling sees shared medical data but not the user's private emotion note; subject-person view shows only authorized care information.
- [ ] Verify Scene completion and Space closure preserve owners' data, histories, and revocation rules.
- [ ] Run migration, backup/restore, Open Format round-trip, offline/retry, supported-browser, accessibility, mobile, and real-user comprehension acceptance.
- [ ] Mark each original §1–45 traceability row complete only with concrete evidence; otherwise keep the aggregate objective open and list its blocking row.

## Execution Notes

- Work inline in the current shared checkout because it contains user-owned uncommitted work and this task is authorized in-place; never reset, stash, clean, stage, or commit that work.
- Execute Stage A–D and Stage F portions that do not perform cross-User authorization while Task 9 is pending.
- Start with Task 1 traceability and Task 5 typed relation creation; then continue sequentially by dependency, updating checkboxes and the traceability record as each deliverable passes.
- User has authorized completing the original design, including verification; run focused tests first and full relevant verification at each stage boundary.
- No remote Git writes, pushes, deployments, or external messages are authorized by this plan.
