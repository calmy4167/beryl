import { actionAsyncRepository } from '@/domain/action/repository'
import type { ActionItem } from '@/domain/action/model'
import { todayAsyncRepository } from '@/domain/today/repository'
import type { TodayPlan } from '@/domain/today/model'

export interface AddActionToTodayInput {
  title: string
  date: string
  matterId?: string
  plan: TodayPlan
  focusLimit?: number
}

export interface AddActionToTodayResult {
  action: ActionItem
  plan?: TodayPlan
  placedInFocus: boolean
  planUpdateError?: unknown
}

/** 创建行动并尝试把它放入当天计划；跨仓储部分成功会被明确返回。 */
export async function addActionToToday(input: AddActionToTodayInput): Promise<AddActionToTodayResult> {
  const action = await actionAsyncRepository.create({ title: input.title, date: input.date, matterId: input.matterId })
  const focusLimit = input.focusLimit ?? 3
  const placedInFocus = input.plan.focusActionIds.length < focusLimit
  const focusActionIds = placedInFocus ? [...input.plan.focusActionIds, action.calmyId] : input.plan.focusActionIds
  try {
    const plan = await todayAsyncRepository.update(input.date, { focusActionIds }, input.plan.revision)
    return { action, plan, placedInFocus }
  } catch (planUpdateError) {
    return { action, placedInFocus: false, planUpdateError }
  }
}
