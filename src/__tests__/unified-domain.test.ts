import { beforeEach, describe, expect, it } from 'vitest'
import { CoreDomainError, unifiedFactories, unifiedRepository, type Relationship, type SharedSpace, type Stage } from '@/domain/unified'

describe('unified Personal OS domain', () => {
  beforeEach(() => localStorage.clear())

  it('creates a stable Person and records a mutation', () => {
    const person = unifiedRepository.create(unifiedFactories.person({ displayName: '林默', roles: ['partner'] }))

    expect(person.calmyId).toBeTruthy()
    expect(unifiedRepository.find('person', person.calmyId)).toMatchObject({ displayName: '林默', revision: 1 })
    expect(unifiedRepository.mutations('person', person.calmyId)).toHaveLength(1)
  })

  it('protects updates with expected revisions and preserves command idempotency', () => {
    const person = unifiedRepository.create(unifiedFactories.person({ displayName: '旧名称' }), { commandId: 'create-person' })
    const updated = unifiedRepository.update('person', person.calmyId, { displayName: '新名称' }, { commandId: 'rename-person', expectedRevision: 1 })
    const replay = unifiedRepository.update('person', person.calmyId, { displayName: '完全不同' }, { commandId: 'rename-person', expectedRevision: 1 })

    expect(replay).toEqual(updated)
    expect(() => unifiedRepository.update('person', person.calmyId, { displayName: '冲突' }, { expectedRevision: 1 })).toThrowError(CoreDomainError)
    expect(unifiedRepository.mutations('person', person.calmyId)).toHaveLength(2)
  })

  it('supports cycles and stages as first-class entities', () => {
    const cycle = unifiedRepository.create(unifiedFactories.cycle({
      matterId: 'matter-1', title: '重新建立节律', theme: '稳定作息', currentStage: 'wood',
      status: 'active', trajectory: 'recovering', stageIds: []
    }))
    const stage = unifiedRepository.create(unifiedFactories.stage({
      cycleId: cycle.calmyId, title: '观察现实', element: 'wood', status: 'active', actionIds: [], recordIds: []
    }))

    unifiedRepository.update('cycle', cycle.calmyId, { stageIds: [stage.calmyId] }, { expectedRevision: 1 })

    expect(unifiedRepository.find('cycle', cycle.calmyId)).toMatchObject({ stageIds: [stage.calmyId] })
    expect(unifiedRepository.find<Stage>('stage', stage.calmyId)?.cycleId).toBe(cycle.calmyId)
  })

  it('allows non-linear cycle and stage movement while rejecting invalid jumps', () => {
    const cycle = unifiedRepository.create(unifiedFactories.cycle({
      matterId: 'matter-2', title: '非线性周期', theme: '允许暂停和重开', currentStage: 'wood',
      status: 'planned', trajectory: 'stable', stageIds: []
    }))
    const stage = unifiedRepository.create(unifiedFactories.stage({
      cycleId: cycle.calmyId, title: '阶段一', element: 'wood', status: 'planned', actionIds: [], recordIds: []
    }))

    unifiedRepository.transitionCycle(cycle.calmyId, 'active', { expectedRevision: 1 })
    unifiedRepository.transitionCycle(cycle.calmyId, 'paused', { expectedRevision: 2 })
    unifiedRepository.transitionCycle(cycle.calmyId, 'active', { expectedRevision: 3 })
    unifiedRepository.transitionStage(stage.calmyId, 'active', { expectedRevision: 1 })
    unifiedRepository.transitionStage(stage.calmyId, 'completed', { expectedRevision: 2 })

    expect(unifiedRepository.find('cycle', cycle.calmyId)).toMatchObject({ status: 'active', revision: 4 })
    expect(unifiedRepository.find('stage', stage.calmyId)).toMatchObject({ status: 'completed', revision: 3 })
    expect(() => unifiedRepository.transitionCycle(cycle.calmyId, 'planned')).toThrowError(CoreDomainError)
  })

  it('binds stages to their cycle and exposes matter-scoped queries', () => {
    const cycle = unifiedRepository.createCycleForMatter({
      matterId: 'matter-3', title: '恢复节律', theme: '先观察再推进', currentStage: 'wood',
      status: 'planned', trajectory: 'recovering', stageIds: []
    })
    const stage = unifiedRepository.createStageForCycle({
      cycleId: cycle.calmyId, title: '观察现实', element: 'wood', status: 'planned', actionIds: [], recordIds: [], order: 1
    })

    expect(unifiedRepository.listCyclesForMatter('matter-3')).toHaveLength(1)
    expect(unifiedRepository.listStagesForCycle(cycle.calmyId)).toMatchObject([{ calmyId: stage.calmyId, order: 1 }])
    expect(unifiedRepository.find<typeof cycle>('cycle', cycle.calmyId)?.stageIds).toEqual([stage.calmyId])
  })

  it('rejects a stage when its parent cycle does not exist', () => {
    expect(() => unifiedRepository.createStageForCycle({
      cycleId: 'missing-cycle', title: '孤立阶段', element: 'wood', status: 'planned', actionIds: [], recordIds: []
    })).toThrowError(CoreDomainError)
  })

  it('keeps an Outcome distinct from a reusable Practice and preserves their link', () => {
    const outcome = unifiedRepository.createOutcomeForAction({
      actionId: 'action-1', matterId: 'matter-4', summary: '完成最小验证', result: '验证通过', status: 'observed', evidenceRecordIds: []
    })
    const practice = unifiedRepository.createPracticeFromOutcome({
      title: '先做最小验证', description: '先验证现实，再决定是否扩展', status: 'candidate', matterIds: ['matter-4'], outcomeIds: [outcome.calmyId], evidenceIds: []
    })

    expect(unifiedRepository.listOutcomesForAction('action-1')).toMatchObject([{ calmyId: outcome.calmyId, summary: '完成最小验证' }])
    expect(unifiedRepository.listPracticesForOutcome(outcome.calmyId)).toMatchObject([{ calmyId: practice.calmyId, title: '先做最小验证' }])
  })

  it('rejects a Practice without a valid Outcome reference', () => {
    expect(() => unifiedRepository.createPracticeFromOutcome({
      title: '没有来源的做法', description: '不应直接伪装成可复用经验', status: 'candidate', matterIds: [], outcomeIds: ['missing-outcome'], evidenceIds: []
    })).toThrowError(CoreDomainError)
  })

  it('keeps relationship and shared-space boundaries editable and matter-queryable', () => {
    const relationship = unifiedRepository.create(unifiedFactories.relationship({
      personAId: 'person-a', personBId: 'person-b', label: '伙伴', status: 'active',
      boundary: '先确认节律再推进', rhythm: '每周一次', blockedMatterIds: ['matter-blocked'], allowedMatterIds: ['matter-allowed'],
      sharedSpaceIds: [], matterIds: ['matter-shared'], evidenceIds: []
    }))
    const space = unifiedRepository.create(unifiedFactories.sharedSpace({
      title: '家庭空间', status: 'active', purpose: '共同生活', boundary: '需要协商',
      blockedMatterIds: ['matter-blocked'], allowedMatterIds: ['matter-allowed'], memberIds: ['person-a', 'person-b'], relationshipIds: [relationship.calmyId], matterIds: ['matter-shared']
    }))

    const updated = unifiedRepository.update<typeof relationship>('relationship', relationship.calmyId, { blockedMatterIds: ['matter-other'] }, { expectedRevision: 1 })

    expect(updated.blockedMatterIds).toEqual(['matter-other'])
    expect(unifiedRepository.listRelationshipsForMatter('matter-shared')).toHaveLength(1)
    expect(unifiedRepository.listRelationshipsForMatter('matter-blocked')).toHaveLength(0)
    expect(unifiedRepository.listRelationshipsForMatter('matter-allowed')).toEqual([expect.objectContaining({ calmyId: relationship.calmyId, allowedMatterIds: ['matter-allowed'] })])
    expect(unifiedRepository.listSharedSpacesForMatter('matter-blocked')).toEqual([])
    expect(unifiedRepository.listSharedSpacesForMatter('matter-shared')).toEqual([expect.objectContaining({ calmyId: space.calmyId, matterIds: ['matter-shared'], relationshipIds: [relationship.calmyId] })])
    expect(unifiedRepository.mutations('relationship', relationship.calmyId)).toHaveLength(2)
  })

  it('does not expose archived social context to active matter queries', () => {
    const relationship = unifiedRepository.create(unifiedFactories.relationship({
      personAId: 'person-a', personBId: 'person-b', label: '已结束关系', status: 'ended', blockedMatterIds: ['matter-1'],
      sharedSpaceIds: [], matterIds: [], evidenceIds: []
    }))
    const space = unifiedRepository.create(unifiedFactories.sharedSpace({
      title: '已归档空间', status: 'archived', blockedMatterIds: ['matter-1'], memberIds: ['person-a'], relationshipIds: [], matterIds: []
    }))

    expect(unifiedRepository.listRelationshipsForMatter('matter-1')).toEqual([])
    expect(unifiedRepository.listSharedSpacesForMatter('matter-1')).toEqual([])
    expect(unifiedRepository.find<Relationship>('relationship', relationship.calmyId)?.status).toBe('ended')
    expect(unifiedRepository.find<SharedSpace>('shared_space', space.calmyId)?.status).toBe('archived')
  })
})
