import { describe, expect, it } from 'vitest'
import { createBackup, createDurableBackup, parseBackup } from '@/core/backup'
import { vi } from 'vitest'

describe('backup contract', () => {
  it('excludes credentials and sync cursors', () => {
    const source = new StorageMock({ b_tasks: '[1]', b_auth: '{}', b_pull_cursor: '9', b_sync_versions: '{}' })
    expect(createBackup(source)).toEqual({ b_tasks: '[1]' })
  })
  it('rejects unknown or malformed values', () => {
    expect(() => parseBackup({ b_unknown: '[]' })).toThrow()
    expect(() => parseBackup({ b_tasks: '{bad' })).toThrow()
  })
  it('keeps only safe JSON strings', () => {
    expect(parseBackup({ b_tasks: '[]', b_auth: '{}' })).toEqual({ b_tasks: '[]' })
  })
  it('round-trips a safe backup through validation', () => {
    const source = new StorageMock({ b_tasks: '[{"id":"t1"}]', b_theme: '"personal"', b_session: '"secret"' })
    const backup = createBackup(source)
    expect(parseBackup(backup)).toEqual(backup)
    expect(backup).not.toHaveProperty('b_session')
  })

  it('includes current domain collections in the portable backup', () => {
    const source = new StorageMock({
      b_matters: '[{"calmyId":"m1"}]',
      b_calmyCaptures: '[{"calmyId":"c1"}]',
      'b_core:person': '[{"calmyId":"p1"}]',
      b_realityRecords: '[{"calmyId":"r1"}]',
      b_recordCommands: '[{"id":"cmd-1"}]',
      b_unknown: '[]'
    })

    const backup = createBackup(source)

    expect(backup).toEqual({
      b_matters: '[{"calmyId":"m1"}]',
      b_calmyCaptures: '[{"calmyId":"c1"}]',
      'b_core:person': '[{"calmyId":"p1"}]',
      b_realityRecords: '[{"calmyId":"r1"}]',
      b_recordCommands: '[{"id":"cmd-1"}]'
    })
    expect(parseBackup(backup)).toEqual(backup)
  })

  it('falls back to the synchronous cache when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const source = new StorageMock({ b_tasks: '[{"id":"t1"}]', b_db_outbox: '[]' })

    await expect(createDurableBackup(source)).resolves.toEqual({ b_tasks: '[{"id":"t1"}]' })
    vi.unstubAllGlobals()
  })
})

class StorageMock implements Storage {
  private values: Record<string, string>
  constructor(values: Record<string, string>) { this.values = values }
  get length() { return Object.keys(this.values).length }
  clear() { this.values = {} }
  getItem(key: string) { return this.values[key] ?? null }
  key(index: number) { return Object.keys(this.values)[index] ?? null }
  removeItem(key: string) { delete this.values[key] }
  setItem(key: string, value: string) { this.values[key] = value }
}
