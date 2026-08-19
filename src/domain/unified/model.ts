/**
 * Personal OS 的统一领域对象。
 *
 * 这些类型先与旧版 Case/Matter/Action 模型并存，作为新功能和迁移的稳定
 * 边界。页面不得把这些对象再投影成另一个事实源。
 */

export const CORE_ENTITY_TYPES = [
  'person', 'relationship', 'shared_space', 'cycle', 'stage', 'resource',
  'relation', 'seed', 'insight', 'outcome', 'practice', 'daily_state', 'asset'
] as const
export type CoreEntityType = typeof CORE_ENTITY_TYPES[number]

export const CORE_ENTITY_SOURCES = ['user', 'ai_assisted', 'import', 'sync'] as const
export type CoreEntitySource = typeof CORE_ENTITY_SOURCES[number]

export const ELEMENT_STAGES = ['wood', 'fire', 'earth', 'metal', 'water'] as const
export type ElementStage = typeof ELEMENT_STAGES[number]

export const TRAJECTORIES = ['advancing', 'stable', 'stalled', 'retreating', 'recovering', 'diverging'] as const
export type Trajectory = typeof TRAJECTORIES[number]

export interface CoreEntityMeta {
  calmyId: string
  entityType: CoreEntityType
  createdAt: number
  updatedAt: number
  revision: number
  source: CoreEntitySource
  archivedAt?: number
}

export interface Person extends CoreEntityMeta {
  entityType: 'person'
  displayName: string
  status: 'active' | 'archived'
  roles: string[]
  domain?: string
  notes?: string
  tags: string[]
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
  entityType: CoreEntityType | 'matter' | 'action' | 'record' | 'today'
  calmyId: string
}

export type RelationType =
  | 'supports' | 'blocks' | 'contradicts' | 'derived_from' | 'related_to'
  | 'belongs_to' | 'depends_on' | 'practices' | 'evidences' | 'part_of'

export interface Relation extends CoreEntityMeta {
  entityType: 'relation'
  from: EntityRef
  to: EntityRef
  relationType: RelationType
  directed: boolean
  confidence?: number
  sourceIds: string[]
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
  | Person | Relationship | SharedSpace | Cycle | Stage | Resource | Relation
  | Seed | Insight | Outcome | Practice | DailyState | Asset

export interface CoreEntityMutation {
  id: string
  entityType: CoreEntityType
  entityId: string
  operation: 'create' | 'update' | 'archive' | 'transition'
  commandId: string
  actor: CoreEntitySource
  sourceIds: string[]
  fromRevision: number
  toRevision: number
  occurredAt: number
  patch?: unknown
}

export interface CoreCommandMeta {
  commandId?: string
  actor?: CoreEntitySource
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
