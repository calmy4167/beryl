import { actionAsyncRepository } from '@/domain/action/repository'
import type { ActionItem } from '@/domain/action/model'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
import { todayAsyncRepository } from '@/domain/today/repository'
import type { TodayPlan } from '@/domain/today/model'
import { unifiedAsyncRepository } from '@/domain/unified/repository'
import type { DailyState, Relationship, SharedSpace } from '@/domain/unified/model'

export interface OpenTodayResult {
  plan: TodayPlan
  actions: ActionItem[]
  matters: Matter[]
  relationships: Relationship[]
  sharedSpaces: SharedSpace[]
  dailyState?: DailyState
}

/** Today 的只读聚合入口；页面不再直接编排多个 Repository。 */
export async function openToday(date: string): Promise<OpenTodayResult> {
  const [plan, actions, matters, relationships, sharedSpaces, dailyStates] = await Promise.all([
    todayAsyncRepository.get(date),
    actionAsyncRepository.listForDate(date),
    matterAsyncRepository.list(),
    unifiedAsyncRepository.list<Relationship>('relationship'),
    unifiedAsyncRepository.list<SharedSpace>('shared_space'),
    unifiedAsyncRepository.list<DailyState>('daily_state')
  ])
  return {
    plan,
    actions,
    matters,
    relationships: relationships.filter(item => item.status === 'active'),
    sharedSpaces: sharedSpaces.filter(item => item.status === 'active'),
    dailyState: dailyStates.find(item => item.date === date)
  }
}
