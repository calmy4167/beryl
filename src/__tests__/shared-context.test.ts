import { beforeEach, describe, expect, it } from 'vitest'
import { actionRepository } from '@/domain/action/repository'
import { matterRepository } from '@/domain/matter/repository'
import { recordRepository } from '@/domain/record/repository'
import { listSharedBoundariesForMatter, listSharedContextForRelationship, listSharedContextForSpace } from '@/domain/social/shared-context'
import { unifiedFactories, unifiedRepository } from '@/domain/unified'

describe('shared context query', () => {
  beforeEach(() => localStorage.clear())

  it('aggregates common Matter, Action, Record and auditable history for an active Relationship', () => {
    const matter = matterRepository.create({ title: '共同搬家' })
    const relationship = unifiedRepository.create(unifiedFactories.relationship({
      personAId: 'person-a', personBId: 'person-b', label: '伴侣', status: 'active',
      matterIds: [matter.calmyId], sharedSpaceIds: [], evidenceIds: [], boundary: '重大决定先沟通'
    }))
    const action = actionRepository.create({ title: '确认搬家预算', date: '2026-08-22', matterId: matter.calmyId })
    const record = recordRepository.create({ body: '双方确认先看三套房', matterId: matter.calmyId })

    const context = listSharedContextForRelationship(relationship.calmyId)

    expect(context).toHaveLength(1)
    expect(context[0]).toMatchObject({ matterId: matter.calmyId, access: 'shared', matter: { title: '共同搬家' } })
    expect(context[0].actions).toEqual([action])
    expect(context[0].records).toEqual([record])
    expect(context[0].history.map(item => item.scope)).toEqual(expect.arrayContaining(['relationship', 'matter', 'record']))
  })

  it('returns boundary status without exposing actions or records for a blocked Matter', () => {
    const matter = matterRepository.create({ title: '私人决定' })
    const relationship = unifiedRepository.create(unifiedFactories.relationship({
      personAId: 'person-a', personBId: 'person-b', label: '合作关系', status: 'active',
      matterIds: [matter.calmyId], blockedMatterIds: [matter.calmyId], sharedSpaceIds: [], evidenceIds: []
    }))
    actionRepository.create({ title: '不应暴露的行动', date: '2026-08-22', matterId: matter.calmyId })
    recordRepository.create({ body: '不应暴露的记录', matterId: matter.calmyId })

    const context = listSharedContextForRelationship(relationship.calmyId)[0]

    expect(context.access).toBe('blocked')
    expect(context.actions).toEqual([])
    expect(context.records).toEqual([])
    expect(context.history).toEqual([])
    expect(listSharedBoundariesForMatter(matter.calmyId)).toEqual([expect.objectContaining({ access: 'blocked', title: '合作关系' })])
  })

  it('supports explicitly allowed Matter access in a Shared Space and excludes inactive owners', () => {
    const matter = matterRepository.create({ title: '项目会议' })
    const space = unifiedRepository.create(unifiedFactories.sharedSpace({
      title: '项目组', status: 'active', memberIds: ['person-a', 'person-b'], relationshipIds: [], matterIds: [], allowedMatterIds: [matter.calmyId]
    }))
    const archivedSpace = unifiedRepository.create(unifiedFactories.sharedSpace({
      title: '旧项目组', status: 'archived', memberIds: ['person-a'], relationshipIds: [], matterIds: [matter.calmyId]
    }))
    const action = actionRepository.create({ title: '准备议程', date: '2026-08-22', matterId: matter.calmyId })

    expect(listSharedContextForSpace(space.calmyId)[0]).toMatchObject({ access: 'allowed', actions: [expect.objectContaining({ calmyId: action.calmyId, title: action.title })] })
    expect(listSharedContextForSpace(archivedSpace.calmyId)).toEqual([])
  })
})
