import type { ActionItem } from '@/domain/action/model'
import type { Matter } from '@/domain/matter/model'
import type { RealityRecord } from '@/domain/record/model'
import type { TodayPlan } from '@/domain/today/model'
import { CORE_ENTITY_TYPES, type CoreEntity, type CoreEntitySource, type CoreEntityType, type RelationType } from '@/domain/unified/model'
import type { OpenAsset } from './assets'
import { hashOpenBytes } from './assets'

export type { OpenAsset } from './assets'

export const OPEN_FORMAT_VERSION = 1
export const OPEN_MANIFEST_PATH = '_calmy/manifest.json'

export type OpenEntity = Matter | ActionItem | RealityRecord | TodayPlan | CoreEntity
export type OpenEntityType = 'matter' | 'action' | 'record' | 'daily' | CoreEntity['entityType']
type OpenScalar = string | number | boolean | null | string[]
type OpenFrontmatter = Record<string, OpenScalar>

export interface OpenManifestEntry {
  calmy_id: string
  calmy_type: OpenEntityType
  path: string
  revision: number
  hash: string
}

export interface OpenManifestAsset {
  path: string
  hash: string
  size: number
  mime_type: string
}

export interface OpenTombstone {
  calmy_id: string
  calmy_type: OpenEntityType
  path: string
  revision: number
  deleted_at: string
}

export interface OpenAssetReference {
  source_path: string
  asset_path: string
  syntax: 'obsidian' | 'markdown'
}

export interface OpenManifest {
  format: 'calmy-open'
  format_version: number
  generated_at: string
  entities: OpenManifestEntry[]
  assets: OpenManifestAsset[]
  asset_references: OpenAssetReference[]
  tombstones?: OpenTombstone[]
}

export interface OpenWorkspace {
  files: Record<string, string>
  assets: OpenAsset[]
  manifest: OpenManifest
}

export interface OpenWorkspaceInput {
  matters?: Matter[]
  actions?: ActionItem[]
  records?: RealityRecord[]
  dailies?: TodayPlan[]
  unified?: CoreEntity[]
  assets?: OpenAsset[]
}

export interface OpenImportIssue {
  path: string
  code: 'invalid-frontmatter' | 'invalid-entity' | 'duplicate-id' | 'manifest-hash-mismatch' | 'manifest-asset-missing' | 'asset-hash-mismatch' | 'missing-asset-reference' | 'unsupported-file'
  message: string
}

export interface OpenImportConflict {
  path: string
  calmyId: string
  reason: 'duplicate-id' | 'existing-entity'
  message: string
}

export interface OpenImportResult {
  entities: OpenEntity[]
  assets: OpenAsset[]
  assetReferences: OpenAssetReference[]
  missingAssetReferences: OpenAssetReference[]
  orphanAssets: OpenAsset[]
  tombstones: OpenTombstone[]
  manifest?: OpenManifest
  issues: OpenImportIssue[]
  conflicts: OpenImportConflict[]
}

function quote(value: string): string { return JSON.stringify(value) }

function scalar(value: OpenScalar): string {
  if (typeof value === 'string') return quote(value)
  if (Array.isArray(value)) return `[${value.map(quote).join(', ')}]`
  if (value === null) return 'null'
  return String(value)
}

function yaml(frontmatter: OpenFrontmatter): string {
  return Object.entries(frontmatter).map(([key, value]) => `${key}: ${scalar(value)}`).join('\n')
}

function normalizeBody(body: string): string {
  return body.replace(/^\s+|\s+$/g, '')
}

export function isUnifiedOpenEntity(entity: OpenEntity): entity is CoreEntity {
  return 'entityType' in entity && (CORE_ENTITY_TYPES as readonly string[]).includes(entity.entityType)
}

function isMatter(entity: OpenEntity): entity is Matter { return 'currentStage' in entity }
function isAction(entity: OpenEntity): entity is ActionItem { return 'title' in entity && 'status' in entity && !('currentStage' in entity) }
function isRecord(entity: OpenEntity): entity is RealityRecord { return 'occurredAt' in entity }

function entityType(entity: OpenEntity): OpenEntityType {
  if (isUnifiedOpenEntity(entity)) return entity.entityType
  if (isMatter(entity)) return 'matter'
  if (isAction(entity)) return 'action'
  if (isRecord(entity)) return 'record'
  return 'daily'
}

function entityId(entity: OpenEntity): string {
  return 'calmyId' in entity ? entity.calmyId : `daily_${entity.date}`
}

export function openEntityType(entity: OpenEntity): OpenEntityType { return entityType(entity) }
export function openEntityId(entity: OpenEntity): string { return entityId(entity) }

function entityRevision(entity: OpenEntity): number { return entity.revision }

function safeName(value: string, fallback: string): string {
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').trim()
  return (cleaned || fallback).slice(0, 90)
}

function assetPath(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized.startsWith('assets/') || normalized.includes('../')) throw new Error('asset-path-invalid:' + value)
  return normalized
}

function normalizeAssetReference(value: string): string | undefined {
  const cleaned = decodeURIComponent(value.trim().replace(/^\.?\//, '')).split('#')[0]
  return cleaned.startsWith('assets/') ? cleaned : undefined
}

export function scanOpenAssetReferences(files: Record<string, string>): OpenAssetReference[] {
  const references: OpenAssetReference[] = []
  const seen = new Set<string>()
  const add = (sourcePath: string, value: string, syntax: OpenAssetReference['syntax']) => {
    const assetPath = normalizeAssetReference(value)
    if (!assetPath || seen.has(sourcePath + '|' + assetPath)) return
    seen.add(sourcePath + '|' + assetPath)
    references.push({ source_path: sourcePath, asset_path: assetPath, syntax })
  }
  for (const [sourcePath, content] of Object.entries(files)) {
    if (!sourcePath.toLowerCase().endsWith('.md')) continue
    const obsidianPattern = /!?\[\[([^\]|]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g
    const markdownPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g
    const matches = [
      ...[...content.matchAll(obsidianPattern)].map(match => ({ index: match.index || 0, value: match[1], syntax: 'obsidian' as const })),
      ...[...content.matchAll(markdownPattern)].map(match => ({ index: match.index || 0, value: match[1], syntax: 'markdown' as const }))
    ].sort((a, b) => a.index - b.index)
    for (const match of matches) add(sourcePath, match.value, match.syntax)
  }
  return references
}

function pathFor(entity: OpenEntity): string {
  const id = entityId(entity)
  if (isUnifiedOpenEntity(entity)) {
    const folders: Record<CoreEntity['entityType'], string> = {
      person: '10 People', relationship: '10 People', shared_space: '10 People', cycle: '30 Cycles',
      stage: '30 Cycles', resource: '60 Resources', relation: '60 Resources', seed: '70 Insights',
      insight: '70 Insights', outcome: '50 Records', practice: '70 Insights', daily_state: '80 Daily', asset: '60 Resources'
    }
    const title = 'title' in entity && typeof entity.title === 'string' ? entity.title : entity.entityType
    const date = entity.entityType === 'daily_state' ? entity.date + '__' : ''
    return `${folders[entity.entityType]}/${date}${safeName(title, entity.entityType)}__${id}.md`
  }
  if (isMatter(entity)) return `20 Matters/${safeName(entity.title, id)}__${id}.md`
  if (isAction(entity)) return `40 Actions/${entity.date}__${safeName(entity.title, id)}__${id}.md`
  if (isRecord(entity)) return `50 Records/${new Date(entity.occurredAt).toISOString().slice(0, 10)}__${id}.md`
  return `80 Daily/${entity.date}.md`
}

function frontmatterFor(entity: OpenEntity): OpenFrontmatter {
  const common = { calmy_id: entityId(entity), calmy_type: entityType(entity), b_version: OPEN_FORMAT_VERSION, revision: entityRevision(entity) }
  if (isUnifiedOpenEntity(entity)) {
    const readable: OpenFrontmatter = { ...common, source: entity.source, created_at: entity.createdAt, updated_at: entity.updatedAt, payload_json: JSON.stringify(entity) }
    switch (entity.entityType) {
      case 'person': return { ...readable, display_name: entity.displayName, status: entity.status, roles: entity.roles, domain: entity.domain || null, notes: entity.notes || null, tags: entity.tags }
      case 'relationship': return { ...readable, person_a_id: entity.personAId, person_b_id: entity.personBId, label: entity.label, status: entity.status, boundary: entity.boundary || null, rhythm: entity.rhythm || null, shared_space_ids: entity.sharedSpaceIds, matter_ids: entity.matterIds, evidence_ids: entity.evidenceIds }
      case 'shared_space': return { ...readable, title: entity.title, status: entity.status, purpose: entity.purpose || null, member_ids: entity.memberIds, relationship_ids: entity.relationshipIds, matter_ids: entity.matterIds }
      case 'cycle': return { ...readable, matter_id: entity.matterId, title: entity.title, theme: entity.theme, current_stage: entity.currentStage, status: entity.status, trajectory: entity.trajectory, stage_ids: entity.stageIds, parent_cycle_id: entity.parentCycleId || null, parent_stage: entity.parentStage || null, owner_id: entity.ownerId || null }
      case 'stage': return { ...readable, cycle_id: entity.cycleId, title: entity.title, element: entity.element, status: entity.status, action_ids: entity.actionIds, record_ids: entity.recordIds, order: entity.order ?? null }
      case 'resource': return { ...readable, title: entity.title, kind: entity.kind, status: entity.status, uri: entity.uri || null, asset_ids: entity.assetIds, matter_ids: entity.matterIds, source_ids: entity.sourceIds, tags: entity.tags, expires_at: entity.expiresAt ?? null }
      case 'relation': return { ...readable, from_entity_type: entity.from.entityType, from_id: entity.from.calmyId, to_entity_type: entity.to.entityType, to_id: entity.to.calmyId, relation_type: entity.relationType, directed: entity.directed, confidence: entity.confidence ?? null, source_ids: entity.sourceIds }
      case 'seed': return { ...readable, title: entity.title, status: entity.status, source_record_ids: entity.sourceRecordIds, target_matter_ids: entity.targetMatterIds, tags: entity.tags }
      case 'insight': return { ...readable, title: entity.title, status: entity.status, confidence: entity.confidence ?? null, source_record_ids: entity.sourceRecordIds, matter_ids: entity.matterIds, resource_ids: entity.resourceIds }
      case 'outcome': return { ...readable, action_id: entity.actionId, matter_id: entity.matterId || null, summary: entity.summary, result: entity.result || null, status: entity.status, evidence_record_ids: entity.evidenceRecordIds }
      case 'practice': return { ...readable, title: entity.title, status: entity.status, cadence: entity.cadence || null, matter_ids: entity.matterIds, outcome_ids: entity.outcomeIds, evidence_ids: entity.evidenceIds }
      case 'daily_state': return { ...readable, date: entity.date, body_state: entity.bodyState, mental_state: entity.mentalState, load: entity.load, actual_time_minutes: entity.actualTimeMinutes ?? null, trajectory: entity.trajectory, today_plan_id: entity.todayPlanId || null, protected_items: entity.protectedItems }
      case 'asset': return { ...readable, path: entity.path, mime_type: entity.mimeType, size_bytes: entity.sizeBytes, hash: entity.hash, lifecycle: entity.lifecycle, version: entity.version, external_uri: entity.externalUri || null }
    }
  }
  if (isMatter(entity)) {
    return {
      ...common, title: entity.title, status: entity.status, why: entity.why,
      primary_contradiction: entity.primaryContradiction, current_stage: entity.currentStage,
      trajectory: entity.trajectory, current_cycle_id: entity.currentCycleId || null,
      evidence_ids: entity.evidenceIds, created_at: entity.createdAt, updated_at: entity.updatedAt
    }
  }
  if (isAction(entity)) {
    return {
      ...common, title: entity.title, date: entity.date, status: entity.status,
      matter_id: entity.matterId || null, cycle_id: entity.cycleId || null,
      result_note: entity.resultNote || null, created_at: entity.createdAt, updated_at: entity.updatedAt
    }
  }
  if (isRecord(entity)) {
    return {
      ...common, record_type: entity.type, occurred_at: entity.occurredAt, created_at: entity.createdAt,
      updated_at: entity.updatedAt, matter_id: entity.matterId || null, action_id: entity.actionId || null,
      source: entity.source, evidence_ids: entity.evidenceIds, impact: entity.impact || null, redacted_at: entity.redactedAt || null
    }
  }
  return {
    ...common, date: entity.date, load: entity.load, focus_action_ids: entity.focusActionIds,
    why: entity.why, must_protect: entity.mustProtect, let_go: entity.letGo,
    review_observation: entity.review.observation, review_analysis: entity.review.analysis,
    review_adjustment: entity.review.adjustment, review_seed: entity.review.seed, updated_at: entity.updatedAt
  }
}

function bodyFor(entity: OpenEntity): string {
  if (isUnifiedOpenEntity(entity)) {
    if (entity.entityType === 'resource' || entity.entityType === 'seed' || entity.entityType === 'insight') return `# ${entity.title}\n\n${entity.body || '尚未填写正文。'}`
    if (entity.entityType === 'practice') return `# ${entity.title}\n\n${entity.description}`
    if (entity.entityType === 'outcome') return `# ${entity.summary}\n\n${entity.result || '尚未填写结果补充。'}`
    const title = 'title' in entity && typeof entity.title === 'string' ? entity.title : entity.entityType
    return `# ${title}\n\n实体类型：${entity.entityType}\n\n稳定 ID：${entity.calmyId}`
  }
  if (isMatter(entity)) return `# ${entity.title}\n\n${entity.why || '尚未写下为什么。'}`
  if (isAction(entity)) return `# ${entity.title}\n\n${entity.resultNote || '尚未记录结果。'}`
  if (isRecord(entity)) return entity.body
  return `# ${entity.date}\n\n## 今日保护\n${entity.mustProtect.map(item => `- ${item}`).join('\n') || '- 暂无'}\n\n## 今日放下\n${entity.letGo.map(item => `- ${item}`).join('\n') || '- 暂无'}`
}

export function serializeOpenEntity(entity: OpenEntity): string {
  return `---\n${yaml(frontmatterFor(entity))}\n---\n\n${bodyFor(entity)}\n`
}

function parseScalar(value: string): OpenScalar {
  const trimmed = value.trim()
  if (trimmed === 'null') return null
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as unknown
    if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) throw new Error('array-value-invalid')
    return parsed as string[]
  }
  if (trimmed.startsWith('"')) return JSON.parse(trimmed) as string
  return trimmed
}

function parseMarkdown(input: string): { frontmatter: OpenFrontmatter; body: string } {
  const lines = input.replace(/^\ufeff/, '').split(/\r?\n/)
  if (lines[0]?.trim() !== '---') throw new Error('frontmatter-start-missing')
  const end = lines.indexOf('---', 1)
  if (end < 0) throw new Error('frontmatter-end-missing')
  const frontmatter: OpenFrontmatter = {}
  for (const line of lines.slice(1, end)) {
    if (!line.trim()) continue
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
    if (!match) throw new Error(`frontmatter-line-invalid:${line}`)
    if (match[1] in frontmatter) throw new Error(`frontmatter-duplicate:${match[1]}`)
    frontmatter[match[1]] = parseScalar(match[2])
  }
  return { frontmatter, body: lines.slice(end + 1).join('\n').replace(/^\n/, '') }
}

function requiredString(frontmatter: OpenFrontmatter, key: string): string {
  const value = frontmatter[key]
  if (typeof value !== 'string') throw new Error(`field-string:${key}`)
  return value
}

function optionalString(frontmatter: OpenFrontmatter, key: string): string | undefined {
  const value = frontmatter[key]
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value !== 'string') throw new Error(`field-string:${key}`)
  return value
}

function requiredNumber(frontmatter: OpenFrontmatter, key: string): number {
  const value = frontmatter[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`field-number:${key}`)
  return value
}

function optionalNumber(frontmatter: OpenFrontmatter, key: string): number | undefined {
  const value = frontmatter[key]
  if (value === null || value === undefined) return undefined
  return requiredNumber(frontmatter, key)
}

function stringArray(frontmatter: OpenFrontmatter, key: string): string[] {
  const value = frontmatter[key]
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error(`field-array:${key}`)
  if (value.some(item => typeof item !== 'string')) throw new Error(`field-array-string:${key}`)
  return [...value]
}

function requiredBoolean(frontmatter: OpenFrontmatter, key: string): boolean {
  const value = frontmatter[key]
  if (typeof value !== 'boolean') throw new Error(`field-boolean:${key}`)
  return value
}

function readableBody(body: string, title: string): string {
  const normalized = normalizeBody(body)
  const heading = `# ${title}`
  return normalized.startsWith(heading) ? normalized.slice(heading.length).trim() : normalized
}

function unifiedMeta(frontmatter: OpenFrontmatter, id: string, type: CoreEntityType, revision: number) {
  return {
    calmyId: id, entityType: type, source: requiredString(frontmatter, 'source') as CoreEntitySource,
    createdAt: requiredNumber(frontmatter, 'created_at'), updatedAt: requiredNumber(frontmatter, 'updated_at'), revision
  }
}

function unifiedPayload(frontmatter: OpenFrontmatter, id: string, type: string): CoreEntity {
  const payload = requiredString(frontmatter, 'payload_json')
  const parsed = JSON.parse(payload) as Partial<CoreEntity>
  if (parsed.entityType !== type || parsed.calmyId !== id || typeof parsed.revision !== 'number') throw new Error('unified-entity-payload-invalid')
  return parsed as CoreEntity
}

function hasReadableUnifiedFields(frontmatter: OpenFrontmatter, type: CoreEntityType): boolean {
  const markers: Record<CoreEntityType, string> = {
    person: 'display_name', relationship: 'person_a_id', shared_space: 'member_ids', cycle: 'matter_id', stage: 'cycle_id',
    resource: 'kind', relation: 'from_entity_type', seed: 'status', insight: 'status', outcome: 'action_id', practice: 'title',
    daily_state: 'body_state', asset: 'path'
  }
  return frontmatter[markers[type]] !== undefined
}

function parseUnifiedEntity(frontmatter: OpenFrontmatter, body: string, id: string, type: CoreEntityType, revision: number): CoreEntity {
  if (!hasReadableUnifiedFields(frontmatter, type)) return unifiedPayload(frontmatter, id, type)
  const meta = unifiedMeta(frontmatter, id, type, revision)
  switch (type) {
    case 'person': return { ...meta, entityType: 'person', displayName: requiredString(frontmatter, 'display_name'), status: requiredString(frontmatter, 'status') as 'active' | 'archived', roles: stringArray(frontmatter, 'roles'), domain: optionalString(frontmatter, 'domain'), notes: optionalString(frontmatter, 'notes'), tags: stringArray(frontmatter, 'tags') }
    case 'relationship': return { ...meta, entityType: 'relationship', personAId: requiredString(frontmatter, 'person_a_id'), personBId: requiredString(frontmatter, 'person_b_id'), label: requiredString(frontmatter, 'label'), status: requiredString(frontmatter, 'status') as 'active' | 'paused' | 'ended', boundary: optionalString(frontmatter, 'boundary'), rhythm: optionalString(frontmatter, 'rhythm'), sharedSpaceIds: stringArray(frontmatter, 'shared_space_ids'), matterIds: stringArray(frontmatter, 'matter_ids'), evidenceIds: stringArray(frontmatter, 'evidence_ids') }
    case 'shared_space': return { ...meta, entityType: 'shared_space', title: requiredString(frontmatter, 'title'), status: requiredString(frontmatter, 'status') as 'active' | 'archived', purpose: optionalString(frontmatter, 'purpose'), memberIds: stringArray(frontmatter, 'member_ids'), relationshipIds: stringArray(frontmatter, 'relationship_ids'), matterIds: stringArray(frontmatter, 'matter_ids') }
    case 'cycle': return { ...meta, entityType: 'cycle', matterId: requiredString(frontmatter, 'matter_id'), title: requiredString(frontmatter, 'title'), theme: requiredString(frontmatter, 'theme'), currentStage: requiredString(frontmatter, 'current_stage') as 'wood' | 'fire' | 'earth' | 'metal' | 'water', status: requiredString(frontmatter, 'status') as 'planned' | 'active' | 'paused' | 'completed' | 'archived', trajectory: requiredString(frontmatter, 'trajectory') as CoreEntity['entityType'] extends never ? never : 'advancing' | 'stable' | 'stalled' | 'retreating' | 'recovering' | 'diverging', stageIds: stringArray(frontmatter, 'stage_ids'), parentCycleId: optionalString(frontmatter, 'parent_cycle_id'), parentStage: optionalString(frontmatter, 'parent_stage') as 'wood' | 'fire' | 'earth' | 'metal' | 'water' | undefined, ownerId: optionalString(frontmatter, 'owner_id') }
    case 'stage': return { ...meta, entityType: 'stage', cycleId: requiredString(frontmatter, 'cycle_id'), title: requiredString(frontmatter, 'title'), element: requiredString(frontmatter, 'element') as 'wood' | 'fire' | 'earth' | 'metal' | 'water', status: requiredString(frontmatter, 'status') as 'planned' | 'active' | 'paused' | 'completed' | 'skipped', actionIds: stringArray(frontmatter, 'action_ids'), recordIds: stringArray(frontmatter, 'record_ids'), order: optionalNumber(frontmatter, 'order') }
    case 'resource': return { ...meta, entityType: 'resource', title: requiredString(frontmatter, 'title'), kind: requiredString(frontmatter, 'kind') as 'reference' | 'tool' | 'template' | 'knowledge' | 'person_asset' | 'other', status: requiredString(frontmatter, 'status') as 'active' | 'expired' | 'retired', body: readableBody(body, requiredString(frontmatter, 'title')), uri: optionalString(frontmatter, 'uri'), assetIds: stringArray(frontmatter, 'asset_ids'), matterIds: stringArray(frontmatter, 'matter_ids'), sourceIds: stringArray(frontmatter, 'source_ids'), tags: stringArray(frontmatter, 'tags'), expiresAt: optionalNumber(frontmatter, 'expires_at') }
    case 'relation': return { ...meta, entityType: 'relation', from: { entityType: requiredString(frontmatter, 'from_entity_type') as CoreEntityType, calmyId: requiredString(frontmatter, 'from_id') }, to: { entityType: requiredString(frontmatter, 'to_entity_type') as CoreEntityType, calmyId: requiredString(frontmatter, 'to_id') }, relationType: requiredString(frontmatter, 'relation_type') as RelationType, directed: requiredBoolean(frontmatter, 'directed'), confidence: optionalNumber(frontmatter, 'confidence'), sourceIds: stringArray(frontmatter, 'source_ids') }
    case 'seed': { const title = requiredString(frontmatter, 'title'); return { ...meta, entityType: 'seed', title, body: readableBody(body, title), status: requiredString(frontmatter, 'status') as 'open' | 'cultivating' | 'promoted' | 'retired', sourceRecordIds: stringArray(frontmatter, 'source_record_ids'), targetMatterIds: stringArray(frontmatter, 'target_matter_ids'), tags: stringArray(frontmatter, 'tags') } }
    case 'insight': { const title = requiredString(frontmatter, 'title'); return { ...meta, entityType: 'insight', title, body: readableBody(body, title), status: requiredString(frontmatter, 'status') as 'draft' | 'confirmed' | 'retired', confidence: optionalNumber(frontmatter, 'confidence'), sourceRecordIds: stringArray(frontmatter, 'source_record_ids'), matterIds: stringArray(frontmatter, 'matter_ids'), resourceIds: stringArray(frontmatter, 'resource_ids') } }
    case 'outcome': return { ...meta, entityType: 'outcome', actionId: requiredString(frontmatter, 'action_id'), matterId: optionalString(frontmatter, 'matter_id'), summary: requiredString(frontmatter, 'summary'), result: optionalString(frontmatter, 'result'), status: requiredString(frontmatter, 'status') as 'observed' | 'accepted' | 'revised', evidenceRecordIds: stringArray(frontmatter, 'evidence_record_ids') }
    case 'practice': { const title = requiredString(frontmatter, 'title'); return { ...meta, entityType: 'practice', title, description: readableBody(body, title), status: requiredString(frontmatter, 'status') as 'candidate' | 'active' | 'paused' | 'retired', matterIds: stringArray(frontmatter, 'matter_ids'), outcomeIds: stringArray(frontmatter, 'outcome_ids'), evidenceIds: stringArray(frontmatter, 'evidence_ids'), cadence: optionalString(frontmatter, 'cadence') } }
    case 'daily_state': return { ...meta, entityType: 'daily_state', date: requiredString(frontmatter, 'date'), bodyState: requiredString(frontmatter, 'body_state') as 'good' | 'normal' | 'tired' | 'bad', mentalState: requiredString(frontmatter, 'mental_state') as 'clear' | 'normal' | 'heavy' | 'overloaded', load: requiredNumber(frontmatter, 'load'), actualTimeMinutes: optionalNumber(frontmatter, 'actual_time_minutes'), trajectory: requiredString(frontmatter, 'trajectory') as 'advancing' | 'stable' | 'stalled' | 'retreating' | 'recovering' | 'diverging', todayPlanId: optionalString(frontmatter, 'today_plan_id'), protectedItems: stringArray(frontmatter, 'protected_items') }
    case 'asset': return { ...meta, entityType: 'asset', path: requiredString(frontmatter, 'path'), mimeType: requiredString(frontmatter, 'mime_type'), sizeBytes: requiredNumber(frontmatter, 'size_bytes'), hash: requiredString(frontmatter, 'hash'), lifecycle: requiredString(frontmatter, 'lifecycle') as 'active' | 'expired' | 'retired' | 'missing', version: requiredNumber(frontmatter, 'version'), externalUri: optionalString(frontmatter, 'external_uri') }
  }
}

function parseEntity(input: string): OpenEntity {
  const { frontmatter, body } = parseMarkdown(input)
  if (frontmatter.b_version !== OPEN_FORMAT_VERSION) throw new Error('unsupported-format-version')
  const id = requiredString(frontmatter, 'calmy_id')
  const type = requiredString(frontmatter, 'calmy_type')
  const revision = requiredNumber(frontmatter, 'revision')
  if (type === 'matter') {
    return {
      calmyId: id, title: requiredString(frontmatter, 'title'), why: requiredString(frontmatter, 'why'),
      primaryContradiction: requiredString(frontmatter, 'primary_contradiction'), status: requiredString(frontmatter, 'status') as Matter['status'],
      currentStage: requiredString(frontmatter, 'current_stage') as Matter['currentStage'], trajectory: requiredString(frontmatter, 'trajectory') as Matter['trajectory'],
      currentCycleId: optionalString(frontmatter, 'current_cycle_id'), evidenceIds: stringArray(frontmatter, 'evidence_ids'),
      createdAt: requiredNumber(frontmatter, 'created_at'), updatedAt: requiredNumber(frontmatter, 'updated_at'), revision
    }
  }
  if (type === 'action') {
    return {
      calmyId: id, title: requiredString(frontmatter, 'title'), date: requiredString(frontmatter, 'date'),
      status: requiredString(frontmatter, 'status') as ActionItem['status'], matterId: optionalString(frontmatter, 'matter_id'),
      cycleId: optionalString(frontmatter, 'cycle_id'), resultNote: optionalString(frontmatter, 'result_note'),
      createdAt: requiredNumber(frontmatter, 'created_at'), updatedAt: requiredNumber(frontmatter, 'updated_at'), revision
    }
  }
  if (type === 'record') {
    return {
      calmyId: id, type: requiredString(frontmatter, 'record_type') as RealityRecord['type'], body: normalizeBody(body),
      occurredAt: requiredNumber(frontmatter, 'occurred_at'), createdAt: requiredNumber(frontmatter, 'created_at'),
      updatedAt: requiredNumber(frontmatter, 'updated_at'), matterId: optionalString(frontmatter, 'matter_id'),
      actionId: optionalString(frontmatter, 'action_id'), source: requiredString(frontmatter, 'source') as RealityRecord['source'],
      evidenceIds: stringArray(frontmatter, 'evidence_ids'), revision, impact: optionalString(frontmatter, 'impact') as RealityRecord['impact'], redactedAt: optionalNumber(frontmatter, 'redacted_at')
    }
  }
  if (type === 'daily') {
    const date = requiredString(frontmatter, 'date')
    return {
      date, load: frontmatter.load === null ? null : requiredString(frontmatter, 'load') as TodayPlan['load'],
      focusActionIds: stringArray(frontmatter, 'focus_action_ids'), why: requiredString(frontmatter, 'why'),
      mustProtect: stringArray(frontmatter, 'must_protect'), letGo: stringArray(frontmatter, 'let_go'),
      review: {
        observation: requiredString(frontmatter, 'review_observation'), analysis: requiredString(frontmatter, 'review_analysis'),
        adjustment: requiredString(frontmatter, 'review_adjustment'), seed: requiredString(frontmatter, 'review_seed')
      }, revision, updatedAt: requiredNumber(frontmatter, 'updated_at')
    }
  }
  if ((CORE_ENTITY_TYPES as readonly string[]).includes(type)) {
    return parseUnifiedEntity(frontmatter, body, id, type as CoreEntityType, revision)
  }
  throw new Error(`unsupported-entity-type:${type}`)
}

export function hashOpenText(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export interface OpenEntityConflict {
  calmyId: string
  calmyType: OpenEntityType
  localRevision: number
  incomingRevision: number
  reason: 'content-changed'
  local: OpenEntity
  incoming: OpenEntity
}

export type OpenFieldDecision = 'keep-local' | 'use-incoming'

export interface OpenFieldConflict {
  key: string
  localValue: unknown
  incomingValue: unknown
}

export interface OpenEntityComparison {
  added: OpenEntity[]
  unchanged: OpenEntity[]
  conflicts: OpenEntityConflict[]
}

export function compareOpenEntityFields(local: OpenEntity, incoming: OpenEntity): OpenFieldConflict[] {
  const keys = new Set([...Object.keys(local), ...Object.keys(incoming)])
  return [...keys].sort().filter(key => JSON.stringify((local as unknown as Record<string, unknown>)[key]) !== JSON.stringify((incoming as unknown as Record<string, unknown>)[key])).map(key => ({
    key, localValue: (local as unknown as Record<string, unknown>)[key], incomingValue: (incoming as unknown as Record<string, unknown>)[key]
  }))
}

export function mergeOpenEntity(local: OpenEntity, incoming: OpenEntity, decisions: Record<string, OpenFieldDecision>): OpenEntity {
  const merged = { ...local } as Record<string, unknown>
  const incomingValues = incoming as unknown as Record<string, unknown>
  for (const [key, decision] of Object.entries(decisions)) {
    if (decision === 'use-incoming') merged[key] = incomingValues[key]
  }
  return merged as unknown as OpenEntity
}

export function compareOpenEntities(local: OpenEntity[], incoming: OpenEntity[]): OpenEntityComparison {
  const localById = new Map(local.map(entity => [openEntityId(entity), entity]))
  const comparison: OpenEntityComparison = { added: [], unchanged: [], conflicts: [] }
  for (const entity of incoming) {
    const current = localById.get(openEntityId(entity))
    if (!current) {
      comparison.added.push(entity)
      continue
    }
    if (JSON.stringify(current) === JSON.stringify(entity)) {
      comparison.unchanged.push(entity)
      continue
    }
    comparison.conflicts.push({
      calmyId: openEntityId(entity), calmyType: openEntityType(entity),
      localRevision: current.revision, incomingRevision: entity.revision, reason: 'content-changed',
      local: current, incoming: entity
    })
  }
  return comparison
}

export interface OpenAssetConflict {
  path: string
  localHash: string
  incomingHash: string
}

export interface OpenAssetComparison {
  added: OpenAsset[]
  unchanged: OpenAsset[]
  conflicts: OpenAssetConflict[]
}

export function compareOpenAssets(local: OpenAsset[], incoming: OpenAsset[]): OpenAssetComparison {
  const localByPath = new Map(local.map(asset => [asset.path, asset]))
  const comparison: OpenAssetComparison = { added: [], unchanged: [], conflicts: [] }
  for (const asset of incoming) {
    const current = localByPath.get(asset.path)
    if (!current) {
      comparison.added.push(asset)
      continue
    }
    const localHash = hashOpenBytes(current.data)
    const incomingHash = hashOpenBytes(asset.data)
    if (localHash === incomingHash && current.mimeType === asset.mimeType) comparison.unchanged.push(asset)
    else comparison.conflicts.push({ path: asset.path, localHash, incomingHash })
  }
  return comparison
}

export function exportOpenWorkspace(input: OpenWorkspaceInput): OpenWorkspace {
  const entities: OpenEntity[] = [...(input.matters || []), ...(input.actions || []), ...(input.records || []), ...(input.dailies || []), ...(input.unified || [])]
  const assets = (input.assets || []).map(asset => ({ ...asset, path: assetPath(asset.path) }))
  const files: Record<string, string> = {}
  const manifestEntries: OpenManifestEntry[] = []
  for (const entity of entities) {
    const path = pathFor(entity)
    const content = serializeOpenEntity(entity)
    if (files[path]) throw new Error(`duplicate-path:${path}`)
    files[path] = content
    manifestEntries.push({ calmy_id: entityId(entity), calmy_type: entityType(entity), path, revision: entityRevision(entity), hash: hashOpenText(content) })
  }
  const manifestAssets: OpenManifestAsset[] = []
  const seenAssetPaths = new Set<string>()
  for (const asset of assets) {
    if (seenAssetPaths.has(asset.path) || files[asset.path]) throw new Error('duplicate-asset-path:' + asset.path)
    seenAssetPaths.add(asset.path)
    manifestAssets.push({ path: asset.path, hash: hashOpenBytes(asset.data), size: asset.data.byteLength, mime_type: asset.mimeType })
  }
  const assetReferences = scanOpenAssetReferences(files)
  manifestEntries.sort((a, b) => a.path.localeCompare(b.path))
  manifestAssets.sort((a, b) => a.path.localeCompare(b.path))
  const manifest: OpenManifest = { format: 'calmy-open', format_version: OPEN_FORMAT_VERSION, generated_at: new Date().toISOString(), entities: manifestEntries, assets: manifestAssets, asset_references: assetReferences }
  files[OPEN_MANIFEST_PATH] = `${JSON.stringify(manifest, null, 2)}\n`
  return { files, assets, manifest }
}

function parseManifest(files: Record<string, string>, issues: OpenImportIssue[]): OpenManifest | undefined {
  const raw = files[OPEN_MANIFEST_PATH]
  if (raw === undefined) return undefined
  try {
    const parsed = JSON.parse(raw) as OpenManifest
    if (parsed.format !== 'calmy-open' || parsed.format_version !== OPEN_FORMAT_VERSION || !Array.isArray(parsed.entities)) throw new Error('manifest-shape-invalid')
    return { ...parsed, assets: Array.isArray(parsed.assets) ? parsed.assets : [], asset_references: Array.isArray(parsed.asset_references) ? parsed.asset_references : [], tombstones: Array.isArray(parsed.tombstones) ? parsed.tombstones : [] }
  } catch (error) {
    issues.push({ path: OPEN_MANIFEST_PATH, code: 'invalid-entity', message: error instanceof Error ? error.message : 'manifest-invalid' })
    return undefined
  }
}

export function importOpenWorkspace(files: Record<string, string>, incomingAssets: OpenAsset[] = []): OpenImportResult {
  const issues: OpenImportIssue[] = []
  const conflicts: OpenImportConflict[] = []
  const manifest = parseManifest(files, issues)
  const entities: OpenEntity[] = []
  const assets: OpenAsset[] = []
  const tombstones: OpenTombstone[] = manifest?.tombstones ? [...manifest.tombstones] : []
  for (const asset of incomingAssets) {
    try {
      assets.push({ ...asset, path: assetPath(asset.path) })
    } catch (error) {
      issues.push({ path: asset.path, code: 'unsupported-file', message: error instanceof Error ? error.message : 'asset-path-invalid' })
    }
  }
  const seen = new Map<string, string>()
  const markdownPathsByHash = new Map<string, string[]>()
  for (const [path, content] of Object.entries(files)) {
    if (!path.toLowerCase().endsWith('.md')) continue
    const paths = markdownPathsByHash.get(hashOpenText(content)) || []
    paths.push(path)
    markdownPathsByHash.set(hashOpenText(content), paths)
  }
  for (const [path, content] of Object.entries(files)) {
    if (path === OPEN_MANIFEST_PATH) continue
    if (!path.toLowerCase().endsWith('.md')) {
      issues.push({ path, code: 'unsupported-file', message: '当前版本只接收 Markdown；附件文件不会被静默丢弃' })
      continue
    }
    try {
      const entity = parseEntity(content)
      const id = entityId(entity)
      if (seen.has(id)) {
        conflicts.push({ path, calmyId: id, reason: 'duplicate-id', message: `ID 已在 ${seen.get(id)} 出现，拒绝静默覆盖` })
        continue
      }
      seen.set(id, path)
      entities.push(entity)
    } catch (error) {
      issues.push({ path, code: 'invalid-entity', message: error instanceof Error ? error.message : 'markdown-invalid' })
    }
  }
  const assetReferences = scanOpenAssetReferences(files)
  const assetsByPath = new Map(assets.map(asset => [asset.path, asset]))
  const missingAssetReferences = assetReferences.filter(reference => !assetsByPath.has(reference.asset_path))
  for (const reference of missingAssetReferences) {
    issues.push({ path: reference.source_path, code: 'missing-asset-reference', message: '缺失附件：' + reference.asset_path })
  }
  const referencedAssetPaths = new Set(assetReferences.map(reference => reference.asset_path))
  const orphanAssets = assets.filter(asset => !referencedAssetPaths.has(asset.path))
  if (manifest) {
    for (const entry of manifest.entities) {
      const content = files[entry.path]
      const movedPath = markdownPathsByHash.get(entry.hash)?.find(path => path !== entry.path)
      if (content === undefined) {
        if (!movedPath) {
          const declared = manifest.tombstones?.find(tombstone => tombstone.calmy_id === entry.calmy_id)
          const tombstone = declared || { calmy_id: entry.calmy_id, calmy_type: entry.calmy_type, path: entry.path, revision: entry.revision, deleted_at: new Date().toISOString() }
          if (!tombstones.some(item => item.calmy_id === tombstone.calmy_id)) tombstones.push(tombstone)
        }
        continue
      }
      if (hashOpenText(content) !== entry.hash) issues.push({ path: entry.path, code: 'manifest-hash-mismatch', message: '文件内容与 manifest hash 不一致' })
    }
    for (const entry of manifest.assets || []) {
      const asset = assetsByPath.get(entry.path)
      if (!asset) {
        issues.push({ path: entry.path, code: 'manifest-asset-missing', message: 'manifest asset missing' })
        continue
      }
      if (hashOpenBytes(asset.data) !== entry.hash || asset.data.byteLength !== entry.size) {
        issues.push({ path: entry.path, code: 'asset-hash-mismatch', message: '附件内容与 manifest hash 不一致' })
      }
    }
  }
  return { entities, assets, assetReferences, missingAssetReferences, orphanAssets, tombstones, manifest, issues, conflicts }
}
