import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { currentSceneId, SCENES } from '@/core/scenes'
import { store } from '@/core/storage'
import { accountStorageKey, setActiveAccount } from '@/core/account-context'

describe('legacy static scene configuration', () => {
  beforeEach(() => { setActiveAccount('scene-config-test-user'); localStorage.clear() })
  afterEach(() => setActiveAccount(null))

  it('keeps existing choices and the persisted scene key', () => {
    expect(Object.keys(SCENES)).toEqual(['personal', 'couple', 'married', 'family'])
    store.set('scene', 'couple')
    expect(localStorage.getItem(accountStorageKey('b_scene'))).toBe('"couple"')
    expect(currentSceneId()).toBe('couple')
  })
})
