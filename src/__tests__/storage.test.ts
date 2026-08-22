import { afterEach, describe, it, expect, vi } from 'vitest'
import { hydrateStoreCache, resetStoreCache, store, safeParse, nextId, fmtDate, todayKey, lsGet, lsSet, lsRemove } from '../core/storage'

afterEach(() => resetStoreCache())

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

  it('启动 hydrate 后 Repository 读取优先使用 IndexedDB 快照并保持写入同步', () => {
    localStorage.setItem('b_tasks', '[{"id":"local","title":"旧缓存"}]')
    hydrateStoreCache({ b_tasks: '[{"id":"persisted","title":"持久快照"}]' })

    expect(store.get<any[]>('tasks', [])[0].id).toBe('persisted')
    expect(lsSet('b_tasks', '[{"id":"new","title":"新写入"}]')).toBe(true)
    expect(store.get<any[]>('tasks', [])[0].id).toBe('new')
    lsRemove('b_tasks')
    expect(lsGet('b_tasks')).toBeNull()
  })

  it('空的 IndexedDB 快照不会错误回退到旧 localStorage 数据', () => {
    localStorage.setItem('b_tasks', '[{"id":"stale","title":"旧缓存"}]')
    hydrateStoreCache({})

    expect(store.get<any[]>('tasks', [])).toEqual([])
    expect(lsGet('b_tasks')).toBeNull()
  })

  it('hydrate 后 localStorage 写入失败时仍由持久缓存接受 Repository 写入', () => {
    hydrateStoreCache({ b_tasks: '[{"id":"old"}]' })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })

    expect(lsSet('b_tasks', '[{"id":"new"}]')).toBe(true)
    expect(store.get<any[]>('tasks', [])[0].id).toBe('new')

    setItem.mockRestore()
  })
})
