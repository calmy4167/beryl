import { describe, expect, it } from 'vitest'
import type { Matter, MatterMutation } from '@/domain/matter/model'
import { matterFromThing, thingFromMatter } from '@/domain/matter/model'
import { matterRepository } from '@/domain/matter/repository'
import { thingRepository } from '@/domain/thing/repository'
import { unifiedFactories } from '@/domain/unified/repository'
import { beforeEach } from 'vitest'

describe('Matter and Thing compatibility', () => {
  beforeEach(() => localStorage.clear())

  it('projects every legacy Matter field into Thing and round-trips without loss', () => {
    const matter: Matter = {
      calmyId: 'matter-legacy-1',
      title: '爸爸住院',
      why: '需要协调照护',
      primaryContradiction: '工作安排与陪护时间冲突',
      problem: '陪护排班经常临时变化',
      desiredChange: '形成稳定的轮班安排',
      progressEvidence: '本周已完成三次交接',
      currentGap: '周末安排尚未确认',
      nextTest: '今晚确认周末轮班',
      stopCondition: '连续两周无需临时调班',
      status: 'paused',
      currentStage: 'earth',
      trajectory: 'recovering',
      currentCycleId: 'cycle-9',
      evidenceIds: ['record-2', 'record-3'],
      createdAt: 1700000000000,
      updatedAt: 1700000000123,
      revision: 7
    }

    const thing = thingFromMatter(matter)

    expect(thing).toMatchObject({
      calmyId: matter.calmyId,
      title: matter.title,
      why: matter.why,
      primaryContradiction: matter.primaryContradiction,
      problem: matter.problem,
      desiredChange: matter.desiredChange,
      progressEvidence: matter.progressEvidence,
      currentGap: matter.currentGap,
      nextTest: matter.nextTest,
      stopCondition: matter.stopCondition,
      status: matter.status,
      currentStage: matter.currentStage,
      trajectory: matter.trajectory,
      currentCycleId: matter.currentCycleId,
      evidenceIds: matter.evidenceIds,
      createdAt: matter.createdAt,
      updatedAt: matter.updatedAt,
      revision: matter.revision
    })
    expect(matterFromThing(thing)).toEqual(matter)
  })

  it('uses mutation history only when assigning source attribution', () => {
    const matter: Matter = {
      calmyId: 'matter-source-1', title: '来源', why: '', primaryContradiction: '', status: 'active',
      currentStage: 'wood', trajectory: 'stable', evidenceIds: [], createdAt: 1, updatedAt: 2, revision: 1
    }
    const mutation: MatterMutation = {
      id: 'mutation-1', entity: 'matter', entityId: matter.calmyId, operation: 'create', commandId: 'cmd-1',
      actor: 'import', actorId: 'migration', sourceIds: ['source-1'], fromRevision: 0, toRevision: 1, occurredAt: 2
    }

    expect(thingFromMatter(matter).source).toBeUndefined()
    expect(thingFromMatter(matter, [mutation]).source).toBe('import')
    expect(thingFromMatter(matter, [{ ...mutation, entityId: 'another-matter', actor: 'sync' }]).source).toBeUndefined()
  })

  it('allows a Person to exist without a linked account', () => {
    const person = unifiedFactories.person({ displayName: '尚未绑定账号的人' })

    expect(person.linkedUserId).toBeUndefined()
  })

  it('routes canonical Thing reads and writes through the existing Matter repository', () => {
    const created = thingRepository.create({ title: '用 Thing 建立' }, { commandId: 'thing-create-1' })
    expect(matterRepository.find(created.calmyId)?.title).toBe('用 Thing 建立')

    const updated = thingRepository.update(created.calmyId, { problem: '同一条数据' }, { expectedRevision: created.revision })
    expect(matterRepository.find(created.calmyId)?.problem).toBe('同一条数据')

    matterRepository.update(created.calmyId, { desiredChange: '旧入口仍可编辑' })
    expect(thingRepository.find(created.calmyId)?.desiredChange).toBe('旧入口仍可编辑')
    expect(thingRepository.list().map(item => item.calmyId)).toEqual([created.calmyId])
    expect(thingRepository.mutations(created.calmyId)).toHaveLength(3)
    expect(updated.revision).toBe(2)
  })
})
