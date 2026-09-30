import type { CaptureStatus } from '@/domain/capture/model'
import { CAPTURE_STATUSES } from '@/domain/capture/model'
import type { DictionaryOption } from './model'

export const CAPTURE_STATUS_DEFAULTS: Record<CaptureStatus, string> = {
  inbox: '待处理',
  suggested: '有建议',
  accepted: '已处理',
  rejected: '建议已忽略',
  archived: '已放下',
}

function optionFor(status: CaptureStatus, options: DictionaryOption[]): DictionaryOption | undefined {
  return options.find(option => option.module === 'capture' && option.field === 'status' && option.systemKey === status && option.status === 'active')
}

export function captureStatusLabel(status: CaptureStatus, options: DictionaryOption[]): string {
  return optionFor(status, options)?.value || CAPTURE_STATUS_DEFAULTS[status]
}

export function orderedCaptureStatuses(options: DictionaryOption[]): CaptureStatus[] {
  return [...CAPTURE_STATUSES].sort((left, right) => {
    const leftOrder = optionFor(left, options)?.sortOrder ?? CAPTURE_STATUSES.indexOf(left) * 10
    const rightOrder = optionFor(right, options)?.sortOrder ?? CAPTURE_STATUSES.indexOf(right) * 10
    return leftOrder - rightOrder || CAPTURE_STATUSES.indexOf(left) - CAPTURE_STATUSES.indexOf(right)
  })
}
