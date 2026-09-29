export const MATTER_STATUSES = ['draft', 'active', 'paused', 'archived'] as const
export type MatterStatus = typeof MATTER_STATUSES[number]

export const MATTER_STAGES = ['wood', 'fire', 'earth', 'metal', 'water'] as const
export type MatterStage = typeof MATTER_STAGES[number]

export const MATTER_TRAJECTORIES = ['advancing', 'stable', 'stalled', 'retreating', 'diverging', 'lost', 'recovering', 'restarting', 'unknown'] as const
export type MatterTrajectory = typeof MATTER_TRAJECTORIES[number]

export interface Matter {
  calmyId: string
  title: string
  why: string
  primaryContradiction: string
  /** Problem-driven learning context. Optional for backwards-compatible legacy Matters. */
  problem?: string
  desiredChange?: string
  progressEvidence?: string
  currentGap?: string
  nextTest?: string
  stopCondition?: string
  status: MatterStatus
  currentStage: MatterStage
  trajectory: MatterTrajectory
  currentCycleId?: string
  evidenceIds: string[]
  createdAt: number
  updatedAt: number
  revision: number
}

/** Canonical semantic view of a Matter. The Matter repository remains the sole fact store during migration. */
export interface Thing {
  entityType: 'thing'
  calmyId: string
  title: string
  why: string
  primaryContradiction: string
  problem?: string
  desiredChange?: string
  progressEvidence?: string
  currentGap?: string
  nextTest?: string
  stopCondition?: string
  status: MatterStatus
  currentStage: MatterStage
  trajectory: MatterTrajectory
  currentCycleId?: string
  evidenceIds: string[]
  createdAt: number
  updatedAt: number
  revision: number
  subjectPersonIds?: string[]
  /** Absent for legacy Matters unless mutation history provides attribution. */
  source?: import('@/domain/unified/model').CoreEntitySource
}

export interface MatterCreateInput {
  title: string
  why?: string
  primaryContradiction?: string
  problem?: string
  desiredChange?: string
  progressEvidence?: string
  currentGap?: string
  nextTest?: string
  stopCondition?: string
  currentStage?: MatterStage
  trajectory?: MatterTrajectory
}

export interface MatterUpdatePatch {
  title?: string
  why?: string
  primaryContradiction?: string
  problem?: string
  desiredChange?: string
  progressEvidence?: string
  currentGap?: string
  nextTest?: string
  stopCondition?: string
  currentStage?: MatterStage
  trajectory?: MatterTrajectory
  currentCycleId?: string
  evidenceIds?: string[]
}

export interface MatterMutation {
  id: string
  entity: 'matter'
  entityId: string
  operation: 'create' | 'update' | 'transition'
  commandId: string
  actor: 'user' | 'ai_assisted' | 'import' | 'sync'
  actorId?: string
  sourceIds: string[]
  fromRevision: number
  toRevision: number
  occurredAt: number
  patch?: unknown
}

export function thingFromMatter(matter: Matter, mutations: MatterMutation[] = []): Thing {
  const matchingMutations = mutations
    .filter(mutation => mutation.entity === 'matter' && mutation.entityId === matter.calmyId)
    .sort((a, b) => b.occurredAt - a.occurredAt)
  const source = matchingMutations[0]?.actor
  return {
    entityType: 'thing',
    calmyId: matter.calmyId,
    title: matter.title,
    why: matter.why,
    primaryContradiction: matter.primaryContradiction,
    problem: matter.problem,
    desiredChange: matter.desiredChange,
    progressEvidence: matter.progressEvidence,
    currentGap: matter.currentGap,
    nextTest: matter.nextTest,
    stopCondition: matter.stopCondition,
    status: matter.status,
    currentStage: matter.currentStage,
    trajectory: matter.trajectory,
    currentCycleId: matter.currentCycleId,
    evidenceIds: matter.evidenceIds.slice(),
    createdAt: matter.createdAt,
    updatedAt: matter.updatedAt,
    revision: matter.revision,
    source
  }
}

export function matterFromThing(thing: Thing): Matter {
  return {
    calmyId: thing.calmyId,
    title: thing.title,
    why: thing.why,
    primaryContradiction: thing.primaryContradiction,
    problem: thing.problem,
    desiredChange: thing.desiredChange,
    progressEvidence: thing.progressEvidence,
    currentGap: thing.currentGap,
    nextTest: thing.nextTest,
    stopCondition: thing.stopCondition,
    status: thing.status,
    currentStage: thing.currentStage,
    trajectory: thing.trajectory,
    currentCycleId: thing.currentCycleId,
    evidenceIds: thing.evidenceIds.slice(),
    createdAt: thing.createdAt,
    updatedAt: thing.updatedAt,
    revision: thing.revision
  }
}

export interface MatterCommandMeta {
  commandId?: string
  actor?: MatterMutation['actor']
  actorId?: string
  sourceIds?: string[]
  expectedRevision?: number
}

export type MatterErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'REVISION_CONFLICT'
  | 'DUPLICATE_COMMAND'

export class MatterDomainError extends Error {
  constructor(public readonly code: MatterErrorCode, message: string) {
    super(message)
    this.name = 'MatterDomainError'
  }
}

export function canTransitionMatter(from: MatterStatus, to: MatterStatus): boolean {
  if (from === to) return true
  if (from === 'draft') return to === 'active' || to === 'archived'
  if (from === 'active') return to === 'paused' || to === 'archived'
  if (from === 'paused') return to === 'active' || to === 'archived'
  if (from === 'archived') return to === 'paused'
  return false
}
