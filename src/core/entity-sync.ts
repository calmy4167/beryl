import { apiFetch } from './api/client'
import { DEVICE_ID, getDbStatus, readDbMeta, readEntityChanges, writeDbMeta, type EntityChange } from './db'
import { decryptValue, encryptValue } from './crypto'
import { lsGet, lsSet, safeParse } from './storage'
import { flushRepositoryWrites } from './repository'

export interface EntitySyncCursor { ts: number; device: string; entity: string; entityId: string }
export interface EntitySyncRecord { entity: string; entityId: string; value?: unknown; updatedAt: number; device: string; deleted?: boolean }

const ENTITY_COLLECTIONS = ['tasks', 'inbox', 'habits', 'goals', 'finance', 'diary', 'chars', 'posts', 'cases', 'caseRelations', 'moments']
const ENTITY_CURSOR_KEY = 'b_entity_pull_cursor'
const ENTITY_READY_KEY = 'b_entity_sync_ready'
const ENTITY_PUSH_TS_KEY = 'b_entity_push_ts'
const ENTITY_CURSOR_META_KEY = 'entity-sync:pull-cursor'
const ENTITY_READY_META_KEY = 'entity-sync:ready'
const ENTITY_PUSH_TS_META_KEY = 'entity-sync:push-ts'

async function readEntitySyncState<T>(metaKey: string, legacyKey: string, fallback: T): Promise<T> {
  const durable = await readDbMeta<T>(metaKey)
  if (durable !== undefined) return durable
  const raw = lsGet(legacyKey)
  if (typeof fallback === 'boolean') return (raw === '1' || raw === 'true') as T
  if (typeof fallback === 'number') return (Number(raw) || fallback) as T
  return safeParse<T>(raw || '') ?? fallback
}

async function writeEntitySyncState<T>(metaKey: string, legacyKey: string, value: T): Promise<boolean> {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  const legacyOk = lsSet(legacyKey, serialized)
  const wasAvailable = getDbStatus().available
  const durableOk = await writeDbMeta(metaKey, value)
  // IndexedDB 不可用时保留 localStorage 兼容回退；一旦可用，只有事务完成
  // 才算同步状态已确认，避免游标/ready 在 durable 写入前提前前进。
  return durableOk || (!wasAvailable && !getDbStatus().available && legacyOk)
}

function idFor(entity: string, item: Record<string, unknown>): string | undefined {
  if (item.id != null) return String(item.id)
  if (entity === 'diary' && item.date != null) return String(item.date)
  return undefined
}

function localEntitySnapshot(): EntityChange[] {
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
  return out
}

/**
 * 按实体同步协议的时间戳与设备 ID 进行 LWW 裁决。
 * 相同设备、相同时间戳视为同一版本，保留本地值，避免重复拉取造成抖动。
 */
export function isRemoteEntityRecordNewer(record: EntitySyncRecord, local?: Pick<EntityChange, 'updatedAt' | 'device'>): boolean {
  if (!local) return true
  return record.updatedAt > local.updatedAt || (record.updatedAt === local.updatedAt && record.device > local.device)
}

function latestLocalEntityVersions(changes: EntityChange[]): Map<string, Pick<EntityChange, 'updatedAt' | 'device'>> {
  const versions = new Map<string, Pick<EntityChange, 'updatedAt' | 'device'>>()
  for (const change of changes) {
    const key = `${change.entity}:${change.entityId}`
    const current = versions.get(key)
    if (!current || change.updatedAt > current.updatedAt || (change.updatedAt === current.updatedAt && change.device > current.device)) {
      versions.set(key, { updatedAt: change.updatedAt, device: change.device })
    }
  }
  return versions
}

/** 将实体级远端记录应用到本地集合；不写入本地实体变更日志，避免回环推送。 */
export async function applyEntityRecords(records: EntitySyncRecord[], localChanges?: EntityChange[]): Promise<number> {
  const localVersions = latestLocalEntityVersions(localChanges || await readEntityChanges(5000))
  const grouped = new Map<string, EntitySyncRecord[]>()
  records.forEach(record => { if (ENTITY_COLLECTIONS.includes(record.entity)) grouped.set(record.entity, [...(grouped.get(record.entity) || []), record]) })
  let applied = 0
  for (const [entity, changes] of grouped) {
    const current = safeParse<unknown>(lsGet(`b_${entity}`) || '')
    const list = Array.isArray(current) ? current.slice() as Record<string, unknown>[] : []
    let entityApplied = 0
    for (const record of changes) {
      const versionKey = `${record.entity}:${record.entityId}`
      const localVersion = localVersions.get(versionKey)
      if (!isRemoteEntityRecordNewer(record, localVersion)) continue
      const index = list.findIndex(item => idFor(entity, item) === record.entityId)
      if (record.deleted) { if (index >= 0) { list.splice(index, 1); entityApplied++ } }
      else if (record.value && typeof record.value === 'object') { if (index >= 0) list[index] = record.value as Record<string, unknown>; else list.unshift(record.value as Record<string, unknown>); entityApplied++ }
      localVersions.set(versionKey, { updatedAt: record.updatedAt, device: record.device })
    }
    const value = JSON.stringify(list)
    if (entityApplied) {
      if (!lsSet(`b_${entity}`, value)) throw new Error(`entity-apply-failed:${entity}`)
      applied += entityApplied
    }
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

export async function pushEntityChanges(baseUrl: string, token: string, changes?: EntityChange[]): Promise<boolean> {
  const pending = changes || await readEntityChanges()
  const records = []
  for (const record of entityChangesToRecords(pending)) {
    if (record.deleted || record.value === undefined) records.push(record)
    else {
      const encrypted = await encryptValue(token, JSON.stringify(record.value))
      if (!encrypted) throw new Error('entity-encrypt-failed')
      records.push({ ...record, value: encrypted })
    }
  }
  const response = await apiFetch(baseUrl, '/api/entity-sync/push', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ changes: records })
  })
  return response.ok
}

export async function pullEntityChanges(baseUrl: string, token: string, cursor: EntitySyncCursor = { ts: 0, device: '', entity: '', entityId: '' }): Promise<{ records: EntitySyncRecord[]; cursor: EntitySyncCursor; hasMore: boolean }> {
  const response = await apiFetch(baseUrl, '/api/entity-sync/pull', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ since: cursor.ts, sinceDevice: cursor.device, sinceEntity: cursor.entity, sinceEntityId: cursor.entityId })
  })
  if (!response.ok) throw new Error(`entity-pull:${response.status}`)
  const data = await response.json() as { records?: EntitySyncRecord[]; nextCursor?: EntitySyncCursor; hasMore?: boolean }
  const records: EntitySyncRecord[] = []
  for (const record of data.records || []) {
    if (record.deleted || record.value === undefined) records.push(record)
    else {
      let payload = record.value
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload) } catch { throw new Error('entity-decrypt-format') }
      }
      const plain = await decryptValue(token, payload)
      if (plain == null) throw new Error('entity-decrypt-failed')
      records.push({ ...record, value: JSON.parse(plain) })
    }
  }
  return { records, cursor: data.nextCursor || cursor, hasMore: !!data.hasMore }
}

export async function pullAllEntityChanges(baseUrl: string, token: string, cursor: EntitySyncCursor = { ts: 0, device: '', entity: '', entityId: '' }): Promise<{ records: EntitySyncRecord[]; cursor: EntitySyncCursor }> {
  let next = cursor; const records: EntitySyncRecord[] = []
  for (let page = 0; page < 100; page++) {
    const result = await pullEntityChanges(baseUrl, token, next)
    records.push(...result.records)
    if (!result.hasMore || !result.records.length) return { records, cursor: result.cursor }
    if (JSON.stringify(result.cursor) === JSON.stringify(next)) throw new Error('entity-cursor-stalled')
    next = result.cursor
  }
  throw new Error('entity-page-limit')
}

/** 实体级同步默认流程：首次连接自动迁移本地集合，后续按游标拉取并推送变更。 */
export async function syncEntityData(baseUrl: string, token: string): Promise<{ pulled: number; pushed: number }> {
  const emptyCursor = { ts: 0, device: '', entity: '', entityId: '' }
  const savedCursor = await readEntitySyncState(ENTITY_CURSOR_META_KEY, ENTITY_CURSOR_KEY, emptyCursor)
  const ready = await readEntitySyncState<boolean>(ENTITY_READY_META_KEY, ENTITY_READY_KEY, false)
  let pushWatermark = await readEntitySyncState<number>(ENTITY_PUSH_TS_META_KEY, ENTITY_PUSH_TS_KEY, 0)
  // ready 之前必须从零开始，避免上一次部分成功留下的游标跳过远端旧记录。
  let pulled = await pullAllEntityChanges(baseUrl, token, ready ? savedCursor : emptyCursor)
  if (!ready) {
    // 首次连接同时存在本地和远端数据时，先把本地快照送入云端，再按同一批
    // 本地版本应用远端记录。这样不会因为“远端有数据”而跳过未进入实体日志
    // 的旧本地记录；任一步失败都不写 ready/cursor，下一次仍可重试。
    const snapshot = localEntitySnapshot()
    if (snapshot.length) {
      const ok = await pushEntityChanges(baseUrl, token, snapshot)
      if (!ok) throw new Error('entity-initial-push-failed')
      pushWatermark = Math.max(...snapshot.map(change => change.updatedAt))
      if (!await writeEntitySyncState(ENTITY_PUSH_TS_META_KEY, ENTITY_PUSH_TS_KEY, pushWatermark)) throw new Error('entity-push-watermark-failed')
      // 推送后重新从初始游标拉取，确认本地快照已进入服务端时间线，并合并
      // 推送期间出现的远端记录；只有这次完整拉取成功后才允许写 ready。
      pulled = await pullAllEntityChanges(baseUrl, token, emptyCursor)
    }
    if (pulled.records.length) await applyEntityRecords(pulled.records, snapshot)
    if (!await writeEntitySyncState(ENTITY_READY_META_KEY, ENTITY_READY_KEY, true)) throw new Error('entity-ready-write-failed')
  } else if (pulled.records.length) await applyEntityRecords(pulled.records)
  if (!await writeEntitySyncState(ENTITY_CURSOR_META_KEY, ENTITY_CURSOR_KEY, pulled.cursor)) throw new Error('entity-cursor-write-failed')
  const pending = await readEntityChanges(500, pushWatermark)
  if (!pending.length) return { pulled: pulled.records.length, pushed: 0 }
  const pushed = await pushEntityChanges(baseUrl, token, pending) ? pending.length : 0
  if (pushed) {
    pushWatermark = Math.max(...pending.map(change => change.updatedAt))
    if (!await writeEntitySyncState(ENTITY_PUSH_TS_META_KEY, ENTITY_PUSH_TS_KEY, pushWatermark)) throw new Error('entity-push-watermark-failed')
  }
  return { pulled: pulled.records.length, pushed }
}
