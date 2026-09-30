import type { DictionaryOption, InsightStatus } from './model'
import { INSIGHT_STATUSES } from './model'

export const INSIGHT_STATUS_DEFAULTS: Record<InsightStatus, string> = {
  draft: '待确认',
  confirmed: '已确认',
  retired: '已结束',
}

function optionFor(status: InsightStatus, options: DictionaryOption[]): DictionaryOption | undefined {
  return options.find(option => option.module === 'insight' && option.field === 'status' && option.systemKey === status && option.status === 'active')
}

export function insightStatusLabel(status: InsightStatus, options: DictionaryOption[]): string {
  return optionFor(status, options)?.value || INSIGHT_STATUS_DEFAULTS[status]
}

export function orderedInsightStatuses(options: DictionaryOption[]): InsightStatus[] {
  return [...INSIGHT_STATUSES].sort((left, right) => {
    const leftOrder = optionFor(left, options)?.sortOrder ?? INSIGHT_STATUSES.indexOf(left) * 10
    const rightOrder = optionFor(right, options)?.sortOrder ?? INSIGHT_STATUSES.indexOf(right) * 10
    return leftOrder - rightOrder || INSIGHT_STATUSES.indexOf(left) - INSIGHT_STATUSES.indexOf(right)
  })
}
