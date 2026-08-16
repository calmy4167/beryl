import { apiFetch } from './api/client'
import { DEVICE_ID, dbMirrorPut, readEntityChanges, type EntityChange } from './db'
import { decryptValue, encryptValue } from './crypto'
import { lsGet, lsSet, safeParse } from './storage'

export interface EntitySyncCursor { ts: number; device: string; entity: string; entityId: string }
export interface EntitySyncRecord { entity: string; entityId: string; value?: unknown; updatedAt: number; device: string; deleted?: boolean }

const ENTITY_COLLECTIONS = ['tasks', 'inbox', 'habits', 'goals', 'finance', 'diary', 'chars', 'posts', 'cases', 'caseRelations', 'moments']
const ENTITY_CURSOR_KEY = 'b_entity_pull_cursor'
const ENTITY_READY_KEY = 'b_entity_sync_ready'
const ENTITY_PUSH_TS_KEY = 'b_entity_push_ts'

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

/** 将实体级远端记录应用到本地集合；不写入本地实体变更日志，避免回环推送。 */
export function applyEntityRecords(records: EntitySyncRecord[]): number {
  const grouped = new Map<string, EntitySyncRecord[]>()
  records.forEach(record => { if (ENTITY_COLLECTIONS.includes(record.entity)) grouped.set(record.entity, [...(grouped.get(record.entity) || []), record]) })
  let applied = 0
  for (const [entity, changes] of grouped) {
    const current = safeParse<unknown>(lsGet(`b_${entity}`) || '')
    const list = Array.isArray(current) ? current.slice() as Record<string, unknown>[] : []
    for (const record of changes) {
      const index = list.findIndex(item => idFor(entity, item) === record.entityId)
      if (record.deleted) { if (index >= 0) { list.splice(index, 1); applied++ } }
      else if (record.value && typeof record.value === 'object') { if (index >= 0) list[index] = record.value as Record<string, unknown>; else list.unshift(record.value as Record<string, unknown>); applied++ }
    }
    const value = JSON.stringify(list)
    if (lsSet(`b_${entity}`, value)) void dbMirrorPut(`b_${entity}`, value)
  }
  if (applied && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('beryl-data-synced'))
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
  const savedCursor = safeParse<EntitySyncCursor>(lsGet(ENTITY_CURSOR_KEY) || '') || { ts: 0, device: '', entity: '', entityId: '' }
  let pulled = await pullAllEntityChanges(baseUrl, token, savedCursor)
  if (!lsGet(ENTITY_READY_KEY)) {
    if (pulled.records.length) applyEntityRecords(pulled.records)
    else {
      const snapshot = localEntitySnapshot()
      if (snapshot.length) {
        const ok = await pushEntityChanges(baseUrl, token, snapshot)
        if (ok) lsSet(ENTITY_PUSH_TS_KEY, String(Math.max(...snapshot.map(change => change.updatedAt))))
      }
    }
    lsSet(ENTITY_READY_KEY, '1')
  } else if (pulled.records.length) applyEntityRecords(pulled.records)
  lsSet(ENTITY_CURSOR_KEY, JSON.stringify(pulled.cursor))
  const pending = await readEntityChanges(500, Number(lsGet(ENTITY_PUSH_TS_KEY) || 0))
  if (!pending.length) return { pulled: pulled.records.length, pushed: 0 }
  const pushed = await pushEntityChanges(baseUrl, token, pending) ? pending.length : 0
  if (pushed) lsSet(ENTITY_PUSH_TS_KEY, String(Math.max(...pending.map(change => change.updatedAt))))
  return { pulled: pulled.records.length, pushed }
}
