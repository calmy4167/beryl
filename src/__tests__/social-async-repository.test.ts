import { beforeEach, describe, expect, it, vi } from 'vitest'

const durable = vi.hoisted(() => {
  const values = new Map<string, string>()
  let available = true
  let state: 'ready' | 'degraded' = 'ready'
  let pendingWrites = 0
  let writeChain: Promise<void> = Promise.resolve()

  const dbPut = vi.fn((key: string, value: string) => {
    pendingWrites += 1
    if (!available) return Promise.resolve()
    const next = writeChain.then(async () => {
      values.set(key, value)
      pendingWrites -= 1
    })
    writeChain = next.catch(() => undefined)
    return next
  })

  return {
    values,
    dbPut,
    flushPendingDbWrites: vi.fn(async () => {
      await writeChain
      state = available ? 'ready' : 'degraded'
    }),
    getDbStatus: vi.fn(() => ({
      state,
      available,
      pendingWrites,
      restoredKeys: 0,
      lastMirrorAt: null,
      lastError: available ? null : 'indexedDB unavailable'
    })),
    readKvSnapshot: vi.fn(async () => available ? Object.fromEntries(values) : undefined),
    setAvailable(next: boolean) {
      available = next
      state = next ? 'ready' : 'degraded'
    },
    reset() {
      values.clear()
      available = true
      state = 'ready'
      pendingWrites = 0
      writeChain = Promise.resolve()
      this.dbPut.mockClear()
      this.flushPendingDbWrites.mockClear()
      this.getDbStatus.mockClear()
      this.readKvSnapshot.mockClear()
    }
  }
})

vi.mock('../core/db.ts', () => ({
  DEVICE_ID: 'test-device',
  dbDelete: vi.fn(async () => undefined),
  dbPut: durable.dbPut,
  flushPendingDbWrites: durable.flushPendingDbWrites,
  getDbStatus: durable.getDbStatus,
  readKvSnapshot: durable.readKvSnapshot,
  recordEntityChanges: vi.fn(async () => undefined)
}))

import { resetStoreCache } from '../core/storage'
import { socialAsyncRepository } from '../domain/social/repository'
import type { SocialPost } from '../domain/social/model'

function post(id: string, createdAt = 1): SocialPost {
  return {
    id,
    author: { id: 'author', name: '作者' },
    content: id,
    visibility: 'private',
    createdAt,
    updatedAt: createdAt,
    likedBy: [],
    comments: []
  }
}

describe('socialAsyncRepository', () => {
  beforeEach(() => {
    durable.reset()
    localStorage.clear()
    resetStoreCache()
  })

  it('reads the durable moments snapshot instead of stale localStorage', async () => {
    localStorage.setItem('b_moments', JSON.stringify([post('stale')]))
    durable.values.set('b_moments', JSON.stringify([post('durable')]))

    await expect(socialAsyncRepository.list()).resolves.toEqual([post('durable')])
  })

  it('creates posts through the durable async boundary and preserves empty content', async () => {
    const created = await socialAsyncRepository.create('   ', 'friends')

    expect(created).toMatchObject({ content: '', visibility: 'friends', likedBy: [], comments: [] })
    await expect(socialAsyncRepository.list()).resolves.toEqual([created])
    expect(durable.values.get('b_moments')).toContain('"content":""')
  })

  it('toggles likes and adds/removes a threaded comment tree', async () => {
    const created = await socialAsyncRepository.create('一条动态')
    const author = { id: 'me', name: '我' }

    await expect(socialAsyncRepository.toggleLike(created.id, 'me')).resolves.toBe(true)
    await expect(socialAsyncRepository.list()).resolves.toMatchObject([{ likedBy: ['me'] }])
    await expect(socialAsyncRepository.toggleLike(created.id, 'me')).resolves.toBe(true)
    const root = await socialAsyncRepository.addComment(created.id, '第一条评论', undefined, author)
    const reply = await socialAsyncRepository.addComment(created.id, '回复第一条', root?.id, { id: 'friend', name: '朋友' })

    expect(root).toMatchObject({ postId: created.id, content: '第一条评论' })
    expect(reply).toMatchObject({ parentId: root?.id, content: '回复第一条' })
    await expect(socialAsyncRepository.list()).resolves.toMatchObject([{ likedBy: [], comments: [{ content: '第一条评论' }, { content: '回复第一条' }] }])
    await expect(socialAsyncRepository.removeComment(created.id, root!.id)).resolves.toBe(true)
    await expect(socialAsyncRepository.list()).resolves.toSatisfy(posts => posts[0].comments.length === 0)
  })

  it('returns boundary results for blank comments and missing posts', async () => {
    await expect(socialAsyncRepository.addComment('missing', '评论')).resolves.toBeNull()
    await expect(socialAsyncRepository.addComment('missing', '   ')).resolves.toBeNull()
    await expect(socialAsyncRepository.remove('missing')).resolves.toBe(false)
    await expect(socialAsyncRepository.toggleLike('missing', 'me')).resolves.toBe(false)
    await expect(socialAsyncRepository.removeComment('missing', 'comment')).resolves.toBe(false)

    const created = await socialAsyncRepository.create('待删除')
    await expect(socialAsyncRepository.remove(created.id)).resolves.toBe(true)
    await expect(socialAsyncRepository.remove(created.id)).resolves.toBe(false)
    await expect(socialAsyncRepository.list()).resolves.toEqual([])
  })

  it('reports durable readiness and degraded availability', async () => {
    await socialAsyncRepository.create('检查持久化')
    await expect(socialAsyncRepository.ready()).resolves.toMatchObject({ durable: true, state: 'ready', pendingWrites: 0 })

    durable.setAvailable(false)
    await expect(socialAsyncRepository.ready()).resolves.toMatchObject({ durable: false, state: 'degraded', available: false })
  })
})
