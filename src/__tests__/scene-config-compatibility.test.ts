import { beforeEach, describe, expect, it } from 'vitest'
import { currentSceneId, SCENES } from '@/core/scenes'
import { store } from '@/core/storage'

describe('legacy static scene configuration', () => {
  beforeEach(() => localStorage.clear())

  it('keeps existing choices and the persisted scene key', () => {
    expect(Object.keys(SCENES)).toEqual(['personal', 'couple', 'married', 'family'])
    store.set('scene', 'couple')
    expect(localStorage.getItem('b_scene')).toBe('"couple"')
    expect(currentSceneId()).toBe('couple')
  })
})
