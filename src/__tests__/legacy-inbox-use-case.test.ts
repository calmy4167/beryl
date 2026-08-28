import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const durable = vi.hoisted(() => {
  const values = new Map<string, string>()
  let writeChain: Promise<void> = Promise.resolve()
  const dbPut = vi.fn((key: string, value: string) => {
    const next = writeChain.then(async () => { values.set(key, value) })
    writeChain = next.catch(() => undefined)
    return next
  })
  return {
    values,
    dbPut,
    flushPendingDbWrites: vi.fn(async () => { await writeChain }),
    readKvSnapshot: vi.fn(async () => Object.fromEntries(values)),
    getDbStatus: vi.fn(() => ({ state: 'ready', available: true, pendingWrites: 0, restoredKeys: 0, lastMirrorAt: null, lastError: null }))
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

import { flushRepositoryWrites } from '@/core/repository'
import { resetStoreCache, store } from '@/core/storage'
import { caseAsyncRepository } from '@/domain/case/repository'
import { convertLegacyInboxToCase, convertLegacyInboxToTask, legacyInboxRepositories, linkFinanceToCase } from '@/application/use-cases/legacy-inbox'

describe('legacy inbox and finance application use cases', () => {
  beforeEach(async () => {
    durable.values.clear()
    durable.dbPut.mockClear()
    durable.flushPendingDbWrites.mockClear()
    durable.readKvSnapshot.mockClear()
    localStorage.clear()
    resetStoreCache()
    await flushRepositoryWrites()
  })

  afterEach(() => {
    resetStoreCache()
    localStorage.clear()
  })

  it('converts one legacy inbox item to one task on repeated command submission', async () => {
    store.set('inbox', [{ id: 'inbox-1', text: '整理合同', date: '2026-08-24' }])
    await flushRepositoryWrites()

    const first = await convertLegacyInboxToTask({ id: 'inbox-1' }, '整理合同', 'convert-task-command', { priority: '中', date: '2026-08-24' })
    const repeated = await convertLegacyInboxToTask({ id: 'inbox-1' }, '整理合同', 'convert-task-command', { priority: '高', date: '2026-08-25' })

    expect(repeated).toEqual(first)
    await expect(legacyInboxRepositories.tasks.list()).resolves.toEqual([first.task])
    await expect(legacyInboxRepositories.inbox.list()).resolves.toEqual([])
  })

  it('keeps legacy case conversion idempotent with a stable case id', async () => {
    store.set('inbox', [{ id: 'inbox-2', text: '处理租房问题', date: '2026-08-24' }])
    await flushRepositoryWrites()

    const first = await convertLegacyInboxToCase({ id: 'inbox-2' }, '处理租房问题', 'convert-case-command')
    const repeated = await convertLegacyInboxToCase({ id: 'inbox-2' }, '处理租房问题', 'convert-case-command')

    expect(repeated).toEqual(first)
    expect((await caseAsyncRepository.list()).filter(item => item.id === first.case?.id)).toHaveLength(1)
    await expect(legacyInboxRepositories.inbox.list()).resolves.toEqual([])
  })

  it('links and unlinks Finance relations without duplicate relation rows', async () => {
    const targetCase = await caseAsyncRepository.create({ title: '现金流整理' })
    const first = await linkFinanceToCase({ caseId: targetCase.id, transactionId: 'transaction-1', phase: 'earth', commandId: 'finance-link-command' })
    const repeated = await linkFinanceToCase({ caseId: targetCase.id, transactionId: 'transaction-1', phase: 'earth', commandId: 'finance-link-command' })

    expect(repeated).toEqual(first)
    await expect(legacyInboxRepositories.commands.find('finance-link:finance-link-command')).resolves.toEqual({ id: 'finance-link:finance-link-command', result: first })

    const cleared = await linkFinanceToCase({ caseId: '', transactionId: 'transaction-1', commandId: 'finance-unlink-command' })
    expect(cleared.relation).toBeUndefined()
    await expect(legacyInboxRepositories.commands.find('finance-link:finance-unlink-command')).resolves.toMatchObject({ result: { unlinked: true } })
  })
})
