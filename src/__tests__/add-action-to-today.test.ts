import { beforeEach, describe, expect, it, vi } from 'vitest'

const repositories = vi.hoisted(() => ({
  actionCreate: vi.fn(),
  todayUpdate: vi.fn()
}))

vi.mock('@/domain/action/repository', () => ({ actionAsyncRepository: { create: repositories.actionCreate } }))
vi.mock('@/domain/today/repository', () => ({ todayAsyncRepository: { update: repositories.todayUpdate } }))

import { addActionToToday } from '@/application/use-cases/add-action-to-today'
import type { TodayPlan } from '@/domain/today/model'

const plan: TodayPlan = {
  date: '2026-08-22', load: null, focusActionIds: ['existing'], why: '', mustProtect: [], letGo: [],
  review: { observation: '', analysis: '', adjustment: '', seed: '' }, revision: 4, updatedAt: 1
}

describe('AddActionToToday application use case', () => {
  beforeEach(() => { repositories.actionCreate.mockReset(); repositories.todayUpdate.mockReset() })

  it('creates an action and adds it to focus while capacity remains', async () => {
    const action = { calmyId: 'action-1', title: '完成确认', date: '2026-08-22' }
    const nextPlan = { ...plan, focusActionIds: ['existing', 'action-1'], revision: 5 }
    repositories.actionCreate.mockResolvedValue(action)
    repositories.todayUpdate.mockResolvedValue(nextPlan)

    await expect(addActionToToday({ title: '完成确认', date: '2026-08-22', plan })).resolves.toEqual({ action, plan: nextPlan, placedInFocus: true })
    expect(repositories.actionCreate).toHaveBeenCalledWith({ title: '完成确认', date: '2026-08-22', matterId: undefined })
    expect(repositories.todayUpdate).toHaveBeenCalledWith('2026-08-22', { focusActionIds: ['existing', 'action-1'] }, 4)
  })

  it('keeps the action saved as optional when focus plan update fails', async () => {
    const action = { calmyId: 'action-2', title: '候选行动', date: '2026-08-22' }
    const error = Object.assign(new Error('stale plan'), { code: 'REVISION_CONFLICT' })
    repositories.actionCreate.mockResolvedValue(action)
    repositories.todayUpdate.mockRejectedValue(error)

    await expect(addActionToToday({ title: '候选行动', date: '2026-08-22', plan: { ...plan, focusActionIds: ['a', 'b', 'c'] } }))
      .resolves.toEqual({ action, placedInFocus: false, planUpdateError: error })
  })

  it('does not attempt to update Today when action creation fails', async () => {
    const error = new Error('action write failed')
    repositories.actionCreate.mockRejectedValue(error)

    await expect(addActionToToday({ title: '无法保存', date: '2026-08-22', plan })).rejects.toBe(error)
    expect(repositories.todayUpdate).not.toHaveBeenCalled()
  })
})
