import { beforeEach, describe, expect, it } from 'vitest'
import { importOpenWorkspace, exportOpenWorkspace } from '@/core/content/open-format'
import { recordRepository } from '@/domain/record/repository'
import { unifiedFactories, unifiedRepository, type DailyState } from '@/domain/unified'

describe('reality extensions', () => {
  beforeEach(() => localStorage.clear())

  it('records negative changes without treating all records as waste', () => {
    const record = recordRepository.createNegative({ body: '刷视频逃避困难任务', impact: 'escape', matterId: 'matter-1' })

    expect(record.type).toBe('negative')
    expect(record.impact).toBe('escape')
    expect(recordRepository.find(record.calmyId)).toEqual(record)
  })

  it('keeps Outcome, Practice, and DailyState distinct in the unified domain', () => {
    const outcome = unifiedRepository.create(unifiedFactories.outcome({ actionId: 'action-1', summary: '完成了最小验证', status: 'observed', evidenceRecordIds: [] }))
    const practice = unifiedRepository.create(unifiedFactories.practice({ title: '先做最小验证', description: '先验证再扩展', status: 'candidate', matterIds: [], outcomeIds: [outcome.calmyId], evidenceIds: [] }))
    const daily = unifiedRepository.create(unifiedFactories.dailyState({ date: '2026-08-19', bodyState: 'tired', mentalState: 'heavy', load: 70, trajectory: 'recovering', protectedItems: [] }))

    expect(outcome.entityType).toBe('outcome')
    expect(practice.entityType).toBe('practice')
    expect(unifiedRepository.find<DailyState>('daily_state', daily.calmyId)?.load).toBe(70)
  })

  it('round-trips the negative record through the open format', () => {
    const record = recordRepository.createNegative({ body: '今天过度切换任务', impact: 'loss' })
    const workspace = exportOpenWorkspace({ records: [record] })
    const imported = importOpenWorkspace(workspace.files, workspace.assets)

    expect(imported.issues).toEqual([])
    expect(imported.entities[0]).toMatchObject({ type: 'negative', impact: 'loss', body: '今天过度切换任务' })
  })
})
