import { describe, it, expect } from 'vitest'
import { maxStreak, statValue, catsFor, modsFor } from '../core/modules'
import { store } from '../core/storage'

describe('modules', () => {
  it('maxStreak 最长连续天数', () => {
    expect(maxStreak(['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-14'])).toBe(3)
    expect(maxStreak([])).toBe(0)
    expect(maxStreak(undefined)).toBe(0)
  })

  it('statValue 各类统计', () => {
    store.set('tasks', [
      { id: 'task-1', title: '完成报告', done: true },
      { id: 'task-2', title: '回复邮件', done: false }
    ])
    store.set('goals', [
      { id: 'goal-1', title: '阅读', done: true },
      { id: 'goal-2', title: '运动', done: false },
      { id: 'goal-3', title: '学习', done: true }
    ])
    store.set('habits', [{ id: 'habit-1', name: '早起', dates: ['2026-08-10', '2026-08-11'] }])
    store.set('finance', [])
    store.set('posts', [{ id: 'post-1', title: '周记', content: '记录' }])
    store.set('pomoTotal', 25)
    expect(statValue('count')).toBe('2')
    expect(statValue('done')).toBe('1')
    expect(statValue('streak')).toContain('2')
    expect(statValue('pct').startsWith('67') && statValue('pct').includes('%')).toBe(true)
    expect(statValue('pomo')).toContain('25')
    expect(statValue('posts')).toBe('1')
    store.set('finance', [
      { id: 'finance-1', type: 'income', amount: 100 },
      { id: 'finance-2', type: 'expense', amount: 25.5 }
    ])
    expect(statValue('balance')).toBe('74.50')
  })

  it('场景模块/分类过滤（差异化）', () => {
    expect(modsFor('personal')).toHaveLength(10)
    expect(modsFor('married')).toHaveLength(9)
    expect(modsFor('family')).toHaveLength(8)
    const familyCats = catsFor('family')
    expect(familyCats.some(c => c.id === 'cai')).toBe(true)
    expect(familyCats.find(c => c.id === 'cai')!.mods.filter(m => modsFor('family').includes(m))).toEqual(['finance'])
  })
})
