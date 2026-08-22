import { createBackup } from './backup'
import { DEVICE_ID, flushPendingDbWrites, readKvSnapshot } from './db'
import type { EntitySyncRecord } from './entity-sync'

export interface EntityMigrationPlan {
  createdAt: number
  snapshot: Record<string, string>
  records: EntitySyncRecord[]
  skipped: string[]
}

const COLLECTION_KEYS = ['b_tasks', 'b_inbox', 'b_habits', 'b_goals', 'b_finance', 'b_diary', 'b_chars', 'b_posts', 'b_cases', 'b_caseRelations', 'b_moments']

function entityId(key: string, item: Record<string, unknown>): string | undefined {
  if (item.id != null) return String(item.id)
  if (key === 'b_diary' && item.date != null) return String(item.date)
  return undefined
}

function createPlanFromSnapshot(snapshot: Record<string, string>): EntityMigrationPlan {
  const records: EntitySyncRecord[] = []
  const skipped: string[] = []
  const updatedAt = Date.now()
  for (const key of COLLECTION_KEYS) {
    const raw = snapshot[key]
    if (!raw) continue
    let value: unknown
    try { value = JSON.parse(raw) } catch { skipped.push(key); continue }
    if (!Array.isArray(value)) { skipped.push(key); continue }
    for (const item of value) {
      if (!item || typeof item !== 'object') { skipped.push(`${key}:invalid`); continue }
      const id = entityId(key, item as Record<string, unknown>)
      if (!id) { skipped.push(`${key}:missing-id`); continue }
      records.push({ entity: key.slice(2), entityId: id, value: item, updatedAt, device: DEVICE_ID, deleted: false })
    }
  }
  return { createdAt: updatedAt, snapshot, records, skipped }
}

export function createEntityMigrationPlan(source: Storage = localStorage): EntityMigrationPlan {
  return createPlanFromSnapshot(createBackup(source))
}

/** 优先从 IndexedDB 持久快照生成迁移计划，失败时回退同步缓存。 */
export async function createDurableEntityMigrationPlan(source: Storage = localStorage): Promise<EntityMigrationPlan> {
  await flushPendingDbWrites()
  const snapshot = await readKvSnapshot()
  return snapshot ? createPlanFromSnapshot(snapshot) : createEntityMigrationPlan(source)
}

export function saveMigrationBackup(plan: EntityMigrationPlan, source: Storage = localStorage): boolean {
  try { source.setItem('b_entity_migration_backup', JSON.stringify({ version: 1, createdAt: plan.createdAt, snapshot: plan.snapshot })); return true } catch { return false }
}

export function rollbackMigration(source: Storage = localStorage): boolean {
  const raw = source.getItem('b_entity_migration_backup')
  if (!raw) return false
  let parsed: { snapshot?: Record<string, string> }
  try { parsed = JSON.parse(raw) } catch { return false }
  if (!parsed.snapshot || typeof parsed.snapshot !== 'object') return false
  const before = createBackup(source)
  try {
    for (const key of COLLECTION_KEYS) source.removeItem(key)
    for (const [key, value] of Object.entries(parsed.snapshot)) { source.setItem(key, value) }
    window.dispatchEvent(new CustomEvent('beryl-data-synced'))
    return true
  } catch {
    for (const key of COLLECTION_KEYS) source.removeItem(key)
    for (const [key, value] of Object.entries(before)) source.setItem(key, value)
    return false
  }
}

export function summarizeEntityConflicts(local: EntitySyncRecord[], remote: EntitySyncRecord[]): { conflicts: number; newerRemote: number; newerLocal: number } {
  const byId = new Map(local.map(record => [`${record.entity}:${record.entityId}`, record]))
  let conflicts = 0, newerRemote = 0, newerLocal = 0
  for (const record of remote) {
    const current = byId.get(`${record.entity}:${record.entityId}`)
    if (!current) continue
    const sameValue = JSON.stringify(current.value) === JSON.stringify(record.value) && !!current.deleted === !!record.deleted
    if (sameValue) continue
    conflicts++
    if (record.updatedAt > current.updatedAt || (record.updatedAt === current.updatedAt && record.device > current.device)) newerRemote++
    else newerLocal++
  }
  return { conflicts, newerRemote, newerLocal }
}

export function migrationBackupExists(source: Storage = localStorage): boolean { return source.getItem('b_entity_migration_backup') != null }
