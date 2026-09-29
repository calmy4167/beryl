import { beforeEach, describe, expect, it } from 'vitest'
import { matterRepository } from '@/domain/matter/repository'
import { createCollaborativeSharedSpace, listRealityActivity, updateSharedMatter } from '@/domain/social/collaboration'
import { recordRepository } from '@/domain/record/repository'
import { unifiedFactories, unifiedRepository } from '@/domain/unified'

describe('Reality activity history compatibility', () => {
  beforeEach(() => localStorage.clear())

  it('preserves each history source and distinguishes a RealityRecord from mutations', () => {
    const matter = matterRepository.create({ title: '历史投影' })
    const shared = createCollaborativeSharedSpace({
      title: '历史空间', status: 'active', memberIds: ['history-owner'], relationshipIds: [], matterIds: [matter.calmyId]
    }, 'history-owner')
    updateSharedMatter('shared_space', shared.calmyId, matter.calmyId, { why: '共同修订' }, matter.revision, 'history-owner')
    const record = recordRepository.create({ body: '医院确认复诊时间', matterId: matter.calmyId, occurredAt: 50 })
    const person = unifiedRepository.create(unifiedFactories.person({ displayName: '历史人物' }))

    const thingHistory = listRealityActivity({ entityType: 'thing', calmyId: matter.calmyId })
    const personHistory = listRealityActivity({ entityType: 'person', calmyId: person.calmyId })
    const sources = [...thingHistory, ...personHistory]

    expect(sources.map(item => item.source)).toEqual(expect.arrayContaining([
      'matter_mutation', 'core_entity_mutation', 'shared_audit', 'reality_record'
    ]))
    expect(thingHistory.find(item => item.source === 'reality_record')).toMatchObject({
      originalId: record.calmyId, operation: 'recorded', recordRevision: 1, recordSource: 'user', body: '医院确认复诊时间'
    })
    expect(thingHistory.find(item => item.source === 'matter_mutation')).toMatchObject({
      actor: 'user', actorUserId: 'local-user', fromRevision: 0, toRevision: 1
    })
    expect(thingHistory.find(item => item.source === 'shared_audit')).toMatchObject({ actorUserId: 'history-owner' })
    expect(personHistory.find(item => item.source === 'core_entity_mutation')).toMatchObject({
      actor: 'user', actorUserId: 'local-user', fromRevision: 0, toRevision: 1
    })
  })
})
