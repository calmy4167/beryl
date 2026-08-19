export const ACTION_STATUSES = ['planned', 'in_progress', 'done', 'skipped', 'cancelled'] as const
export type ActionStatus = typeof ACTION_STATUSES[number]

export interface ActionItem {
  calmyId: string
  title: string
  date: string
  status: ActionStatus
  matterId?: string
  cycleId?: string
  resultNote?: string
  createdAt: number
  updatedAt: number
  revision: number
}

export interface ActionCreateInput {
  title: string
  date: string
  matterId?: string
  cycleId?: string
}

export class ActionDomainError extends Error {
  constructor(public readonly code: 'VALIDATION_FAILED' | 'NOT_FOUND' | 'INVALID_TRANSITION' | 'REVISION_CONFLICT', message: string) {
    super(message)
    this.name = 'ActionDomainError'
  }
}

export function canTransitionAction(from: ActionStatus, to: ActionStatus): boolean {
  if (from === to) return true
  if (from === 'planned') return to === 'in_progress' || to === 'done' || to === 'skipped' || to === 'cancelled'
  if (from === 'in_progress') return to === 'done' || to === 'skipped' || to === 'cancelled'
  if (from === 'skipped' || from === 'cancelled') return to === 'planned'
  return false
}
