import type { Trajectory } from '@/domain/unified/model'

export type ConstraintKind = 'body_capacity' | 'mental_load' | 'time_window' | 'matter_competition' | 'protected_space' | 'resource_availability' | 'trajectory_conflict' | 'relationship_boundary' | 'shared_space_conflict'
export type ActionIntensity = 'minimum' | 'normal' | 'high'

export interface ConstraintResource {
  resourceId: string
  label: string
  available: boolean
}

export interface ConstraintBoundary {
  boundaryId: string
  label: string
  blockedMatterIds?: string[]
  allowedMatterIds?: string[]
}

export interface ConstraintActionCandidate {
  actionId: string
  title: string
  estimatedMinutes: number
  intensity: ActionIntensity
  matterId?: string
  trajectory?: Trajectory
  protected?: boolean
  requiredResourceIds?: string[]
  relationshipIds?: string[]
  sharedSpaceIds?: string[]
}

export interface ConstraintContext {
  bodyState: 'good' | 'normal' | 'tired' | 'bad'
  mentalState: 'clear' | 'normal' | 'heavy' | 'overloaded'
  load: number
  availableMinutes: number
  protectedMinutes?: number
  actionCandidates: ConstraintActionCandidate[]
  competingMatterIds?: string[]
  preferredTrajectory?: Trajectory
  resources?: ConstraintResource[]
  relationshipBoundaries?: ConstraintBoundary[]
  sharedSpaceBoundaries?: ConstraintBoundary[]
}

export interface ConstraintFinding {
  id: string
  kind: ConstraintKind
  severity: 'notice' | 'warning' | 'critical'
  actionIds: string[]
  evidence: string[]
  explanation: string
  minimumAdjustment: string
  minimumActionId?: string
}

export interface ConstraintEvaluation {
  findings: ConstraintFinding[]
  suggestedActionIds: string[]
  reducedIntensity: boolean
}
