import { beforeEach, describe, expect, it } from 'vitest'
import { RecordDomainError } from '@/domain/record/model'
import { recordRepository } from '@/domain/record/repository'
import { unifiedRepository } from '@/domain/unified'

describe('recordRepository', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stores a reality fact with occurredAt separate from createdAt', () => {
    const occurredAt = Date.now() - 60_000
    const record = recordRepository.create({ body: '昨晚学习 40 分钟', occurredAt })

    expect(record.type).toBe('fact')
    expect(record.occurredAt).toBe(occurredAt)
    expect(record.createdAt).toBeGreaterThanOrEqual(occurredAt)
    expect(recordRepository.revisions(record.calmyId)).toHaveLength(1)
  })

  it('requires evidence for AI observations', () => {
    expect(() => recordRepository.create({ type: 'observation', source: 'ai', body: '可能睡眠影响学习' })).toThrowError(RecordDomainError)
    expect(recordRepository.list()).toHaveLength(0)
  })

  it('preserves revisions when a fact is corrected', () => {
    const record = recordRepository.create({ body: '学习 20 分钟' })
    const revised = recordRepository.revise(record.calmyId, '学习 40 分钟', '补充真实用时', 'user', 1)

    expect(revised.body).toBe('学习 40 分钟')
    expect(revised.revision).toBe(2)
    expect(recordRepository.revisions(record.calmyId).map(item => item.body)).toEqual(['学习 20 分钟', '学习 40 分钟'])
  })

  it('rejects stale corrections instead of overwriting a newer revision', () => {
    const record = recordRepository.create({ body: '原始记录' })
    recordRepository.revise(record.calmyId, '第一次修订', '修正', 'user', 1)

    expect(() => recordRepository.revise(record.calmyId, '过期修订', '过期', 'user', 1)).toThrowError(/revision/)
    expect(recordRepository.find(record.calmyId)?.body).toBe('第一次修订')
  })

  it('redacts content without deleting the record identity or history', () => {
    const record = recordRepository.create({ body: '包含隐私的现实记录' })
    const redacted = recordRepository.redact(record.calmyId, '用户要求隐藏', 1)

    expect(redacted.body).toBe('[已隐藏]')
    expect(redacted.redactedAt).toBeTruthy()
    expect(recordRepository.find(record.calmyId)?.calmyId).toBe(record.calmyId)
    expect(recordRepository.revisions(record.calmyId)).toHaveLength(2)
  })

  it('links a Record to its Stage and derives the owning Cycle and Matter', () => {
    const cycle = unifiedRepository.createCycleForMatter({
      matterId: 'matter-stage-source', title: '恢复周期', theme: '恢复节奏', currentStage: 'wood',
      status: 'active', trajectory: 'stable', stageIds: []
    })
    const stage = unifiedRepository.createStageForCycle({
      cycleId: cycle.calmyId, title: '观察现实', element: 'wood', status: 'active', actionIds: [], recordIds: [], order: 1
    })

    const record = recordRepository.create({ body: '连续三天在 23:00 前入睡', stageId: stage.calmyId })

    expect(record).toMatchObject({ matterId: 'matter-stage-source', cycleId: cycle.calmyId, stageId: stage.calmyId })
    expect(recordRepository.listForMatter('matter-stage-source')).toEqual([record])
    expect(recordRepository.listForCycle(cycle.calmyId)).toEqual([record])
    expect(recordRepository.listForStage(stage.calmyId)).toEqual([record])
    expect(unifiedRepository.find<typeof stage>('stage', stage.calmyId)?.recordIds).toContain(record.calmyId)
    expect(recordRepository.history(record.calmyId)[0]).toMatchObject({ stageId: stage.calmyId, cycleId: cycle.calmyId })
  })

  it('keeps Records from parallel Cycles isolated and rejects mismatched source ownership', () => {
    const firstCycle = unifiedRepository.createCycleForMatter({
      matterId: 'matter-parallel', title: '周期 A', theme: 'A', currentStage: 'wood', status: 'active', trajectory: 'stable', stageIds: []
    })
    const secondCycle = unifiedRepository.createCycleForMatter({
      matterId: 'matter-parallel', title: '周期 B', theme: 'B', currentStage: 'fire', status: 'active', trajectory: 'stable', stageIds: []
    })
    const firstStage = unifiedRepository.createStageForCycle({
      cycleId: firstCycle.calmyId, title: 'A 阶段', element: 'wood', status: 'active', actionIds: [], recordIds: [], order: 1
    })
    const secondStage = unifiedRepository.createStageForCycle({
      cycleId: secondCycle.calmyId, title: 'B 阶段', element: 'fire', status: 'active', actionIds: [], recordIds: [], order: 1
    })
    const firstRecord = recordRepository.create({ body: 'A 的现实证据', stageId: firstStage.calmyId })
    const secondRecord = recordRepository.create({ body: 'B 的现实证据', stageId: secondStage.calmyId })

    expect(recordRepository.listForCycle(firstCycle.calmyId)).toEqual([firstRecord])
    expect(recordRepository.listForStage(secondStage.calmyId)).toEqual([secondRecord])
    expect(() => recordRepository.create({ body: '错误归属', matterId: 'other-matter', stageId: firstStage.calmyId })).toThrowError(/does not belong to Matter/)
  })

  it('moves the reverse Stage index when an imported Record changes source Stage', () => {
    const firstCycle = unifiedRepository.createCycleForMatter({
      matterId: 'matter-import-move', title: '旧周期', theme: '旧', currentStage: 'wood', status: 'active', trajectory: 'stable', stageIds: []
    })
    const secondCycle = unifiedRepository.createCycleForMatter({
      matterId: 'matter-import-move', title: '新周期', theme: '新', currentStage: 'fire', status: 'active', trajectory: 'stable', stageIds: []
    })
    const firstStage = unifiedRepository.createStageForCycle({
      cycleId: firstCycle.calmyId, title: '旧阶段', element: 'wood', status: 'active', actionIds: [], recordIds: [], order: 1
    })
    const secondStage = unifiedRepository.createStageForCycle({
      cycleId: secondCycle.calmyId, title: '新阶段', element: 'fire', status: 'active', actionIds: [], recordIds: [], order: 1
    })
    const record = recordRepository.create({ body: '来源待迁移', stageId: firstStage.calmyId })

    recordRepository.replaceImported({ ...record, body: '来源已迁移', cycleId: secondCycle.calmyId, stageId: secondStage.calmyId, revision: 2, updatedAt: record.updatedAt + 1 })

    expect(unifiedRepository.find<typeof firstStage>('stage', firstStage.calmyId)?.recordIds).not.toContain(record.calmyId)
    expect(unifiedRepository.find<typeof secondStage>('stage', secondStage.calmyId)?.recordIds).toContain(record.calmyId)
    expect(recordRepository.listForStage(secondStage.calmyId).map(item => item.body)).toEqual(['来源已迁移'])
  })
})
