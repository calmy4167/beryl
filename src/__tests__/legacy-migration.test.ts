import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackup, parseBackup } from '@/core/backup'
import { legacyMigrationSample } from './fixtures/legacy-migration-sample'

const durable = vi.hoisted(() => {
  const values = new Map<string, string>()
  let chain: Promise<void> = Promise.resolve()
  const dbPut = vi.fn((key: string, value: string) => {
    chain = chain.then(async () => { values.set(key, value) })
    return chain
  })
  const flushPendingDbWrites = vi.fn(async () => { await chain })
  return {
    values, dbPut, flushPendingDbWrites,
    readKvSnapshot: vi.fn(async () => Object.fromEntries(values)),
    getDbStatus: vi.fn(() => ({ state: 'ready' as const, available: true, pendingWrites: 0, restoredKeys: 0, lastMirrorAt: null, lastError: null })),
    reset() { values.clear(); chain = Promise.resolve(); dbPut.mockClear(); flushPendingDbWrites.mockClear(); this.readKvSnapshot.mockClear(); this.getDbStatus.mockClear() }
  }
})

vi.mock('../core/db.ts', () => ({
  DEVICE_ID: 'migration-test-device',
  dbDelete: vi.fn(async () => undefined),
  dbPut: durable.dbPut,
  flushPendingDbWrites: durable.flushPendingDbWrites,
  getDbStatus: durable.getDbStatus,
  readKvSnapshot: durable.readKvSnapshot,
  recordEntityChanges: vi.fn(async () => undefined)
}))

import { resetStoreCache } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import { captureAsyncRepository } from '@/domain/capture'
import { ensureLegacyMigration, legacyMapping, legacyTargetId, rollbackLegacyMigration } from '@/domain/legacy/migration'
import { matterAsyncRepository } from '@/domain/matter/repository'

describe('legacy Case/Task/inbox migration', () => {
  beforeEach(() => {
    durable.reset()
    localStorage.clear()
    resetStoreCache()
  })

  it('copies legacy records to Matter/Action/Capture without changing the source collections', async () => {
    const oldCase = {
      id: 'case-1', title: '旧课题', problem: '需要梳理', desiredOutcome: '形成下一步', status: 'active', currentPhase: 'wood', priority: 2,
      createdAt: 100, updatedAt: 200, phaseNotes: {}, wood: { constraints: '', paths: '' }, decisions: [], reviews: []
    }
    const oldTask = { id: 'task-1', title: '完成旧任务', priority: '高', date: '2026-08-20 09:00', done: true }
    const oldInbox = { id: 'inbox-1', text: '一段旧收集', date: '2026-08-20 10:00' }
    const oldRelations = [{ id: 'relation-1', caseId: 'case-1', targetType: 'task', targetId: 'task-1', phase: 'fire', createdAt: 100 }]
    for (const [key, value] of Object.entries({
      b_cases: [oldCase], b_tasks: [oldTask], b_inbox: [oldInbox], b_caseRelations: oldRelations
    })) durable.values.set(key, JSON.stringify(value))
    localStorage.setItem('b_cases', JSON.stringify([oldCase]))
    localStorage.setItem('b_tasks', JSON.stringify([oldTask]))
    localStorage.setItem('b_inbox', JSON.stringify([oldInbox]))
    localStorage.setItem('b_caseRelations', JSON.stringify(oldRelations))
    resetStoreCache()

    const report = await ensureLegacyMigration()

    expect(report.status).toBe('completed')
    expect(report.migrated).toEqual({ cases: 1, tasks: 1, inbox: 1 })
    await expect(matterAsyncRepository.find(legacyTargetId('case', 'case-1'))).resolves.toMatchObject({ title: '旧课题', why: '需要梳理\n\n目标：形成下一步', status: 'active' })
    await expect(actionAsyncRepository.find(legacyTargetId('task', 'task-1'))).resolves.toMatchObject({ title: '完成旧任务', date: '2026-08-20', status: 'done', matterId: legacyTargetId('case', 'case-1') })
    await expect(captureAsyncRepository.find(legacyTargetId('inbox', 'inbox-1'))).resolves.toMatchObject({ body: '一段旧收集', status: 'inbox' })
    expect(legacyMapping('case', 'case-1')).toMatchObject({ targetType: 'matter', targetId: legacyTargetId('case', 'case-1') })
    expect(legacyMapping('task', 'task-1')).toMatchObject({ targetType: 'action', targetId: legacyTargetId('task', 'task-1') })
    expect(legacyMapping('inbox', 'inbox-1')).toMatchObject({ targetType: 'capture', targetId: legacyTargetId('inbox', 'inbox-1') })
    expect(localStorage.getItem('b_cases')).toBe(JSON.stringify([oldCase]))
    expect(localStorage.getItem('b_tasks')).toBe(JSON.stringify([oldTask]))
    expect(localStorage.getItem('b_inbox')).toBe(JSON.stringify([oldInbox]))

    await actionAsyncRepository.update(legacyTargetId('task', 'task-1'), { resultNote: '用户已补充结果' })
    const rollback = await rollbackLegacyMigration()
    expect(rollback.removed).toEqual({ cases: 1, tasks: 0, inbox: 1 })
    expect(rollback.preserved).toEqual({ cases: 0, tasks: 1, inbox: 0 })
    await expect(matterAsyncRepository.find(legacyTargetId('case', 'case-1'))).resolves.toBeUndefined()
    await expect(captureAsyncRepository.find(legacyTargetId('inbox', 'inbox-1'))).resolves.toBeUndefined()
    await expect(actionAsyncRepository.find(legacyTargetId('task', 'task-1'))).resolves.toMatchObject({ resultNote: '用户已补充结果', revision: 2 })
    expect(legacyMapping('case', 'case-1')).toBeUndefined()
    expect(legacyMapping('task', 'task-1')).toBeDefined()
    expect(legacyMapping('inbox', 'inbox-1')).toBeUndefined()
  })

  it('rehearses export, isolated clear, import, migration and protected rollback with a real-shaped sample', async () => {
    const { cases, tasks, inbox, relations } = legacyMigrationSample
    const source = {
      b_cases: cases,
      b_tasks: tasks,
      b_inbox: inbox,
      b_caseRelations: relations
    }
    for (const [key, value] of Object.entries(source)) {
      durable.values.set(key, JSON.stringify(value))
      localStorage.setItem(key, JSON.stringify(value))
    }
    resetStoreCache()

    const exported = createBackup(localStorage)
    expect(Object.keys(exported)).toEqual(expect.arrayContaining(['b_cases', 'b_tasks', 'b_inbox', 'b_caseRelations']))

    Object.keys(source).forEach(key => localStorage.removeItem(key))
    resetStoreCache()
    expect(localStorage.getItem('b_cases')).toBeNull()
    const imported = parseBackup(JSON.parse(JSON.stringify(exported)))
    Object.entries(imported).forEach(([key, value]) => localStorage.setItem(key, value))
    resetStoreCache()

    const report = await ensureLegacyMigration()
    expect(report).toMatchObject({ status: 'completed', migrated: { cases: 1, tasks: 1, inbox: 1 } })
    expect(JSON.parse(localStorage.getItem('b_cases') || 'null')).toEqual(cases)
    expect(JSON.parse(localStorage.getItem('b_tasks') || 'null')).toEqual(tasks)
    expect(JSON.parse(localStorage.getItem('b_inbox') || 'null')).toEqual(inbox)
    await expect(actionAsyncRepository.find(legacyTargetId('task', 'task-migration-sample'))).resolves.toMatchObject({
      matterId: legacyTargetId('case', 'case-migration-sample'),
      title: '整理本周最重要的三件事'
    })

    await actionAsyncRepository.update(legacyTargetId('task', 'task-migration-sample'), { resultNote: '用户已经补充结果' })
    const rollback = await rollbackLegacyMigration()
    expect(rollback.removed).toEqual({ cases: 1, tasks: 0, inbox: 1 })
    expect(rollback.preserved).toEqual({ cases: 0, tasks: 1, inbox: 0 })
    await expect(actionAsyncRepository.find(legacyTargetId('task', 'task-migration-sample'))).resolves.toMatchObject({ resultNote: '用户已经补充结果' })
  })
})
