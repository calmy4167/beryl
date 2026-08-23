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
      this.readKvSnapshot.mockClear()
      this.getDbStatus.mockClear()
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
import { caseAsyncRelationRepository, caseAsyncRepository } from '../domain/case/repository'
import type { CaseItem } from '../domain/case/model'

function item(id: string, title: string): CaseItem {
  return {
    id,
    title,
    problem: '问题',
    desiredOutcome: '结果',
    status: 'active',
    currentPhase: 'wood',
    priority: 2,
    createdAt: 1,
    updatedAt: 1,
    phaseNotes: {},
    wood: { constraints: '', paths: '' },
    decisions: [],
    reviews: []
  }
}

describe('caseAsyncRepository', () => {
  beforeEach(() => {
    durable.reset()
    localStorage.clear()
    resetStoreCache()
  })

  afterEach(() => {
    resetStoreCache()
    localStorage.clear()
  })

  it('prioritizes the durable IndexedDB snapshot over stale localStorage', async () => {
    localStorage.setItem('b_cases', JSON.stringify([item('stale', '旧缓存')]))
    durable.values.set('b_cases', JSON.stringify([item('durable', '持久快照')]))

    await expect(caseAsyncRepository.list()).resolves.toEqual([item('durable', '持久快照')])
    await expect(caseAsyncRepository.get('durable')).resolves.toMatchObject({ title: '持久快照' })
    await expect(caseAsyncRepository.get('stale')).resolves.toBeUndefined()
  })

  it('writes, updates, imports, and reports durable readiness through the async facade', async () => {
    const created = await caseAsyncRepository.create({ title: '  异步案例  ', problem: '先验证' })
    expect(created.title).toBe('异步案例')
    await expect(caseAsyncRepository.update(created.id, { status: 'paused' })).resolves.toBe(true)
    await expect(caseAsyncRepository.get(created.id)).resolves.toMatchObject({ status: 'paused' })

    const imported = item('imported', '导入案例')
    await expect(caseAsyncRepository.importEntity(imported)).resolves.toBe('created')
    await expect(caseAsyncRepository.importEntity(imported)).resolves.toBe('unchanged')
    await expect(caseAsyncRepository.replaceImported({ ...imported, title: '替换案例' })).resolves.toBe('replaced')
    await expect(caseAsyncRepository.get('imported')).resolves.toMatchObject({ title: '替换案例' })

    expect(durable.values.get('b_cases')).toContain('替换案例')
    await expect(caseAsyncRepository.ready()).resolves.toMatchObject({ durable: true, state: 'ready', pendingWrites: 0 })
  })

  it('keeps case relations on the async repository path', async () => {
    const relation = await caseAsyncRelationRepository.link('case-1', 'transaction', 'transaction-1', 'earth')
    await expect(caseAsyncRelationRepository.listForTarget('transaction', 'transaction-1')).resolves.toEqual([relation])
    await expect(caseAsyncRelationRepository.unlinkForTarget('transaction', 'transaction-1')).resolves.toBe(true)
    await expect(caseAsyncRelationRepository.listForTarget('transaction', 'transaction-1')).resolves.toEqual([])
  })
})
