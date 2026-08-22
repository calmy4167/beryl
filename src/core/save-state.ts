import { getDbStatus } from './db.ts'

export const SAVE_STATE_EVENT = 'beryl-save-state' as const

export type SaveState = 'saving' | 'saved' | 'pending' | 'conflict' | 'failed'

export interface SaveStateDetail {
  state: SaveState
  durable: boolean
  pending: boolean
  error?: unknown
}

export interface SaveStateEvent extends CustomEvent<SaveStateDetail> {
  readonly type: typeof SAVE_STATE_EVENT
}

function isRevisionConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'REVISION_CONFLICT'
}

function isDurable(): boolean {
  const status = getDbStatus()
  return status.state === 'ready' && status.available && status.pendingWrites === 0
}

function broadcast(detail: SaveStateDetail): void {
  const target = typeof window !== 'undefined' ? window : undefined
  if (!target || typeof target.dispatchEvent !== 'function') return
  target.dispatchEvent(new target.CustomEvent<SaveStateDetail>(SAVE_STATE_EVENT, { detail }))
}

export function withSaveState<T>(work: () => Promise<T>): Promise<T> {
  broadcast({ state: 'saving', durable: false, pending: false })

  return work().then(
    (value) => {
      const durable = isDurable()
      broadcast({ state: durable ? 'saved' : 'pending', durable, pending: !durable })
      return value
    },
    (error: unknown) => {
      broadcast({
        state: isRevisionConflict(error) ? 'conflict' : 'failed',
        durable: false,
        pending: false,
        error
      })
      throw error
    }
  )
}
