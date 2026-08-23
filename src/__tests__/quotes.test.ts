import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildGroups } from '@/core/quotes'

describe('local quote source', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does not request external content for decorative first-screen groups', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    const groups = await buildGroups()

    expect(fetch).not.toHaveBeenCalled()
    expect(groups.length).toBeGreaterThan(0)
    expect(groups.flatMap(group => group.cards).every(card => card.fromNetwork === false)).toBe(true)
  })
})
