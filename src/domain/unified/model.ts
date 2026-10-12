/**
 * Personal OS 的统一领域对象。
 *
 * 这些类型先与旧版 Case/Matter/Action 模型并存，作为新功能和迁移的稳定
 * 边界。页面不得把这些对象再投影成另一个事实源。
 */

export const CORE_ENTITY_TYPES = [
  'person', 'important_date', 'organization', 'relationship', 'shared_space', 'cycle', 'stage', 'resource',
  'relation', 'seed', 'insight', 'outcome', 'practice', 'daily_state', 'asset', 'scene', 'scene_participant', 'space', 'domain', 'scope', 'permission', 'dictionary_option'
] as const
export type CoreEntityType = typeof CORE_ENTITY_TYPES[number]

export const CORE_ENTITY_SOURCES = ['user', 'ai_assisted', 'import', 'sync'] as const
export type CoreEntitySource = typeof CORE_ENTITY_SOURCES[number]

export const ELEMENT_STAGES = ['wood', 'fire', 'earth', 'metal', 'water'] as const
export type ElementStage = typeof ELEMENT_STAGES[number]

export const TRAJECTORIES = ['advancing', 'stable', 'stalled', 'retreating', 'diverging', 'lost', 'recovering', 'restarting', 'unknown'] as const
export type Trajectory = typeof TRAJECTORIES[number]

export interface CoreEntityHistorySnapshot {
  revision: number
  operation: 'created' | 'updated' | 'archived' | 'transitioned'
  source: CoreEntitySource
  actorUserId?: string
  occurredAt: number
  fromRevision: number
  toRevision: number
  previousSnapshot?: Record<string, unknown>
  snapshot: Record<string, unknown>
}

export interface CoreEntityMeta {
  calmyId: string
  entityType: CoreEntityType
  createdAt: number
  updatedAt: number
  revision: number
  source: CoreEntitySource
  archivedAt?: number
  ownership?: Ownership
  revisionHistory?: CoreEntityHistorySnapshot[]
}

export interface PrincipalRef {
  type: 'user' | 'person' | 'space' | 'organization'
  id: string
}

export interface Ownership {
  createdByUserId?: string
  ownerRef: PrincipalRef
  /** Additional owners for genuinely joint ownership; access still requires Permission. */
  coOwnerRefs?: PrincipalRef[]
  subjectRef?: EntityRef
  stewardRefs: PrincipalRef[]
  /** `shared` is retained for legacy compatibility; it does not grant access. */
  privacy?: 'private' | 'restricted' | 'scene' | 'space' | 'shared'
}

export const PERSON_STATUSES = ['active', 'archived'] as const
export type PersonStatus = typeof PERSON_STATUSES[number]

export interface Person extends CoreEntityMeta {
  entityType: 'person'
  displayName: string
  status: PersonStatus
  roles: string[]
  domain?: string
  notes?: string
  tags: string[]
  /** Optional link to a login account; a Person may exist without an account. */
  linkedUserId?: string
}

export type ImportantDateKind = 'birthday' | 'anniversary' | 'memorial' | 'other'
export type ImportantDateRecurrence = 'yearly' | 'once'

/** A canonical date record; Person/Thing/Scene associations remain typed Relations. */
export interface ImportantDate extends CoreEntityMeta {
  entityType: 'important_date'
  title: string
  kind: ImportantDateKind
  personId?: string
  /** Month and day only, so dates such as Feb 29 can recur in leap years. */
  monthDay: string
  year?: number
  recurrence: ImportantDateRecurrence
  notes?: string
}

export function isValidImportantMonthDay(value: string): boolean {
  if (!/^\d{2}-\d{2}$/.test(value)) return false
  const [month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(2000, month - 1, day))
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export interface Organization extends CoreEntityMeta {
  entityType: 'organization'
  title: string
  status: 'active' | 'archived'
}

export type SceneStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'

export interface RealitySettlementDecision {
  entityRef: EntityRef
  choice: 'keep' | 'retire' | 'reassociate'
  targetRef?: EntityRef
  decidedAt: number
}

export interface RealitySettlement {
  commandId: string
  settledAt: number
  decisions: RealitySettlementDecision[]
}

export interface Scene extends CoreEntityMeta {
  entityType: 'scene'
  title: string
  thingId?: string
  spaceId?: string
  startedAt?: number
  endedAt?: number
  order?: number
  status: SceneStatus
  /** Append-only settlement decisions reference existing Entities; they never copy payloads. */
  settlements?: RealitySettlement[]
}

export interface SceneParticipant extends CoreEntityMeta {
  entityType: 'scene_participant'
  sceneId: string
  personId: string
  role?: string
  joinedAt: number
  leftAt?: number
}

export interface Space extends CoreEntityMeta {
  entityType: 'space'
  title: string
  purpose?: string
  boundary?: string
  memberPersonIds: string[]
  relationshipIds: string[]
  thingIds: string[]
  sceneIds: string[]
  ownerRef?: PrincipalRef
  status: 'active' | 'closed' | 'archived'
  /** Retained adapter metadata for a legacy SharedSpace; it never acts as a Permission grant. */
  legacyBoundary?: LegacySpaceBoundary
}

export interface LegacySpaceBoundary {
  sharedSpaceId: string
  matterIds: string[]
  allowedMatterIds?: string[]
  blockedMatterIds?: string[]
  /** Legacy member IDs may be account IDs, so they are retained without reclassifying as Persons. */
  legacyMemberIds: string[]
  legacyStatus: SharedSpace['status']
}

export interface SpaceCompatibilityProjection {
  space: Space
  legacyBoundary: LegacySpaceBoundary
}

export function spaceFromSharedSpace(shared: SharedSpace): SpaceCompatibilityProjection {
  const legacyBoundary: LegacySpaceBoundary = {
    sharedSpaceId: shared.calmyId,
    matterIds: shared.matterIds.slice(),
    allowedMatterIds: shared.allowedMatterIds?.slice(),
    blockedMatterIds: shared.blockedMatterIds?.slice(),
    legacyMemberIds: shared.memberIds.slice(),
    legacyStatus: shared.status
  }
  return {
    space: {
      calmyId: shared.calmyId, entityType: 'space', createdAt: shared.createdAt, updatedAt: shared.updatedAt,
      revision: shared.revision, source: shared.source, archivedAt: shared.archivedAt,
      title: shared.title, purpose: shared.purpose, boundary: shared.boundary,
      memberPersonIds: [], relationshipIds: shared.relationshipIds.slice(), thingIds: shared.matterIds.slice(), sceneIds: [],
      ownerRef: shared.ownerId ? { type: 'user', id: shared.ownerId } : undefined,
      status: shared.status === 'archived' ? 'archived' : 'active', legacyBoundary
    },
    legacyBoundary
  }
}

export function sharedSpaceFromSpace(projection: SpaceCompatibilityProjection): SharedSpace {
  const { space } = projection
  const legacyBoundary = projection.legacyBoundary || space.legacyBoundary
  if (!legacyBoundary) throw new Error(`Space ${space.calmyId} has no SharedSpace compatibility boundary`)
  return {
    calmyId: legacyBoundary.sharedSpaceId, entityType: 'shared_space', createdAt: space.createdAt,
    updatedAt: space.updatedAt, revision: space.revision, source: space.source, archivedAt: space.archivedAt,
    title: space.title, status: space.status === 'active' ? legacyBoundary.legacyStatus : 'archived',
    purpose: space.purpose, boundary: space.boundary, memberIds: legacyBoundary.legacyMemberIds.slice(),
    relationshipIds: space.relationshipIds.slice(), matterIds: space.thingIds.slice(),
    allowedMatterIds: legacyBoundary.allowedMatterIds?.slice(), blockedMatterIds: legacyBoundary.blockedMatterIds?.slice(),
    ownerId: space.ownerRef?.type === 'user' ? space.ownerRef.id : undefined
  }
}

export interface Relationship extends CoreEntityMeta {
  entityType: 'relationship'
  personAId: string
  personBId: string
  label: string
  status: 'active' | 'paused' | 'ended'
  boundary?: string
  rhythm?: string
  blockedMatterIds?: string[]
  allowedMatterIds?: string[]
  sharedSpaceIds: string[]
  matterIds: string[]
  evidenceIds: string[]
  ownerId?: string
}

export interface SharedSpace extends CoreEntityMeta {
  entityType: 'shared_space'
  title: string
  status: 'active' | 'archived'
  purpose?: string
  boundary?: string
  blockedMatterIds?: string[]
  allowedMatterIds?: string[]
  memberIds: string[]
  relationshipIds: string[]
  matterIds: string[]
  ownerId?: string
}

export interface Cycle extends CoreEntityMeta {
  entityType: 'cycle'
  matterId: string
  title: string
  theme: string
  currentStage: ElementStage
  status: 'planned' | 'active' | 'paused' | 'completed' | 'archived'
  trajectory: Trajectory
  stageIds: string[]
  parentCycleId?: string
  parentStage?: ElementStage
  ownerId?: string
}

export interface Stage extends CoreEntityMeta {
  entityType: 'stage'
  cycleId: string
  title: string
  element: ElementStage
  status: 'planned' | 'active' | 'paused' | 'completed' | 'skipped'
  actionIds: string[]
  recordIds: string[]
  order?: number
}

export const CYCLE_STATUSES = ['planned', 'active', 'paused', 'completed', 'archived'] as const
export type CycleStatus = typeof CYCLE_STATUSES[number]
export const STAGE_STATUSES = ['planned', 'active', 'paused', 'completed', 'skipped'] as const
export type StageStatus = typeof STAGE_STATUSES[number]

export const RESOURCE_STATUSES = ['active', 'expired', 'retired'] as const
export type ResourceStatus = typeof RESOURCE_STATUSES[number]
export const ASSET_LIFECYCLES = ['active', 'expired', 'retired', 'missing'] as const
export type AssetLifecycle = typeof ASSET_LIFECYCLES[number]
export const SEED_STATUSES = ['open', 'cultivating', 'promoted', 'retired'] as const
export type SeedStatus = typeof SEED_STATUSES[number]
export const INSIGHT_STATUSES = ['draft', 'confirmed', 'retired'] as const
export type InsightStatus = typeof INSIGHT_STATUSES[number]

export interface Resource extends CoreEntityMeta {
  entityType: 'resource'
  title: string
  kind: 'reference' | 'tool' | 'template' | 'knowledge' | 'person_asset' | 'other'
  status: ResourceStatus
  body?: string
  uri?: string
  assetIds: string[]
  matterIds: string[]
  sourceIds: string[]
  tags: string[]
  categoryOptionId?: string
  tagOptionIds?: string[]
  sourceOptionId?: string
  expiresAt?: number
}

export type DictionaryOptionModule = 'resource' | 'asset' | 'seed' | 'insight' | 'action' | 'capture' | 'finance' | 'goal' | 'matter' | 'person'
export type DictionaryOptionField = 'category' | 'tag' | 'source' | 'status'
export interface DictionaryOption extends CoreEntityMeta {
  entityType: 'dictionary_option'
  module: DictionaryOptionModule
  field: DictionaryOptionField
  value: string
  /** Canonical domain status code for module-scoped status label/order overrides. */
  systemKey?: string
  status: 'active' | 'retired'
  sortOrder: number
}

export interface EntityRef {
  entityType: CoreEntityType | 'thing' | 'shared_space' | 'matter' | 'action' | 'record' | 'today' | 'finance_entry' | 'diary_entry' | 'goal' | 'post' | 'time'
  calmyId: string
}

/** Time is a value reference, not a copied/stored Entity. IDs accept year, month, or exact date. */
export function isValidTimeContextId(value: string): boolean {
  if (/^\d{4}$/.test(value)) return Number(value) >= 1 && Number(value) <= 9999
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [, month] = value.split('-').map(Number)
    return month >= 1 && month <= 12
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export type RelationType =
  | 'supports' | 'blocks' | 'contradicts' | 'derived_from' | 'related_to'
  | 'belongs_to' | 'depends_on' | 'practices' | 'evidences' | 'part_of'
  | 'subject_of' | 'has_related_content' | 'used_in' | 'belongs_to_domain' | 'context_of'

export interface Relation extends CoreEntityMeta {
  entityType: 'relation'
  from: EntityRef
  to: EntityRef
  relationType: RelationType
  directed: boolean
  confidence?: number
  sourceIds: string[]
}

export interface Domain extends CoreEntityMeta {
  entityType: 'domain'
  key: string
  displayName: string
  status: 'active' | 'retired'
}

export interface Scope extends CoreEntityMeta {
  entityType: 'scope'
  personId?: string
  domainId?: string
  thingId?: string
  sceneId?: string
  spaceId?: string
}

export type PermissionAction = 'view' | 'comment' | 'edit' | 'manage'

export interface Permission extends CoreEntityMeta {
  entityType: 'permission'
  principalUserId: string
  scopeId?: string
  entityRef?: EntityRef
  effect: 'allow' | 'deny'
  actions: PermissionAction[]
}

export interface RelationDefinition {
  relationType: RelationType
  fromTypes: EntityRef['entityType'][]
  toTypes: EntityRef['entityType'][]
  directed: boolean | 'either'
  cardinality: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many'
  minCardinality: number
  maxCardinality?: number
  inverseType?: RelationType
  /** Retained only for legacy relation strings whose historical endpoints may not be loaded yet. */
  legacyCompatibility?: boolean
}

export type RelationValidation = { valid: true } | {
  valid: false
  code: 'UNKNOWN_RELATION_TYPE' | 'INVALID_TYPE_PAIR' | 'ENDPOINT_NOT_FOUND' | 'CARDINALITY_EXCEEDED'
  reason: string
}

const ALL_RELATION_ENDPOINT_TYPES: EntityRef['entityType'][] = [
  'person', 'important_date', 'diary_entry', 'post', 'organization', 'relationship', 'shared_space', 'cycle', 'stage', 'resource', 'seed', 'insight', 'outcome',
  'practice', 'daily_state', 'asset', 'scene', 'space', 'domain', 'thing', 'matter', 'action', 'record', 'today', 'finance_entry', 'goal', 'time'
]
const STORED_RELATION_ENDPOINT_TYPES = ALL_RELATION_ENDPOINT_TYPES.filter(type => type !== 'time')
const NON_PERSON_RELATION_ENDPOINT_TYPES = ALL_RELATION_ENDPOINT_TYPES.filter(type => type !== 'person' && type !== 'time')
const CONTEXT_SOURCE_TYPES = ALL_RELATION_ENDPOINT_TYPES.filter(type => !['time', 'domain', 'scope', 'permission'].includes(type))
const LEGACY_COMPAT_TYPES: EntityRef['entityType'][] = [
  'thing', 'matter', 'person', 'relationship', 'shared_space', 'cycle', 'stage', 'resource',
  'action', 'record', 'today', 'finance_entry', 'goal', 'seed', 'insight', 'outcome', 'practice', 'asset'
]

export const RELATION_DEFINITIONS: RelationDefinition[] = [
  { relationType: 'subject_of', fromTypes: NON_PERSON_RELATION_ENDPOINT_TYPES, toTypes: ['person'], directed: true, cardinality: 'many-to-many', minCardinality: 0, inverseType: 'has_related_content' },
  { relationType: 'has_related_content', fromTypes: ['person'], toTypes: NON_PERSON_RELATION_ENDPOINT_TYPES, directed: true, cardinality: 'many-to-many', minCardinality: 0, inverseType: 'subject_of' },
  { relationType: 'related_to', fromTypes: STORED_RELATION_ENDPOINT_TYPES, toTypes: STORED_RELATION_ENDPOINT_TYPES, directed: 'either', cardinality: 'many-to-many', minCardinality: 0 },
  { relationType: 'used_in', fromTypes: ['resource', 'asset', 'action', 'record', 'finance_entry', 'diary_entry', 'post', 'relationship', 'insight', 'important_date'], toTypes: ['scene', 'thing', 'matter'], directed: true, cardinality: 'many-to-many', minCardinality: 0 },
  { relationType: 'belongs_to_domain', fromTypes: STORED_RELATION_ENDPOINT_TYPES.filter(type => type !== 'domain'), toTypes: ['domain'], directed: true, cardinality: 'many-to-one', minCardinality: 0 },
  { relationType: 'context_of', fromTypes: CONTEXT_SOURCE_TYPES, toTypes: ['thing', 'matter', 'person', 'scene', 'space', 'time'], directed: true, cardinality: 'many-to-many', minCardinality: 0 },
  { relationType: 'supports', fromTypes: LEGACY_COMPAT_TYPES, toTypes: LEGACY_COMPAT_TYPES, directed: true, cardinality: 'many-to-many', minCardinality: 0, legacyCompatibility: true },
  { relationType: 'blocks', fromTypes: LEGACY_COMPAT_TYPES, toTypes: LEGACY_COMPAT_TYPES, directed: true, cardinality: 'many-to-many', minCardinality: 0, legacyCompatibility: true },
  { relationType: 'contradicts', fromTypes: LEGACY_COMPAT_TYPES, toTypes: LEGACY_COMPAT_TYPES, directed: true, cardinality: 'many-to-many', minCardinality: 0, legacyCompatibility: true },
  { relationType: 'derived_from', fromTypes: LEGACY_COMPAT_TYPES, toTypes: LEGACY_COMPAT_TYPES, directed: true, cardinality: 'many-to-many', minCardinality: 0, legacyCompatibility: true },
  { relationType: 'belongs_to', fromTypes: LEGACY_COMPAT_TYPES, toTypes: LEGACY_COMPAT_TYPES, directed: true, cardinality: 'many-to-many', minCardinality: 0, legacyCompatibility: true },
  { relationType: 'depends_on', fromTypes: LEGACY_COMPAT_TYPES, toTypes: LEGACY_COMPAT_TYPES, directed: true, cardinality: 'many-to-many', minCardinality: 0, legacyCompatibility: true },
  { relationType: 'practices', fromTypes: LEGACY_COMPAT_TYPES, toTypes: LEGACY_COMPAT_TYPES, directed: true, cardinality: 'many-to-many', minCardinality: 0, legacyCompatibility: true },
  { relationType: 'evidences', fromTypes: LEGACY_COMPAT_TYPES, toTypes: LEGACY_COMPAT_TYPES, directed: true, cardinality: 'many-to-many', minCardinality: 0, legacyCompatibility: true },
  { relationType: 'part_of', fromTypes: LEGACY_COMPAT_TYPES, toTypes: LEGACY_COMPAT_TYPES, directed: true, cardinality: 'many-to-many', minCardinality: 0, legacyCompatibility: true }
]

export function validateRelation(
  relation: Relation,
  definitions: RelationDefinition[] = RELATION_DEFINITIONS,
  lookup: (ref: EntityRef) => boolean = () => true,
  existingRelations: Relation[] = []
): RelationValidation {
  const definition = definitions.find(item => item.relationType === relation.relationType)
  if (!definition) return { valid: false, code: 'UNKNOWN_RELATION_TYPE', reason: `No definition for ${relation.relationType}` }
  if (!definition.fromTypes.includes(relation.from.entityType) || !definition.toTypes.includes(relation.to.entityType) || (definition.directed !== 'either' && definition.directed !== relation.directed)) {
    return { valid: false, code: 'INVALID_TYPE_PAIR', reason: `${relation.from.entityType} ${relation.relationType} ${relation.to.entityType} is not allowed` }
  }
  const endpointExists = (ref: EntityRef) => ref.entityType === 'time' ? isValidTimeContextId(ref.calmyId) : lookup(ref)
  if (!relation.from.calmyId || !relation.to.calmyId || !endpointExists(relation.from) || !endpointExists(relation.to)) {
    if (definition.legacyCompatibility && relation.from.calmyId && relation.to.calmyId) return { valid: true }
    return { valid: false, code: 'ENDPOINT_NOT_FOUND', reason: 'Relation endpoint is missing' }
  }
  const sameRef = (left: EntityRef, right: EntityRef) => left.entityType === right.entityType && left.calmyId === right.calmyId
  const matches = existingRelations.filter(item => item.relationType === relation.relationType)
  const sourceAlreadyConnected = matches.some(item => sameRef(item.from, relation.from) && !sameRef(item.to, relation.to))
  const targetAlreadyConnected = matches.some(item => sameRef(item.to, relation.to) && !sameRef(item.from, relation.from))
  const cardinalityExceeded = definition.cardinality === 'one-to-one'
    ? sourceAlreadyConnected || targetAlreadyConnected
    : definition.cardinality === 'one-to-many'
      ? targetAlreadyConnected
      : definition.cardinality === 'many-to-one'
        ? sourceAlreadyConnected
        : false
  if (cardinalityExceeded) return { valid: false, code: 'CARDINALITY_EXCEEDED', reason: `${relation.relationType} cardinality ${definition.cardinality} would be exceeded` }
  return { valid: true }
}

export interface Seed extends CoreEntityMeta {
  entityType: 'seed'
  title: string
  body: string
  status: SeedStatus
  sourceRecordIds: string[]
  targetMatterIds: string[]
  tags: string[]
}

export interface Insight extends CoreEntityMeta {
  entityType: 'insight'
  title: string
  body: string
  confidence?: number
  sourceRecordIds: string[]
  matterIds: string[]
  resourceIds: string[]
  status: InsightStatus
  /** The user-facing memory view. This is metadata on an Insight, not a second entity. */
  memoryLayer?: 'ai_inference' | 'preference' | 'principle'
  confirmedAt?: number
  deniedAt?: number
  /** Records which retired Insight action the user chose; older ambiguous records may omit it. */
  retirementReason?: 'denied' | 'removed'
}

export interface Outcome extends CoreEntityMeta {
  entityType: 'outcome'
  actionId: string
  matterId?: string
  summary: string
  result?: string
  status: 'observed' | 'accepted' | 'revised'
  evidenceRecordIds: string[]
}

export interface Practice extends CoreEntityMeta {
  entityType: 'practice'
  title: string
  description: string
  status: 'candidate' | 'active' | 'paused' | 'retired'
  matterIds: string[]
  outcomeIds: string[]
  evidenceIds: string[]
  cadence?: string
}

export interface DailyState extends CoreEntityMeta {
  entityType: 'daily_state'
  date: string
  bodyState: 'good' | 'normal' | 'tired' | 'bad'
  mentalState: 'clear' | 'normal' | 'heavy' | 'overloaded'
  load: number
  actualTimeMinutes?: number
  trajectory: Trajectory
  todayPlanId?: string
  protectedItems: string[]
  history?: DailyStateHistorySnapshot[]
}

export interface DailyStateHistorySnapshot {
  revision: number
  operation: 'created' | 'updated'
  occurredAt: number
  actorUserId?: string
  date: string
  bodyState: DailyState['bodyState']
  mentalState: DailyState['mentalState']
  load: number
  actualTimeMinutes?: number
  trajectory: Trajectory
  todayPlanId?: string
  protectedItems: string[]
  ownership?: Ownership
}

export interface Asset extends CoreEntityMeta {
  entityType: 'asset'
  path: string
  mimeType: string
  sizeBytes: number
  hash: string
  lifecycle: AssetLifecycle
  version: number
  externalUri?: string
}

export type CoreEntity =
  | Person | ImportantDate | Organization | Scene | SceneParticipant | Space | Domain | Scope | Permission | Relationship | SharedSpace | Cycle | Stage | Resource | Relation
  | Seed | Insight | Outcome | Practice | DailyState | Asset | DictionaryOption

export interface CoreEntityMutation {
  id: string
  entityType: CoreEntityType
  entityId: string
  operation: 'create' | 'update' | 'archive' | 'transition'
  commandId: string
  actor: CoreEntitySource
  actorId?: string
  sourceIds: string[]
  fromRevision: number
  toRevision: number
  occurredAt: number
  patch?: unknown
  previousSnapshot?: Record<string, unknown>
  snapshot?: Record<string, unknown>
}

export type RealityActivity =
  | {
    source: 'matter_mutation' | 'core_entity_mutation' | 'shared_audit' | 'goal_revision' | 'post_revision'
    originalId: string
    entityRef: EntityRef
    operation: string
    actor?: string
    actorUserId?: string
    sourceIds: string[]
    fromRevision: number
    toRevision: number
    occurredAt: number
    patch?: unknown
    previousSnapshot?: Record<string, unknown>
    snapshot?: Record<string, unknown>
  }
  | {
    source: 'reality_record'
    originalId: string
    entityRef: EntityRef
    operation: 'recorded'
    actorUserId?: undefined
    sourceIds: string[]
    occurredAt: number
    recordRevision: number
    recordType: string
    recordSource: string
    evidenceIds: string[]
    body: string
  }
  | {
    source: 'record_revision'
    originalId: string
    entityRef: EntityRef
    operation: 'revised'
    sourceIds: string[]
    occurredAt: number
    recordRevision: number
    reason: string
    actor: 'user' | 'ai' | 'import' | 'sync'
    actorUserId?: string
    body: string
  }
  | {
    source: 'finance_mutation'
    originalId: string
    entityRef: EntityRef
    operation: 'created' | 'updated' | 'ownership-updated'
    actorUserId: string
    sourceIds: string[]
    fromRevision: number
    toRevision: number
    occurredAt: number
    patch: { ownership?: Ownership; previousOwnership?: Ownership; snapshot?: Record<string, unknown>; previousSnapshot?: Record<string, unknown> }
  }
  | {
    source: 'diary_revision'
    originalId: string
    entityRef: EntityRef
    operation: 'created' | 'content_updated' | 'ownership_updated'
    actorUserId?: string
    sourceIds: string[]
    fromRevision: number
    toRevision: number
    occurredAt: number
    patch: { content: string; sourceMaterialIds?: string[]; ownership?: Ownership }
  }
  | {
    source: 'daily_state_revision'
    originalId: string
    entityRef: EntityRef
    operation: 'created' | 'updated'
    actorUserId?: string
    sourceIds: string[]
    fromRevision: number
    toRevision: number
    occurredAt: number
    patch: DailyStateHistorySnapshot
  }

export interface CoreCommandMeta {
  commandId?: string
  actor?: CoreEntitySource
  actorId?: string
  sourceIds?: string[]
  expectedRevision?: number
}

export type CoreDomainErrorCode =
  | 'VALIDATION_FAILED' | 'NOT_FOUND' | 'REVISION_CONFLICT'
  | 'INVALID_TRANSITION' | 'DUPLICATE_COMMAND'

export class CoreDomainError extends Error {
  constructor(public readonly code: CoreDomainErrorCode, message: string) {
    super(message)
    this.name = 'CoreDomainError'
  }
}

export function isCoreEntityType(value: string): value is CoreEntityType {
  return (CORE_ENTITY_TYPES as readonly string[]).includes(value)
}

export function isTrajectory(value: string): value is Trajectory {
  return (TRAJECTORIES as readonly string[]).includes(value)
}

export function isElementStage(value: string): value is ElementStage {
  return (ELEMENT_STAGES as readonly string[]).includes(value)
}

export function canTransitionCycle(from: CycleStatus, to: CycleStatus): boolean {
  if (from === to) return true
  if (from === 'planned') return ['active', 'paused', 'archived'].includes(to)
  if (from === 'active') return ['paused', 'completed', 'archived'].includes(to)
  if (from === 'paused') return ['active', 'completed', 'archived'].includes(to)
  if (from === 'completed') return ['active', 'paused', 'archived'].includes(to)
  if (from === 'archived') return to === 'paused'
  return false
}

export function canTransitionStage(from: StageStatus, to: StageStatus): boolean {
  if (from === to) return true
  if (from === 'planned') return ['active', 'paused', 'skipped'].includes(to)
  if (from === 'active') return ['paused', 'completed', 'skipped'].includes(to)
  if (from === 'paused') return ['active', 'completed', 'skipped'].includes(to)
  if (from === 'completed') return ['active', 'paused'].includes(to)
  if (from === 'skipped') return ['planned', 'active'].includes(to)
  return false
}
