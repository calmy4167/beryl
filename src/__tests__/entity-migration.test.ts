import { describe, expect, it, vi } from 'vitest'
import { createDurableEntityMigrationPlan, createEntityMigrationPlan, rollbackMigration, saveMigrationBackup, summarizeEntityConflicts } from '@/core/entity-migration'

describe('entity migration safety', () => {
  it('creates a deterministic entity seed plan and backup', () => {
    const storage = new StorageMock({ b_tasks: '[{"id":"t1","title":"任务"}]', b_diary: '[{"date":"2026-08-16","content":"日记"}]' })
    const plan = createEntityMigrationPlan(storage)
    expect(plan.records.map(item => `${item.entity}:${item.entityId}`)).toEqual(['tasks:t1', 'diary:2026-08-16'])
    expect(saveMigrationBackup(plan, storage)).toBe(true)
    expect(storage.getItem('b_entity_migration_backup')).toContain('t1')
  })
  it('rolls back only supported collections and restores the original snapshot', () => {
    const storage = new StorageMock({ b_tasks: '[{"id":"t1"}]', b_inbox: '[]' })
    const plan = createEntityMigrationPlan(storage)
    saveMigrationBackup(plan, storage)
    storage.setItem('b_tasks', '[{"id":"changed"}]')
    expect(rollbackMigration(storage)).toBe(true)
    expect(storage.getItem('b_tasks')).toBe('[{"id":"t1"}]')
  })
  it('reports LWW direction for conflicting entity versions', () => {
    const local = [{ entity: 'tasks', entityId: 't1', value: { title: 'local' }, updatedAt: 10, device: 'a' }]
    const remote = [{ entity: 'tasks', entityId: 't1', value: { title: 'remote' }, updatedAt: 11, device: 'b' }]
    expect(summarizeEntityConflicts(local, remote)).toEqual({ conflicts: 1, newerRemote: 1, newerLocal: 0 })
  })

  it('falls back to the local cache when the durable migration snapshot is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const storage = new StorageMock({ b_tasks: '[{"id":"t1","title":"任务"}]' })

    const plan = await createDurableEntityMigrationPlan(storage)

    expect(plan.records.map(item => `${item.entity}:${item.entityId}`)).toEqual(['tasks:t1'])
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
