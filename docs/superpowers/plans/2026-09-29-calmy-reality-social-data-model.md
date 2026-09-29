# Calmy 现实数据模型与共享体系 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 建立以 Person、Thing、Scene、Space、Entity、Domain、Relation、Ownership、Participant、Scope 和 Permission 为规范语义的多人现实数据模型，并保证现有 Matter、Cycle、SharedSpace、关系、历史与数据格式可兼容读取和逐步迁移。

**Architecture:** 先在现有领域层加规范模型与兼容适配，不并行创建可独立编辑的旧/新事实源。Thing 在领域语义上融合 Matter，Scene 表达现实情境并与 Cycle 分离；SharedSpace、旧协作边界和 Mutation/审计由显式适配层映射。每个阶段通过 typed Repository、Open Format/备份路径和回归验收后，才开放后续写入能力。

**Tech Stack:** Vue 3、TypeScript 5.7、现有同步/异步 Collection Repository、IndexedDB durable queue、Vitest、Open Format v2（继续读取 v1）与 JSON Backup。

**Spec:** [`docs/superpowers/specs/2026-09-29-calmy-reality-social-data-model-design.md`](../specs/2026-09-29-calmy-reality-social-data-model-design.md)

## Global Constraints

- `Person` 是现实人物；`User` 是账号身份；未绑定账号的人物不得获得数字访问权。
- Thing 与 Matter 只能有一个事实源；保留稳定 `calmyId`，不得复制成两份可独立编辑的对象。
- Scene 表示现实情境；Cycle/Stage 继续表示旧过程迭代，不能互相转换或混为一谈。
- Space 是长期关系背景，不自动授予成员访问权；Entity 私人内容在共同上下文中仍保持私有。
- Domain 与 Entity Type 分离；Relation 必须类型化并通过 RelationDefinition 校验。
- Permission 默认拒绝，拒绝优先于授权；兼容映射不得扩大旧数据访问范围。
- 现实 Record 与对象 Mutation/Activity 保持不同历史语义，迁移保留 ID、revision、actor、source 和时间。
- IndexedDB/Repository、Open Format、备份和同步是既有兼容边界；新类型必须加入所有相关白名单和往返映射。
- 不删除旧路由、旧对象或历史字段；每一项替换都提供可读适配与回滚路径。
- 当前工作区已有未提交变更；每项实现仅修改本任务列出的文件。不得覆盖、清理或提交其他已有变更，不向远端推送。

---

## File Map

| File | Responsibility |
|---|---|
| `src/domain/unified/model.ts` | 统一实体类型、Relation、来源和 mutation 的规范类型 |
| `src/domain/unified/repository.ts` | 现有 typed sync/async Repository、validation、revision 与 Mutation |
| `src/domain/unified/index.ts` | 领域模型与 Repository 的公开导出 |
| `src/domain/matter/model.ts` | 现有 Matter 数据契约与状态转换 |
| `src/domain/matter/repository.ts` | 旧 `matters` 持久化、异步命令及 Mutation |
| `src/domain/social/collaboration.ts` | 现有 SharedSpace/Relationship 写入访问和协作审计 |
| `src/domain/graph/query.ts` | 现有实体关系投影与展示 |
| `src/core/content/open-format.ts` | Open Format 类型、序列化和反序列化 |
| `src/core/backup.ts` | JSON Backup 的实体 key 白名单 |
| `src/core/entity-sync.ts` | 实体同步类型与兼容映射 |
| `src/core/scenes.ts` | 旧静态产品场景配置；不得把它当作新 Scene 实例 |
| `src/__tests__/thing-compatibility.test.ts` | Matter ↔ Thing 同 ID 与字段映射回归 |
| `src/__tests__/scene-participant.test.ts` | Scene 生命周期、Participant 和旧静态场景区分 |
| `src/__tests__/scene-config-compatibility.test.ts` | 现有静态 SCENES 配置和本地 key 不变 |
| `src/__tests__/domain-relation.test.ts` | Domain / RelationDefinition 类型组合和边约束 |
| `src/__tests__/ownership-permission.test.ts` | Owner/Subject/Steward、Scope 评估、deny 和解释结果 |
| `src/__tests__/reality-model-open-format.test.ts` | 新旧对象导入/导出往返与未知旧字段保留 |
| `src/__tests__/reality-model-backup.test.ts` | 新对象进入 JSON Backup / restore 白名单 |
| `src/__tests__/collaboration.test.ts` | 旧协作边界仍有效且不隐式扩权 |

## Task 1: Add Identity Binding and Canonical Thing Types

**Files:**
- Modify: `src/domain/unified/model.ts`
- Modify: `src/domain/matter/model.ts`
- Modify: `src/domain/unified/index.ts`
- Create: `src/__tests__/thing-compatibility.test.ts`

**Interfaces:**
- Add `Person.linkedUserId?: string`; it is an optional account binding, not a User entity or a substitute Person identifier.
- Add `Thing` as the canonical Matter-compatible model with stable `calmyId`, title/context fields, existing status/trajectory/evidence, optional Person subject references, and metadata (`createdAt`, `updatedAt`, `revision`). Legacy Matter has no record-level `source`; keep that attribution absent unless it can be read from its mutation history.
- Extend `EntityRef.entityType` to accept canonical `thing` while retaining legacy `matter`, so new relations use Thing identity and existing relation documents still parse.
- Keep `Matter` as a compatibility type that converts losslessly to/from Thing; preserve `problem`, `desiredChange`, `progressEvidence`, `currentGap`, `nextTest`, `stopCondition`, `currentCycleId`, and `currentStage`.

- [x] **Step 1: Write compatibility assertions.** `thing-compatibility.test.ts` creates a Matter fixture with every optional legacy field and asserts the Thing projection retains the same ID, status, trajectory, evidence, and Cycle/Stage references; assert `matterFromThing(thingFromMatter(matter))` equals the original Matter; add a Person fixture proving `linkedUserId` may be absent.
- [x] **Step 2: Run the focused test.** Run `npm test -- --run src/__tests__/thing-compatibility.test.ts`. Expected: FAIL because the canonical type and conversion functions do not exist.
- [x] **Step 3: Add canonical types and converters.** Export `thingFromMatter(matter: Matter, mutations?: MatterMutation[]): Thing` and `matterFromThing(thing: Thing): Matter`; copy each legacy field without deriving account identity from `calmyId` or filling absent values. Populate source attribution only when a matching mutation supplies it.
- [x] **Step 4: Run focused and existing Matter tests.** Run `npm test -- --run src/__tests__/thing-compatibility.test.ts src/__tests__/matter.test.ts`. Expected: PASS; old `matterRepository` behavior remains unchanged.

## Task 2: Route Canonical Thing Reads and Writes Through One Matter Store

**Files:**
- Create: `src/domain/thing/repository.ts`
- Create: `src/domain/thing/index.ts`
- Modify: `src/domain/matter/repository.ts`
- Modify: `src/domain/unified/index.ts`
- Modify: `src/__tests__/thing-compatibility.test.ts`

**Interfaces:**
- Export `thingRepository.find(id): Thing | undefined`, `list(): Thing[]`, `create(input, meta?): Thing`, `update(id, patch, meta?): Thing`, and `mutations(id?): ThingMutation[]`.
- Export matching `thingAsyncRepository` operations returning `Promise<Thing | undefined>`, `Promise<Thing[]>`, or `Promise<Thing>` and `Promise<ThingMutation[]>`.
- During this migration slice, the existing `matters` collection remains the sole durable store. Thing operations delegate through the Matter Repository and convert at the boundary; existing Matter callers continue to use the same store and stable IDs.

- [x] **Step 1: Add tests for shared identity and writes.** Assert creating/updating through `thingRepository` is visible through `matterRepository` with the same `calmyId`, and updating through the legacy repository is visible through `thingRepository` without duplicate records.
- [x] **Step 2: Run the focused compatibility test.** Run `npm test -- --run src/__tests__/thing-compatibility.test.ts`. Expected: FAIL because the canonical repository facade is absent.
- [x] **Step 3: Implement the facade over Matter Repository.** Delegate create/update/list/find/mutation operations and convert input/output; do not create a `core:thing` collection in this task.
- [x] **Step 4: Run compatibility and repository tests.** Run `npm test -- --run src/__tests__/thing-compatibility.test.ts src/__tests__/matter.test.ts`. Expected: PASS with exactly one Matter/Thing record per ID.

## Task 3: Add Real Scene and Participant Types

**Files:**
- Modify: `src/domain/unified/model.ts`
- Modify: `src/domain/unified/repository.ts`
- Modify: `src/domain/unified/index.ts`
- Modify: `src/core/scenes.ts` only if a naming-only alias is needed; preserve exports and stored keys
- Create: `src/__tests__/scene-participant.test.ts`

**Interfaces:**
- Add `Scene` as a typed core object with `calmyId`, title, optional `thingId`, optional `spaceId`, start/end timestamps, and status `'draft' | 'active' | 'paused' | 'completed' | 'archived'`. Participant membership is stored only in SceneParticipant records, not duplicated as a Person ID array on Scene.
- Add `SceneParticipant` as a typed core relation record containing `sceneId`, `personId`, optional role, joined/left timestamps, and source; register both `scene` and `scene_participant` in `CORE_ENTITY_TYPES` and `CoreEntity`. It records real participation and never grants account access.
- Extend `EntityRef.entityType` to accept `scene` and `scene_participant`; preserve the existing `src/core/scenes.ts` names only as presentation configuration.
- Keep legacy `SceneDef`, `SCENES`, `currentSceneId()`, and the `scene` local key behavior intact; label them as presentation configuration in the code comments.

- [x] **Step 1: Test that new scenes are typed records.** Add create/find/list/lifecycle assertions for a Scene and a participant whose Person has no `linkedUserId`; assert no Permission record is created.
- [x] **Step 2: Run the focused scene test.** Run `npm test -- --run src/__tests__/scene-participant.test.ts`. Expected: FAIL because Scene/Participant entities are not registered.
- [x] **Step 3: Register Scene and Participant types.** Add their factories, repository validation and status transition guards; reject nonexistent Thing/Space/Person references and invalid joined/left time order.
- [x] **Step 4: Run Scene tests and static-config regression tests.** Run `npm test -- --run src/__tests__/scene-participant.test.ts src/__tests__/scene-config-compatibility.test.ts`. Expected: PASS; static configuration values remain unchanged and are not imported as Scene entities.

## Task 4: Establish Space Semantics Without Implicit Grants

**Files:**
- Modify: `src/domain/unified/model.ts`
- Modify: `src/domain/unified/repository.ts`
- Modify: `src/domain/unified/index.ts`
- Modify: `src/domain/social/collaboration.ts`
- Create: `src/__tests__/space-compatibility.test.ts`

**Interfaces:**
- Add canonical `Space` with `calmyId`, title, purpose, member Person IDs, relationship IDs, linked Thing/Scene IDs, owner reference, and status `'active' | 'closed' | 'archived'`; register `space` in `CORE_ENTITY_TYPES` and `CoreEntity` while retaining `shared_space` as a legacy type.
- Extend `EntityRef.entityType` to accept canonical `space` and keep `shared_space` as a legacy reference type.
- Keep `SharedSpace` as a compatibility projection preserving its existing `memberIds`, `matterIds`, allow/block Matter lists and `ownerId`.
- Add `LegacySpaceBoundary` with `sharedSpaceId`, `matterIds`, `allowedMatterIds`, and `blockedMatterIds`, plus `SpaceCompatibilityProjection = { space: Space; legacyBoundary: LegacySpaceBoundary }`.
- Add `spaceFromSharedSpace(shared: SharedSpace): SpaceCompatibilityProjection` / `sharedSpaceFromSpace(projection: SpaceCompatibilityProjection): SharedSpace` conversions that preserve IDs and access-boundary fields. Conversion itself does not grant access.

- [x] **Step 1: Test legacy conversion and closed-space behavior.** Assert a SharedSpace maps to one Space with the same ID and every old boundary list preserved; a closed Space denies new collaborative writes but does not delete its linked objects.
- [x] **Step 2: Run the focused Space and collaboration tests.** Run `npm test -- --run src/__tests__/space-compatibility.test.ts src/__tests__/collaboration.test.ts`. Expected: FAIL on missing canonical Space conversion.
- [x] **Step 3: Add the Space compatibility facade.** Preserve current shared write checks while routing new semantic reads through Space; do not treat `memberIds` as a new universal Permission grant.
- [x] **Step 4: Re-run focused tests.** Run the same command. Expected: PASS and existing allowed/blocked Matter behavior is unchanged.

## Task 5: Add Domain and RelationDefinition Validation

**Files:**
- Modify: `src/domain/unified/model.ts`
- Modify: `src/domain/unified/repository.ts`
- Modify: `src/domain/graph/query.ts`
- Modify: `src/core/content/open-format.ts`
- Create: `src/__tests__/domain-relation.test.ts`

**Interfaces:**
- Add typed `Domain` core entities with stable ID, key, display name, and active/retired status; register `domain` in `CORE_ENTITY_TYPES` and `CoreEntity`. Entity-to-Domain membership uses a typed `belongs_to_domain` Relation.
- Extend `EntityRef.entityType` to accept `domain`; existing legacy and Core Entity reference types remain valid.
- Add `RelationDefinition` with `relationType`, permitted `fromTypes: EntityRef['entityType'][]`, permitted `toTypes: EntityRef['entityType'][]` (including canonical `thing`, `scene`, `space`, and `domain` plus explicitly supported legacy refs), `directed`, minimum/maximum cardinality, and optional inverse type.
- Register definitions for `subject_of`, `related_to`, `used_in`, `belongs_to_domain`, and `context_of`; Scene participation remains a typed SceneParticipant record with its own role/time fields, not a duplicate generic Relation edge. Preserve current relation strings and imported legacy edges through explicit compatibility definitions.
- Add `validateRelation(relation, definitions, lookup)` returning either `{ valid: true }` or `{ valid: false, code, reason }`; invalid type pairs and missing endpoint IDs are rejected before Repository create/update.

- [x] **Step 1: Write relation contract tests.** Cover every registered relation type, one invalid source/target pair, one missing endpoint, and an imported legacy relation accepted only by its registered compatibility definition.
- [x] **Step 2: Run the focused relation test.** Run `npm test -- --run src/__tests__/domain-relation.test.ts`. Expected: FAIL because definitions and validation are absent.
- [x] **Step 3: Implement relation registry and validation.** Add the typed registry, enforce it in Repository writes, and expose definitions for Graph labels without making Graph the source of truth.
- [x] **Step 4: Run relation and Graph regression tests.** Run `npm test -- --run src/__tests__/domain-relation.test.ts src/__tests__/graph-query.test.ts`. Expected: PASS; existing generic typed edges remain readable through compatibility definitions.

## Task 6: Add Ownership, Scope, and Explainable Permission Evaluation

**Files:**
- Modify: `src/domain/unified/model.ts`
- Modify: `src/domain/unified/repository.ts`
- Modify: `src/domain/social/collaboration.ts`
- Create: `src/domain/permission/policy.ts`
- Create: `src/__tests__/ownership-permission.test.ts`
- Modify: `src/__tests__/collaboration.test.ts`

**Interfaces:**
- Add `Ownership` metadata for `createdByUserId`, `ownerRef: PrincipalRef`, `subjectRef?: EntityRef`, and `stewardRefs: PrincipalRef[]`; `PrincipalRef` is `{ type: 'user' | 'person' | 'space'; id: string }`. Store it on canonical content Entity metadata; legacy objects may omit it until an explicit user choice or source mapping supplies it.
- Add `Scope` and `Permission` as typed core records and register both in `CORE_ENTITY_TYPES` and `CoreEntity`. Scope has optional `personId`, `domainId`, `thingId`, `sceneId`, and `spaceId` filters; omitted filters are wildcards only inside the Permission explicitly attached to the Scope.
- Permission has `principalUserId`, `scopeId` or `entityRef`, effect `'allow' | 'deny'`, and actions `('view' | 'comment' | 'edit' | 'manage')[]`.
- Extend `EntityRef.entityType` to accept `scope` and `permission`; `Scope` and `Permission` do not become principals.
- Add `evaluatePermission(input): PermissionDecision`, where `PermissionDecision` contains `allowed`, `action`, `resourceRef`, `matchedRuleIds`, and a human-readable `reason`.
- Resolve in this order: explicit deny, explicit allow, inherited allow, default deny. Space membership and Scene participation are context facts and do not independently return `allowed: true`.

- [x] **Step 1: Test policy precedence and explanation.** Cover default deny, explicit allow, explicit deny overriding allow, inherited Scope allow, an entity-level private restriction, and an unbound Participant with no User principal.
- [x] **Step 2: Run the focused permission test.** Run `npm test -- --run src/__tests__/ownership-permission.test.ts`. Expected: FAIL because the policy model and evaluator are absent.
- [x] **Step 3: Implement typed policy evaluation.** Make policy evaluation pure and deterministic; have existing `sharedWriteAccess()` adapt its current rules into decisions while preserving legacy Matter boundary behavior.
- [x] **Step 4: Run policy and collaboration tests.** Run `npm test -- --run src/__tests__/ownership-permission.test.ts src/__tests__/collaboration.test.ts`. Expected: PASS; no legacy collaboration test gains broader access.

## Task 7: Preserve Lifecycle, Mutation, and Reality History

**Files:**
- Modify: `src/domain/unified/model.ts`
- Modify: `src/domain/unified/repository.ts`
- Modify: `src/domain/matter/repository.ts`
- Modify: `src/domain/social/collaboration.ts`
- Create: `src/__tests__/reality-history-compatibility.test.ts`

**Interfaces:**
- Add `RealityActivity` for object operations with `entityRef`, operation, `actorUserId`, `sourceIds`, `fromRevision`, `toRevision`, `occurredAt`, and optional patch.
- Preserve MatterMutation, CoreEntityMutation, SharedAuditEntry, and RealityRecord as distinct legacy/canonical sources; `listRealityActivity(ref: EntityRef)` returns normalized projections with a source discriminator and original IDs.
- Scene/Space closing or archiving changes lifecycle only; it never removes linked Entity, RealityRecord, mutation, or audit entries.

- [x] **Step 1: Add history fixtures and assertions.** Seed one MatterMutation, one CoreEntityMutation, one SharedAuditEntry, and one RealityRecord; assert the normalized history preserves source, actor, revision, and timestamps without conflating the RealityRecord with a mutation.
- [x] **Step 2: Run the focused history test.** Run `npm test -- --run src/__tests__/reality-history-compatibility.test.ts`. Expected: FAIL because normalized history projection is absent.
- [x] **Step 3: Implement the read-only history projection.** Read each existing repository/audit source and normalize without rewriting stored records.
- [x] **Step 4: Run history, Matter, and collaboration tests.** Run `npm test -- --run src/__tests__/reality-history-compatibility.test.ts src/__tests__/matter.test.ts src/__tests__/collaboration.test.ts`. Expected: PASS; all original logs remain unchanged.

## Task 8: Extend Open Format, Backup, and Sync Compatibility

**Files:**
- Modify: `src/core/content/open-format.ts`
- Modify: `src/core/backup.ts`
- Modify: `src/core/entity-sync.ts`
- Create: `src/__tests__/reality-model-open-format.test.ts`
- Create: `src/__tests__/reality-model-backup.test.ts`
- Modify: `src/__tests__/unified-open-format.test.ts`
- Modify: `src/__tests__/backup.test.ts`

**Interfaces:**
- Open Format uses explicit typed records for `thing`, `scene`, `scene_participant`, `space`, `domain`, `relation`, `scope`, and `permission`; `Person` binding and Ownership fields are typed frontmatter fields. `OpenEntityType` and import reference types include the canonical identifiers while retaining legacy `matter` and `shared_space` identifiers.
- Existing `matter`, `shared_space`, relation, and current Core Entity documents continue to parse and serialize. First prove whether current v1 readers preserve or safely ignore each added type; retain v1 only for types that pass that compatibility check, otherwise add an explicit versioned conversion. Never silently bump or retain `format_version` without the round-trip evidence.
- JSON Backup and entity sync include each new canonical store and retain legacy store entries until an explicit migration removes them.

- [x] **Step 1: Write new and legacy round-trip tests.** Round-trip Person with/without User binding, Thing with every Matter field, Scene/Participant, Space with blocked/allowed Matter lists, Domain and typed Relation edges, Ownership/Scope/Permission, and a fixture containing an unknown legacy field. RelationDefinition stays a versioned code registry and is verified through Task 5 relation validation tests, not exported as user data.
- [x] **Step 2: Run focused Open Format and Backup tests.** Run `npm test -- --run src/__tests__/reality-model-open-format.test.ts src/__tests__/reality-model-backup.test.ts`. Expected: FAIL because serialization and key allowlists are incomplete.
- [x] **Step 3: Add explicit serializers, parsers, and store keys.** Update both import and export switches, validate new enum values, preserve unknown legacy fields in the existing compatibility payload, and add each canonical type to the JSON Backup and entity-sync registries.
- [x] **Step 4: Run focused and existing data compatibility tests.** Run `npm test -- --run src/__tests__/reality-model-open-format.test.ts src/__tests__/reality-model-backup.test.ts src/__tests__/unified-open-format.test.ts src/__tests__/backup.test.ts`. Expected: PASS; current Open Format v1 fixtures remain readable and round-trip.

## Task 9: Add Read-Only Migration Audit and End-to-End Compatibility Gate

**Files:**
- Create: `src/domain/migration/reality-model-audit.ts`
- Create: `src/__tests__/reality-model-migration-audit.test.ts`
- Modify: `docs/product/OPEN_WORK.md` after user-visible behavior and migration evidence exist

**Interfaces:**
- Define `RealityModelSnapshot` as `{ people: Person[]; matters: Matter[]; things: Thing[]; scenes: Scene[]; sceneParticipants: SceneParticipant[]; spaces: Space[]; legacySpaceBoundaries: LegacySpaceBoundary[]; relations: Relation[]; domains: Domain[]; scopes: Scope[]; permissions: Permission[] }` and export `auditRealityModelMigration(snapshot: RealityModelSnapshot): RealityModelAudit` with counts and issue rows for distinct-object ID collisions (not same-ID Matter/Thing compatibility projections), unresolved Person/User associations, Matter/Thing projection differences, invalid Relation endpoints, unknown ownership references, invalid Scope/Permission principals, and legacy Scene config collisions.
- The audit is read-only; it never repairs, deletes, grants access, or rewrites Open Format data.

- [x] **Step 1: Write audit fixtures.** Include one valid legacy-only snapshot, one valid mixed snapshot with same-ID Matter/Thing projection, and one snapshot for each issue category; assert deterministic issue codes and stable source IDs.
- [x] **Step 2: Run the focused audit test.** Run `npm test -- --run src/__tests__/reality-model-migration-audit.test.ts`. Expected: FAIL because the audit API is absent.
- [x] **Step 3: Implement deterministic read-only audit.** Emit sorted issue rows and counts; never access mutating Repository methods.
- [x] **Step 4: Run project data and build checks.** Run `npm test -- --run src/__tests__/thing-compatibility.test.ts src/__tests__/scene-participant.test.ts src/__tests__/space-compatibility.test.ts src/__tests__/domain-relation.test.ts src/__tests__/ownership-permission.test.ts src/__tests__/reality-history-compatibility.test.ts src/__tests__/reality-model-open-format.test.ts src/__tests__/reality-model-backup.test.ts src/__tests__/reality-model-migration-audit.test.ts src/__tests__/collaboration.test.ts src/__tests__/matter.test.ts src/__tests__/graph-query.test.ts`; then run `npm run build`. Expected: all focused tests pass and Vue type-check/build succeeds.
- [x] **Step 5: Update the open-work record.** Record the actual audit/build output and list any remaining migration, UI, account-binding, or real-user validation gaps; do not mark the entire sharing product complete from model tests alone.

## Deferred After This Plan

- Moving durable records from the legacy `matters` key into a new canonical physical store.
- UI for invitation, member management, share links, private/shared selection, and access explanations.
- Cloud multi-account integration and server-side authorization enforcement.
- Full data migration execution or deletion of legacy keys.
- Product-wide adoption of Domain and Relation pickers in every module.

## Execution Notes

- Work serially in the existing shared checkout because the repository currently has a broad uncommitted Vue migration; each task must preserve unrelated diffs.
- `.git` is read-only in the current environment. Do not stage or commit until repository permissions change; do not run remote Git writes.
- Tests were authorized through plan execution. Focused compatibility run: 20 test files / 100 tests passed; `npm run build` completed successfully after final code changes. Open Format v1 file and manifest reads are covered by tests.
