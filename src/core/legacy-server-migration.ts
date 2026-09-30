import { apiFetch } from './api/client'
import { decryptValue } from './crypto'
import { flushPendingDbWrites, readDbMeta, writeDbMeta } from './db'
import { applyEntityRecords, localEntitySnapshot, readVerifiedVaultSnapshot, supportsEntitySyncRecord, supportsEntitySyncType, syncVaultEntityData, type EntitySyncRecord } from './entity-sync'
import { lsGet, lsSet } from './storage'
import { recordLegacyD1Tombstones } from './legacy-local-migration'
import { encryptEntityContent } from './vault-keys'

const LEGACY_KEYS = new Set([
  'b_tasks', 'b_inbox', 'b_habits', 'b_goals', 'b_finance', 'b_diary', 'b_chars', 'b_posts', 'b_cases',
  'b_caseRelations', 'b_moments', 'b_pomoTotal', 'b_pomoCount', 'b_scene'
])
const LEGACY_COLLECTIONS = new Set(['b_tasks', 'b_inbox', 'b_habits', 'b_goals', 'b_finance', 'b_diary', 'b_chars', 'b_posts', 'b_cases', 'b_caseRelations', 'b_moments'])
const MIGRATION_META_KEY = 'vault:legacy-d1-migration'
const MIGRATION_PAGE_SIZE = 250

export type LegacyD1Export = {
  records: { key: string; value: string; ts: number; device: string; deleted: boolean }[]
  entities: { entity: string; entityId: string; value: unknown; updatedAt: number; device: string; deleted: boolean }[]
  recordCursor: string
  entityCursor: { entity: string; entityId: string }
  recordHasMore: boolean
  entityHasMore: boolean
}

export type LegacyReferencePreview = {
  unknownKeys: string[]
  sharedSpaceMemberRefs: number
  spacePersonRefs: number
  sceneParticipantRefs: number
  personLinkedUserRefs: number
  permissionPrincipalRefs: number
  ownershipUserRefs: number
}

type LegacyCursor = { recordAfter: string; entityAfter: { entity: string; entityId: string } }
type LegacyStatus = { status: 'running' | 'complete'; recordCount: number; entityCount: number; sourceDigest: string }
type DurableMigration = LegacyStatus & {
  recordCursor: string
  entityCursor: { entity: string; entityId: string }
  processedRecords: number
  processedEntities: number
  keySets: number
  entities: number
  accepted: number
  status: 'running' | 'complete'
}

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(body.error || `legacy-request:${response.status}`)
  return body
}

async function legacyStatus(baseUrl: string): Promise<LegacyStatus> {
  const body = await readJson<LegacyStatus>(await apiFetch(baseUrl, '/api/admin/legacy/status'))
  if ((body.status !== 'running' && body.status !== 'complete') || !Number.isSafeInteger(body.recordCount) || !Number.isSafeInteger(body.entityCount) || !/^[a-f0-9]{64}$/.test(body.sourceDigest)) {
    throw new Error('旧版 D1 状态不完整，已保留原数据。')
  }
  return body
}

async function fetchLegacyPage(baseUrl: string, cursor: LegacyCursor): Promise<LegacyD1Export> {
  const query = new URLSearchParams({
    recordAfter: cursor.recordAfter,
    entityAfter: cursor.entityAfter.entity,
    entityIdAfter: cursor.entityAfter.entityId
  })
  const body = await readJson<LegacyD1Export>(await apiFetch(baseUrl, `/api/admin/legacy/export?${query}`))
  if (!Array.isArray(body.records) || !Array.isArray(body.entities)) throw new Error('旧数据分页响应格式无效，已保留原数据。')
  if (body.records.length > MIGRATION_PAGE_SIZE || body.entities.length > MIGRATION_PAGE_SIZE) throw new Error('旧数据分页超过安全上限，已保留原数据。')
  return body
}

/** Download an encrypted legacy snapshot while retaining only serialized pages, not the full row object graph. */
export async function createLegacyCipherBackup(baseUrl: string, expected: { recordCount: number; entityCount: number }, userKey: CryptoKey): Promise<Blob> {
  const recordParts: string[] = []
  const entityParts: string[] = []
  let recordCount = 0
  let entityCount = 0
  let recordCursor = ''
  let entityCursor = { entity: '', entityId: '' }
  let recordHasMore = true
  let entityHasMore = true
  const cursor: LegacyCursor = { recordAfter: '', entityAfter: { entity: '', entityId: '' } }

  while (recordHasMore || entityHasMore) {
    const page = await fetchLegacyPage(baseUrl, cursor)
    for (const row of page.records) {
      if (recordCount) recordParts.push(',')
      recordParts.push(JSON.stringify(await encryptEntityContent(userKey, { kind: 'record', row })))
      recordCount++
    }
    for (const row of page.entities) {
      if (entityCount) entityParts.push(',')
      entityParts.push(JSON.stringify(await encryptEntityContent(userKey, { kind: 'entity', row })))
      entityCount++
    }
    recordCursor = page.recordCursor
    entityCursor = page.entityCursor
    recordHasMore = page.recordHasMore
    entityHasMore = page.entityHasMore
    cursor.recordAfter = recordCursor
    cursor.entityAfter = entityCursor
    if (!page.records.length && !page.entities.length && (recordHasMore || entityHasMore)) throw new Error('旧数据分页游标未前进，已保留原数据。')
  }

  if (recordCount !== expected.recordCount || entityCount !== expected.entityCount) {
    throw new Error(`旧数据分页校验不一致：状态 ${expected.recordCount + expected.entityCount} 行，导出 ${recordCount + entityCount} 行。请刷新后重试。`)
  }
  const exportedAt = Date.now()
  const metadata = JSON.stringify({
    format: 'calmy-legacy-d1-user-key-backup-v1',
    exportedAt: new Date(exportedAt).toISOString(),
    rollbackExpiresAt: new Date(exportedAt + 30 * 24 * 60 * 60 * 1000).toISOString(),
    encryption: 'AES-GCM with the active Calmy User Key', recordCount, entityCount
  }).slice(0, -1)
  const parts: BlobPart[] = [`${metadata},"records":[`]
  for (const part of recordParts) parts.push(part)
  parts.push('],"entities":[')
  for (const part of entityParts) parts.push(part)
  parts.push(']}')
  return new Blob(parts, { type: 'application/json' })
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

function parseLegacyClear(value: string): unknown {
  try { return JSON.parse(value) } catch { return undefined }
}

function referenceCount(value: unknown): number {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.length > 0).length : 0
}

/** Inspect ambiguous legacy identity references locally; never turns them into grants. */
export async function inspectLegacyD1References(
  baseUrl: string,
  legacyPassword: string,
  expected: { recordCount: number; entityCount: number }
): Promise<LegacyReferencePreview> {
  const preview: LegacyReferencePreview = { unknownKeys: [], sharedSpaceMemberRefs: 0, spacePersonRefs: 0, sceneParticipantRefs: 0, personLinkedUserRefs: 0, permissionPrincipalRefs: 0, ownershipUserRefs: 0 }
  const unknownKeys = new Set<string>()
  let recordCount = 0
  let entityCount = 0
  const cursor: LegacyCursor = { recordAfter: '', entityAfter: { entity: '', entityId: '' } }
  let recordHasMore = true
  let entityHasMore = true
  while (recordHasMore || entityHasMore) {
    const page = await fetchLegacyPage(baseUrl, cursor)
    for (const row of page.records) {
      recordCount++
      if (!row.deleted && !LEGACY_KEYS.has(row.key)) unknownKeys.add(row.key)
    }
    for (const row of page.entities) {
      entityCount++
      if (row.deleted) continue
      const clear = await decryptLegacyValue(row.value, legacyPassword)
      const value = parseLegacyClear(clear)
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue
      const record = value as Record<string, unknown>
      if (row.entity === 'shared_space') preview.sharedSpaceMemberRefs += referenceCount(record.memberIds)
      if (row.entity === 'space') preview.spacePersonRefs += referenceCount(record.memberPersonIds)
      if (row.entity === 'scene_participant' && typeof record.personId === 'string' && record.personId) preview.sceneParticipantRefs++
      if (row.entity === 'person' && typeof record.linkedUserId === 'string' && record.linkedUserId) preview.personLinkedUserRefs++
      if (row.entity === 'permission' && typeof record.principalUserId === 'string' && record.principalUserId) preview.permissionPrincipalRefs++
      const ownership = record.ownership && typeof record.ownership === 'object' ? record.ownership as Record<string, unknown> : record
      const ownerRef = ownership.ownerRef && typeof ownership.ownerRef === 'object' ? ownership.ownerRef as Record<string, unknown> : null
      if (ownerRef?.type === 'user' && typeof ownerRef.id === 'string' && ownerRef.id) preview.ownershipUserRefs++
      if (typeof ownership.createdByUserId === 'string' && ownership.createdByUserId) preview.ownershipUserRefs++
      if (typeof record.ownerId === 'string' && record.ownerId) preview.ownershipUserRefs++
      if (Array.isArray(ownership.stewardRefs)) preview.ownershipUserRefs += ownership.stewardRefs.filter(item => item && typeof item === 'object' && (item as Record<string, unknown>).type === 'user' && typeof (item as Record<string, unknown>).id === 'string').length
    }
    cursor.recordAfter = page.recordCursor
    cursor.entityAfter = page.entityCursor
    recordHasMore = page.recordHasMore
    entityHasMore = page.entityHasMore
    if (!page.records.length && !page.entities.length && (recordHasMore || entityHasMore)) throw new Error('旧数据分页游标未前进，无法完成安全预览。')
  }
  if (recordCount !== expected.recordCount || entityCount !== expected.entityCount) throw new Error('旧 D1 数据在预览过程中发生变化，请重新加载迁移状态。')
  preview.unknownKeys = [...unknownKeys].sort()
  return preview
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

async function importLegacyPage(legacyPassword: string, page: LegacyD1Export): Promise<{ keySets: number; entities: number }> {
  const unsupportedKeys = page.records.filter(row => !row.deleted && !LEGACY_KEYS.has(row.key))
  if (unsupportedKeys.length) throw new Error(`有 ${unsupportedKeys.length} 个旧数据键尚无安全迁移规则；旧版 D1 数据保留。`)

  const deletedKeys = page.records.filter(row => row.deleted).map(row => row.key)
  const deletedEntities = page.entities.filter(row => row.deleted).map(row => ({ entity: row.entity, entityId: row.entityId }))
  recordLegacyD1Tombstones(deletedKeys, deletedEntities)
  for (const row of page.records) {
    if (!row.deleted) continue
    const existing = lsGet(row.key)
    if (existing != null && existing !== '[]' && existing !== 'null' && existing !== '') {
      throw new Error(`旧云端数据包含删除标记，但当前账户本地仍有 ${row.key} 数据。为避免覆盖或重新上传，迁移已暂停，旧版 D1 数据保留。`)
    }
  }

  const decodedRecords: Array<{ key: string; clear: string }> = []
  for (const row of page.records) if (!row.deleted) decodedRecords.push({ key: row.key, clear: await decryptLegacyValue(row.value, legacyPassword) })
  const entityRecords: EntitySyncRecord[] = []
  for (const row of page.entities) {
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
    const previous = lsGet(key)
    const value = mergeLegacyCollection(clear, previous)
    if (value !== previous) {
      if (!lsSet(key, value)) throw new Error(`旧数据写入失败：${key}`)
      keySets++
    }
  }
  validateLegacyCollections()
  const entities = entityRecords.length ? await applyEntityRecords(entityRecords) : 0
  await flushPendingDbWrites()
  return { keySets, entities }
}

export async function importLegacyD1Export(
  baseUrl: string,
  legacyPassword: string,
  expected: { recordCount: number; entityCount: number },
  onProgress?: (progress: { processed: number; total: number }) => void
): Promise<{ keySets: number; entities: number; accepted: number }> {
  let state = await readDbMeta<DurableMigration>(MIGRATION_META_KEY)
  if (state?.status === 'complete') throw new Error('此设备已完成旧版 D1 数据迁移。')
  if (!state) {
    const status = await legacyStatus(baseUrl)
    if (status.status !== 'running') throw new Error('旧版 D1 迁移已经在服务端完成。')
    if (status.recordCount !== expected.recordCount || status.entityCount !== expected.entityCount) throw new Error('旧版 D1 数据在预览后发生变化，请重新检查并下载备份。')
    state = {
      ...status, recordCursor: '', entityCursor: { entity: '', entityId: '' },
      processedRecords: 0, processedEntities: 0, keySets: 0, entities: 0, accepted: 0, status: 'running'
    }
    if (!await writeDbMeta(MIGRATION_META_KEY, state)) throw new Error('无法保存迁移断点；旧版 D1 数据保留。')
    if (!await writeDbMeta('vault:initial-snapshot-sent', false)) throw new Error('无法初始化密文迁移状态')
  } else if (state.recordCount !== expected.recordCount || state.entityCount !== expected.entityCount) {
    throw new Error('旧版 D1 数据数量与已保存迁移断点不一致；旧版 D1 数据保留。')
  }

  const total = state.recordCount + state.entityCount
  while (state.processedRecords < state.recordCount || state.processedEntities < state.entityCount) {
    const cursor: LegacyCursor = { recordAfter: state.recordCursor, entityAfter: state.entityCursor }
    const page = await fetchLegacyPage(baseUrl, cursor)
    if (!page.records.length && !page.entities.length) throw new Error('旧数据迁移游标未前进；旧版 D1 数据保留。')
    const imported = await importLegacyPage(legacyPassword, page)
    const synced = await syncVaultEntityData(baseUrl)
    state = {
      ...state,
      recordCursor: page.recordCursor,
      entityCursor: page.entityCursor,
      processedRecords: state.processedRecords + page.records.length,
      processedEntities: state.processedEntities + page.entities.length,
      keySets: state.keySets + imported.keySets,
      entities: state.entities + imported.entities,
      accepted: state.accepted + synced.pushed
    }
    if (state.processedRecords > state.recordCount || state.processedEntities > state.entityCount) throw new Error('旧数据迁移计数超过预览值；旧版 D1 数据保留。')
    if (!await writeDbMeta(MIGRATION_META_KEY, state)) throw new Error('迁移断点保存失败；旧版 D1 数据仍保留，可重试继续。')
    onProgress?.({ processed: state.processedRecords + state.processedEntities, total })
  }

  if (state.processedRecords !== state.recordCount || state.processedEntities !== state.entityCount) throw new Error('源数据与迁移页计数不一致；旧版 D1 数据保留。')
  const currentStatus = await legacyStatus(baseUrl)
  if (currentStatus.status === 'complete') {
    state = { ...state, status: 'complete' }
    if (!await writeDbMeta(MIGRATION_META_KEY, state)) throw new Error('服务端已完成迁移，本机无法记录完成状态；刷新设置页核对云端状态。')
    return { keySets: state.keySets, entities: state.entities, accepted: state.accepted }
  }
  if (currentStatus.recordCount !== state.recordCount || currentStatus.entityCount !== state.entityCount || currentStatus.sourceDigest !== state.sourceDigest) {
    throw new Error('旧版 D1 源数据在迁移期间发生变化；为避免清理未迁移内容，原数据仍保留。')
  }

  const localRecords = localEntitySnapshot()
  const localById = new Map(localRecords.map(record => [`${record.entity}\u0000${record.entityId}`, record]))
  const destinationSnapshot = await readVerifiedVaultSnapshot(baseUrl)
  const destination = destinationSnapshot.records
  const destinationById = new Map(destination.map(record => [`${record.entity}\u0000${record.entityId}`, record]))
  for (const [id, local] of localById) {
    const remote = destinationById.get(id)
    if (!remote || remote.deleted || JSON.stringify(remote.value) !== JSON.stringify(local.value)) {
      throw new Error('新 Vault 的解密校验未覆盖全部本地记录；旧版 D1 数据仍保留，请重试同步后再迁移。')
    }
  }
  const destinationCount = destination.filter(record => !record.deleted).length
  if (destinationCount < localById.size) throw new Error('新 Vault 目标记录数少于本地记录数；旧版 D1 数据仍保留。')
  const verifiedIds = [...localById.keys()].sort()
  const destinationIds = [...destinationSnapshot.opaqueIds].sort()
  const idBytes = new TextEncoder().encode(JSON.stringify(destinationIds))
  const idDigestBytes = await crypto.subtle.digest('SHA-256', idBytes)
  const destinationIdDigest = Array.from(new Uint8Array(idDigestBytes), byte => byte.toString(16).padStart(2, '0')).join('')
  const response = await apiFetch(baseUrl, '/api/admin/legacy/complete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      verified: true,
      backupConfirmed: true,
      copiedServerRecords: total,
      sourceDigest: state.sourceDigest,
      verifiedDestinationCount: destinationCount,
      verifiedSourceIdCount: verifiedIds.length,
      destinationIdDigest,
      verifiedCursor: destinationSnapshot.cursor,
      decryptedSampleCount: Math.min(5, destinationCount)
    })
  })
  const body = await response.json().catch(() => ({})) as { error?: string; legacyCount?: number }
  if (!response.ok) throw new Error(body.error || `旧数据清理确认失败：${response.status}`)
  state = { ...state, status: 'complete' }
  if (!await writeDbMeta(MIGRATION_META_KEY, state)) throw new Error('迁移完成，但本机无法记录完成状态；请刷新设置页核对云端状态。')
  return { keySets: state.keySets, entities: state.entities, accepted: state.accepted }
}

export function legacyD1RowCount(backup: Pick<LegacyD1Export, 'records' | 'entities'>): number {
  return backup.records.length + backup.entities.length
}
