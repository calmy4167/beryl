import { beforeEach, describe, expect, it } from 'vitest'
import { MatterDomainError } from '@/domain/matter/model'
import { matterRepository } from '@/domain/matter/repository'

describe('matterRepository', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('creates a Matter with stable identity and a create mutation', () => {
    const matter = matterRepository.create({ title: '学习 Java', why: '建立独立开发能力' }, { commandId: 'cmd-create-1' })

    expect(matter.calmyId).toBeTruthy()
    expect(matter.status).toBe('active')
    expect(matter.revision).toBe(1)
    expect(matterRepository.mutations(matter.calmyId)).toHaveLength(1)
    expect(matterRepository.mutations(matter.calmyId)[0].operation).toBe('create')
  })

  it('rejects blank titles before writing data', () => {
    expect(() => matterRepository.create({ title: '   ' })).toThrowError(MatterDomainError)
    expect(matterRepository.list()).toHaveLength(0)
  })

  it('allows pause and resume while preserving revisions', () => {
    const matter = matterRepository.create({ title: '改善睡眠' }, { commandId: 'cmd-create-2' })
    const paused = matterRepository.pause(matter.calmyId, { commandId: 'cmd-pause-1', expectedRevision: 1 })
    const resumed = matterRepository.resume(paused.calmyId, { commandId: 'cmd-resume-1', expectedRevision: 2 })

    expect(paused.status).toBe('paused')
    expect(resumed.status).toBe('active')
    expect(resumed.revision).toBe(3)
    expect(matterRepository.mutations(resumed.calmyId)).toHaveLength(3)
  })

  it('rejects an invalid transition and keeps the prior state', () => {
    const matter = matterRepository.create({ title: '一次性准备旅行' }, { commandId: 'cmd-create-3' })
    matterRepository.archive(matter.calmyId, { commandId: 'cmd-archive-1', expectedRevision: 1 })

    expect(() => matterRepository.resume(matter.calmyId, { commandId: 'cmd-resume-2', expectedRevision: 2 })).toThrowError(/archived → active/)
    expect(matterRepository.find(matter.calmyId)?.status).toBe('archived')
  })

  it('rejects stale revisions instead of overwriting the latest change', () => {
    const matter = matterRepository.create({ title: '职业转型' }, { commandId: 'cmd-create-4' })
    matterRepository.update(matter.calmyId, { why: '先做出真实项目' }, { commandId: 'cmd-update-1', expectedRevision: 1 })

    expect(() => matterRepository.update(matter.calmyId, { why: '过期修改' }, { commandId: 'cmd-update-2', expectedRevision: 1 })).toThrowError(/revision/)
    expect(matterRepository.find(matter.calmyId)?.why).toBe('先做出真实项目')
  })

  it('is idempotent for repeated command ids', () => {
    const first = matterRepository.create({ title: '重复命令测试' }, { commandId: 'cmd-idempotent-1' })
    const second = matterRepository.create({ title: '不应创建第二条' }, { commandId: 'cmd-idempotent-1' })

    expect(second.calmyId).toBe(first.calmyId)
    expect(matterRepository.list()).toHaveLength(1)
    expect(matterRepository.mutations(first.calmyId)).toHaveLength(1)
  })

  it('keeps the expanded trajectory vocabulary separate from lifecycle status', () => {
    const matter = matterRepository.create({ title: '轨迹词汇测试' }, { commandId: 'cmd-trajectory-1' })
    const lost = matterRepository.update(matter.calmyId, { trajectory: 'lost' }, { commandId: 'cmd-trajectory-2', expectedRevision: 1 })
    const restarting = matterRepository.update(matter.calmyId, { trajectory: 'restarting' }, { commandId: 'cmd-trajectory-3', expectedRevision: 2 })

    expect(lost).toMatchObject({ status: 'active', trajectory: 'lost', revision: 2 })
    expect(restarting).toMatchObject({ status: 'active', trajectory: 'restarting', revision: 3 })
  })
})
