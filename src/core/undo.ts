import { store } from './storage'
import { createAsyncCollectionRepository } from './repository'

interface UndoAction { key: string; item: unknown; index: number; id?: string; expiresAt: number }
let pending: UndoAction | null = null

export function registerUndo(key: string, item: unknown, index: number, id?: string): void {
  pending = { key, item, index, id, expiresAt: Date.now() + 8000 }
  window.dispatchEvent(new CustomEvent('beryl-undo-available'))
}

export function undoLast(): boolean {
  const action = pending
  pending = null
  if (!action || action.expiresAt < Date.now()) return false
  const list = store.get<unknown>(action.key, [])
  if (!Array.isArray(list)) return false
  if (action.id && list.some(item => item && typeof item === 'object' && String((item as { id?: unknown }).id) === action.id)) return false
  list.splice(Math.max(0, Math.min(action.index, list.length)), 0, action.item)
  const ok = store.set(action.key, list)
  if (ok) window.dispatchEvent(new CustomEvent('beryl-data-synced'))
  return ok
}

/** Async counterpart used by React pages and the shared shell after repository migration. */
export async function undoLastAsync(): Promise<boolean> {
  const action = pending
  pending = null
  if (!action || action.expiresAt < Date.now()) return false
  const repository = createAsyncCollectionRepository<unknown>(action.key, item => {
    if (!item || typeof item !== 'object') return undefined
    const id = (item as { id?: unknown }).id
    return id == null ? undefined : String(id)
  })
  const list = await repository.list()
  if (action.id && list.some(item => item && typeof item === 'object' && String((item as { id?: unknown }).id) === action.id)) return false
  list.splice(Math.max(0, Math.min(action.index, list.length)), 0, action.item)
  const ok = await repository.replace(list)
  if (ok) window.dispatchEvent(new CustomEvent('beryl-data-synced'))
  return ok
}
