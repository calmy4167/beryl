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
import { actionAsyncRepository } from '../domain/action/repository'
import type { ActionItem } from '../domain/action/model'

function action(calmyId: string, revision = 1): ActionItem {
  return {
    calmyId,
    title: '同步后的行动',
    date: '2026-08-22',
    status: 'planned',
    createdAt: 1,
    updatedAt: revision,
    revision
  }
}

describe('actionAsyncRepository', () => {
  beforeEach(() => {
    durable.reset()
    localStorage.clear()
    resetStoreCache()
  })

  it('reads the durable snapshot instead of stale localStorage', async () => {
    localStorage.setItem('b_mvpActions', JSON.stringify([action('stale')]))
    durable.values.set('b_mvpActions', JSON.stringify([action('durable')]))

    await expect(actionAsyncRepository.list()).resolves.toEqual([action('durable')])
    await expect(actionAsyncRepository.get('durable')).resolves.toEqual(action('durable'))
  })

  it('creates and updates actions through the durable async boundary', async () => {
    const created = await actionAsyncRepository.create({ title: '整理收件箱', date: '2026-08-22' })
    const updated = await actionAsyncRepository.update(created.calmyId, { title: '整理完成' }, { expectedRevision: 1 })

    expect(created).toMatchObject({ title: '整理收件箱', status: 'planned', revision: 1 })
    expect(updated).toMatchObject({ calmyId: created.calmyId, title: '整理完成', revision: 2 })
    await expect(actionAsyncRepository.get(created.calmyId)).resolves.toEqual(updated)
    expect(durable.values.get('b_mvpActions')).toContain('整理完成')
  })

  it('imports and replaces actions while preserving unchanged and conflict behavior', async () => {
    const imported = action('imported-action')

    await expect(actionAsyncRepository.importEntity(imported)).resolves.toBe('created')
    await expect(actionAsyncRepository.importEntity(imported)).resolves.toBe('unchanged')
    await expect(actionAsyncRepository.replaceImported({ ...imported, title: '替换后的行动', revision: 2 })).resolves.toBe('replaced')
    await expect(actionAsyncRepository.get(imported.calmyId)).resolves.toMatchObject({ title: '替换后的行动', revision: 2 })
    await expect(actionAsyncRepository.importEntity({ ...imported, title: '本地冲突' })).rejects.toThrow('has local changes')
  })

  it('reports durable readiness and exposes the degraded fallback', async () => {
    await actionAsyncRepository.create({ title: '检查持久化', date: '2026-08-22' })
    await expect(actionAsyncRepository.ready()).resolves.toMatchObject({ durable: true, state: 'ready', pendingWrites: 0 })

    durable.setAvailable(false)
    const current = (await actionAsyncRepository.list())[0]
    await actionAsyncRepository.update(current.calmyId, { title: '离线更新' })

    await expect(actionAsyncRepository.ready()).resolves.toMatchObject({ durable: false, state: 'degraded', available: false })
    await expect(actionAsyncRepository.get(current.calmyId)).resolves.toMatchObject({ title: '离线更新', revision: 2 })
  })

  it('reads async mutations and command results from durable snapshots', async () => {
    const durableAction = action('durable-action')
    const durableMutation = {
      id: 'mutation-1', entity: 'action', entityId: durableAction.calmyId, operation: 'create', commandId: 'durable-command',
      actor: 'user', actorId: 'local-user', sourceIds: [], fromRevision: 0, toRevision: 1, occurredAt: 1, patch: durableAction
    }
    localStorage.setItem('b_actionMutations', JSON.stringify([{ ...durableMutation, id: 'stale-mutation' }]))
    localStorage.setItem('b_actionCommands', JSON.stringify([{ id: 'durable-command', result: action('stale-action') }]))
    durable.values.set('b_actionMutations', JSON.stringify([durableMutation]))
    durable.values.set('b_actionCommands', JSON.stringify([{ id: 'durable-command', result: durableAction }]))

    await expect(actionAsyncRepository.mutations('durable-command')).resolves.toEqual([durableMutation])
    await expect(actionAsyncRepository.create({ title: '不会重复创建', date: '2026-08-22' }, { commandId: 'durable-command' })).resolves.toEqual(durableAction)
  })

  it('writes mutation and command journals through durable async repositories', async () => {
    const created = await actionAsyncRepository.create({ title: '写入日志', date: '2026-08-22' }, { commandId: 'create-command' })
    const updated = await actionAsyncRepository.update(created.calmyId, { title: '写入更新日志' }, { commandId: 'update-command', expectedRevision: 1 })

    expect(JSON.parse(durable.values.get('b_actionMutations') || '[]')).toEqual(expect.arrayContaining([
      expect.objectContaining({ commandId: 'create-command', operation: 'create', toRevision: 1 }),
      expect.objectContaining({ commandId: 'update-command', operation: 'update', fromRevision: 1, toRevision: 2 })
    ]))
    expect(JSON.parse(durable.values.get('b_actionCommands') || '[]')).toEqual(expect.arrayContaining([
      { id: 'create-command', result: created },
      { id: 'update-command', result: updated }
    ]))
    await expect(actionAsyncRepository.mutations()).resolves.toHaveLength(2)
  })

  it('keeps repeated command IDs idempotent without adding a second action or mutation', async () => {
    const first = await actionAsyncRepository.create({ title: '只创建一次', date: '2026-08-22' }, { commandId: 'idempotent-create' })
    const repeated = await actionAsyncRepository.create({ title: '不应覆盖', date: '2026-08-23' }, { commandId: 'idempotent-create' })

    expect(repeated).toEqual(first)
    await expect(actionAsyncRepository.list()).resolves.toEqual([first])
    await expect(actionAsyncRepository.mutations('idempotent-create')).resolves.toHaveLength(1)
    expect(JSON.parse(durable.values.get('b_actionCommands') || '[]')).toEqual([{ id: 'idempotent-create', result: first }])
  })

  it('keeps import and replace journals durable and rejects invalid async mutations', async () => {
    const imported = action('imported-durable')
    const replaced = { ...imported, title: '替换后的 durable 行动', revision: 2 }

    await expect(actionAsyncRepository.importEntity(imported)).resolves.toBe('created')
    await expect(actionAsyncRepository.replaceImported(replaced)).resolves.toBe('replaced')
    await expect(actionAsyncRepository.mutations('import:imported-durable:1')).resolves.toEqual([
      expect.objectContaining({ commandId: 'import:imported-durable:1', operation: 'create' })
    ])
    await expect(actionAsyncRepository.mutations('import-replace:imported-durable:2')).resolves.toEqual([
      expect.objectContaining({ commandId: 'import-replace:imported-durable:2', operation: 'update' })
    ])
    expect(JSON.parse(durable.values.get('b_actionCommands') || '[]')).toEqual(expect.arrayContaining([
      { id: 'import:imported-durable:1', result: imported },
      { id: 'import-replace:imported-durable:2', result: replaced }
    ]))

    await expect(actionAsyncRepository.create({ title: '   ', date: '2026-08-22' }, { commandId: 'invalid-create' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(actionAsyncRepository.update('missing-action', { title: '不存在' }, { commandId: 'missing-update' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(actionAsyncRepository.update(imported.calmyId, { title: '过期修订' }, { commandId: 'stale-update', expectedRevision: 1 })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    expect(JSON.parse(durable.values.get('b_actionCommands') || '[]')).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'invalid-create' }),
      expect.objectContaining({ id: 'missing-update' }),
      expect.objectContaining({ id: 'stale-update' })
    ]))
  })
})
