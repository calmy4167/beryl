import { beforeEach, describe, expect, it, vi } from 'vitest'

const durable = vi.hoisted(() => {
  const values = new Map<string, string>()
  let available = true
  let state: 'ready' | 'degraded' = 'ready'
  let pendingWrites = 0
  let chain: Promise<void> = Promise.resolve()
  return {
    values,
    flushPendingDbWrites: vi.fn(async () => {
      await chain
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
    dbPut: vi.fn((key: string, value: string) => {
      pendingWrites += 1
      const next = chain.then(async () => {
        if (available) values.set(key, value)
        pendingWrites -= 1
      })
      chain = next.catch(() => undefined)
      return next
    }),
    dbDelete: vi.fn(async (key: string) => {
      pendingWrites += 1
      if (available) values.delete(key)
      pendingWrites -= 1
    }),
    recordEntityChanges: vi.fn(async () => undefined),
    setAvailable(next: boolean) {
      available = next
      state = next ? 'ready' : 'degraded'
    },
    reset() {
      values.clear()
      available = true
      state = 'ready'
      pendingWrites = 0
      chain = Promise.resolve()
      this.flushPendingDbWrites.mockClear()
      this.getDbStatus.mockClear()
      this.readKvSnapshot.mockClear()
      this.dbPut.mockClear()
      this.dbDelete.mockClear()
      this.recordEntityChanges.mockClear()
    }
  }
})

vi.mock('../core/db.ts', () => ({
  DEVICE_ID: 'test-device',
  dbDelete: durable.dbDelete,
  dbPut: durable.dbPut,
  flushPendingDbWrites: durable.flushPendingDbWrites,
  getDbStatus: durable.getDbStatus,
  readKvSnapshot: durable.readKvSnapshot,
  recordEntityChanges: durable.recordEntityChanges
}))

import { resetStoreCache } from '../core/storage'
import { todayAsyncRepository } from '../domain/today/repository'
import type { TodayPlan } from '../domain/today/model'

function plan(date: string, revision = 1): TodayPlan {
  return {
    date,
    load: null,
    focusActionIds: [],
    why: '',
    mustProtect: [],
    letGo: [],
    review: { observation: '', analysis: '', adjustment: '', seed: '' },
    revision,
    updatedAt: 1
  }
}

describe('todayAsyncRepository', () => {
  beforeEach(() => {
    durable.reset()
    localStorage.clear()
    resetStoreCache()
  })

  it('reads and writes plans through the durable async seam', async () => {
    await expect(todayAsyncRepository.list()).resolves.toEqual([])
    const created = await todayAsyncRepository.get('2026-08-22')
    expect(created.revision).toBe(1)
    const updated = await todayAsyncRepository.update('2026-08-22', { why: '保护主线' }, 1)
    expect(updated).toMatchObject({ date: '2026-08-22', why: '保护主线', revision: 2 })
    await expect(todayAsyncRepository.list()).resolves.toMatchObject([{ date: '2026-08-22', revision: 2 }])
    expect(durable.values.get('b_mvpTodayPlans')).toContain('保护主线')
  })

  it('supports imported replacement and preserves unchanged imports', async () => {
    const imported = plan('2026-08-21')
    await expect(todayAsyncRepository.replaceImported(imported)).resolves.toBe('replaced')
    await expect(todayAsyncRepository.replaceImported(imported)).resolves.toBe('unchanged')
    await expect(todayAsyncRepository.replaceImported({ ...imported, why: '新版本' })).resolves.toBe('replaced')
    await expect(todayAsyncRepository.get('2026-08-21')).resolves.toMatchObject({ why: '新版本' })
  })

  it('rejects stale revision updates without changing the plan', async () => {
    await todayAsyncRepository.replaceImported(plan('2026-08-20', 3))
    await expect(todayAsyncRepository.update('2026-08-20', { why: '过期写入' }, 2))
      .rejects.toThrow('Today 2026-08-20 revision conflict')
    await expect(todayAsyncRepository.get('2026-08-20')).resolves.toMatchObject({ revision: 3, why: '' })
  })

  it('reports durable readiness and exposes the IndexedDB downgrade', async () => {
    await todayAsyncRepository.replaceImported(plan('2026-08-19'))
    await expect(todayAsyncRepository.ready()).resolves.toMatchObject({ durable: true, state: 'ready', pendingWrites: 0 })
    durable.setAvailable(false)
    await todayAsyncRepository.update('2026-08-19', { why: '离线保存' })
    await expect(todayAsyncRepository.ready()).resolves.toMatchObject({ durable: false, state: 'degraded', available: false })
    await expect(todayAsyncRepository.get('2026-08-19')).resolves.toMatchObject({ why: '离线保存' })
  })
})
