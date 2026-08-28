import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TodayPlan } from '@/domain/today/model'

const repository = vi.hoisted(() => ({ update: vi.fn() }))
vi.mock('@/domain/today/repository', () => ({ todayAsyncRepository: { update: repository.update } }))

import { completeReview } from '@/application/use-cases/complete-review'

const plan = { date: '2026-08-22', revision: 3, review: { observation: '发生了什么', analysis: '', adjustment: '', seed: '' } } as TodayPlan

describe('CompleteReview application use case', () => {
  beforeEach(() => repository.update.mockReset().mockResolvedValue(plan))

  it('saves a trimmed review with the expected revision', async () => {
    const result = await completeReview({ date: '2026-08-22', expectedRevision: 2, review: { observation: '  实际完成  ', analysis: '', adjustment: '', seed: '  明天继续  ' } })

    expect(repository.update).toHaveBeenCalledWith('2026-08-22', { review: { observation: '实际完成', analysis: '', adjustment: '', seed: '明天继续' } }, 2)
    expect(result).toEqual({ plan })
  })

  it('stores an explicit let-go list without changing the review boundary', async () => {
    await completeReview({ date: '2026-08-22', expectedRevision: 2, letGo: ['  不再追踪  ', '', '暂不展开'], review: { observation: '', analysis: '', adjustment: '', seed: '' } })

    expect(repository.update).toHaveBeenCalledWith('2026-08-22', {
      review: { observation: '', analysis: '', adjustment: '', seed: '' },
      letGo: ['不再追踪', '暂不展开'],
    }, 2)
  })

})
