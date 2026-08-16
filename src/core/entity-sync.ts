import { apiFetch } from './api/client'
import { DEVICE_ID, readEntityChanges, type EntityChange } from './db'
import { decryptValue, encryptValue } from './crypto'

export interface EntitySyncCursor { ts: number; device: string; entity: string; entityId: string }
export interface EntitySyncRecord { entity: string; entityId: string; value?: unknown; updatedAt: number; device: string; deleted?: boolean }

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
