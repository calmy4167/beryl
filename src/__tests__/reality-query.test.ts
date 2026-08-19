import { beforeEach, describe, expect, it } from 'vitest'
import { actionRepository } from '@/domain/action/repository'
import { caseRepository } from '@/domain/case/repository'
import { captureRepository } from '@/domain/capture'
import { matterRepository } from '@/domain/matter/repository'
import { recordRepository } from '@/domain/record/repository'
import { todayRepository } from '@/domain/today/repository'
import { store } from '@/core/storage'
import { listRealityDocuments } from '@/domain/reality'
import { unifiedFactories, unifiedRepository } from '@/domain/unified'

describe('unified reality query', () => {
  beforeEach(() => localStorage.clear())

  it('normalizes legacy and unified entities with source labels and stable IDs', () => {
    const matter = matterRepository.create({ title: '现实事项', why: '验证来源' })
    const action = actionRepository.create({ title: '现实行动', date: '2026-08-19', matterId: matter.calmyId })
    const person = unifiedRepository.create(unifiedFactories.person({ displayName: '现实人物' }))

    const first = listRealityDocuments({ types: ['matter', 'action', 'person'] })
    const second = listRealityDocuments({ types: ['matter', 'action', 'person'] })

    expect(first).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: matter.calmyId, entityType: 'matter', source: 'legacy', route: `/app/matters/${matter.calmyId}`, status: 'active', currentStage: 'wood', revision: matter.revision }),
      expect.objectContaining({ id: action.calmyId, calmyId: action.calmyId, entityType: 'action', source: 'legacy', matterId: matter.calmyId, date: '2026-08-19', status: 'planned' }),
      expect.objectContaining({ id: person.calmyId, entityType: 'person', source: 'unified', route: '/app/people' })
    ]))
    expect(first.map(item => `${item.entityType}:${item.id}`)).toEqual(second.map(item => `${item.entityType}:${item.id}`))
  })

  it('filters by text, type, and event time', () => {
    const todayAt = new Date(2026, 7, 19).getTime()
    const tomorrowAt = new Date(2026, 7, 20).getTime()
    const matter = matterRepository.create({ title: '今天事项' })
    actionRepository.create({ title: '今天联系', date: '2026-08-19', matterId: matter.calmyId })
    recordRepository.create({ body: '今天实际发生', occurredAt: todayAt, matterId: matter.calmyId })
    recordRepository.create({ body: '昨天实际发生', occurredAt: todayAt - 24 * 60 * 60 * 1000 })
    todayRepository.update('2026-08-19', { why: '今天保护专注' })

    const result = listRealityDocuments({
      text: '今天', types: ['action', 'record', 'today'], from: todayAt, to: tomorrowAt - 1
    })

    expect(result.map(item => item.entityType)).toEqual(expect.arrayContaining(['action', 'record', 'today']))
    expect(result.find(item => item.entityType === 'action')).toMatchObject({ matterId: matter.calmyId, date: '2026-08-19' })
    expect(result.find(item => item.entityType === 'record')).toMatchObject({ matterId: matter.calmyId, recordType: 'fact' })
    expect(result).not.toEqual(expect.arrayContaining([expect.objectContaining({ title: '昨天实际发生' })]))
    expect(listRealityDocuments({ types: ['person'] })).toEqual([])
  })

  it('handles empty, zero-limit, and invalid ranges without leaking data', () => {
    matterRepository.create({ title: '不会被返回' })

    expect(listRealityDocuments({ text: '不存在的词' })).toEqual([])
    expect(listRealityDocuments({ limit: 0 })).toEqual([])
    expect(listRealityDocuments({ from: 20, to: 10 })).toEqual([])
  })

  it('exposes unified context entities with stable source and type labels', () => {
    const personA = unifiedRepository.create(unifiedFactories.person({ displayName: '甲' }))
    const personB = unifiedRepository.create(unifiedFactories.person({ displayName: '乙' }))
    const relationship = unifiedRepository.create(unifiedFactories.relationship({ personAId: personA.calmyId, personBId: personB.calmyId, label: '合作', status: 'active', sharedSpaceIds: [], matterIds: [], evidenceIds: [] }))
    const space = unifiedRepository.create(unifiedFactories.sharedSpace({ title: '项目空间', status: 'active', memberIds: [personA.calmyId, personB.calmyId], relationshipIds: [relationship.calmyId], matterIds: [] }))
    const resource = unifiedRepository.create(unifiedFactories.resource({ title: '参考资料', kind: 'reference', status: 'active', assetIds: [], matterIds: [], sourceIds: [], tags: [] }))
    const asset = unifiedRepository.create(unifiedFactories.asset({ path: 'assets/reference.pdf', mimeType: 'application/pdf', sizeBytes: 12, hash: 'hash', lifecycle: 'active', version: 1 }))

    const result = listRealityDocuments({ types: ['relationship', 'shared_space', 'resource', 'asset'] })

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: relationship.calmyId, source: 'unified', entityType: 'relationship', title: '合作' }),
      expect.objectContaining({ id: space.calmyId, source: 'unified', entityType: 'shared_space', title: '项目空间' }),
      expect.objectContaining({ id: resource.calmyId, source: 'unified', entityType: 'resource', title: '参考资料' }),
      expect.objectContaining({ id: asset.calmyId, source: 'unified', entityType: 'asset', title: 'assets/reference.pdf' })
    ]))
  })

  it('exposes legacy Case and Capture records through the same read boundary', () => {
    const caseItem = caseRepository.create({ title: '现实课题', problem: '需要梳理' })
    const capture = captureRepository.create('一段尚未理解的原文')

    expect(listRealityDocuments({ types: ['case', 'capture'] })).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: caseItem.id, source: 'legacy', entityType: 'case', route: `/app/cases/${caseItem.id}` }),
      expect.objectContaining({ id: capture.calmyId, source: 'legacy', entityType: 'capture', route: '/app/capture', body: capture.body })
    ]))
  })

  it('normalizes legacy Tasks and Inbox entries while preserving mutation IDs', () => {
    store.set('tasks', [{ id: 'task-1', title: '完成任务', priority: '高', date: '2026-08-19 09:00', done: false }])
    store.set('inbox', [{ id: 'inbox-1', text: '待理解原文', date: '2026-08-19 10:00' }, { text: '   ', date: '2026-08-19 11:00' }])

    const result = listRealityDocuments({ types: ['task', 'inbox'] })

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'task-1', entityType: 'task', source: 'legacy', status: 'open', priority: '高', done: false, route: '/app/module/tasks' }),
      expect.objectContaining({ id: 'inbox-1', entityType: 'inbox', source: 'legacy', body: '待理解原文', sourceIndex: 0, route: '/app/module/inbox' })
    ]))
    expect(result).not.toEqual(expect.arrayContaining([expect.objectContaining({ body: '   ' })]))
  })

  it('normalizes Diary, Post, Finance, and Habit module records', () => {
    store.set('diary', [{ date: '2026-08-19', content: '今天观察到节律变化' }])
    store.set('posts', [{ id: 'post-1', title: '经验文章', content: '一段经验正文', date: '2026-08-19 12:00' }])
    store.set('finance', [{ id: 'finance-1', type: 'expense', amount: 12.5, amountCents: 1250, category: '学习', note: '书籍', date: '2026-08-19 13:00' }])
    store.set('habits', [{ id: 'habit-1', name: '阅读', color: '#123456', days: 2, dates: ['2026-08-18', '2026-08-19'] }])

    const result = listRealityDocuments({ types: ['diary', 'post', 'transaction', 'habit'] })

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: '2026-08-19', entityType: 'diary', body: '今天观察到节律变化', route: '/app/module/diary' }),
      expect.objectContaining({ id: 'post-1', entityType: 'post', title: '经验文章', body: '一段经验正文', route: '/app/module/posts' }),
      expect.objectContaining({ id: 'finance-1', entityType: 'transaction', amountCents: 1250, category: '学习', financeType: 'expense' }),
      expect.objectContaining({ id: 'habit-1', entityType: 'habit', title: '阅读', dates: ['2026-08-18', '2026-08-19'], days: 2 })
    ]))
  })

  it('normalizes Chars, Goals, Pomo, and Moments module records', () => {
    store.set('chars', [{ id: 'char-1', name: '小林', title: '伙伴', date: '2026-08-19 14:00' }])
    store.set('goals', [{ id: 'goal-1', title: '完成迁移', done: true }])
    store.set('pomoTotal', 50)
    store.set('pomoCount', 2)
    store.set('moments', [{ id: 'moment-1', author: { name: '我' }, content: '今天完成了一步', visibility: 'private', createdAt: 1724068800000, updatedAt: 1724068800000, likedBy: ['me'], comments: [] }])

    const result = listRealityDocuments({ types: ['char', 'goal', 'pomo', 'moment'] })

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'char-1', entityType: 'char', name: '小林', charTitle: '伙伴', route: '/app/module/chars' }),
      expect.objectContaining({ id: 'goal-1', entityType: 'goal', status: 'done', done: true, route: '/app/module/goals' }),
      expect.objectContaining({ id: 'pomo', entityType: 'pomo', minutes: 50, count: 2 }),
      expect.objectContaining({ id: 'moment-1', entityType: 'moment', visibility: 'private', likeCount: 1, commentCount: 0 })
    ]))
  })
})
