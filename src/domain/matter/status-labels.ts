import type { DictionaryOption } from '@/domain/unified/model'
import { MATTER_STATUSES, type MatterStatus } from './model'

export const MATTER_STATUS_DEFAULTS: Record<MatterStatus, string> = {
  draft: '草稿',
  active: '进行中',
  paused: '已暂停',
  archived: '已结束',
}

function optionFor(status: MatterStatus, options: DictionaryOption[]): DictionaryOption | undefined {
  return options.find(option => option.module === 'matter' && option.field === 'status' && option.systemKey === status && option.status === 'active')
}

export function matterStatusLabel(status: MatterStatus, options: DictionaryOption[]): string {
  return optionFor(status, options)?.value || MATTER_STATUS_DEFAULTS[status]
}

export function orderedMatterStatuses(options: DictionaryOption[]): MatterStatus[] {
  return [...MATTER_STATUSES].sort((left, right) => {
    const leftOrder = optionFor(left, options)?.sortOrder ?? MATTER_STATUSES.indexOf(left) * 10
    const rightOrder = optionFor(right, options)?.sortOrder ?? MATTER_STATUSES.indexOf(right) * 10
    return leftOrder - rightOrder || MATTER_STATUSES.indexOf(left) - MATTER_STATUSES.indexOf(right)
  })
}
