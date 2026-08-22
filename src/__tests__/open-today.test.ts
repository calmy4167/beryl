import { beforeEach, describe, expect, it, vi } from 'vitest'

const repositories = vi.hoisted(() => ({
  todayGet: vi.fn(),
  actionListForDate: vi.fn(),
  matterList: vi.fn(),
  unifiedList: vi.fn()
}))

vi.mock('@/domain/today/repository', () => ({ todayAsyncRepository: { get: repositories.todayGet } }))
vi.mock('@/domain/action/repository', () => ({ actionAsyncRepository: { listForDate: repositories.actionListForDate } }))
vi.mock('@/domain/matter/repository', () => ({ matterAsyncRepository: { list: repositories.matterList } }))
vi.mock('@/domain/unified/repository', () => ({ unifiedAsyncRepository: { list: repositories.unifiedList } }))

import { openToday } from '@/application/use-cases/open-today'

describe('OpenToday application use case', () => {
  beforeEach(() => {
    repositories.todayGet.mockReset()
    repositories.actionListForDate.mockReset()
    repositories.matterList.mockReset()
    repositories.unifiedList.mockReset()
    repositories.todayGet.mockResolvedValue({ date: '2026-08-22', focusActionIds: [], revision: 1 })
    repositories.actionListForDate.mockResolvedValue([{ calmyId: 'a1', date: '2026-08-22' }])
    repositories.matterList.mockResolvedValue([{ calmyId: 'm1', status: 'active' }])
    repositories.unifiedList.mockImplementation(async (type: string) => {
      if (type === 'relationship') return [{ calmyId: 'r1', status: 'active' }, { calmyId: 'r2', status: 'ended' }]
      if (type === 'shared_space') return [{ calmyId: 's1', status: 'active' }, { calmyId: 's2', status: 'archived' }]
      return [{ calmyId: 'd1', date: '2026-08-22' }]
    })
  })

  it('opens the Today aggregate with only active context', async () => {
    const result = await openToday('2026-08-22')

    expect(result.plan.date).toBe('2026-08-22')
    expect(result.actions).toHaveLength(1)
    expect(result.matters).toHaveLength(1)
    expect(result.relationships.map(item => item.calmyId)).toEqual(['r1'])
    expect(result.sharedSpaces.map(item => item.calmyId)).toEqual(['s1'])
    expect(result.dailyState?.calmyId).toBe('d1')
  })

  it('passes the requested date and entity types to every repository', async () => {
    await openToday('2026-08-23')

    expect(repositories.todayGet).toHaveBeenCalledWith('2026-08-23')
    expect(repositories.actionListForDate).toHaveBeenCalledWith('2026-08-23')
    expect(repositories.matterList).toHaveBeenCalledWith()
    expect(repositories.unifiedList).toHaveBeenCalledWith('relationship')
    expect(repositories.unifiedList).toHaveBeenCalledWith('shared_space')
    expect(repositories.unifiedList).toHaveBeenCalledWith('daily_state')
  })

  it('leaves dailyState undefined when no state matches the requested date', async () => {
    repositories.unifiedList.mockImplementation(async (type: string) => {
      if (type === 'relationship') return []
      if (type === 'shared_space') return []
      return [{ calmyId: 'd1', date: '2026-08-22' }]
    })

    const result = await openToday('2026-08-23')

    expect(result.dailyState).toBeUndefined()
  })

  it('propagates a failed aggregate read instead of returning partial facts', async () => {
    const error = new Error('matter read failed')
    repositories.matterList.mockRejectedValue(error)

    await expect(openToday('2026-08-22')).rejects.toBe(error)
  })
})
