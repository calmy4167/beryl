import type { DictionaryOption } from '@/domain/unified/model'

export const GOAL_STATUSES = ['open', 'done'] as const
export type GoalStatus = typeof GOAL_STATUSES[number]

export const GOAL_STATUS_DEFAULTS: Record<GoalStatus, string> = {
  open: '进行中',
  done: '已完成',
}

function optionFor(status: GoalStatus, options: DictionaryOption[]): DictionaryOption | undefined {
  return options.find(option => option.module === 'goal' && option.field === 'status' && option.systemKey === status && option.status === 'active')
}

export function goalStatusLabel(status: GoalStatus, options: DictionaryOption[]): string {
  return optionFor(status, options)?.value || GOAL_STATUS_DEFAULTS[status]
}

export function orderedGoalStatuses(options: DictionaryOption[]): GoalStatus[] {
  return [...GOAL_STATUSES].sort((left, right) => {
    const leftOrder = optionFor(left, options)?.sortOrder ?? GOAL_STATUSES.indexOf(left) * 10
    const rightOrder = optionFor(right, options)?.sortOrder ?? GOAL_STATUSES.indexOf(right) * 10
    return leftOrder - rightOrder || GOAL_STATUSES.indexOf(left) - GOAL_STATUSES.indexOf(right)
  })
}
