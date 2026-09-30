import { readServerSession } from './auth'
import { flushPendingDbWrites, readKvSnapshot } from './db'
import { lsGet, lsSet } from './storage'
import { accountStorageKey } from './account-context'
import { syncVaultEntityData } from './entity-sync'

const LEGACY_DB = 'beryl-db'
const CLAIM_KEY = 'calmy:legacy-local-claimed'
const D1_TOMBSTONES_KEY = 'calmy:legacy-d1-tombstones'
const SYNCED_D1_TOMBSTONES_KEY = 'b_calmy_migration_deletion_manifest'
const EXCLUDED = new Set(['b_auth', 'b_session', 'b_cloud', 'b_s3', 'b_theme', 'b_db_outbox'])

type ClaimMarker = { version: 1; status: 'pending' | 'complete'; ownerUserId: string; sourceDigest: string; updatedAt: number }
type LegacyEntityTombstone = { entity: string; entityId: string }
type LegacyDeletionManifest = { keys: string[]; entities: LegacyEntityTombstone[] }
export type LegacyLocalPreview = { values: Record<string, string>; count: number; bytes: number; sourceDigest: string; alreadyClaimed: boolean; claimPending: boolean; tombstonedKeys: string[]; tombstonedEntities: LegacyEntityTombstone[] }

export function recordLegacyD1Tombstones(keys: string[], entities: LegacyEntityTombstone[] = []): void {
  if (!keys.length && !entities.length) return
  try {
    const existing = JSON.parse(localStorage.getItem(D1_TOMBSTONES_KEY) || '[]') as unknown
    const parsed: LegacyDeletionManifest = Array.isArray(existing)
      ? { keys: existing.filter((key): key is string => typeof key === 'string'), entities: [] }
      : existing && typeof existing === 'object' && Array.isArray((existing as LegacyDeletionManifest).keys) && Array.isArray((existing as LegacyDeletionManifest).entities)
        ? existing as LegacyDeletionManifest
        : { keys: [], entities: [] }
    const mergedKeys = new Set(parsed.keys)
    const mergedEntities = new Map(parsed.entities.map(item => [`${item.entity}\u0000${item.entityId}`, item]))
    const syncedRaw = lsGet(SYNCED_D1_TOMBSTONES_KEY)
    if (syncedRaw != null) {
      const syncedManifest = parseDeletionManifest(syncedRaw)
      syncedManifest.keys.forEach(key => mergedKeys.add(key))
      syncedManifest.entities.forEach(item => mergedEntities.set(`${item.entity}\u0000${item.entityId}`, item))
    }
    keys.forEach(key => mergedKeys.add(key))
    entities.forEach(item => mergedEntities.set(`${item.entity}\u0000${item.entityId}`, item))
    const encoded = JSON.stringify({ keys: [...mergedKeys].sort(), entities: [...mergedEntities.values()].sort((a, b) => a.entity.localeCompare(b.entity) || a.entityId.localeCompare(b.entityId)) })
    localStorage.setItem(D1_TOMBSTONES_KEY, encoded)
    if (localStorage.getItem(D1_TOMBSTONES_KEY) !== encoded) throw new Error('storage-verification-failed')
    if (!lsSet(SYNCED_D1_TOMBSTONES_KEY, encoded)) throw new Error('account-storage-write-failed')
  } catch { throw new Error('无法保存旧数据删除标记；原云端数据保留。') }
}

function parseDeletionManifest(raw: string): LegacyDeletionManifest {
  const parsed = JSON.parse(raw) as unknown
  if (Array.isArray(parsed)) return { keys: parsed.filter((key): key is string => typeof key === 'string' && key.startsWith('b_')), entities: [] }
  if (parsed && typeof parsed === 'object') {
    const manifest = parsed as Partial<LegacyDeletionManifest>
    if (!Array.isArray(manifest.keys) || !Array.isArray(manifest.entities)) throw new Error('legacy-deletion-manifest-invalid')
    return {
      keys: manifest.keys.filter((key): key is string => typeof key === 'string' && key.startsWith('b_')),
      entities: manifest.entities.filter(item => item && typeof item.entity === 'string' && typeof item.entityId === 'string')
    }
  }
  throw new Error('legacy-deletion-manifest-invalid')
}

function readLegacyD1Tombstones(): LegacyDeletionManifest {
  let manifest: LegacyDeletionManifest = { keys: [], entities: [] }
  try {
    const raw = localStorage.getItem(D1_TOMBSTONES_KEY)
    if (raw) manifest = parseDeletionManifest(raw)
  } catch { throw new Error('旧数据删除清单无法读取；为避免数据复活，已停止本地认领。') }
  const synced = lsGet(SYNCED_D1_TOMBSTONES_KEY)
  if (synced != null) {
    try {
      const accountManifest = parseDeletionManifest(synced)
      manifest = {
        keys: [...new Set([...manifest.keys, ...accountManifest.keys])],
        entities: [...new Map([...manifest.entities, ...accountManifest.entities].map(item => [`${item.entity}\u0000${item.entityId}`, item])).values()]
      }
    } catch { throw new Error('账号中的旧数据删除清单无法读取；为避免数据复活，已停止本地认领。') }
  }
  return manifest
}

function readClaimMarker(): ClaimMarker | null {
  try {
    const raw = localStorage.getItem(CLAIM_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ClaimMarker>
    if (parsed.version === 1 && (parsed.status === 'pending' || parsed.status === 'complete') && typeof parsed.ownerUserId === 'string' && typeof parsed.sourceDigest === 'string') {
      return parsed as ClaimMarker
    }
    // Older builds stored only the owner ID after claiming the data.
    return { version: 1, status: 'complete', ownerUserId: raw, sourceDigest: '', updatedAt: 0 }
  } catch { return null }
}

async function digestValues(values: Record<string, string>): Promise<string> {
  const entries = Object.keys(values).sort().map(key => [key, values[key]])
  const bytes = new TextEncoder().encode(JSON.stringify(entries))
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('')
}

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

export async function previewLegacyLocalData(baseUrl: string): Promise<LegacyLocalPreview> {
  const session = readServerSession()
  if (!session) throw new Error('请先登录后再检查旧设备数据。')
  await syncVaultEntityData(baseUrl)
  const values = { ...readLegacyLocalStorage(), ...await readLegacyIndexedDb() }
  const server = readServerSession()
  const marker = readClaimMarker()
  const deletionManifest = readLegacyD1Tombstones()
  const tombstonedKeys = [...new Set([
    ...deletionManifest.keys,
    ...deletionManifest.entities.filter(item => item.entity === 'setting').map(item => `b_${item.entityId}`)
  ])]
  const tombstonedEntities = deletionManifest.entities
  const sourceDigest = await digestValues(values)
  const ownsPendingClaim = !!server && !!marker && marker.status === 'pending' && marker.ownerUserId === server.user.id
  return {
    values,
    count: Object.keys(values).length,
    bytes: Object.values(values).reduce((sum, value) => sum + new Blob([value]).size, 0),
    sourceDigest,
    alreadyClaimed: !server || server.user.role !== 'admin' || marker?.status === 'complete' || (!!marker && !ownsPendingClaim),
    claimPending: ownsPendingClaim,
    tombstonedKeys,
    tombstonedEntities
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

export async function claimLegacyLocalData(preview: LegacyLocalPreview, baseUrl: string): Promise<number> {
  const server = readServerSession()
  if (!server || server.user.role !== 'admin' || preview.alreadyClaimed) throw new Error('legacy-claim-not-allowed')
  await syncVaultEntityData(baseUrl)
  const currentValues = { ...readLegacyLocalStorage(), ...await readLegacyIndexedDb() }
  const currentDigest = await digestValues(currentValues)
  if (currentDigest !== preview.sourceDigest) throw new Error('旧数据在预览后发生变化，请重新预览并重新下载备份。')
  const marker = readClaimMarker()
  if (marker?.status === 'complete' || (marker && marker.ownerUserId !== server.user.id)) throw new Error('legacy-claim-not-allowed')
  if (marker?.status === 'pending' && marker.sourceDigest !== currentDigest) throw new Error('待恢复的旧数据与原迁移快照不一致；原数据未更改，请先核对备份。')
  if (!marker) {
    try {
      localStorage.setItem(CLAIM_KEY, JSON.stringify({ version: 1, status: 'pending', ownerUserId: server.user.id, sourceDigest: currentDigest, updatedAt: Date.now() } satisfies ClaimMarker))
    } catch { throw new Error('无法保存迁移断点，旧数据未更改。') }
  }
  let imported = 0
  const expected: Record<string, string> = {}
  const tombstoned = readLegacyD1Tombstones()
  for (const [key, legacy] of Object.entries(currentValues)) {
    const keySuffix = key.startsWith('b_') ? key.slice(2) : key
    const deletedSetting = tombstoned.entities.some(item => item.entity === 'setting' && item.entityId === keySuffix)
    if (tombstoned.keys.includes(key) || deletedSetting) continue
    let eligibleLegacy = legacy
    const entity = key.startsWith('b_') ? key.slice(2) : ''
    const deletedIds = new Set(tombstoned.entities.filter(item => item.entity === entity).map(item => item.entityId))
    if (deletedIds.size) {
      try {
        const value: unknown = JSON.parse(legacy)
        if (Array.isArray(value)) {
          eligibleLegacy = JSON.stringify(value.filter((item, index) => {
            if (!item || typeof item !== 'object') return true
            const row = item as Record<string, unknown>
            const id = String(row.id ?? row.calmyId ?? row.date ?? `legacy-${index}`)
            return !deletedIds.has(id)
          }))
        }
      } catch { /* preserve opaque data when no entity-level merge rule applies */ }
    }
    const value = mergeValues(eligibleLegacy, lsGet(key))
    expected[key] = value
    if (value !== lsGet(key)) {
      if (!lsSet(key, value)) throw new Error(`legacy-local-write-failed:${key}`)
      imported++
    }
  }
  await flushPendingDbWrites()
  let durable = false
  const snapshot = await readKvSnapshot()
  if (snapshot && Object.entries(expected).every(([key, value]) => snapshot[key] === value)) durable = true
  if (!durable) {
    try { durable = Object.entries(expected).every(([key, value]) => localStorage.getItem(accountStorageKey(key)) === value) }
    catch { durable = false }
  }
  if (!durable) throw new Error('旧数据尚未完整持久化；迁移已保留断点，可以在此账号下重试。')
  try {
    localStorage.setItem(CLAIM_KEY, JSON.stringify({ version: 1, status: 'complete', ownerUserId: server.user.id, sourceDigest: currentDigest, updatedAt: Date.now() } satisfies ClaimMarker))
  } catch { throw new Error('迁移已保存但无法提交认领标记；刷新后可安全恢复。') }
  return imported
}
