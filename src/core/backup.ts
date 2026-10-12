import { SYNC_KEYS } from './sync'
import { flushPendingDbWrites, readKvSnapshot } from './db'
import { accountStoragePrefix, getActiveAccount, unaccountStorageKey } from './account-context'
import { CORE_ENTITY_TYPES } from '@/domain/unified/model'

export const BACKUP_SENSITIVE_KEYS = new Set(['b_auth', 'b_cloud', 'b_s3', 'b_session', 'b_pull_cursor', 'b_push_cursor', 'b_sync_ts', 'b_sync_versions', 'b_last_sync', 'b_db_outbox'])
const DOMAIN_COLLECTION_KEYS = [
  'b_mvpActions', 'b_actionMutations', 'b_actionCommands',
  'b_calmyCaptures', 'b_calmySuggestions',
  'b_legacyEntityMappings',
  'b_calmy_migration_deletion_manifest',
  'b_userPersonBinding',
  'b_cases', 'b_caseRelations', 'b_tasks', 'b_inbox', 'b_inboxHistory',
  'b_matters', 'b_matterMutations', 'b_matterCommands',
  'b_realityRecords', 'b_realityRecordRevisions', 'b_recordCommands',
  'b_mvpTodayPlans',
  'b_coreEntityMutations', 'b_coreEntityCommands',
  'b_openAssets',
  'b_sharedCollaborationAudit', 'b_financeMutations'
]
const CORE_ENTITY_KEYS = CORE_ENTITY_TYPES.map(type => `b_core:${type}`)
export const BACKUP_ALLOWED_KEYS = new Set([...SYNC_KEYS, 'b_theme', 'b_version', ...DOMAIN_COLLECTION_KEYS, ...CORE_ENTITY_KEYS])

export function createBackup(source: Storage = localStorage): Record<string, string> {
  const out: Record<string, string> = {}
  const accountScopedStorage = source === localStorage
  const activeAccount = accountScopedStorage ? getActiveAccount() : null
  const accountPrefix = accountStoragePrefix()
  for (let i = 0; i < source.length; i++) {
    const physicalKey = source.key(i)
    if (!physicalKey) continue
    if (accountScopedStorage && physicalKey.startsWith('b_') && physicalKey !== 'b_theme' && activeAccount && !physicalKey.startsWith(accountPrefix || '\0')) continue
    if (accountScopedStorage && physicalKey.startsWith('calmy:user:') && !activeAccount) continue
    const key = activeAccount && physicalKey !== 'b_theme' ? unaccountStorageKey(physicalKey) : physicalKey
    if (key && BACKUP_ALLOWED_KEYS.has(key) && !BACKUP_SENSITIVE_KEYS.has(key)) out[key] = source.getItem(physicalKey) || ''
  }
  return out
}

/** 优先从 IndexedDB 持久快照导出；IndexedDB 不可用时回退到同步缓存。 */
export async function createDurableBackup(source: Storage = localStorage): Promise<Record<string, string>> {
  await flushPendingDbWrites()
  const snapshot = await readKvSnapshot()
  if (!snapshot) return createBackup(source)
  return Object.fromEntries(Object.entries(snapshot)
    .map(([physicalKey, value]) => [unaccountStorageKey(physicalKey) || physicalKey, value] as const)
    .filter(([key]) => BACKUP_ALLOWED_KEYS.has(key) && !BACKUP_SENSITIVE_KEYS.has(key)))
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
