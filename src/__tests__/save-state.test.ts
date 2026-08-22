import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  getDbStatus: vi.fn()
}))

vi.mock('@/core/db', () => db)

import { SAVE_STATE_EVENT, withSaveState, type SaveStateDetail } from '@/core/save-state'

describe('save state protocol', () => {
  const events: SaveStateDetail[] = []
  const listener = (event: Event) => {
    events.push((event as CustomEvent<SaveStateDetail>).detail)
  }

  beforeEach(() => {
    db.getDbStatus.mockReset()
    events.length = 0
    window.addEventListener(SAVE_STATE_EVENT, listener)
  })

  afterEach(() => {
    window.removeEventListener(SAVE_STATE_EVENT, listener)
  })

  it('broadcasts saving then saved when the database is durable', async () => {
    db.getDbStatus.mockReturnValue({ state: 'ready', available: true, pendingWrites: 0 })

    await expect(withSaveState(async () => 'ok')).resolves.toBe('ok')

    expect(events.map((event) => event.state)).toEqual(['saving', 'saved'])
    expect(events[1]).toMatchObject({ state: 'saved', durable: true, pending: false })
  })

  it('broadcasts pending when the write is accepted but not durable', async () => {
    db.getDbStatus.mockReturnValue({ state: 'degraded', available: false, pendingWrites: 1 })

    await withSaveState(async () => undefined)

    expect(events.map((event) => event.state)).toEqual(['saving', 'pending'])
    expect(events[1]).toMatchObject({ state: 'pending', durable: false, pending: true })
  })

  it('broadcasts conflict and rethrows revision conflicts', async () => {
    const error = Object.assign(new Error('stale revision'), { code: 'REVISION_CONFLICT' })

    await expect(withSaveState(async () => { throw error })).rejects.toBe(error)

    expect(events.map((event) => event.state)).toEqual(['saving', 'conflict'])
    expect(events[1]).toMatchObject({ state: 'conflict', error })
  })

  it('broadcasts failed and rethrows other errors', async () => {
    const error = new Error('write failed')

    await expect(withSaveState(async () => { throw error })).rejects.toBe(error)

    expect(events.map((event) => event.state)).toEqual(['saving', 'failed'])
    expect(events[1]).toMatchObject({ state: 'failed', error })
    expect(db.getDbStatus).not.toHaveBeenCalled()
  })
})
