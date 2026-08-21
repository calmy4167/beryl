import { SYNC_KEYS } from './sync'

export const BACKUP_SENSITIVE_KEYS = new Set(['b_auth', 'b_cloud', 'b_s3', 'b_session', 'b_pull_cursor', 'b_push_cursor', 'b_sync_ts', 'b_last_sync', 'b_db_outbox'])
export const BACKUP_ALLOWED_KEYS = new Set([...SYNC_KEYS, 'b_theme', 'b_version'])

export function createBackup(source: Storage = localStorage): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < source.length; i++) {
    const key = source.key(i)
    if (key && key.startsWith('b_') && !BACKUP_SENSITIVE_KEYS.has(key)) out[key] = source.getItem(key) || ''
  }
  return out
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
