import type { DictionaryOption, PersonStatus } from './model'
import { PERSON_STATUSES } from './model'

export const PERSON_STATUS_DEFAULTS: Record<PersonStatus, string> = {
  active: '活跃',
  archived: '已归档',
}

function optionFor(status: PersonStatus, options: DictionaryOption[]): DictionaryOption | undefined {
  return options.find(option => option.module === 'person' && option.field === 'status' && option.systemKey === status && option.status === 'active')
}

export function personStatusLabel(status: PersonStatus, options: DictionaryOption[]): string {
  return optionFor(status, options)?.value || PERSON_STATUS_DEFAULTS[status]
}

export function orderedPersonStatuses(options: DictionaryOption[]): PersonStatus[] {
  return [...PERSON_STATUSES].sort((left, right) => {
    const leftOrder = optionFor(left, options)?.sortOrder ?? PERSON_STATUSES.indexOf(left) * 10
    const rightOrder = optionFor(right, options)?.sortOrder ?? PERSON_STATUSES.indexOf(right) * 10
    return leftOrder - rightOrder || PERSON_STATUSES.indexOf(left) - PERSON_STATUSES.indexOf(right)
  })
}
