import { describe, expect, it } from 'vitest'
import { canTransitionAction } from '@/domain/action/model'

describe('action status transitions for the task board', () => {
  it('allows an in-progress action to return to planned', () => {
    expect(canTransitionAction('in_progress', 'planned')).toBe(true)
  })

  it('allows a completed action to be reopened before moving again', () => {
    expect(canTransitionAction('done', 'planned')).toBe(true)
    expect(canTransitionAction('done', 'in_progress')).toBe(false)
  })

  it('keeps skipped and cancelled actions recoverable', () => {
    expect(canTransitionAction('skipped', 'planned')).toBe(true)
    expect(canTransitionAction('cancelled', 'planned')).toBe(true)
  })
})
