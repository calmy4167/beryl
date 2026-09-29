import { beforeEach, describe, expect, it } from 'vitest'
import { sharedSpaceFromSpace, spaceFromSharedSpace } from '@/domain/unified/model'
import { unifiedFactories, unifiedRepository } from '@/domain/unified/repository'
import { assertSpaceAllowsNewCollaborativeWrites, createCollaborativeSharedSpace, readSpaceCompatibilityProjection, sharedWriteAccess, spaceCollaborativeWritesOpen, writeSpaceCompatibilityProjection } from '@/domain/social/collaboration'
import { matterRepository } from '@/domain/matter/repository'

describe('SharedSpace to Space compatibility', () => {
  beforeEach(() => localStorage.clear())

  it('preserves old access boundaries during the canonical Space projection', () => {
    const shared = unifiedFactories.sharedSpace({
      title: '家庭空间', status: 'active', purpose: '照护协作', boundary: '只用于共同照护',
      memberIds: ['user-owner', 'user-helper'], relationshipIds: ['relationship-1'], matterIds: ['matter-1'],
      allowedMatterIds: ['matter-2'], blockedMatterIds: ['matter-3'], ownerId: 'user-owner'
    })
    unifiedRepository.create(shared)
    const projection = spaceFromSharedSpace(shared)
    expect(readSpaceCompatibilityProjection(shared.calmyId)).toEqual(projection)
    expect(writeSpaceCompatibilityProjection(projection)).toEqual(shared)

    expect(projection.space.calmyId).toBe(shared.calmyId)
    expect(projection.legacyBoundary).toMatchObject({
      sharedSpaceId: shared.calmyId,
      matterIds: ['matter-1'],
      allowedMatterIds: ['matter-2'],
      blockedMatterIds: ['matter-3'],
      legacyMemberIds: ['user-owner', 'user-helper']
    })
    expect(sharedSpaceFromSpace(projection)).toEqual(shared)

    const withoutOptionalBoundaries = unifiedFactories.sharedSpace({
      title: '无额外边界', status: 'active', memberIds: [], relationshipIds: [], matterIds: []
    })
    expect(sharedSpaceFromSpace(spaceFromSharedSpace(withoutOptionalBoundaries))).toEqual(withoutOptionalBoundaries)
  })

  it('closed spaces deny new writes while preserving linked Matters', () => {
    const matter = matterRepository.create({ title: '保留的数据' })
    const shared = createCollaborativeSharedSpace({
      title: '关闭后空间', status: 'active', memberIds: ['space-owner'], relationshipIds: [], matterIds: [matter.calmyId]
    }, 'space-owner')
    const projection = spaceFromSharedSpace(shared)
    const closed = { ...projection, space: { ...projection.space, status: 'closed' as const } }

    unifiedRepository.create(closed.space)
    const savedClosed = unifiedRepository.find('space', closed.space.calmyId)
    expect(savedClosed?.entityType).toBe('space')
    if (savedClosed?.entityType === 'space') expect(spaceCollaborativeWritesOpen(savedClosed)).toBe(false)
    expect(() => assertSpaceAllowsNewCollaborativeWrites(closed.space.calmyId)).toThrow(/不能新增协作写入/)
    expect(sharedWriteAccess('shared_space', shared.calmyId, 'space-owner', matter.calmyId).allowed).toBe(true)
    expect(matterRepository.find(matter.calmyId)?.title).toBe('保留的数据')
  })
})
