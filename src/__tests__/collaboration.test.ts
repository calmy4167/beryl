import { describe, expect, it } from 'vitest'
import { actionRepository } from '@/domain/action/repository'
import { matterAsyncRepository, matterRepository } from '@/domain/matter/repository'
import { recordAsyncRepository } from '@/domain/record/repository'
import { createCollaborativeRelationship, createCollaborativeRelationshipAsync, createCollaborativeSharedSpace, createSharedAction, createSharedActionAsync, createSharedRecord, createSharedRecordAsync, listSharedAudit, listSharedAuditAsync, reviseSharedRecord, sharedWriteAccess, SharedPermissionError, transitionSharedAction, transitionSharedActionAsync, updateCollaborativeRelationship, updateCollaborativeSharedSpace, updateSharedMatter, updateSharedMatterAsync } from '@/domain/social/collaboration'
import { listSharedContextForRelationship, listSharedContextForRelationshipAsync } from '@/domain/social/shared-context'

describe('Shared collaboration writes and audit', () => {
  it('allows a relationship owner to update its boundary and records the actor in history', () => {
    const actorId = 'collab-owner-' + Date.now()
    const relationship = createCollaborativeRelationship({
      personAId: actorId, personBId: actorId + '-partner', label: '协作关系', status: 'active',
      sharedSpaceIds: [], matterIds: [], evidenceIds: []
    }, actorId)

    const updated = updateCollaborativeRelationship(relationship.calmyId, { boundary: '每周同步一次' }, relationship.revision, actorId)
    expect(updated.boundary).toBe('每周同步一次')
    expect(listSharedAudit('relationship', relationship.calmyId).map(item => item.actorId)).toEqual([actorId, actorId])
    expect(listSharedContextForRelationship(relationship.calmyId)).toEqual([])
  })

  it('rejects a non-member from editing a relationship or a shared space boundary', () => {
    const ownerId = 'permission-owner-' + Date.now()
    const outsiderId = ownerId + '-outsider'
    const relationship = createCollaborativeRelationship({
      personAId: ownerId, personBId: ownerId + '-partner', label: '权限关系', status: 'active',
      sharedSpaceIds: [], matterIds: [], evidenceIds: []
    }, ownerId)
    const space = createCollaborativeSharedSpace({
      title: '权限空间', status: 'active', memberIds: [ownerId], relationshipIds: [], matterIds: []
    }, ownerId)

    expect(sharedWriteAccess('relationship', relationship.calmyId, outsiderId).allowed).toBe(false)
    expect(() => updateCollaborativeRelationship(relationship.calmyId, { rhythm: '每天' }, relationship.revision, outsiderId)).toThrow(SharedPermissionError)
    expect(() => updateCollaborativeSharedSpace(space.calmyId, { purpose: '越权修改' }, space.revision, outsiderId)).toThrow(SharedPermissionError)
  })

  it('allows shared members to edit common Matter, Action and Record, while blocked Matter stays read-isolated', () => {
    const ownerId = 'shared-member-' + Date.now()
    const matter = matterRepository.create({ title: '共享协作 Matter' })
    const relationship = createCollaborativeRelationship({
      personAId: ownerId, personBId: ownerId + '-partner', label: '共同处理', status: 'active',
      sharedSpaceIds: [], matterIds: [matter.calmyId], evidenceIds: []
    }, ownerId)
    const updatedMatter = updateSharedMatter('relationship', relationship.calmyId, matter.calmyId, { why: '共同更新' }, matter.revision, ownerId)
    const action = createSharedAction('relationship', relationship.calmyId, { title: '共享行动', date: '2026-08-22' }, matter.calmyId, ownerId)
    const started = transitionSharedAction('relationship', relationship.calmyId, action.calmyId, 'in_progress', matter.calmyId, action.revision, ownerId)
    const record = createSharedRecord('relationship', relationship.calmyId, { body: '共享事实', matterId: matter.calmyId }, ownerId)
    const revised = reviseSharedRecord('relationship', relationship.calmyId, record.calmyId, '共享事实修订', '补充证据', record.revision, ownerId)

    expect(updatedMatter.why).toBe('共同更新')
    expect(started.status).toBe('in_progress')
    expect(revised.body).toBe('共享事实修订')
    expect(listSharedContextForRelationship(relationship.calmyId)[0].history.some(item => item.actorId === ownerId && item.scope === 'action')).toBe(true)
    const auditTypes = listSharedAudit('relationship', relationship.calmyId, matter.calmyId).map(item => item.entityType)
    expect(auditTypes).toHaveLength(5)
    expect(auditTypes.filter(type => type === 'matter')).toHaveLength(1)
    expect(auditTypes.filter(type => type === 'action')).toHaveLength(2)
    expect(auditTypes.filter(type => type === 'record')).toHaveLength(2)

    const blockedMatter = matterRepository.create({ title: '被阻止 Matter' })
    const blocked = createCollaborativeRelationship({
      personAId: ownerId, personBId: ownerId + '-partner', label: '有边界关系', status: 'active',
      sharedSpaceIds: [], matterIds: [], allowedMatterIds: [], blockedMatterIds: [blockedMatter.calmyId], evidenceIds: []
    }, ownerId)
    expect(sharedWriteAccess('relationship', blocked.calmyId, ownerId, blockedMatter.calmyId).allowed).toBe(false)
    expect(() => updateSharedMatter('relationship', blocked.calmyId, blockedMatter.calmyId, { why: '不应写入' }, blockedMatter.revision, ownerId)).toThrow(SharedPermissionError)
    expect(() => createSharedRecord('relationship', blocked.calmyId, { body: '不应写入', matterId: blockedMatter.calmyId }, ownerId)).toThrow(SharedPermissionError)
    expect(actionRepository.find(action.calmyId)?.status).toBe('in_progress')
  })

  it('keeps async shared writes, audit and history on the durable boundary', async () => {
    const ownerId = 'async-shared-owner-' + Date.now()
    const matter = await matterAsyncRepository.create({ title: '异步共享 Matter' })
    const relationship = await createCollaborativeRelationshipAsync({
      personAId: ownerId, personBId: ownerId + '-partner', label: '异步共同处理', status: 'active',
      sharedSpaceIds: [], matterIds: [matter.calmyId], evidenceIds: []
    }, ownerId)

    const updatedMatter = await updateSharedMatterAsync('relationship', relationship.calmyId, matter.calmyId, { why: '异步共同更新' }, matter.revision, ownerId)
    const action = await createSharedActionAsync('relationship', relationship.calmyId, { title: '异步行动', date: '2026-08-22' }, matter.calmyId, ownerId)
    await transitionSharedActionAsync('relationship', relationship.calmyId, action.calmyId, 'in_progress', matter.calmyId, action.revision, ownerId)
    const record = await createSharedRecordAsync('relationship', relationship.calmyId, { body: '异步事实', matterId: matter.calmyId }, ownerId)
    const revised = await recordAsyncRepository.revise(record.calmyId, '异步事实修订', '补充证据', 'user', record.revision, ownerId)

    expect(updatedMatter.why).toBe('异步共同更新')
    await expect(matterAsyncRepository.mutations(matter.calmyId)).resolves.toHaveLength(2)
    await expect(recordAsyncRepository.history(record.calmyId)).resolves.toHaveLength(2)
    await expect(listSharedAuditAsync('relationship', relationship.calmyId, matter.calmyId)).resolves.toHaveLength(4)
    await expect(listSharedContextForRelationshipAsync(relationship.calmyId)).resolves.toEqual([
      expect.objectContaining({
        matterId: matter.calmyId,
        actions: [expect.objectContaining({ calmyId: action.calmyId, status: 'in_progress' })],
        records: [expect.objectContaining({ calmyId: record.calmyId, body: revised.body })],
        history: expect.arrayContaining([
          expect.objectContaining({ scope: 'matter' }),
          expect.objectContaining({ scope: 'record' }),
          expect.objectContaining({ scope: 'action' })
        ])
      })
    ])
  })
})
