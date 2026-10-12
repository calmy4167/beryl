import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { actionAsyncRepository } from '@/domain/action/repository'
import { matterAsyncRepository, matterRepository } from '@/domain/matter/repository'
import { createCollaborativeSharedSpace, listRealityActivity, listRealityActivityAsync, updateSharedMatter } from '@/domain/social/collaboration'
import { recordAsyncRepository, recordRepository } from '@/domain/record/repository'
import { unifiedAsyncRepository, unifiedFactories, unifiedRepository } from '@/domain/unified'
import { setActiveAccount } from '@/core/account-context'
import { resetStoreCache } from '@/core/storage'

describe('Reality activity history compatibility', () => {
  beforeEach(() => { setActiveAccount('reality-history-test-user'); localStorage.clear(); resetStoreCache() })
  afterEach(() => setActiveAccount(null))

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

  it('reads durable object mutations and RealityRecords without merging them', async () => {
    const matter = await matterAsyncRepository.create({ title: '耐久历史投影' })
    const record = await recordAsyncRepository.create({ body: '异步复诊结果', matterId: matter.calmyId, occurredAt: 60 })
    await recordAsyncRepository.revise(record.calmyId, '异步复诊时间修正', '医院来电修正', 'user', record.revision, 'history-owner')
    await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '耐久历史人物' }))

    const activity = await listRealityActivityAsync({ entityType: 'thing', calmyId: matter.calmyId })
    expect(activity).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'matter_mutation', entityRef: { entityType: 'thing', calmyId: matter.calmyId } }),
      expect.objectContaining({ source: 'reality_record', originalId: record.calmyId, operation: 'recorded', body: '异步复诊时间修正' })
    ]))
    expect(activity.find(item => item.originalId === record.calmyId)).not.toHaveProperty('fromRevision')
    expect(activity).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'record_revision', originalId: expect.any(String), entityRef: { entityType: 'record', calmyId: record.calmyId }, recordRevision: 1, body: '异步复诊结果' }),
      expect.objectContaining({ source: 'record_revision', entityRef: { entityType: 'record', calmyId: record.calmyId }, recordRevision: 2, body: '异步复诊时间修正', actorUserId: 'history-owner', reason: '医院来电修正' })
    ]))
  })

  it('does not mix mutation history for different entity types that share an imported stable ID', async () => {
    const sharedId = 'imported-id-collision'
    const person = { ...unifiedFactories.person({ displayName: '历史人物' }), calmyId: sharedId }
    const relationship = { ...unifiedFactories.relationship({
      personAId: 'person-a', personBId: 'person-b', label: '历史关系', status: 'active',
      sharedSpaceIds: [], matterIds: [], evidenceIds: []
    }), calmyId: sharedId }
    await unifiedAsyncRepository.importEntity(person)
    await unifiedAsyncRepository.importEntity(relationship)
    await unifiedAsyncRepository.update('person', sharedId, { displayName: '更新人物' }, { expectedRevision: 1, commandId: 'history-person-update' })
    await unifiedAsyncRepository.update('relationship', sharedId, { label: '更新关系' }, { expectedRevision: 1, commandId: 'history-relationship-update' })

    const activity = await listRealityActivityAsync({ entityType: 'person', calmyId: sharedId })

    expect(activity.length).toBeGreaterThan(0)
    expect(activity.every(item => item.entityRef.entityType === 'person')).toBe(true)
    expect(activity.map(item => item.operation)).toEqual(expect.arrayContaining(['create', 'update']))
  })

  it('projects durable DailyState revisions as readable snapshots', async () => {
    const state = await unifiedAsyncRepository.create(unifiedFactories.dailyState({
      date: '2026-10-02', bodyState: 'normal', mentalState: 'clear', load: 35,
      trajectory: 'advancing', protectedItems: [],
      ownership: { createdByUserId: 'daily-owner', ownerRef: { type: 'user', id: 'daily-owner' }, stewardRefs: [], privacy: 'private' }
    }))
    await unifiedAsyncRepository.update('daily_state', state.calmyId, {
      bodyState: 'tired', mentalState: 'heavy', load: 70, trajectory: 'recovering'
    }, { expectedRevision: state.revision, actorId: 'daily-owner' })

    const activity = await listRealityActivityAsync({ entityType: 'daily_state', calmyId: state.calmyId })

    expect(activity).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'daily_state_revision', originalId: `${state.calmyId}#2`, operation: 'updated',
        fromRevision: 1, toRevision: 2, actorUserId: 'daily-owner',
        patch: expect.objectContaining({ bodyState: 'tired', mentalState: 'heavy', load: 70, trajectory: 'recovering' })
      })
    ]))
  })

  it('retains complete before and after values for canonical Core, Matter, and Action revisions', async () => {
    const person = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '旧人物名' }))
    const updatedPerson = await unifiedAsyncRepository.update('person', person.calmyId, { displayName: '新人物名' }, { expectedRevision: person.revision, actorId: 'history-user' })
    const matter = await matterAsyncRepository.create({ title: '旧处境名', why: '旧原因' })
    const updatedMatter = await matterAsyncRepository.update(matter.calmyId, { title: '新处境名' }, { expectedRevision: matter.revision, actorId: 'history-user' })
    const action = await actionAsyncRepository.create({ title: '旧行动名', date: '2026-10-02' })
    const updatedAction = await actionAsyncRepository.update(action.calmyId, { title: '新行动名' }, { expectedRevision: action.revision, actorId: 'history-user' })
    await unifiedAsyncRepository.update('person', person.calmyId, { notes: '第二次变更' }, { expectedRevision: updatedPerson.revision, actorId: 'history-user' })

    const coreMutation = (await unifiedAsyncRepository.mutations('person', person.calmyId)).find(item => item.operation === 'update')
    const matterMutation = (await matterAsyncRepository.mutations(matter.calmyId)).find(item => item.operation === 'update')
    const actionMutation = (await actionAsyncRepository.mutations()).find(item => item.entityId === action.calmyId && item.operation === 'update')

    expect(coreMutation).toMatchObject({ previousSnapshot: expect.objectContaining({ displayName: '旧人物名' }), snapshot: expect.objectContaining({ displayName: '新人物名' }) })
    expect(matterMutation).toMatchObject({ previousSnapshot: expect.objectContaining({ title: '旧处境名', why: '旧原因' }), snapshot: expect.objectContaining({ title: '新处境名', why: '旧原因' }) })
    expect(actionMutation).toMatchObject({ previousSnapshot: expect.objectContaining({ title: '旧行动名' }), snapshot: expect.objectContaining({ title: '新行动名' }) })
    expect((updatedPerson as unknown as { revisionHistory?: Array<{ previousSnapshot?: Record<string, unknown>; snapshot?: Record<string, unknown> }> }).revisionHistory?.at(-1)).toMatchObject({ previousSnapshot: expect.objectContaining({ displayName: '旧人物名' }), snapshot: expect.objectContaining({ displayName: '新人物名' }) })
    expect(coreMutation?.snapshot).not.toHaveProperty('revisionHistory')
    expect((await unifiedAsyncRepository.mutations('person', person.calmyId)).find(item => item.operation === 'update')?.snapshot).toMatchObject({ displayName: '新人物名' })
    expect((await listRealityActivityAsync({ entityType: 'person', calmyId: person.calmyId })).find(item => 'toRevision' in item && item.toRevision === 2)).toMatchObject({
      previousSnapshot: expect.objectContaining({ displayName: '旧人物名' }), snapshot: expect.objectContaining({ displayName: '新人物名' })
    })
    expect(updatedMatter.revision).toBe(2)
    expect(updatedAction.revision).toBe(2)
  })
})
