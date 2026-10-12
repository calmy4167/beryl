import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readStagePresentation, saveStagePresentation, type StagePresentation } from '../ui/stage-presentation'

const storageKey = 'calmy.ui.stage.v1'

describe('stage presentation preferences', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses full, comfortable presentation when nothing has been stored', () => {
    expect(readStagePresentation()).toEqual({ mode: 'full', density: 'comfortable' })
  })

  it('persists preferences across reads using only the versioned UI key', () => {
    window.localStorage.setItem('business-data', '{"entries":["keep"]}')

    expect(saveStagePresentation({ mode: 'simple', density: 'compact' })).toBe(true)
    expect(readStagePresentation()).toEqual({ mode: 'simple', density: 'compact' })
    expect(JSON.parse(window.localStorage.getItem(storageKey)!)).toEqual({
      version: 1, mode: 'simple', density: 'compact',
    })
    expect(window.localStorage.getItem('business-data')).toBe('{"entries":["keep"]}')
    expect(window.localStorage.length).toBe(2)
  })

  it('uses the supplied storage for both reads and writes', () => {
    window.localStorage.setItem(storageKey, '{"version":1,"mode":"full","density":"comfortable"}')

    expect(saveStagePresentation({ mode: 'simple', density: 'compact' }, window.sessionStorage)).toBe(true)
    expect(readStagePresentation(window.sessionStorage)).toEqual({ mode: 'simple', density: 'compact' })
    expect(readStagePresentation()).toEqual({ mode: 'full', density: 'comfortable' })
  })

  it.each([
    ['broken JSON', '{broken'],
    ['null', 'null'],
    ['a scalar', '42'],
    ['an array', '["simple","compact"]'],
    ['a missing version', '{"mode":"simple","density":"compact"}'],
    ['an unsupported version', '{"version":2,"mode":"simple","density":"compact"}'],
    ['an invalid version type', '{"version":"1","mode":"simple","density":"compact"}'],
  ])('falls back for %s', (_name, raw) => {
    window.localStorage.setItem(storageKey, raw)

    expect(readStagePresentation()).toEqual({ mode: 'full', density: 'comfortable' })
  })

  it.each([
    [{ version: 1, mode: 'unknown', density: 'compact' }, { mode: 'full', density: 'compact' }],
    [{ version: 1, mode: 'simple', density: null }, { mode: 'simple', density: 'comfortable' }],
    [{ version: 1, density: 'compact' }, { mode: 'full', density: 'compact' }],
    [{ version: 1, mode: 'simple' }, { mode: 'simple', density: 'comfortable' }],
    [{ version: 1, mode: {}, density: [] }, { mode: 'full', density: 'comfortable' }],
  ])('preserves independently valid fields in %j', (stored, expected) => {
    window.localStorage.setItem(storageKey, JSON.stringify(stored))

    expect(readStagePresentation()).toEqual(expected)
  })

  it('normalizes malformed values on save and excludes unrelated fields', () => {
    const value = { mode: 'simple', density: 'unknown', entries: ['private'] } as unknown as StagePresentation

    expect(saveStagePresentation(value)).toBe(true)
    expect(JSON.parse(window.localStorage.getItem(storageKey)!)).toEqual({
      version: 1, mode: 'simple', density: 'comfortable',
    })
  })

  it('returns defaults when reading storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })

    expect(readStagePresentation()).toEqual({ mode: 'full', density: 'comfortable' })
  })

  it('reports a failed write without replacing saved preferences', () => {
    window.localStorage.setItem(storageKey, '{"version":1,"mode":"simple","density":"compact"}')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota exceeded') })

    expect(saveStagePresentation({ mode: 'full', density: 'comfortable' })).toBe(false)
    expect(readStagePresentation()).toEqual({ mode: 'simple', density: 'compact' })
  })

  it('handles a browser that denies access to localStorage', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('access denied') })

    expect(readStagePresentation()).toEqual({ mode: 'full', density: 'comfortable' })
    expect(saveStagePresentation({ mode: 'simple', density: 'compact' })).toBe(false)
  })

  it('handles a missing browser while allowing explicitly supplied storage', () => {
    const storage = window.sessionStorage
    vi.stubGlobal('window', undefined)

    expect(readStagePresentation()).toEqual({ mode: 'full', density: 'comfortable' })
    expect(saveStagePresentation({ mode: 'simple', density: 'compact' })).toBe(false)
    expect(saveStagePresentation({ mode: 'simple', density: 'compact' }, storage)).toBe(true)
    expect(readStagePresentation(storage)).toEqual({ mode: 'simple', density: 'compact' })
  })

  it('returns independent preferences so callers cannot alter subsequent defaults', () => {
    const first = readStagePresentation()
    first.mode = 'simple'
    first.density = 'compact'

    expect(readStagePresentation()).toEqual({ mode: 'full', density: 'comfortable' })
  })
})
