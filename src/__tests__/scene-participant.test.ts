import { beforeEach, describe, expect, it } from 'vitest'
import { unifiedFactories, unifiedRepository } from '@/domain/unified/repository'
import { matterRepository } from '@/domain/matter/repository'

describe('Scene and SceneParticipant', () => {
  beforeEach(() => localStorage.clear())

  it('stores real scenes separately from static scene configuration and does not grant access to participants', () => {
    const person = unifiedRepository.create(unifiedFactories.person({ displayName: '尚未绑定账号' }))
    const thing = matterRepository.create({ title: 'Thing fixture' })
    const scene = unifiedRepository.create(unifiedFactories.scene({
      title: '爸爸住院期間', thingId: thing.calmyId, startedAt: 100, status: 'active'
    }))
    const participant = unifiedRepository.create(unifiedFactories.sceneParticipant({
      sceneId: scene.calmyId, personId: person.calmyId, role: '陪护', joinedAt: 110
    }))

    expect(unifiedRepository.find('scene', scene.calmyId)).toEqual(scene)
    expect(unifiedRepository.find('scene_participant', participant.calmyId)).toEqual(participant)
    expect(person.linkedUserId).toBeUndefined()
    expect(unifiedRepository.list('permission')).toEqual([])
    expect(unifiedRepository.transitionScene(scene.calmyId, 'completed').status).toBe('completed')
  })

  it('rejects a participant whose leave time is earlier than their join time', () => {
    const person = unifiedRepository.create(unifiedFactories.person({ displayName: '参与者' }))
    const scene = unifiedRepository.create(unifiedFactories.scene({ title: '時間校驗', startedAt: 100 }))

    expect(() => unifiedRepository.create(unifiedFactories.sceneParticipant({
      sceneId: scene.calmyId, personId: person.calmyId, joinedAt: 200, leftAt: 150
    }))).toThrow(/leftAt/)
  })
})
