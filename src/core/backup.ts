import { SYNC_KEYS } from './sync'
import { flushPendingDbWrites, readKvSnapshot } from './db'
import { CORE_ENTITY_TYPES } from '@/domain/unified/model'

export const BACKUP_SENSITIVE_KEYS = new Set(['b_auth', 'b_cloud', 'b_s3', 'b_session', 'b_pull_cursor', 'b_push_cursor', 'b_sync_ts', 'b_last_sync', 'b_db_outbox'])
const DOMAIN_COLLECTION_KEYS = [
  'b_mvpActions', 'b_actionMutations', 'b_actionCommands',
  'b_calmyCaptures', 'b_calmySuggestions',
  'b_legacyEntityMappings',
  'b_cases', 'b_caseRelations', 'b_tasks', 'b_inbox',
  'b_matters', 'b_matterMutations', 'b_matterCommands',
  'b_realityRecords', 'b_realityRecordRevisions', 'b_recordCommands',
  'b_mvpTodayPlans',
  'b_coreEntityMutations', 'b_coreEntityCommands',
  'b_sharedCollaborationAudit'
]
const CORE_ENTITY_KEYS = CORE_ENTITY_TYPES.map(type => `b_core:${type}`)
export const BACKUP_ALLOWED_KEYS = new Set([...SYNC_KEYS, 'b_theme', 'b_version', ...DOMAIN_COLLECTION_KEYS, ...CORE_ENTITY_KEYS])

export function createBackup(source: Storage = localStorage): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < source.length; i++) {
    const key = source.key(i)
    if (key && BACKUP_ALLOWED_KEYS.has(key) && !BACKUP_SENSITIVE_KEYS.has(key)) out[key] = source.getItem(key) || ''
  }
  return out
}

/** 优先从 IndexedDB 持久快照导出；IndexedDB 不可用时回退到同步缓存。 */
export async function createDurableBackup(source: Storage = localStorage): Promise<Record<string, string>> {
  await flushPendingDbWrites()
  const snapshot = await readKvSnapshot()
  if (!snapshot) return createBackup(source)
  return Object.fromEntries(Object.entries(snapshot).filter(([key]) => BACKUP_ALLOWED_KEYS.has(key) && !BACKUP_SENSITIVE_KEYS.has(key)))
}

export function parseBackup(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('backup-not-object')
  const data = input as Record<string, unknown>
  for (const [key, value] of Object.entries(data)) {
    if (BACKUP_SENSITIVE_KEYS.has(key)) continue
    if (!BACKUP_ALLOWED_KEYS.has(key) || typeof value !== 'string') throw new Error('backup-key-not-allowed')
    JSON.parse(value)
  }
  return Object.fromEntries(Object.entries(data).filter(([key]) => !BACKUP_SENSITIVE_KEYS.has(key))) as Record<string, string>
}
