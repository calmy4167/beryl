import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Cycle, Stage } from '@/domain/unified/model'
import type { RealityRecord } from '@/domain/record/model'

const isolated = vi.hoisted(() => {
  const values = new Map<string, string>()
  const stages = new Map<string, Stage>()
  const cycles = new Map<string, Cycle>()
  let available = true
  let state: 'ready' | 'degraded' = 'ready'
  let pendingWrites = 0
  let writeChain: Promise<void> = Promise.resolve()

  const unifiedAsyncRepository = {
    find: vi.fn(async (entityType: string, id: string) => {
      if (entityType === 'stage') return stages.get(id)
      if (entityType === 'cycle') return cycles.get(id)
      return undefined
    }),
    update: vi.fn(async (entityType: string, id: string, patch: Partial<Stage>) => {
      if (entityType !== 'stage') return undefined
      const current = stages.get(id)
      if (!current) return undefined
      const next = { ...current, ...patch, updatedAt: Date.now(), revision: current.revision + 1 }
      stages.set(id, next)
      return next
    })
  }

  return {
    values,
    stages,
    cycles,
    unifiedAsyncRepository,
    unifiedRepository: { find: vi.fn(() => undefined) },
    dbPut: vi.fn((key: string, value: string) => {
      pendingWrites += 1
      const next = writeChain.then(async () => {
        if (available) values.set(key, value)
        pendingWrites -= 1
      })
      writeChain = next.catch(() => undefined)
      return next
    }),
    dbDelete: vi.fn(async (key: string) => {
      pendingWrites += 1
      if (available) values.delete(key)
      pendingWrites -= 1
    }),
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
    recordEntityChanges: vi.fn(async () => undefined),
    setAvailable(next: boolean) {
      available = next
      state = next ? 'ready' : 'degraded'
    },
    reset() {
      values.clear()
      stages.clear()
      cycles.clear()
      available = true
      state = 'ready'
      pendingWrites = 0
      writeChain = Promise.resolve()
      this.unifiedAsyncRepository.find.mockClear()
      this.unifiedAsyncRepository.update.mockClear()
      this.dbPut.mockClear()
      this.dbDelete.mockClear()
      this.flushPendingDbWrites.mockClear()
      this.getDbStatus.mockClear()
      this.readKvSnapshot.mockClear()
      this.recordEntityChanges.mockClear()
      this.unifiedRepository.find.mockClear()
    }
  }
})

vi.mock('@/domain/unified', () => ({
  unifiedAsyncRepository: isolated.unifiedAsyncRepository,
  unifiedRepository: isolated.unifiedRepository
}))

vi.mock('../core/db.ts', () => ({
  DEVICE_ID: 'test-device',
  dbDelete: isolated.dbDelete,
  dbPut: isolated.dbPut,
  flushPendingDbWrites: isolated.flushPendingDbWrites,
  getDbStatus: isolated.getDbStatus,
  readKvSnapshot: isolated.readKvSnapshot,
  recordEntityChanges: isolated.recordEntityChanges
}))

import { resetStoreCache } from '../core/storage'
import { recordAsyncRepository } from '../domain/record/repository'

function record(calmyId: string, overrides: Partial<RealityRecord> = {}): RealityRecord {
  return {
    calmyId, type: 'fact', body: '导入的现实记录', occurredAt: 10, createdAt: 10, updatedAt: 10,
    source: 'import', evidenceIds: [], revision: 1, ...overrides
  }
}

function cycle(calmyId: string, matterId: string): Cycle {
  return {
    calmyId, entityType: 'cycle', matterId, title: '恢复周期', theme: '稳定', currentStage: 'wood',
    status: 'active', trajectory: 'stable', stageIds: [], createdAt: 1, updatedAt: 1, revision: 1, source: 'user'
  }
}

function stage(calmyId: string, cycleId: string): Stage {
  return {
    calmyId, entityType: 'stage', cycleId, title: '观察现实', element: 'wood', status: 'active',
    actionIds: [], recordIds: [], createdAt: 1, updatedAt: 1, revision: 1, source: 'user'
  }
}

describe('recordAsyncRepository', () => {
  beforeEach(() => {
    isolated.reset()
    localStorage.clear()
    resetStoreCache()
  })

  it('reads the durable snapshot instead of stale localStorage', async () => {
    localStorage.setItem('b_realityRecords', JSON.stringify([record('stale', { body: '旧缓存' })]))
    isolated.values.set('b_realityRecords', JSON.stringify([record('durable', { body: '持久快照' })]))

    await expect(recordAsyncRepository.list()).resolves.toEqual([record('durable', { body: '持久快照' })])
    await expect(recordAsyncRepository.find('durable')).resolves.toMatchObject({ body: '持久快照' })
  })

  it('creates and revises records while preserving AI evidence and Stage association', async () => {
    const owningCycle = cycle('cycle-1', 'matter-1')
    const owningStage = stage('stage-1', owningCycle.calmyId)
    isolated.cycles.set(owningCycle.calmyId, owningCycle)
    isolated.stages.set(owningStage.calmyId, owningStage)

    const created = await recordAsyncRepository.create({
      type: 'observation', source: 'ai', body: '可能是睡眠影响学习', evidenceIds: ['evidence-1'], stageId: owningStage.calmyId
    }, { actorId: 'assistant' })
    const revised = await recordAsyncRepository.revise(created.calmyId, '确认是睡眠影响学习', '补充证据', 'ai', 1, 'assistant')

    expect(created).toMatchObject({ matterId: 'matter-1', cycleId: 'cycle-1', stageId: 'stage-1', revision: 1 })
    expect(revised).toMatchObject({ body: '确认是睡眠影响学习', revision: 2 })
    expect(isolated.stages.get('stage-1')?.recordIds).toContain(created.calmyId)
    expect(JSON.parse(isolated.values.get('b_realityRecordRevisions') || '[]')).toHaveLength(2)
    expect(isolated.values.get('b_realityRecords')).toContain('确认是睡眠影响学习')
  })

  it('rejects invalid bodies, unsupported AI observations, missing Stages, and stale revisions', async () => {
    await expect(recordAsyncRepository.create({ body: '   ' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(recordAsyncRepository.create({ type: 'observation', source: 'ai', body: '无证据' }))
      .rejects.toThrow('AI observations require evidenceIds')
    await expect(recordAsyncRepository.create({ body: '缺失阶段', stageId: 'missing-stage' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })

    const created = await recordAsyncRepository.create({ body: '原始记录' })
    await recordAsyncRepository.revise(created.calmyId, '第一次修订', '修正', 'user', 1)
    await expect(recordAsyncRepository.revise(created.calmyId, '过期修订', '过期', 'user', 1))
      .rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    await expect(recordAsyncRepository.find(created.calmyId)).resolves.toMatchObject({ body: '第一次修订', revision: 2 })
  })

  it('imports, replaces, and moves the reverse Stage index without losing conflict semantics', async () => {
    const firstCycle = cycle('cycle-a', 'matter-import')
    const secondCycle = cycle('cycle-b', 'matter-import')
    const firstStage = stage('stage-a', firstCycle.calmyId)
    const secondStage = stage('stage-b', secondCycle.calmyId)
    isolated.cycles.set(firstCycle.calmyId, firstCycle)
    isolated.cycles.set(secondCycle.calmyId, secondCycle)
    isolated.stages.set(firstStage.calmyId, firstStage)
    isolated.stages.set(secondStage.calmyId, secondStage)
    const imported = record('record-import', { cycleId: firstCycle.calmyId, stageId: firstStage.calmyId })

    await expect(recordAsyncRepository.importEntity(imported)).resolves.toBe('created')
    await expect(recordAsyncRepository.importEntity(imported)).resolves.toBe('unchanged')
    await expect(recordAsyncRepository.importEntity({ ...imported, body: '本地冲突' })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    await expect(recordAsyncRepository.replaceImported({
      ...imported, body: '替换后的现实', cycleId: secondCycle.calmyId, stageId: secondStage.calmyId, revision: 2, updatedAt: 11
    })).resolves.toBe('replaced')

    expect(isolated.stages.get(firstStage.calmyId)?.recordIds).not.toContain(imported.calmyId)
    expect(isolated.stages.get(secondStage.calmyId)?.recordIds).toContain(imported.calmyId)
    await expect(recordAsyncRepository.find(imported.calmyId)).resolves.toMatchObject({ body: '替换后的现实', revision: 2 })
  })

  it('reports durable readiness and keeps the async boundary usable after IndexedDB degrades', async () => {
    await recordAsyncRepository.create({ body: '准备检查' })
    await expect(recordAsyncRepository.ready()).resolves.toMatchObject({ durable: true, state: 'ready', pendingWrites: 0 })

    isolated.setAvailable(false)
    const current = (await recordAsyncRepository.list())[0]
    await recordAsyncRepository.revise(current.calmyId, '降级后仍可修订', '离线修订')
    await expect(recordAsyncRepository.ready()).resolves.toMatchObject({ durable: false, state: 'degraded', available: false })
    await expect(recordAsyncRepository.find(current.calmyId)).resolves.toMatchObject({ body: '降级后仍可修订', revision: 2 })
  })
})
