import { afterEach, describe, expect, it, beforeEach } from 'vitest'
import { store } from '@/core/storage'
import { registerUndo, undoLast } from '@/core/undo'
import { setActiveAccount } from '@/core/account-context'

describe('undo delete', () => {
  beforeEach(() => { setActiveAccount('undo-test-user'); localStorage.clear() })
  afterEach(() => setActiveAccount(null))
  it('restores one deleted entity at its original position', () => {
    store.set('tasks', [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }])
    const current = store.get<any[]>('tasks', [])
    const [removed] = current.splice(0, 1)
    store.set('tasks', current)
    registerUndo('tasks', removed, 0, 'a')
    expect(undoLast()).toBe(true)
    expect(store.get<any[]>('tasks', [])[0].id).toBe('a')
  })
})
