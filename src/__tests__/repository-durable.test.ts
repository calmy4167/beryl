import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const durable = vi.hoisted(() => {
  const values = new Map<string, string>()
  const pending = new Set<string>()
  let available = true
  let state: 'ready' | 'degraded' = 'ready'
  let lastError: string | null = null
  let writeChain: Promise<void> = Promise.resolve()

  const dbPut = vi.fn((key: string, value: string) => {
    pending.add(key)
    if (!available) return Promise.resolve()
    const next = writeChain.then(async () => {
      await Promise.resolve()
      values.set(key, value)
      pending.delete(key)
    })
    writeChain = next.catch(() => undefined)
    return next
  })

  const flushPendingDbWrites = vi.fn(async () => {
    await writeChain
    if (!available) {
      state = 'degraded'
      lastError = 'indexedDB unavailable'
      return
    }
    state = 'ready'
    lastError = null
  })

  return {
    values,
    pending,
    dbPut,
    flushPendingDbWrites,
    readKvSnapshot: vi.fn(async () => available ? Object.fromEntries(values) : undefined),
    getDbStatus: vi.fn(() => ({
      state,
      available,
      pendingWrites: pending.size,
      restoredKeys: 0,
      lastMirrorAt: null,
      lastError
    })),
    setAvailable(next: boolean) {
      available = next
      state = next ? 'ready' : 'degraded'
      lastError = next ? null : 'indexedDB unavailable'
    },
    reset() {
      values.clear()
      pending.clear()
      available = true
      state = 'ready'
      lastError = null
      writeChain = Promise.resolve()
      dbPut.mockClear()
      flushPendingDbWrites.mockClear()
      durable.readKvSnapshot.mockClear()
    }
  }
})

vi.mock('../core/db.ts', () => ({
  DEVICE_ID: 'test-device',
  dbDelete: vi.fn(async (key: string) => { durable.pending.add(key) }),
  dbPut: durable.dbPut,
  flushPendingDbWrites: durable.flushPendingDbWrites,
  getDbStatus: durable.getDbStatus,
  readKvSnapshot: durable.readKvSnapshot,
  recordEntityChanges: vi.fn(async () => undefined)
}))

import { createAsyncCollectionRepository, createCollectionRepository, flushRepositoryWrites, readAsyncStorageValue, writeAsyncStorageValue } from '../core/repository'
import { resetStoreCache } from '../core/storage'

describe('Repository durable boundary', () => {
  beforeEach(() => {
    durable.reset()
    localStorage.clear()
    resetStoreCache()
  })

  afterEach(() => {
    resetStoreCache()
    localStorage.clear()
  })

  it('waits for a successful write and reports a durable ready state', async () => {
    const repository = createCollectionRepository<{ id: string; title: string }>('tasks')

    expect(repository.replace([{ id: 't1', title: '可持久化' }])).toBe(true)

    const result = await repository.ready()

    expect(result).toEqual({
      durable: true,
      state: 'ready',
      available: true,
      pendingWrites: 0,
      lastError: null
    })
    expect(durable.values.get('b_tasks')).toBe('[{"id":"t1","title":"可持久化"}]')
    expect(durable.flushPendingDbWrites).toHaveBeenCalledTimes(1)
  })

  it('resolves without blocking when IndexedDB is unavailable and exposes the downgrade', async () => {
    durable.setAvailable(false)
    const repository = createCollectionRepository<{ id: string; title: string }>('tasks')

    expect(repository.replace([{ id: 't1', title: '保留在降级 outbox' }])).toBe(true)

    const result = await repository.ready()

    expect(result).toMatchObject({
      durable: false,
      state: 'degraded',
      available: false,
      pendingWrites: 1,
      lastError: 'indexedDB unavailable'
    })
    expect(repository.list()).toEqual([{ id: 't1', title: '保留在降级 outbox' }])
    expect(durable.values.has('b_tasks')).toBe(false)
  })

  it('serializes consecutive writes and resolves after the latest value is durable', async () => {
    const repository = createCollectionRepository<{ id: string; title: string }>('tasks')

    repository.replace([{ id: 't1', title: '第一版' }])
    repository.replace([{ id: 't1', title: '第二版' }])
    repository.replace([{ id: 't1', title: '最终版' }])

    const result = await flushRepositoryWrites()

    expect(result.durable).toBe(true)
    expect(result.pendingWrites).toBe(0)
    expect(durable.values.get('b_tasks')).toBe('[{"id":"t1","title":"最终版"}]')
    expect(durable.dbPut).toHaveBeenNthCalledWith(1, 'b_tasks', '[{"id":"t1","title":"第一版"}]', expect.any(Object))
    expect(durable.dbPut).toHaveBeenNthCalledWith(3, 'b_tasks', '[{"id":"t1","title":"最终版"}]', expect.any(Object))
  })

  it('reads from the durable snapshot instead of stale localStorage', async () => {
    localStorage.setItem('b_tasks', '[{"id":"stale"}]')
    durable.values.set('b_tasks', '[{"id":"durable"}]')
    const repository = createAsyncCollectionRepository<{ id: string }>('tasks')

    await expect(repository.list()).resolves.toEqual([{ id: 'durable' }])
  })

  it('treats an empty durable snapshot as authoritative and falls back only when unavailable', async () => {
    localStorage.setItem('b_tasks', '[{"id":"stale"}]')
    const repository = createAsyncCollectionRepository<{ id: string }>('tasks')

    await expect(repository.list()).resolves.toEqual([])
    durable.setAvailable(false)
    localStorage.setItem('b_tasks', '[{"id":"fallback"}]')
    await expect(repository.list()).resolves.toEqual([{ id: 'fallback' }])
  })

  it('serializes async create and update through the durable write boundary', async () => {
    const repository = createAsyncCollectionRepository<{ id: string; title: string }>('tasks')

    await repository.create({ id: 't1', title: '第一版' })
    await repository.update('t1', item => ({ ...item, title: '最终版' }))

    await expect(repository.find('t1')).resolves.toEqual({ id: 't1', title: '最终版' })
    expect(durable.values.get('b_tasks')).toBe('[{"id":"t1","title":"最终版"}]')
  })

  it('uses the same durable boundary for legacy scalar keys', async () => {
    durable.values.set('b_pomoTotal', '25')
    localStorage.setItem('b_pomoTotal', '3')

    await expect(readAsyncStorageValue('pomoTotal', 0)).resolves.toBe(25)
    await expect(writeAsyncStorageValue('pomoTotal', 50)).resolves.toBe(true)
    expect(durable.values.get('b_pomoTotal')).toBe('50')
  })
})
