import { describe, expect, it } from 'vitest'
import { createBackup, parseBackup } from '@/core/backup'

describe('backup contract', () => {
  it('excludes credentials and sync cursors', () => {
    const source = new StorageMock({ b_tasks: '[1]', b_auth: '{}', b_pull_cursor: '9' })
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
