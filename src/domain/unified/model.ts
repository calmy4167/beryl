/**
 * Personal OS 的统一领域对象。
 *
 * 这些类型先与旧版 Case/Matter/Action 模型并存，作为新功能和迁移的稳定
 * 边界。页面不得把这些对象再投影成另一个事实源。
 */

export const CORE_ENTITY_TYPES = [
  'person', 'relationship', 'shared_space', 'cycle', 'stage', 'resource',
  'relation', 'seed', 'insight', 'outcome', 'practice', 'daily_state', 'asset', 'scene', 'scene_participant', 'space', 'domain', 'scope', 'permission'
] as const
export type CoreEntityType = typeof CORE_ENTITY_TYPES[number]

export const CORE_ENTITY_SOURCES = ['user', 'ai_assisted', 'import', 'sync'] as const
export type CoreEntitySource = typeof CORE_ENTITY_SOURCES[number]

export const ELEMENT_STAGES = ['wood', 'fire', 'earth', 'metal', 'water'] as const
export type ElementStage = typeof ELEMENT_STAGES[number]

export const TRAJECTORIES = ['advancing', 'stable', 'stalled', 'retreating', 'diverging', 'lost', 'recovering', 'restarting', 'unknown'] as const
export type Trajectory = typeof TRAJECTORIES[number]

export interface CoreEntityMeta {
  calmyId: string
  entityType: CoreEntityType
  createdAt: number
  updatedAt: number
  revision: number
  source: CoreEntitySource
  archivedAt?: number
  ownership?: Ownership
}

export interface PrincipalRef {
  type: 'user' | 'person' | 'space'
  id: string
}

export interface Ownership {
  createdByUserId?: string
  ownerRef: PrincipalRef
  subjectRef?: EntityRef
  stewardRefs: PrincipalRef[]
  privacy?: 'private' | 'shared'
}

export interface Person extends CoreEntityMeta {
  entityType: 'person'
  displayName: string
  status: 'active' | 'archived'
  roles: string[]
  domain?: string
  notes?: string
  tags: string[]
  /** Optional link to a login account; a Person may exist without an account. */
  linkedUserId?: string
}

export type SceneStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'

export interface Scene extends CoreEntityMeta {
  entityType: 'scene'
  title: string
  thingId?: string
  spaceId?: string
  startedAt?: number
  endedAt?: number
  status: SceneStatus
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
  ownerRef?: { type: 'user' | 'person' | 'space'; id: string }
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

export interface Resource extends CoreEntityMeta {
  entityType: 'resource'
  title: string
  kind: 'reference' | 'tool' | 'template' | 'knowledge' | 'person_asset' | 'other'
  status: 'active' | 'expired' | 'retired'
  body?: string
  uri?: string
  assetIds: string[]
  matterIds: string[]
  sourceIds: string[]
  tags: string[]
  expiresAt?: number
}

export interface EntityRef {
  entityType: CoreEntityType | 'thing' | 'shared_space' | 'matter' | 'action' | 'record' | 'today'
  calmyId: string
}

export type RelationType =
  | 'supports' | 'blocks' | 'contradicts' | 'derived_from' | 'related_to'
  | 'belongs_to' | 'depends_on' | 'practices' | 'evidences' | 'part_of'
  | 'subject_of' | 'used_in' | 'belongs_to_domain' | 'context_of'

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
  minCardinality: number
  maxCardinality?: number
  inverseType?: RelationType
  /** Retained only for legacy relation strings whose historical endpoints may not be loaded yet. */
  legacyCompatibility?: boolean
}

export type RelationValidation = { valid: true } | {
  valid: false
  code: 'UNKNOWN_RELATION_TYPE' | 'INVALID_TYPE_PAIR' | 'ENDPOINT_NOT_FOUND'
  reason: string
}

const ALL_RELATION_ENDPOINT_TYPES: EntityRef['entityType'][] = [
  ...CORE_ENTITY_TYPES, 'thing', 'matter', 'action', 'record', 'today', 'shared_space'
]
const LEGACY_COMPAT_TYPES: EntityRef['entityType'][] = [
  'thing', 'matter', 'person', 'relationship', 'shared_space', 'cycle', 'stage', 'resource',
  'action', 'record', 'today', 'seed', 'insight', 'outcome', 'practice', 'asset'
]

export const RELATION_DEFINITIONS: RelationDefinition[] = [
  { relationType: 'subject_of', fromTypes: ['person'], toTypes: ['thing', 'scene', 'record', 'asset'], directed: true, minCardinality: 0 },
  { relationType: 'related_to', fromTypes: ALL_RELATION_ENDPOINT_TYPES, toTypes: ALL_RELATION_ENDPOINT_TYPES, directed: 'either', minCardinality: 0 },
  { relationType: 'used_in', fromTypes: ['resource', 'asset', 'action', 'record'], toTypes: ['scene', 'thing', 'matter'], directed: true, minCardinality: 0 },
  { relationType: 'belongs_to_domain', fromTypes: ALL_RELATION_ENDPOINT_TYPES.filter(type => type !== 'domain'), toTypes: ['domain'], directed: true, minCardinality: 0 },
  { relationType: 'context_of', fromTypes: ['scene', 'space', 'shared_space'], toTypes: ['thing', 'matter', 'person'], directed: true, minCardinality: 0 },
  { relationType: 'supports', fromTypes: LEGACY_COMPAT_TYPES, toTypes: LEGACY_COMPAT_TYPES, directed: true, minCardinality: 0, legacyCompatibility: true },
  { relationType: 'blocks', fromTypes: LEGACY_COMPAT_TYPES, toTypes: LEGACY_COMPAT_TYPES, directed: true, minCardinality: 0, legacyCompatibility: true },
  { relationType: 'contradicts', fromTypes: LEGACY_COMPAT_TYPES, toTypes: LEGACY_COMPAT_TYPES, directed: true, minCardinality: 0, legacyCompatibility: true },
  { relationType: 'derived_from', fromTypes: LEGACY_COMPAT_TYPES, toTypes: LEGACY_COMPAT_TYPES, directed: true, minCardinality: 0, legacyCompatibility: true },
  { relationType: 'belongs_to', fromTypes: LEGACY_COMPAT_TYPES, toTypes: LEGACY_COMPAT_TYPES, directed: true, minCardinality: 0, legacyCompatibility: true },
  { relationType: 'depends_on', fromTypes: LEGACY_COMPAT_TYPES, toTypes: LEGACY_COMPAT_TYPES, directed: true, minCardinality: 0, legacyCompatibility: true },
  { relationType: 'practices', fromTypes: LEGACY_COMPAT_TYPES, toTypes: LEGACY_COMPAT_TYPES, directed: true, minCardinality: 0, legacyCompatibility: true },
  { relationType: 'evidences', fromTypes: LEGACY_COMPAT_TYPES, toTypes: LEGACY_COMPAT_TYPES, directed: true, minCardinality: 0, legacyCompatibility: true },
  { relationType: 'part_of', fromTypes: LEGACY_COMPAT_TYPES, toTypes: LEGACY_COMPAT_TYPES, directed: true, minCardinality: 0, legacyCompatibility: true }
]

export function validateRelation(
  relation: Relation,
  definitions: RelationDefinition[] = RELATION_DEFINITIONS,
  lookup: (ref: EntityRef) => boolean = () => true
): RelationValidation {
  const definition = definitions.find(item => item.relationType === relation.relationType)
  if (!definition) return { valid: false, code: 'UNKNOWN_RELATION_TYPE', reason: `No definition for ${relation.relationType}` }
  if (!definition.fromTypes.includes(relation.from.entityType) || !definition.toTypes.includes(relation.to.entityType) || (definition.directed !== 'either' && definition.directed !== relation.directed)) {
    return { valid: false, code: 'INVALID_TYPE_PAIR', reason: `${relation.from.entityType} ${relation.relationType} ${relation.to.entityType} is not allowed` }
  }
  if (!relation.from.calmyId || !relation.to.calmyId || !lookup(relation.from) || !lookup(relation.to)) {
    if (definition.legacyCompatibility && relation.from.calmyId && relation.to.calmyId) return { valid: true }
    return { valid: false, code: 'ENDPOINT_NOT_FOUND', reason: 'Relation endpoint is missing' }
  }
  return { valid: true }
}

export interface Seed extends CoreEntityMeta {
  entityType: 'seed'
  title: string
  body: string
  status: 'open' | 'cultivating' | 'promoted' | 'retired'
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
  status: 'draft' | 'confirmed' | 'retired'
  /** The user-facing memory view. This is metadata on an Insight, not a second entity. */
  memoryLayer?: 'ai_inference' | 'preference' | 'principle'
  confirmedAt?: number
  deniedAt?: number
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
}

export interface Asset extends CoreEntityMeta {
  entityType: 'asset'
  path: string
  mimeType: string
  sizeBytes: number
  hash: string
  lifecycle: 'active' | 'expired' | 'retired' | 'missing'
  version: number
  externalUri?: string
}

export type CoreEntity =
  | Person | Scene | SceneParticipant | Space | Domain | Scope | Permission | Relationship | SharedSpace | Cycle | Stage | Resource | Relation
  | Seed | Insight | Outcome | Practice | DailyState | Asset

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
}

export type RealityActivity =
  | {
    source: 'matter_mutation' | 'core_entity_mutation' | 'shared_audit'
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
