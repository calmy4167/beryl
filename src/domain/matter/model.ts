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
  status: MatterStatus
  currentStage: MatterStage
  trajectory: MatterTrajectory
  currentCycleId?: string
  evidenceIds: string[]
  createdAt: number
  updatedAt: number
  revision: number
}

export interface MatterCreateInput {
  title: string
  why?: string
  primaryContradiction?: string
  currentStage?: MatterStage
  trajectory?: MatterTrajectory
}

export interface MatterUpdatePatch {
  title?: string
  why?: string
  primaryContradiction?: string
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
