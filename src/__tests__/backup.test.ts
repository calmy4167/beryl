import { describe, expect, it } from 'vitest'
import { createBackup, createDurableBackup, parseBackup } from '@/core/backup'
import { vi } from 'vitest'
import { accountStorageKey, setActiveAccount } from '@/core/account-context'

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

  it('preserves canonical revision history snapshots in backups', () => {
    const person = JSON.stringify([{ calmyId: 'p-history', revision: 2, revisionHistory: [{
      revision: 2, fromRevision: 1, toRevision: 2,
      previousSnapshot: { displayName: '旧姓名' }, snapshot: { displayName: '新姓名' }
    }] }])
    const backup = createBackup(new StorageMock({ 'b_core:person': person }))

    expect(parseBackup(backup)['b_core:person']).toBe(person)
    expect(JSON.parse(backup['b_core:person']).at(0).revisionHistory[0].previousSnapshot.displayName).toBe('旧姓名')
  })

  it('preserves Capture history snapshots in portable backups', () => {
    const captures = JSON.stringify([{ calmyId: 'capture-history', body: '原文', revision: 2, history: [{
      revision: 2, operation: 'accepted', source: 'user', occurredAt: 20, fromRevision: 1, toRevision: 2,
      previousSnapshot: { status: 'suggested' }, snapshot: { status: 'accepted' }, sourceIds: ['suggestion-1']
    }] }])
    const backup = createBackup(new StorageMock({ b_calmyCaptures: captures }))

    expect(parseBackup(backup).b_calmyCaptures).toBe(captures)
    expect(JSON.parse(backup.b_calmyCaptures)[0].history[0].previousSnapshot.status).toBe('suggested')
  })

  it('preserves legacy habit revision history in portable backups', () => {
    const habits = JSON.stringify([{ id: 'habit-history', name: '阅读', color: '#123456', days: 1, dates: ['2026-10-02'], revision: 2, history: [{
      revision: 2, operation: 'updated', source: 'user', occurredAt: 20,
      before: { name: '阅读', color: '#123456', days: 0, dates: [] },
      after: { name: '阅读', color: '#123456', days: 1, dates: ['2026-10-02'] }
    }] }])
    const backup = createBackup(new StorageMock({ b_habits: habits }))

    expect(parseBackup(backup).b_habits).toBe(habits)
    expect(JSON.parse(backup.b_habits)[0].history[0].before.dates).toEqual([])
  })

  it('preserves legacy inbox removal snapshots in portable backups', () => {
    const history = JSON.stringify([{ id: 'inbox-history:cmd-1', revision: 1, operation: 'removed', source: 'user', occurredAt: 20, actorUserId: 'u1', before: { id: 'inbox-1', text: '原始收件项' }, after: null }])
    const backup = createBackup(new StorageMock({ b_inboxHistory: history }))

    expect(parseBackup(backup).b_inboxHistory).toBe(history)
  })

  it('preserves local binary assets in the JSON disaster-recovery backup', () => {
    const assets = JSON.stringify([{ path: 'assets/photo.png', data: 'iVBORw0KGgo=', mimeType: 'image/png' }])
    const backup = createBackup(new StorageMock({ b_openAssets: assets }))

    expect(backup).toEqual({ b_openAssets: assets })
    expect(parseBackup(backup)).toEqual({ b_openAssets: assets })
  })

  it('exports only the active account namespace and emits logical keys', () => {
    localStorage.clear()
    setActiveAccount('backup-owner')
    try {
      localStorage.setItem(accountStorageKey('b_tasks'), '[{"id":"owner-task"}]')
      localStorage.setItem('calmy:user:other%40example.test:b_tasks', '[{"id":"other-task"}]')
      localStorage.setItem(accountStorageKey('b_auth'), '{"secret":"never-export"}')

      const backup = createBackup()

      expect(backup).toEqual({ b_tasks: '[{"id":"owner-task"}]' })
      expect(JSON.stringify(backup)).not.toContain('other-task')
      expect(JSON.stringify(backup)).not.toContain('never-export')
    } finally {
      setActiveAccount(null)
      localStorage.clear()
    }
  })

  it('round-trips journal categories and remains compatible with older record JSON', () => {
    const categorized = '[{"calmyId":"r2","journalCategory":"mind"}]'
    const legacy = '[{"calmyId":"r1","type":"fact"}]'
    const backup = createBackup(new StorageMock({ b_realityRecords: categorized }))
    const olderBackup = createBackup(new StorageMock({ b_realityRecords: legacy }))

    expect(parseBackup(backup).b_realityRecords).toBe(categorized)
    expect(parseBackup(olderBackup).b_realityRecords).toBe(legacy)
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
