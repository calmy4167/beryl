import { describe, expect, it } from 'vitest'
import { BACKUP_ALLOWED_KEYS, createBackup, parseBackup } from '@/core/backup'
import { applyEntityRecords } from '@/core/entity-sync'

describe('reality model backup compatibility', () => {
  it('includes every canonical core store in backup and restore parsing', () => {
    const source = new StorageMock()
    const keys = ['b_core:scene', 'b_core:scene_participant', 'b_core:space', 'b_core:domain', 'b_core:scope', 'b_core:permission']
    for (const key of keys) source.setItem(key, '[]')

    const backup = createBackup(source)
    expect(keys.every(key => BACKUP_ALLOWED_KEYS.has(key))).toBe(true)
    expect(Object.keys(parseBackup(backup))).toEqual(expect.arrayContaining(keys))
  })

  it('keeps the shared Matter/Thing fact store in the entity-sync allowlist', async () => {
    localStorage.clear()
    await expect(applyEntityRecords([{
      entity: 'matters', entityId: 'thing-sync-1', updatedAt: 10, device: 'remote',
      value: { calmyId: 'thing-sync-1', title: '同步 Thing 来源' }
    }], [])).resolves.toBe(1)
    expect(localStorage.getItem('b_matters')).toContain('同步 Thing 来源')
  })
})

class StorageMock implements Storage {
  private values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, String(value)) }
}
