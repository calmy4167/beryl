import { apiFetch } from './api/client'
import { DEVICE_ID, latestEntityChangeCursor, readDbMeta, readEntityChanges, readEntityChangesAfter, recordEntityChanges, recordSyncedEntityChanges, writeDbMeta, type EntityChange, type EntityChangeCursor } from './db'
import { lsGet, lsRemove, lsSet, listLocalStorageKeys, safeParse } from './storage'
import { flushRepositoryWrites } from './repository'
import { CORE_ENTITY_TYPES } from '@/domain/unified/model'
import { createEntityContentKey, currentDeviceId, decryptEntityContent, encryptEntityContent, unwrapEntityContentKey } from './vault-keys'
import { readServerSession } from './auth'
import { getActiveAccount } from './account-context'

export interface EntitySyncCursor { ts: number; device: string; entity: string; entityId: string }
export interface EntitySyncRecord { entity: string; entityId: string; value?: unknown; updatedAt: number; device: string; deleted?: boolean }

const ENTITY_COLLECTIONS = [
  'tasks', 'inbox', 'habits', 'goals', 'finance', 'diary', 'chars', 'posts', 'cases', 'caseRelations', 'moments', 'matters',
  'mvpTodayPlans', 'calmyCaptures', 'calmySuggestions',
  ...CORE_ENTITY_TYPES.map(type => `core:${type}`)
]
const LEGACY_COLLECTION_SETTING_KEYS = new Set(['mvpTodayPlans', 'calmyCaptures', 'calmySuggestions'])
const LOCAL_ONLY_KEYS = new Set(['b_session', 'b_auth', 'b_cloud', 'b_s3', 'b_last_sync', 'b_sync_ts', 'b_sync_versions', 'b_sync_cursor', 'b_push_cursor', 'b_entity_pull_cursor', 'b_entity_sync_ready', 'b_entity_push_ts'])
function idFor(entity: string, item: Record<string, unknown>): string | undefined {
  if (item.id != null) return String(item.id)
  if (item.calmyId != null) return String(item.calmyId)
  if ((entity === 'diary' || entity === 'mvpTodayPlans') && item.date != null) return String(item.date)
  return undefined
}

/** True only when the migrated record can survive the local snapshot/export path. */
export function supportsEntitySyncRecord(record: EntitySyncRecord): boolean {
  if (!record.entityId) return false
  if (record.entity === 'setting') return true
  if (!ENTITY_COLLECTIONS.includes(record.entity) || !record.value || typeof record.value !== 'object' || Array.isArray(record.value)) return false
  return idFor(record.entity, record.value as Record<string, unknown>) === record.entityId
}

export function supportsEntitySyncType(entity: string): boolean {
  return entity === 'setting' || ENTITY_COLLECTIONS.includes(entity)
}

export function localEntitySnapshot(): EntityChange[] {
  const now = Date.now()
  const out: EntityChange[] = []
  for (const entity of ENTITY_COLLECTIONS) {
    const raw = lsGet(`b_${entity}`)
    const list = raw ? safeParse<unknown>(raw) : undefined
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const entityId = idFor(entity, item as Record<string, unknown>)
      if (!entityId) continue
      out.push({ id: `${DEVICE_ID}:${now}:${entity}:${entityId}`, entity, entityId, operation: 'create', updatedAt: now, device: DEVICE_ID, value: item })
    }
  }
  for (const key of listLocalStorageKeys()) {
    if (!key.startsWith('b_') || LOCAL_ONLY_KEYS.has(key) || key === 'b_db_outbox') continue
    const entity = key.slice(2)
    if (ENTITY_COLLECTIONS.includes(entity)) continue
    const raw = lsGet(key)
    if (raw == null) continue
    let value: unknown
    try { value = JSON.parse(raw) } catch { value = raw }
    out.push({ id: `${DEVICE_ID}:${now}:setting:${entity}`, entity: 'setting', entityId: entity, operation: 'create', updatedAt: now, device: DEVICE_ID, value })
  }
  return out
}

type VaultEnvelope = { v: 1; iv: string; ciphertext: string }
type EntityKeyMapping = { opaqueId: string; keyEnvelope: VaultEnvelope; __contentKey?: CryptoKey }
type VaultWireChange = { sequence: number; opaqueId: string; ciphertext: string; keyEnvelope: string; version: number; deviceId: string; deleted: boolean }
const VAULT_PULL_CURSOR = 'vault:pull-sequence'
const VAULT_PUSH_CURSOR = 'vault:push-cursor'

function entityMapKey(entity: string, entityId: string): string {
  return `vault:entity-map:${encodeURIComponent(entity)}:${encodeURIComponent(entityId)}`
}

async function readEntityMapping(entity: string, entityId: string): Promise<EntityKeyMapping | undefined> {
  return readDbMeta<EntityKeyMapping>(entityMapKey(entity, entityId))
}

async function ensureEntityMapping(change: EntityChange): Promise<EntityKeyMapping> {
  const existing = await readEntityMapping(change.entity, change.entityId)
  if (existing) return existing
  const userId = readServerSession()?.user.id
  if (!userId) throw new Error('unauthorized')
  const created = await createEntityContentKey(userId)
  const mapping = { opaqueId: crypto.randomUUID(), keyEnvelope: created.envelope as VaultEnvelope }
  if (!await writeDbMeta(entityMapKey(change.entity, change.entityId), mapping)) throw new Error('vault-entity-key-save-failed')
  if (!await writeDbMeta(`vault:opaque-map:${mapping.opaqueId}`, { entity: change.entity, entityId: change.entityId })) throw new Error('vault-entity-map-save-failed')
  return { ...mapping, __contentKey: created.key }
}

async function encodeVaultChange(change: EntityChange): Promise<Record<string, unknown> | null> {
  const mapping = await readEntityMapping(change.entity, change.entityId)
  const deleted = change.operation === 'delete'
  if (deleted && !mapping) return null
  const selected = mapping || await ensureEntityMapping(change)
  if (deleted) return { opaqueId: selected.opaqueId, version: change.updatedAt, deviceId: change.device || currentDeviceId(), deleted: true }
  const userId = readServerSession()?.user.id
  if (!userId) throw new Error('unauthorized')
  const key = selected.__contentKey || await unwrapEntityContentKey(userId, selected.keyEnvelope)
  const content = { entity: change.entity, entityId: change.entityId, value: change.value, deleted: false }
  const ciphertext = await encryptEntityContent(key, content)
  return { opaqueId: selected.opaqueId, ciphertext, keyEnvelope: selected.keyEnvelope, version: change.updatedAt, deviceId: change.device || currentDeviceId(), deleted: false }
}

async function decodeVaultChange(change: VaultWireChange): Promise<EntitySyncRecord | null> {
  if (change.deleted) return null // tombstones need the last local semantic mapping below
  let envelope: VaultEnvelope
  let payload: { v: 1; iv: string; ciphertext: string }
  try {
    envelope = JSON.parse(change.keyEnvelope) as VaultEnvelope
    payload = JSON.parse(change.ciphertext) as { v: 1; iv: string; ciphertext: string }
  } catch { throw new Error('vault-record-format') }
  const userId = readServerSession()?.user.id
  if (!userId) throw new Error('unauthorized')
  const contentKey = await unwrapEntityContentKey(userId, envelope)
  const clear = await decryptEntityContent(contentKey, payload) as { entity?: unknown; entityId?: unknown; value?: unknown; deleted?: unknown }
  if (typeof clear?.entity !== 'string' || typeof clear.entityId !== 'string') throw new Error('vault-record-payload')
  const mapping = { opaqueId: change.opaqueId, keyEnvelope: envelope }
  if (!await writeDbMeta(entityMapKey(clear.entity, clear.entityId), mapping)) throw new Error('vault-entity-key-save-failed')
  if (!await writeDbMeta(`vault:opaque-map:${change.opaqueId}`, { entity: clear.entity, entityId: clear.entityId })) throw new Error('vault-entity-map-save-failed')
  return { entity: clear.entity, entityId: clear.entityId, value: clear.value, updatedAt: change.version, device: change.deviceId }
}

/** User-scoped sync: semantic IDs stay inside AES-GCM payloads; D1 sees only opaque IDs and ciphertext. */
let vaultSyncFlight: Promise<{ pulled: number; pushed: number }> | null = null

export function syncVaultEntityData(baseUrl: string): Promise<{ pulled: number; pushed: number }> {
  if (vaultSyncFlight) return vaultSyncFlight
  vaultSyncFlight = syncVaultEntityDataOnce(baseUrl).finally(() => { vaultSyncFlight = null })
  return vaultSyncFlight
}

function collapseEntityChanges(changes: EntityChange[]): EntityChange[] {
  const latest = new Map<string, EntityChange>()
  for (const change of changes) {
    const key = `${change.entity}\u0000${change.entityId}`
    const current = latest.get(key)
    if (!current || change.updatedAt > current.updatedAt || (change.updatedAt === current.updatedAt && change.device > current.device)) latest.set(key, change)
  }
  return [...latest.values()].sort((a, b) => a.updatedAt - b.updatedAt || a.device.localeCompare(b.device) || a.id.localeCompare(b.id))
}

async function syncVaultEntityDataOnce(baseUrl: string): Promise<{ pulled: number; pushed: number }> {
  const session = readServerSession()
  if (!session) throw new Error('unauthorized')
  if (getActiveAccount() !== session.user.id) throw new Error('session-account-mismatch')
  let cursor = Number(await readDbMeta<number>(VAULT_PULL_CURSOR)) || 0
  const ready = await readDbMeta<boolean>('vault:initial-snapshot-sent')
  let pushed = 0
  let pushCursor = await readDbMeta<EntityChangeCursor>(VAULT_PUSH_CURSOR)
  if (!pushCursor || typeof pushCursor !== 'object' || typeof pushCursor.updatedAt !== 'number') {
    pushCursor = { updatedAt: 0, device: '', id: '' }
  }

  if (!ready) {
    // Snapshot the entire current dataset once. Capture the changelog cursor first:
    // concurrent edits after this point remain queued for the next incremental pass.
    const cursorBeforeSnapshot = await latestEntityChangeCursor()
    const initial = collapseEntityChanges(localEntitySnapshot())
    pushed += await pushVaultChanges(baseUrl, initial)
    pushCursor = cursorBeforeSnapshot
    if (!await writeDbMeta(VAULT_PUSH_CURSOR, pushCursor)) throw new Error('vault-push-cursor-save-failed')
    if (!await writeDbMeta('vault:initial-snapshot-sent', true)) throw new Error('vault-initial-snapshot-state-failed')
  } else {
    const changes = await readEntityChangesAfter(pushCursor, 500)
    if (changes.length) {
      pushed += await pushVaultChanges(baseUrl, collapseEntityChanges(changes))
      pushCursor = changeCursor(changes[changes.length - 1])
      if (!await writeDbMeta(VAULT_PUSH_CURSOR, pushCursor)) throw new Error('vault-push-cursor-save-failed')
    }
  }

  let pulled = 0
  let hasMore = true
  let lastCursor = cursor
  while (hasMore) {
    const response = await apiFetch(baseUrl, '/api/vault/sync/pull', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ after: cursor })
    })
    if (!response.ok) throw new Error(`vault-pull:${response.status}`)
    const body = await response.json() as { changes?: VaultWireChange[]; cursor?: number; hasMore?: boolean }
    const changes = body.changes || []
    const decoded: EntitySyncRecord[] = []
    for (const change of changes) {
      if (change.deleted) {
        const keys = await listEntityMappingsByOpaqueId(change.opaqueId)
        keys.forEach(key => decoded.push({ entity: key.entity, entityId: key.entityId, updatedAt: change.version, device: change.deviceId, deleted: true }))
      } else {
        const record = await decodeVaultChange(change)
        if (record) decoded.push(record)
      }
    }
    if (decoded.length) await applyEntityRecords(decoded)
    pulled += decoded.length
    cursor = Number(body.cursor || cursor)
    hasMore = !!body.hasMore
    if (hasMore && cursor <= lastCursor) throw new Error('vault-pull-cursor-stalled')
    lastCursor = cursor
  }
  if (!await writeDbMeta(VAULT_PULL_CURSOR, cursor)) throw new Error('vault-pull-cursor-save-failed')

  // Push edits made while the pull was in flight using the full timestamp/device/id cursor.
  const concurrentChanges = await readEntityChangesAfter(pushCursor, 500)
  if (concurrentChanges.length) {
    pushed += await pushVaultChanges(baseUrl, collapseEntityChanges(concurrentChanges))
    pushCursor = changeCursor(concurrentChanges[concurrentChanges.length - 1])
    if (!await writeDbMeta(VAULT_PUSH_CURSOR, pushCursor)) throw new Error('vault-push-cursor-save-failed')
  }
  return { pulled, pushed }
}

function changeCursor(change: EntityChange): EntityChangeCursor {
  return { updatedAt: change.updatedAt, device: change.device || DEVICE_ID, id: change.id }
}

async function pushVaultChanges(baseUrl: string, changes: EntityChange[]): Promise<number> {
  let batch: Record<string, unknown>[] = []
  let batchBytes = 0
  let accepted = 0
  const send = async () => {
    if (!batch.length) return
    const response = await apiFetch(baseUrl, '/api/vault/sync/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes: batch })
    })
    if (!response.ok) throw new Error(`vault-push:${response.status}`)
    accepted += batch.length
    batch = []
    batchBytes = 0
  }
  for (const change of changes) {
    const encoded = await encodeVaultChange(change)
    if (!encoded) continue
    const size = JSON.stringify(encoded).length
    if (size > 6_000_000) throw new Error('vault-entity-too-large')
    if (batch.length >= 50 || batchBytes + size > 6_000_000) await send()
    batch.push(encoded)
    batchBytes += size
  }
  await send()
  return accepted
}

async function listEntityMappingsByOpaqueId(opaqueId: string): Promise<{ entity: string; entityId: string }[]> {
  const mapping = await readDbMeta<{ entity?: unknown; entityId?: unknown }>(`vault:opaque-map:${opaqueId}`)
  return typeof mapping?.entity === 'string' && typeof mapping.entityId === 'string'
    ? [{ entity: mapping.entity, entityId: mapping.entityId }]
    : []
}

/** Read the latest server version of each opaque record and decrypt it for a migration audit. */
export async function readVerifiedVaultSnapshot(baseUrl: string): Promise<{ records: EntitySyncRecord[]; cursor: number; opaqueIds: string[] }> {
  const latest: VaultWireChange[] = []
  const opaqueIds: string[] = []
  let snapshotCursor: number | null = null
  let after = ''
  let hasMore = true
  while (hasMore) {
    const query = new URLSearchParams({ after })
    const response = await apiFetch(baseUrl, `/api/vault/sync/snapshot?${query}`)
    if (!response.ok) throw new Error(`vault-verification-pull:${response.status}`)
    const body = await response.json() as { records?: VaultWireChange[]; nextAfter?: string; cursor?: number; hasMore?: boolean }
    const records = body.records || []
    if (snapshotCursor == null) snapshotCursor = Number(body.cursor || 0)
    if (Number(body.cursor || 0) !== snapshotCursor) throw new Error('vault-changed-during-snapshot')
    for (const record of records) {
      latest.push(record)
      opaqueIds.push(record.opaqueId)
    }
    const nextAfter = String(body.nextAfter || after)
    if (body.hasMore && nextAfter <= after) throw new Error('vault-verification-cursor-stalled')
    after = nextAfter
    hasMore = !!body.hasMore
  }

  const verified: EntitySyncRecord[] = []
  for (const change of latest) {
    if (change.deleted) {
      const mappings = await listEntityMappingsByOpaqueId(change.opaqueId)
      mappings.forEach(mapping => verified.push({ ...mapping, updatedAt: change.version, device: change.deviceId, deleted: true }))
    } else {
      const record = await decodeVaultChange(change)
      if (!record) throw new Error('vault-verification-decode-failed')
      verified.push(record)
    }
  }
  return { records: verified, cursor: snapshotCursor || 0, opaqueIds }
}

/**
 * 按实体同步协议的时间戳与设备 ID 进行 LWW 裁决。
 * 相同设备、相同时间戳视为同一版本，保留本地值，避免重复拉取造成抖动。
 */
export function isRemoteEntityRecordNewer(record: EntitySyncRecord, local?: Pick<EntityChange, 'updatedAt' | 'device'>): boolean {
  if (!local) return true
  return record.updatedAt > local.updatedAt || (record.updatedAt === local.updatedAt && record.device > local.device)
}

function latestLocalEntityVersions(changes: EntityChange[]): Map<string, Pick<EntityChange, 'updatedAt' | 'device'> & { deleted: boolean }> {
  const versions = new Map<string, Pick<EntityChange, 'updatedAt' | 'device'> & { deleted: boolean }>()
  for (const change of changes) {
    const key = `${change.entity}:${change.entityId}`
    const current = versions.get(key)
    if (!current || change.updatedAt > current.updatedAt || (change.updatedAt === current.updatedAt && change.device > current.device)) {
      versions.set(key, { updatedAt: change.updatedAt, device: change.device, deleted: change.operation === 'delete' })
    }
  }
  return versions
}

/** 将实体级远端记录应用到本地集合，并保留收到的版本/墓碑以避免后续旧数据复活。 */
export async function applyEntityRecords(records: EntitySyncRecord[], localChanges?: EntityChange[]): Promise<number> {
  const changes = localChanges || await readEntityChanges(Number.MAX_SAFE_INTEGER)
  const localVersions = latestLocalEntityVersions(changes)
  const localTombstones = new Set([...localVersions].filter(([, version]) => version.deleted).map(([key]) => key))
  const grouped = new Map<string, EntitySyncRecord[]>()
  const legacyBefore = new Map<string, Record<string, unknown>[]>()
  const appliedRemoteRecords: EntityChange[] = []
  let applied = 0
  for (const record of records) {
    if (record.entity !== 'setting') continue
    // Older clients synced these arrays as one opaque setting. Merge it first,
    // preserving stable item IDs; after native records/tombstones are applied,
    // persist only the resulting local migration diff as per-item changes.
    if (LEGACY_COLLECTION_SETTING_KEYS.has(record.entityId)) {
      if (record.deleted || !Array.isArray(record.value)) continue
      const key = `b_${record.entityId}`
      const current = safeParse<unknown>(lsGet(key) || '')
      const before = Array.isArray(current) ? current.slice() as Record<string, unknown>[] : []
      if (!legacyBefore.has(key)) legacyBefore.set(key, before)
      const list = before.slice()
      const entity = record.entityId
      let changed = 0
      for (const item of record.value) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue
        const value = item as Record<string, unknown>
        const entityId = idFor(entity, value)
        if (!entityId) continue
        const versionKey = `${entity}:${entityId}`
        if (localTombstones.has(versionKey)) continue
        const index = list.findIndex(existing => idFor(entity, existing) === entityId)
        if (index < 0) {
          list.push(value)
          changed++
          continue
        }
        const knownVersion = localVersions.get(versionKey)
        const existingUpdatedAt = Number(list[index].updatedAt)
        const itemVersion = knownVersion || (Number.isFinite(existingUpdatedAt)
          ? { updatedAt: existingUpdatedAt, device: DEVICE_ID, deleted: false }
          : undefined)
        const incomingUpdatedAt = Number(value.updatedAt)
        const incomingVersion = {
          updatedAt: Number.isFinite(incomingUpdatedAt) ? incomingUpdatedAt : record.updatedAt,
          device: record.device,
        }
        if (isRemoteEntityRecordNewer({ ...record, ...incomingVersion }, itemVersion)) {
          list[index] = value
          changed++
        }
      }
      if (changed) {
        if (!lsSet(key, JSON.stringify(list))) throw new Error(`entity-apply-failed:${record.entityId}`)
        applied += changed
      }
      continue
    }
    const versionKey = `${record.entity}:${record.entityId}`
    if (!isRemoteEntityRecordNewer(record, localVersions.get(versionKey))) continue
    const key = `b_${record.entityId}`
    if (record.deleted) lsRemove(key)
    else if (!lsSet(key, JSON.stringify(record.value))) throw new Error(`entity-apply-failed:${record.entityId}`)
    localVersions.set(versionKey, { updatedAt: record.updatedAt, device: record.device, deleted: !!record.deleted })
    applied++
  }
  records.forEach(record => { if (ENTITY_COLLECTIONS.includes(record.entity)) grouped.set(record.entity, [...(grouped.get(record.entity) || []), record]) })
  for (const [entity, changes] of grouped) {
    const current = safeParse<unknown>(lsGet(`b_${entity}`) || '')
    const list = Array.isArray(current) ? current.slice() as Record<string, unknown>[] : []
    let entityApplied = 0
    for (const record of changes) {
      const versionKey = `${record.entity}:${record.entityId}`
      const localVersion = localVersions.get(versionKey)
      if (!isRemoteEntityRecordNewer(record, localVersion)) continue
      const index = list.findIndex(item => idFor(entity, item) === record.entityId)
      if (record.deleted) {
        if (index >= 0) { list.splice(index, 1); entityApplied++ }
        localTombstones.add(versionKey)
      }
      else if (record.value && typeof record.value === 'object') {
        if (index >= 0) list[index] = record.value as Record<string, unknown>
        else list.unshift(record.value as Record<string, unknown>)
        entityApplied++
        localTombstones.delete(versionKey)
      }
      localVersions.set(versionKey, { updatedAt: record.updatedAt, device: record.device, deleted: !!record.deleted })
      if (['mvpTodayPlans', 'calmyCaptures', 'calmySuggestions'].includes(entity)) {
        appliedRemoteRecords.push({ id: `${record.device}:${record.updatedAt}:${entity}:${record.entityId}`, entity, entityId: record.entityId, operation: record.deleted ? 'delete' : 'update', updatedAt: record.updatedAt, device: record.device, ...(record.deleted ? {} : { value: record.value }) })
      }
    }
    const value = JSON.stringify(list)
    if (entityApplied) {
      if (!lsSet(`b_${entity}`, value)) throw new Error(`entity-apply-failed:${entity}`)
      applied += entityApplied
    }
  }
  if (appliedRemoteRecords.length) await recordSyncedEntityChanges(appliedRemoteRecords)
  for (const [key, before] of legacyBefore) {
    const after = safeParse<unknown>(lsGet(key) || '')
    if (Array.isArray(after) && JSON.stringify(before) !== JSON.stringify(after)) await recordEntityChanges(key, before, after)
  }
  if (applied) {
    await flushRepositoryWrites()
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('beryl-data-synced'))
  }
  return applied
}

export function entityChangeToRecord(change: EntityChange): EntitySyncRecord {
  return { entity: change.entity, entityId: change.entityId, value: change.value, updatedAt: change.updatedAt, device: change.device || DEVICE_ID, deleted: change.operation === 'delete' }
}

export function entityChangesToRecords(changes: EntityChange[]): EntitySyncRecord[] {
  return changes.map(entityChangeToRecord)
}

/** Compatibility surface: encryption and authorization now come from the active User Vault session. */
export async function pushEntityChanges(baseUrl: string, _legacyToken: string, changes?: EntityChange[]): Promise<boolean> {
  const pending = changes || await readEntityChanges()
  await pushVaultChanges(baseUrl, collapseEntityChanges(pending))
  return true
}

export async function pullEntityChanges(_baseUrl: string, _legacyToken: string, _cursor?: EntitySyncCursor): Promise<{ records: EntitySyncRecord[]; cursor: EntitySyncCursor; hasMore: boolean }> {
  throw new Error('legacy-entity-pull-disabled-use-vault-sync')
}

export async function pullAllEntityChanges(_baseUrl: string, _legacyToken: string, _cursor?: EntitySyncCursor): Promise<{ records: EntitySyncRecord[]; cursor: EntitySyncCursor }> {
  throw new Error('legacy-entity-pull-disabled-use-vault-sync')
}

export async function syncEntityData(baseUrl: string, _legacyToken: string): Promise<{ pulled: number; pushed: number }> {
  return syncVaultEntityData(baseUrl)
}
