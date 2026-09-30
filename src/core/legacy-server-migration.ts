import { apiFetch } from './api/client'
import { decryptValue } from './crypto'
import { writeDbMeta } from './db'
import { applyEntityRecords, localEntitySnapshot, supportsEntitySyncRecord, supportsEntitySyncType, syncVaultEntityData, type EntitySyncRecord } from './entity-sync'
import { lsGet, lsSet } from './storage'

const LEGACY_KEYS = new Set([
  'b_tasks', 'b_inbox', 'b_habits', 'b_goals', 'b_finance', 'b_diary', 'b_chars', 'b_posts', 'b_cases',
  'b_caseRelations', 'b_moments', 'b_pomoTotal', 'b_pomoCount', 'b_scene'
])
const LEGACY_COLLECTIONS = new Set(['b_tasks', 'b_inbox', 'b_habits', 'b_goals', 'b_finance', 'b_diary', 'b_chars', 'b_posts', 'b_cases', 'b_caseRelations', 'b_moments'])

export type LegacyD1Export = {
  records: { key: string; value: string; ts: number; device: string; deleted: boolean }[]
  entities: { entity: string; entityId: string; value: unknown; updatedAt: number; device: string; deleted: boolean }[]
  recordCursor: string
  entityCursor: { entity: string; entityId: string }
  recordHasMore: boolean
  entityHasMore: boolean
}

export async function fetchLegacyD1Export(baseUrl: string): Promise<LegacyD1Export> {
  const result: LegacyD1Export = { records: [], entities: [], recordCursor: '', entityCursor: { entity: '', entityId: '' }, recordHasMore: true, entityHasMore: true }
  for (let page = 0; page < 1000 && (result.recordHasMore || result.entityHasMore); page++) {
    const query = new URLSearchParams({ recordAfter: result.recordCursor, entityAfter: result.entityCursor.entity, entityIdAfter: result.entityCursor.entityId })
    const response = await apiFetch(baseUrl, `/api/admin/legacy/export?${query}`)
    const body = await response.json().catch(() => ({})) as Partial<LegacyD1Export> & { error?: string }
    if (!response.ok) throw new Error(body.error || `legacy-export:${response.status}`)
    result.records.push(...(body.records || []))
    result.entities.push(...(body.entities || []))
    result.recordCursor = body.recordCursor || result.recordCursor
    result.entityCursor = body.entityCursor || result.entityCursor
    result.recordHasMore = Boolean(body.recordHasMore)
    result.entityHasMore = Boolean(body.entityHasMore)
  }
  if (result.recordHasMore || result.entityHasMore) throw new Error('旧数据页数超过安全上限，保留数据并联系管理员处理。')
  return result
}

export async function decryptLegacyValue(value: unknown, legacyPassword: string): Promise<string> {
  if (typeof value !== 'string') return JSON.stringify(value)
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { return value }
  if (!parsed || typeof parsed !== 'object' || (parsed as { v?: unknown }).v !== 2) return value
  const plain = await decryptValue(legacyPassword, parsed)
  if (plain == null) throw new Error('旧同步密码不正确，或旧版密文已损坏。')
  return plain
}

async function sourceDigest(backup: LegacyD1Export): Promise<string> {
  const identifiers = [
    ...backup.records.map(row => JSON.stringify(['record', row.key])),
    ...backup.entities.map(row => JSON.stringify(['entity', row.entity, row.entityId])),
  ].sort()
  const bytes = new TextEncoder().encode(JSON.stringify(identifiers))
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('')
}

function validateLegacyCollections(): void {
  for (const key of LEGACY_COLLECTIONS) {
    const raw = lsGet(key)
    if (raw == null) continue
    let value: unknown
    try { value = JSON.parse(raw) } catch { throw new Error(`旧集合格式无法迁移：${key}`) }
    if (!Array.isArray(value)) throw new Error(`旧集合不是记录列表，不能安全清理云端副本：${key}`)
    for (const [index, item] of value.entries()) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`旧集合包含无法同步的记录：${key} #${index + 1}`)
      const row = item as Record<string, unknown>
      const id = row.id ?? row.calmyId ?? (key === 'b_diary' ? row.date : undefined)
      if (id == null || String(id) === '') throw new Error(`旧集合包含缺少稳定 ID 的记录：${key} #${index + 1}`)
    }
  }
}

function mergeLegacyCollection(legacyText: string, currentText: string | null): string {
  if (currentText == null) return legacyText
  try {
    const oldValue: unknown = JSON.parse(legacyText)
    const currentValue: unknown = JSON.parse(currentText)
    if (Array.isArray(oldValue) && Array.isArray(currentValue)) {
      const merged = new Map<string, unknown>()
      const key = (item: unknown, index: number) => item && typeof item === 'object'
        ? String((item as Record<string, unknown>).id ?? (item as Record<string, unknown>).calmyId ?? (item as Record<string, unknown>).date ?? `old-${index}`)
        : `old-${index}`
      oldValue.forEach((item, index) => merged.set(key(item, index), item))
      currentValue.forEach((item, index) => merged.set(key(item, index), item))
      return JSON.stringify([...merged.values()])
    }
  } catch { /* preserve active account on conflicts */ }
  return currentText
}

export async function importLegacyD1Export(baseUrl: string, legacyPassword: string, backup: LegacyD1Export): Promise<{ keySets: number; entities: number; accepted: number }> {
  const unsupportedKeys = backup.records.filter(row => !row.deleted && !LEGACY_KEYS.has(row.key))
  if (unsupportedKeys.length) throw new Error(`有 ${unsupportedKeys.length} 个旧数据键尚无安全迁移规则；旧版 D1 数据保留。`)

  const decodedRecords: Array<{ key: string; clear: string }> = []
  for (const row of backup.records) {
    if (!row.deleted) decodedRecords.push({ key: row.key, clear: await decryptLegacyValue(row.value, legacyPassword) })
  }
  const entityRecords: EntitySyncRecord[] = []
  for (const row of backup.entities) {
    if (row.deleted) {
      if (!supportsEntitySyncType(row.entity)) throw new Error(`旧实体类型尚无安全迁移规则：${row.entity}；旧版 D1 数据保留。`)
      entityRecords.push({ entity: row.entity, entityId: row.entityId, updatedAt: row.updatedAt, device: row.device, deleted: true })
      continue
    }
    const clear = await decryptLegacyValue(row.value, legacyPassword)
    let value: unknown
    try { value = JSON.parse(clear) } catch { throw new Error(`旧实体数据无法解析：${row.entity}`) }
    const record = { entity: row.entity, entityId: row.entityId, value, updatedAt: row.updatedAt, device: row.device }
    if (!supportsEntitySyncRecord(record)) throw new Error(`旧实体类型或 ID 暂不支持安全迁移：${row.entity}/${row.entityId}；旧版 D1 数据保留。`)
    entityRecords.push(record)
  }

  let keySets = 0
  for (const { key, clear } of decodedRecords) {
    const value = mergeLegacyCollection(clear, lsGet(key))
    if (value !== lsGet(key)) {
      if (!lsSet(key, value)) throw new Error(`旧数据写入失败：${key}`)
      keySets++
    }
  }
  validateLegacyCollections()
  const entities = entityRecords.length ? await applyEntityRecords(entityRecords) : 0
  // A fresh snapshot emits current opaque IDs and Content Keys for all imported content.
  if (!await writeDbMeta('vault:initial-snapshot-sent', false)) throw new Error('无法初始化密文迁移状态')
  const snapshotCount = localEntitySnapshot().length
  const synced = await syncVaultEntityData(baseUrl)
  if (synced.pushed < snapshotCount) throw new Error(`新 Vault 上传校验未通过：应上传 ${snapshotCount} 项，已接受 ${synced.pushed} 项。`)

  const copiedServerRecords = backup.records.length + backup.entities.length
  const response = await apiFetch(baseUrl, '/api/admin/legacy/complete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verified: true, backupConfirmed: true, copiedServerRecords, sourceDigest: await sourceDigest(backup) })
  })
  const body = await response.json().catch(() => ({})) as { error?: string; legacyCount?: number }
  if (!response.ok) throw new Error(body.error || `旧数据清理确认失败：${response.status}`)
  return { keySets, entities, accepted: synced.pushed }
}

export function legacyD1RowCount(backup: LegacyD1Export): number {
  return backup.records.length + backup.entities.length
}

export function exportLegacyCipherBackup(backup: LegacyD1Export): string {
  return JSON.stringify({ format: 'calmy-legacy-d1-cipher-backup-v1', exportedAt: new Date().toISOString(), backup }, null, 2)
}
