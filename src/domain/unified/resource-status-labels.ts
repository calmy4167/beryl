import type { DictionaryOption, ResourceStatus } from './model'
import { RESOURCE_STATUSES } from './model'

export const RESOURCE_STATUS_DEFAULTS: Record<ResourceStatus, string> = {
  active: '有效',
  expired: '已过期',
  retired: '已退休',
}

function optionFor(status: ResourceStatus, options: DictionaryOption[]): DictionaryOption | undefined {
  return options.find(option => option.module === 'resource' && option.field === 'status' && option.systemKey === status && option.status === 'active')
}

export function resourceStatusLabel(status: ResourceStatus, options: DictionaryOption[]): string {
  return optionFor(status, options)?.value || RESOURCE_STATUS_DEFAULTS[status]
}

export function orderedResourceStatuses(options: DictionaryOption[]): ResourceStatus[] {
  return [...RESOURCE_STATUSES].sort((left, right) => {
    const leftOrder = optionFor(left, options)?.sortOrder ?? RESOURCE_STATUSES.indexOf(left) * 10
    const rightOrder = optionFor(right, options)?.sortOrder ?? RESOURCE_STATUSES.indexOf(right) * 10
    return leftOrder - rightOrder || RESOURCE_STATUSES.indexOf(left) - RESOURCE_STATUSES.indexOf(right)
  })
}
