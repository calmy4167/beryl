import { ACTION_STATUSES, type ActionStatus } from './model'
import type { DictionaryOption } from '@/domain/unified/model'

export const ACTION_STATUS_DEFAULTS: Record<ActionStatus, { label: string; hint: string }> = {
  planned: { label: '待开始', hint: '还没有进入现实行动' },
  in_progress: { label: '进行中', hint: '正在现实中推进' },
  done: { label: '已完成', hint: '已经发生并可以离开' },
  skipped: { label: '已跳过', hint: '暂时不投入注意力' },
  cancelled: { label: '已取消', hint: '不再继续这一步' },
}

function optionFor(status: ActionStatus, options: DictionaryOption[]): DictionaryOption | undefined {
  return options.find(option => option.module === 'action' && option.field === 'status' && option.systemKey === status && option.status === 'active')
}

export function actionStatusLabel(status: ActionStatus, options: DictionaryOption[]): string {
  return optionFor(status, options)?.value || ACTION_STATUS_DEFAULTS[status].label
}

export function orderedActionStatuses(options: DictionaryOption[]): ActionStatus[] {
  const index = new Map<ActionStatus, number>(ACTION_STATUSES.map((status, position) => [status, position]))
  return [...ACTION_STATUSES].sort((left, right) => {
    const leftOrder = optionFor(left, options)?.sortOrder ?? (index.get(left) || 0) * 10
    const rightOrder = optionFor(right, options)?.sortOrder ?? (index.get(right) || 0) * 10
    return leftOrder - rightOrder || (index.get(left) || 0) - (index.get(right) || 0)
  })
}
