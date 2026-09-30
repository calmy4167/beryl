import { readServerSession } from './auth'
import { flushPendingDbWrites } from './db'
import { lsGet, lsSet } from './storage'

const LEGACY_DB = 'beryl-db'
const CLAIM_KEY = 'calmy:legacy-local-claimed'
const EXCLUDED = new Set(['b_auth', 'b_session', 'b_cloud', 'b_s3', 'b_theme', 'b_db_outbox'])

export type LegacyLocalPreview = { values: Record<string, string>; count: number; bytes: number; alreadyClaimed: boolean }

function readLegacyLocalStorage(): Record<string, string> {
  const values: Record<string, string> = {}
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (!key?.startsWith('b_') || EXCLUDED.has(key)) continue
      const value = localStorage.getItem(key)
      if (value != null) values[key] = value
    }
  } catch { /* preview whatever remains readable */ }
  return values
}

async function readLegacyIndexedDb(): Promise<Record<string, string>> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return {}
  const databases = await indexedDB.databases()
  if (!databases.some(database => database.name === LEGACY_DB)) return {}
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('legacy-db-open-failed'))
    request.onblocked = () => reject(new Error('legacy-db-blocked'))
  })
  try {
    if (!db.objectStoreNames.contains('kv')) return {}
    const tx = db.transaction('kv', 'readonly')
    return await new Promise<Record<string, string>>((resolve, reject) => {
      const request = tx.objectStore('kv').openCursor()
      const result: Record<string, string> = {}
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) { resolve(result); return }
        if (typeof cursor.key === 'string' && cursor.key.startsWith('b_') && !EXCLUDED.has(cursor.key)) result[cursor.key] = String(cursor.value)
        cursor.continue()
      }
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}

export async function previewLegacyLocalData(): Promise<LegacyLocalPreview> {
  const values = { ...readLegacyLocalStorage(), ...await readLegacyIndexedDb() }
  const server = readServerSession()
  let claimed = false
  try { claimed = Boolean(localStorage.getItem(CLAIM_KEY)) } catch { /* ignore */ }
  return {
    values,
    count: Object.keys(values).length,
    bytes: Object.values(values).reduce((sum, value) => sum + new Blob([value]).size, 0),
    alreadyClaimed: claimed || !server || server.user.role !== 'admin'
  }
}

function mergeValues(legacy: string, current: string | null): string {
  if (current == null) return legacy
  try {
    const oldValue: unknown = JSON.parse(legacy)
    const currentValue: unknown = JSON.parse(current)
    if (Array.isArray(oldValue) && Array.isArray(currentValue)) {
      const merged = new Map<string, unknown>()
      const identity = (item: unknown, index: number) => {
        if (!item || typeof item !== 'object') return `legacy-${index}`
        const row = item as Record<string, unknown>
        return String(row.id ?? row.calmyId ?? row.date ?? `legacy-${index}`)
      }
      oldValue.forEach((item, index) => merged.set(identity(item, index), item))
      currentValue.forEach((item, index) => merged.set(identity(item, index), item))
      return JSON.stringify([...merged.values()])
    }
  } catch { /* opaque legacy string; preserve current value on collision */ }
  return current
}

export async function claimLegacyLocalData(preview: LegacyLocalPreview): Promise<number> {
  const server = readServerSession()
  if (!server || server.user.role !== 'admin' || preview.alreadyClaimed) throw new Error('legacy-claim-not-allowed')
  let imported = 0
  for (const [key, legacy] of Object.entries(preview.values)) {
    const value = mergeValues(legacy, lsGet(key))
    if (value === lsGet(key)) continue
    if (!lsSet(key, value)) throw new Error(`legacy-local-write-failed:${key}`)
    imported++
  }
  await flushPendingDbWrites()
  try { localStorage.setItem(CLAIM_KEY, server.user.id) } catch { throw new Error('legacy-claim-marker-failed') }
  return imported
}
