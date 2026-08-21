import { describe, expect, it } from 'vitest'
import { actionRepository } from '@/domain/action/repository'
import { matterRepository } from '@/domain/matter/repository'
import { createCollaborativeRelationship, createCollaborativeSharedSpace, createSharedAction, createSharedRecord, listSharedAudit, reviseSharedRecord, sharedWriteAccess, SharedPermissionError, transitionSharedAction, updateCollaborativeRelationship, updateCollaborativeSharedSpace, updateSharedMatter } from '@/domain/social/collaboration'
import { listSharedContextForRelationship } from '@/domain/social/shared-context'

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
})
