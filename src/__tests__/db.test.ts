import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dbDelete, flushPendingDbWrites, getDbStatus, initDb, dbPut } from '@/core/db'
import { createBackup } from '@/core/backup'

describe('IndexedDB durable layer', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('indexedDB', undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps only the latest value per key in the durable outbox when IndexedDB is unavailable', async () => {
    await dbPut('b_tasks', '[{"id":"task-1","title":"旧值"}]')
    await dbPut('b_tasks', '[{"id":"task-1","title":"新值"}]')

    expect(JSON.parse(localStorage.getItem('b_db_outbox') || '[]')).toEqual([
      { key: 'b_tasks', value: '[{"id":"task-1","title":"新值"}]' }
    ])
    expect(getDbStatus()).toMatchObject({ state: 'degraded', available: false, pendingWrites: 1 })
  })

  it('restores pending writes before attempting the IndexedDB mirror', async () => {
    localStorage.setItem('b_db_outbox', JSON.stringify([{ key: 'b_tasks', value: '[{"id":"task-1"}]' }]))
    localStorage.removeItem('b_tasks')

    await initDb()

    expect(localStorage.getItem('b_tasks')).toBe('[{"id":"task-1"}]')
    expect(getDbStatus()).toMatchObject({ state: 'degraded', pendingWrites: 1 })
  })

  it('does not put the internal outbox into user backups', async () => {
    localStorage.setItem('b_tasks', '[]')
    await dbPut('b_tasks', '[]')

    expect(createBackup()).toEqual({ b_tasks: '[]' })
    await flushPendingDbWrites()
  })

  it('keeps a durable deletion intent when IndexedDB is unavailable', async () => {
    localStorage.setItem('b_tasks', '[]')
    await dbDelete('b_tasks')

    expect(JSON.parse(localStorage.getItem('b_db_outbox') || '[]')).toEqual([{ key: 'b_tasks', deleted: true }])
    expect(getDbStatus().pendingWrites).toBe(1)
  })
})
