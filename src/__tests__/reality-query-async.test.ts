import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import { recordAsyncRepository } from '@/domain/record/repository'
import { listActionRecordDocumentsAsync, listRealityDocumentsAsync } from '@/domain/reality'

describe('async reality evidence query', () => {
  beforeEach(() => {
    localStorage.clear()
    resetStoreCache()
  })

  afterEach(() => {
    localStorage.clear()
    resetStoreCache()
  })

  it('reads Action and Record evidence through async repositories', async () => {
    const action = await actionAsyncRepository.create({ title: '整理证据', date: '2026-08-28' })
    const record = await recordAsyncRepository.create({ body: '今天完成了证据整理', occurredAt: Date.parse('2026-08-28T12:00:00') })

    const documents = await listActionRecordDocumentsAsync({ types: ['action', 'record'], text: '证据' })

    expect(documents.map(item => item.id)).toEqual(expect.arrayContaining([action.calmyId, record.calmyId]))
    expect(documents.every(item => item.entityType === 'action' || item.entityType === 'record')).toBe(true)
  })

  it('preserves query boundaries for empty and reversed ranges', async () => {
    await actionAsyncRepository.create({ title: '边界行动', date: '2026-08-28' })

    await expect(listActionRecordDocumentsAsync({ limit: 0 })).resolves.toEqual([])
    await expect(listActionRecordDocumentsAsync({ from: Date.parse('2026-08-29T00:00:00'), to: Date.parse('2026-08-28T00:00:00') })).resolves.toEqual([])
  })

  it('loads the complete cross-domain document view without synchronous repository reads', async () => {
    const action = await actionAsyncRepository.create({ title: '完整视图行动', date: '2026-08-28' })
    const documents = await listRealityDocumentsAsync({ types: ['action'] })

    expect(documents).toEqual([expect.objectContaining({ id: action.calmyId, title: '完整视图行动', entityType: 'action' })])
  })

  it('keeps legacy collection keys readable through the async compatibility boundary', async () => {
    localStorage.setItem('b_tasks', JSON.stringify([{ id: 'legacy-task', title: '旧键任务', date: '2026-08-28', done: false }]))

    const documents = await listRealityDocumentsAsync({ types: ['task'] })

    expect(documents).toEqual([expect.objectContaining({ id: 'legacy-task', title: '旧键任务', entityType: 'task', route: '/app/module/tasks' })])
  })
})
