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
import { matterAsyncRepository } from '../domain/matter/repository'
import { MatterDomainError, type Matter } from '../domain/matter/model'

function matter(calmyId: string, title: string, revision = 1, status: Matter['status'] = 'active'): Matter {
  return {
    calmyId,
    title,
    why: '验证核心矛盾',
    primaryContradiction: '重要但紧急',
    status,
    currentStage: 'wood',
    trajectory: 'stable',
    evidenceIds: [],
    createdAt: 1,
    updatedAt: revision,
    revision
  }
}

describe('matterAsyncRepository', () => {
  beforeEach(() => {
    durable.reset()
    localStorage.clear()
    resetStoreCache()
  })

  it('prioritizes the durable snapshot over stale localStorage', async () => {
    localStorage.setItem('b_matters', JSON.stringify([matter('stale', '旧缓存')]))
    durable.values.set('b_matters', JSON.stringify([matter('durable', '持久快照')]))

    await expect(matterAsyncRepository.list()).resolves.toEqual([matter('durable', '持久快照')])
    await expect(matterAsyncRepository.find('durable')).resolves.toMatchObject({ title: '持久快照' })
    await expect(matterAsyncRepository.find('stale')).resolves.toBeUndefined()
  })

  it('creates and updates matters through the durable async boundary', async () => {
    await expect(matterAsyncRepository.create({ title: '  异步事项  ', why: '保持聚焦' })).resolves.toMatchObject({
      title: '异步事项',
      status: 'active',
      revision: 1
    })
    const created = (await matterAsyncRepository.list())[0]
    const updated = await matterAsyncRepository.update(created.calmyId, { title: '异步事项已更新' }, { expectedRevision: 1 })

    expect(updated).toMatchObject({ calmyId: created.calmyId, title: '异步事项已更新', revision: 2 })
    expect(durable.values.get('b_matters')).toContain('异步事项已更新')
    await expect(matterAsyncRepository.update(created.calmyId, {}, { expectedRevision: 1 })).rejects.toMatchObject({
      code: 'REVISION_CONFLICT'
    })
  })

  it('preserves title validation and not-found errors', async () => {
    await expect(matterAsyncRepository.create({ title: '   ' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED'
    })
    await expect(matterAsyncRepository.update('missing', { title: '不会写入' })).rejects.toMatchObject({
      code: 'NOT_FOUND'
    })

    const created = await matterAsyncRepository.create({ title: '有效事项' })
    await expect(matterAsyncRepository.update(created.calmyId, { title: '   ' })).rejects.toBeInstanceOf(MatterDomainError)
    await expect(matterAsyncRepository.find(created.calmyId)).resolves.toMatchObject({ title: '有效事项', revision: 1 })
  })

  it('imports, replaces, and rejects conflicting matter snapshots', async () => {
    const imported = matter('imported', '导入事项')

    await expect(matterAsyncRepository.importEntity(imported)).resolves.toBe('created')
    await expect(matterAsyncRepository.importEntity(imported)).resolves.toBe('unchanged')
    await expect(matterAsyncRepository.importEntity({ ...imported, title: '本地冲突' })).rejects.toMatchObject({
      code: 'REVISION_CONFLICT'
    })
    await expect(matterAsyncRepository.replaceImported({ ...imported, title: '替换事项', revision: 2 })).resolves.toBe('replaced')
    await expect(matterAsyncRepository.replaceImported({ ...imported, title: '替换事项', revision: 2 })).resolves.toBe('unchanged')
    await expect(matterAsyncRepository.find('imported')).resolves.toMatchObject({ title: '替换事项', revision: 2 })
  })

  it('keeps transition, pause, resume, archive, and restore semantics', async () => {
    const created = await matterAsyncRepository.create({ title: '状态事项' })
    const paused = await matterAsyncRepository.pause(created.calmyId, { expectedRevision: 1 })
    expect(paused).toMatchObject({ status: 'paused', revision: 2 })

    const resumed = await matterAsyncRepository.resume(created.calmyId, { expectedRevision: 2 })
    expect(resumed).toMatchObject({ status: 'active', revision: 3 })
    const archived = await matterAsyncRepository.archive(created.calmyId, { expectedRevision: 3 })
    expect(archived).toMatchObject({ status: 'archived', revision: 4 })
    const restored = await matterAsyncRepository.restore(created.calmyId, { expectedRevision: 4 })
    expect(restored).toMatchObject({ status: 'paused', revision: 5 })

    await expect(matterAsyncRepository.transition(created.calmyId, 'draft')).rejects.toMatchObject({
      code: 'INVALID_TRANSITION'
    })
  })

  it('reports durable readiness and degraded fallback status', async () => {
    await matterAsyncRepository.create({ title: '持久化状态' })
    await expect(matterAsyncRepository.ready()).resolves.toMatchObject({ durable: true, state: 'ready', pendingWrites: 0 })

    durable.setAvailable(false)
    await expect(matterAsyncRepository.ready()).resolves.toMatchObject({ durable: false, state: 'degraded', available: false })
  })
})
