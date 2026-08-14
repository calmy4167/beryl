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
    store.set('tasks', [{ done: true }, { done: false }])
    store.set('goals', [{ done: true }, { done: false }, { done: true }])
    store.set('habits', [])
    store.set('finance', [])
    store.set('posts', [])
    expect(statValue('count')).toBe('2')
    expect(statValue('done')).toBe('1')
    expect(statValue('pct').startsWith('67') && statValue('pct').includes('%')).toBe(true)
    store.set('finance', [{ type: 'income', amount: 100 }, { type: 'expense', amount: 25.5 }])
    expect(statValue('balance')).toBe('74.50')
  })

  it('场景模块/分类过滤（差异化）', () => {
    expect(modsFor('personal')).toHaveLength(9)
    expect(modsFor('married')).toHaveLength(8)
    expect(modsFor('family')).toHaveLength(7)
    const familyCats = catsFor('family')
    expect(familyCats.some(c => c.id === 'cai')).toBe(true)
    expect(familyCats.find(c => c.id === 'cai')!.mods.filter(m => modsFor('family').includes(m))).toEqual(['finance'])
  })
})
