import { describe, it, expect } from 'vitest'
import { store, safeParse, nextId, fmtDate, todayKey } from '../core/storage'

describe('storage', () => {
  it('store 读写与容错解析', () => {
    store.set('tasks', [{ id: 'a', title: 't' }])
    expect(store.get<any[]>('tasks', [])).toHaveLength(1)
    expect(store.get('not-exists', 'def')).toBe('def')
    localStorage.setItem('b_bad', '{bad json')
    expect(store.get('bad', 'def')).toBe('def')
  })

  it('safeParse 兼容裸字符串', () => {
    expect(safeParse('"couple"')).toBe('couple')
    expect(safeParse('couple')).toBeUndefined()
    expect(safeParse('5')).toBe(5)
    expect(safeParse(null)).toBeUndefined()
  })

  it('nextId 多设备安全（100 个不重复）', () => {
    const s = new Set<string>()
    for (let i = 0; i < 100; i++) s.add(nextId())
    expect(s.size).toBe(100)
  })

  it('fmtDate / todayKey 格式', () => {
    expect(fmtDate(new Date(2026, 7, 14, 9, 5).getTime())).toMatch(/^2026-08-14 09:05$/)
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
