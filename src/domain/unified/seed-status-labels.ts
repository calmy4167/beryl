import type { DictionaryOption, SeedStatus } from './model'
import { SEED_STATUSES } from './model'

export const SEED_STATUS_DEFAULTS: Record<SeedStatus, string> = {
  open: '待探索',
  cultivating: '培育中',
  promoted: '已转为行动',
  retired: '已退休',
}

function optionFor(status: SeedStatus, options: DictionaryOption[]): DictionaryOption | undefined {
  return options.find(option => option.module === 'seed' && option.field === 'status' && option.systemKey === status && option.status === 'active')
}

export function seedStatusLabel(status: SeedStatus, options: DictionaryOption[]): string {
  return optionFor(status, options)?.value || SEED_STATUS_DEFAULTS[status]
}

export function orderedSeedStatuses(options: DictionaryOption[]): SeedStatus[] {
  return [...SEED_STATUSES].sort((left, right) => {
    const leftOrder = optionFor(left, options)?.sortOrder ?? SEED_STATUSES.indexOf(left) * 10
    const rightOrder = optionFor(right, options)?.sortOrder ?? SEED_STATUSES.indexOf(right) * 10
    return leftOrder - rightOrder || SEED_STATUSES.indexOf(left) - SEED_STATUSES.indexOf(right)
  })
}
