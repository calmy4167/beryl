import { beforeEach, describe, expect, it } from 'vitest'
import { actionRepository } from '@/domain/action/repository'
import { captureRepository } from '@/domain/capture'
import { matterRepository } from '@/domain/matter/repository'
import { recordRepository } from '@/domain/record/repository'
import { searchAll } from '@/domain/search'
import { todayRepository } from '@/domain/today/repository'
import { unifiedFactories, unifiedRepository } from '@/domain/unified'

describe('global search query', () => {
  beforeEach(() => localStorage.clear())

  it('finds legacy and unified entities by title and body text', () => {
    const matter = matterRepository.create({ title: '供应商交付', why: '需要确认新的交付节奏' })
    const action = actionRepository.create({ title: '联系供应商', date: '2026-08-19', matterId: matter.calmyId })
    const record = recordRepository.create({ body: '供应商回复了交付时间' })
    const person = unifiedRepository.create(unifiedFactories.person({ displayName: '供应商联系人' }))
    const capture = captureRepository.create('供应商的报价需要复核')

    const results = searchAll('供应商', 50)

    expect(results.map(item => item.type)).toEqual(expect.arrayContaining(['matter', 'action', 'record', 'person', 'capture']))
    expect(results.find(item => item.id === matter.calmyId)).toMatchObject({ type: 'matter', route: `/app/matters/${matter.calmyId}` })
    expect(results.find(item => item.id === action.calmyId)).toMatchObject({ type: 'action', route: `/app/matters/${matter.calmyId}` })
    expect(results.find(item => item.id === record.calmyId)).toMatchObject({ type: 'record', route: '/app/today' })
    expect(results.find(item => item.id === person.calmyId)).toMatchObject({ type: 'person', route: '/app/people' })
    expect(results.find(item => item.id === capture.calmyId)).toMatchObject({ type: 'capture', route: '/app/capture' })
  })

  it('ranks a title match above a body-only match and supports case-insensitive terms', () => {
    const titleMatch = matterRepository.create({ title: 'Supplier decision' })
    const bodyMatch = matterRepository.create({ title: '普通事项', why: 'supplier decision is still open' })

    const results = searchAll('SUPPLIER decision')

    expect(results[0]).toMatchObject({ id: titleMatch.calmyId, title: 'Supplier decision', score: 18 })
    expect(results.some(item => item.id === bodyMatch.calmyId)).toBe(true)
  })

  it('routes linked cycles, stages and outcomes back to their matter', () => {
    const matter = matterRepository.create({ title: '恢复节律' })
    const cycle = unifiedRepository.createCycleForMatter({
      matterId: matter.calmyId, title: '恢复周期', theme: '先观察再推进', currentStage: 'wood', status: 'active', trajectory: 'recovering', stageIds: []
    })
    const stage = unifiedRepository.createStageForCycle({
      cycleId: cycle.calmyId, title: '观察阶段', element: 'wood', status: 'active', actionIds: [], recordIds: []
    })
    const action = actionRepository.create({ title: '完成观察', date: '2026-08-19', matterId: matter.calmyId })
    const outcome = unifiedRepository.createOutcomeForAction({ actionId: action.calmyId, matterId: matter.calmyId, summary: '确认节律变化', status: 'observed', evidenceRecordIds: [] })

    expect(unifiedRepository.list('outcome')).toHaveLength(1)
    expect(searchAll('outcome', 50).map(item => item.id)).toContain(outcome.calmyId)
    expect(searchAll('恢复周期')[0]).toMatchObject({ id: cycle.calmyId, route: `/app/matters/${matter.calmyId}` })
    expect(searchAll('观察阶段')[0]).toMatchObject({ id: stage.calmyId, route: `/app/matters/${matter.calmyId}` })
    expect(searchAll('节律变化')[0]).toMatchObject({ id: outcome.calmyId, route: `/app/matters/${matter.calmyId}` })
  })

  it('searches Today plans, returns recent empty-query results, and respects the limit', () => {
    const today = todayRepository.get('2026-08-19')
    todayRepository.update(today.date, { why: '今天保护深度工作' })
    captureRepository.create('最后一条收集')

    expect(searchAll('深度工作')[0]).toMatchObject({ type: 'today', id: today.date, route: '/app/today' })
    expect(searchAll('   ', 2)).toHaveLength(2)
    expect(searchAll('不存在的词')).toEqual([])
  })
})
