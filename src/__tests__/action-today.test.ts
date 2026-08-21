import { beforeEach, describe, expect, it } from 'vitest'
import { ActionDomainError } from '@/domain/action/model'
import { actionRepository } from '@/domain/action/repository'
import { todayRepository } from '@/domain/today/repository'

describe('actionRepository', () => {
  beforeEach(() => localStorage.clear())

  it('creates a planned action for a date', () => {
    const action = actionRepository.create({ title: '完成登录模块最小闭环', date: '2026-08-19', matterId: 'mat-1' })
    expect(action.status).toBe('planned')
    expect(action.date).toBe('2026-08-19')
    expect(action.matterId).toBe('mat-1')
  })

  it('lists actions by Matter and Cycle without mixing parallel cycles', () => {
    const first = actionRepository.create({ title: '恢复作息', date: '2026-08-19', matterId: 'mat-1', cycleId: 'cycle-a' })
    const second = actionRepository.create({ title: '整理环境', date: '2026-08-19', matterId: 'mat-1', cycleId: 'cycle-b' })
    actionRepository.create({ title: '其他课题', date: '2026-08-19', matterId: 'mat-2', cycleId: 'cycle-a' })

    expect(actionRepository.listForMatter('mat-1').map(item => item.calmyId)).toEqual(expect.arrayContaining([first.calmyId, second.calmyId]))
    expect(actionRepository.listForCycle('cycle-a').map(item => item.calmyId)).toEqual(expect.arrayContaining([first.calmyId]))
    expect(actionRepository.listForCycle('cycle-a').map(item => item.calmyId)).not.toContain(second.calmyId)
  })

  it('moves an action through start and complete while preserving revision', () => {
    const action = actionRepository.create({ title: '跑通测试', date: '2026-08-19' })
    const started = actionRepository.start(action.calmyId, 1)
    const done = actionRepository.complete(started.calmyId, '测试通过', 2)
    expect(done.status).toBe('done')
    expect(done.resultNote).toBe('测试通过')
    expect(done.revision).toBe(3)
  })

  it('rejects invalid transitions and stale revisions', () => {
    const action = actionRepository.create({ title: '一次性行动', date: '2026-08-19' })
    actionRepository.complete(action.calmyId, undefined, 1)
    expect(() => actionRepository.complete(action.calmyId, undefined, 1)).toThrowError(ActionDomainError)
    expect(() => actionRepository.start(action.calmyId, 2)).toThrowError(/done → in_progress/)
  })
})

describe('todayRepository', () => {
  beforeEach(() => localStorage.clear())

  it('creates a stable daily plan and updates opening answers', () => {
    const first = todayRepository.get('2026-08-19')
    const next = todayRepository.update('2026-08-19', { load: 'tired', why: '守住最小学习节奏', mustProtect: ['吃饭', '睡眠'] }, first.revision)
    expect(next.load).toBe('tired')
    expect(next.why).toBe('守住最小学习节奏')
    expect(todayRepository.get('2026-08-19').revision).toBe(2)
  })

  it('does not overwrite a newer daily plan with a stale revision', () => {
    const first = todayRepository.get('2026-08-19')
    todayRepository.update('2026-08-19', { letGo: ['新教程'] }, first.revision)
    expect(() => todayRepository.update('2026-08-19', { letGo: ['算法'] }, first.revision)).toThrowError(/revision conflict/)
    expect(todayRepository.get('2026-08-19').letGo).toEqual(['新教程'])
  })

  it('stores an evening review without replacing other review fields', () => {
    const first = todayRepository.get('2026-08-19')
    const second = todayRepository.update('2026-08-19', { review: { observation: '实际学习 40 分钟', adjustment: '明天保持 45 分钟' } }, first.revision)
    const third = todayRepository.update('2026-08-19', { review: { seed: '补充 RBAC' } }, second.revision)

    expect(third.review).toEqual({ observation: '实际学习 40 分钟', analysis: '', adjustment: '明天保持 45 分钟', seed: '补充 RBAC' })
  })
})
