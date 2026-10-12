import type { ActionItem } from '@/domain/action/model'
import { matterFromThing, type Matter, type Thing } from '@/domain/matter/model'
import type { RealityRecord } from '@/domain/record/model'
import type { TodayPlan } from '@/domain/today/model'
import type { FinanceEntry, FinanceMutation } from '@/domain/finance/repository'
import { CAPTURE_STATUSES, type CaptureItem } from '@/domain/capture/model'
import { isValidDiaryDate, type DiaryEntry } from '@/domain/diary/model'
import { CORE_ENTITY_TYPES, type CoreEntity, type CoreEntitySource, type CoreEntityType, type EntityRef, type Ownership, type RelationType } from '@/domain/unified/model'
import type { OpenAsset } from './assets'
import { hashOpenBytes } from './assets'

export type { OpenAsset } from './assets'

export const OPEN_FORMAT_VERSION = 3
export const OPEN_MANIFEST_PATH = '_calmy/manifest.json'

export type OpenFinanceEntry = FinanceEntry & { entityType: 'finance_entry' }
export interface OpenHabitSnapshot { name: string; color: string; days: number; dates: string[] }
export interface OpenHabitHistorySnapshot {
  revision: number
  operation: 'created' | 'updated'
  source: 'user' | 'system'
  occurredAt: number
  actorUserId?: string
  before?: OpenHabitSnapshot
  after: OpenHabitSnapshot
}
export interface OpenHabit {
  entityType: 'habit_entry'
  id: string
  name: string
  color: string
  days: number
  dates: string[]
  revision?: number
  history?: OpenHabitHistorySnapshot[]
}
export interface OpenGoal { id: string; title: string; done?: boolean; status?: string; progress?: number; problem?: string; evidence?: string; nextAction?: string; matterId?: string; ownership?: Ownership; revision?: number; history?: Array<{ revision: number; operation: 'created' | 'updated'; occurredAt: number; actorUserId?: string; title: string; done: boolean; status: string; progress: number; problem?: string; evidence?: string; nextAction?: string; matterId?: string; ownership?: Ownership }> }
export interface OpenPostHistorySnapshot { revision: number; operation: 'created' | 'updated'; occurredAt: number; actorUserId?: string; title: string; content: string; date: string; archivedAt?: number; ownership?: Ownership }
export interface OpenPost { entityType: 'post'; id: string; title: string; content: string; date: string; archivedAt?: number; revision?: number; ownership?: Ownership; history?: OpenPostHistorySnapshot[] }
export interface OpenLegacyInboxHistory {
  entityType: 'inbox_history'
  id: string
  revision: number
  operation: 'removed' | 'converted-to-task' | 'converted-to-case'
  source: 'user'
  occurredAt: number
  actorUserId?: string
  before: { id?: string; text?: string; date?: string }
  after: null
  target?: { type: 'task' | 'case'; id: string }
}
export type OpenEntity = Matter | Thing | ActionItem | RealityRecord | TodayPlan | DiaryEntry | CaptureItem | CoreEntity | OpenFinanceEntry | OpenHabit | OpenGoal | OpenPost | OpenLegacyInboxHistory
export type OpenEntityType = 'matter' | 'thing' | 'action' | 'record' | 'daily' | 'diary' | 'capture' | 'finance_entry' | 'habit_entry' | 'goal' | 'post' | 'inbox_history' | CoreEntity['entityType']
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
  /** Append-only Finance ownership audit; separate from the Finance Entity payload. */
  finance_mutations?: FinanceMutation[]
}

export interface OpenWorkspace {
  files: Record<string, string>
  assets: OpenAsset[]
  manifest: OpenManifest
}

export interface OpenWorkspaceInput {
  matters?: Matter[]
  things?: Thing[]
  actions?: ActionItem[]
  records?: RealityRecord[]
  dailies?: TodayPlan[]
  diaries?: DiaryEntry[]
  captures?: CaptureItem[]
  finance?: OpenFinanceEntry[]
  habits?: OpenHabit[]
  goals?: OpenGoal[]
  posts?: OpenPost[]
  inboxHistory?: OpenLegacyInboxHistory[]
  financeMutations?: FinanceMutation[]
  unified?: CoreEntity[]
  assets?: OpenAsset[]
}

export interface OpenImportIssue {
  path: string
  code: 'invalid-frontmatter' | 'invalid-entity' | 'duplicate-id' | 'manifest-identity-mismatch' | 'manifest-hash-mismatch' | 'manifest-asset-missing' | 'asset-hash-mismatch' | 'missing-asset-reference' | 'unsupported-file'
  message: string
}

export interface OpenImportConflict {
  path: string
  calmyId: string
  calmyType: OpenEntityType
  identityKey: string
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
  financeMutations: FinanceMutation[]
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

function isFinanceMutation(value: unknown): value is FinanceMutation {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<FinanceMutation>
  const validBase = typeof item.id === 'string' && !!item.id && typeof item.entityId === 'string' && !!item.entityId
    && (item.operation === 'created' || item.operation === 'updated' || item.operation === 'ownership-updated') && typeof item.commandId === 'string' && typeof item.actorId === 'string'
    && Number.isFinite(item.occurredAt) && Number.isInteger(item.fromRevision) && Number.isInteger(item.toRevision)
    && (item.toRevision as number) > (item.fromRevision as number)
  if (!validBase) return false
  if (item.operation === 'created') return item.fromRevision === 0 && !!item.snapshot && typeof item.snapshot === 'object'
    && item.snapshot.id === item.entityId && item.snapshot.revision === item.toRevision
  if (item.operation === 'updated') return !!item.snapshot && !!item.previousSnapshot
    && item.snapshot.id === item.entityId && item.snapshot.revision === item.toRevision
    && item.previousSnapshot.id === item.entityId && item.previousSnapshot.revision === item.fromRevision
  return true
}

export function isUnifiedOpenEntity(entity: OpenEntity): entity is CoreEntity {
  return 'entityType' in entity && (CORE_ENTITY_TYPES as readonly string[]).includes(entity.entityType)
}

function isThing(entity: OpenEntity): entity is Thing { return 'entityType' in entity && entity.entityType === 'thing' }
function isMatter(entity: OpenEntity): entity is Matter { return !('entityType' in entity) && 'currentStage' in entity }
function isAction(entity: OpenEntity): entity is ActionItem { return 'title' in entity && 'status' in entity && !('currentStage' in entity) }
function isRecord(entity: OpenEntity): entity is RealityRecord { return 'occurredAt' in entity }
function isCapture(entity: OpenEntity): entity is CaptureItem { return 'suggestionIds' in entity && 'body' in entity && 'createdAt' in entity }
function isDiary(entity: OpenEntity): entity is DiaryEntry { return !('entityType' in entity) && 'date' in entity && 'content' in entity }
function isFinanceEntry(entity: OpenEntity): entity is OpenFinanceEntry { return 'entityType' in entity && entity.entityType === 'finance_entry' }
export function isHabit(entity: OpenEntity): entity is OpenHabit { return 'entityType' in entity && entity.entityType === 'habit_entry' }
function isPost(entity: OpenEntity): entity is OpenPost { return 'entityType' in entity && entity.entityType === 'post' }
function isInboxHistory(entity: OpenEntity): entity is OpenLegacyInboxHistory { return 'entityType' in entity && entity.entityType === 'inbox_history' }
export function isGoal(entity: OpenEntity): entity is OpenGoal { return !('entityType' in entity) && 'id' in entity && 'title' in entity }

function entityType(entity: OpenEntity): OpenEntityType {
  if (isUnifiedOpenEntity(entity)) return entity.entityType
  if (isFinanceEntry(entity)) return 'finance_entry'
  if (isHabit(entity)) return 'habit_entry'
  if (isPost(entity)) return 'post'
  if (isInboxHistory(entity)) return 'inbox_history'
  if (isGoal(entity)) return 'goal'
  if (isThing(entity)) return 'thing'
  if (isMatter(entity)) return 'matter'
  if (isAction(entity)) return 'action'
  if (isRecord(entity)) return 'record'
  if (isDiary(entity)) return 'diary'
  if (isCapture(entity)) return 'capture'
  return 'daily'
}

function entityId(entity: OpenEntity): string {
  if (isDiary(entity)) return `diary_${entity.date}`
  if (isFinanceEntry(entity)) return entity.id
  if (isHabit(entity)) return entity.id
  if (isPost(entity)) return entity.id
  if (isInboxHistory(entity)) return entity.id
  if (isGoal(entity)) return entity.id
  return 'calmyId' in entity ? entity.calmyId : `daily_${entity.date}`
}

export function openEntityType(entity: OpenEntity): OpenEntityType { return entityType(entity) }
export function openEntityId(entity: OpenEntity): string { return entityId(entity) }
export function openEntityKey(entity: OpenEntity): string { return `${entityType(entity)}:${entityId(entity)}` }

function entityRevision(entity: OpenEntity): number { return 'revision' in entity ? entity.revision ?? 0 : 0 }
export function openEntityRevision(entity: OpenEntity): number { return entityRevision(entity) }

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
      person: '10 People', important_date: '10 People', organization: '10 People', relationship: '10 People', shared_space: '10 People', cycle: '30 Cycles',
      stage: '30 Cycles', resource: '60 Resources', relation: '60 Resources', seed: '70 Insights',
      insight: '70 Insights', outcome: '50 Records', practice: '70 Insights', daily_state: '80 Daily', asset: '60 Resources',
      scene: '20 Scenes', scene_participant: '20 Scenes', space: '10 People', domain: '10 Domains', scope: '10 Sharing', permission: '10 Sharing', dictionary_option: '90 System Dictionary'
    }
    const title = 'title' in entity && typeof entity.title === 'string' ? entity.title : entity.entityType === 'dictionary_option' ? `${entity.field}-${entity.value}` : entity.entityType
    const date = entity.entityType === 'daily_state' ? entity.date + '__' : ''
    return `${folders[entity.entityType]}/${date}${safeName(title, entity.entityType)}__${id}.md`
  }
  if (isThing(entity)) return `20 Things/${safeName(entity.title, id)}__${id}.md`
  if (isMatter(entity)) return `20 Matters/${safeName(entity.title, id)}__${id}.md`
  if (isAction(entity)) return `40 Actions/${entity.date}__${safeName(entity.title, id)}__${id}.md`
  if (isRecord(entity)) return `50 Records/${new Date(entity.occurredAt).toISOString().slice(0, 10)}__${id}.md`
  if (isCapture(entity)) return `15 Captures/${safeName(id, 'capture')}.md`
  if (isDiary(entity)) return `80 Daily/Diary__${id}.md`
  if (isFinanceEntry(entity)) return '45 Finance/' + safeName(entity.category || 'entry', 'entry') + '__' + safeName(id, 'finance-entry') + '.md'
  if (isHabit(entity)) return `60 Habits/${safeName(entity.name, id)}__${safeName(id, 'habit')}.md`
  if (isInboxHistory(entity)) return `90 History/Inbox/${safeName(id, 'inbox-history')}.md`
  if (isPost(entity)) return `55 Posts/${safeName(entity.title, id)}__${safeName(id, 'post')}.md`
  if (isGoal(entity)) return `55 Goals/${safeName(entity.title, id)}__${safeName(id, 'goal')}.md`
  return `80 Daily/${entity.date}.md`
}

function frontmatterFor(entity: OpenEntity): OpenFrontmatter {
  const common = { calmy_id: entityId(entity), calmy_type: entityType(entity), b_version: OPEN_FORMAT_VERSION, revision: entityRevision(entity) }
  if (isFinanceEntry(entity)) return {
    ...common, finance_type: entity.type, amount: entity.amount ?? null, amount_cents: entity.amountCents ?? null,
    category: entity.category, category_option_id: entity.categoryOptionId || null, date: entity.date,
    ownership_json: entity.ownership ? JSON.stringify(entity.ownership) : null, payload_json: JSON.stringify(entity)
  }
  if (isInboxHistory(entity)) return { ...common, operation: entity.operation, source: entity.source, occurred_at: entity.occurredAt, actor_user_id: entity.actorUserId || null, payload_json: JSON.stringify(entity) }
  if (isHabit(entity)) return {
    ...common, title: entity.name, color: entity.color, days: entity.days, dates: entity.dates,
    payload_json: JSON.stringify(entity)
  }
  if (isPost(entity)) return {
    ...common, title: entity.title, date: entity.date, archived_at: entity.archivedAt ?? null,
    ownership_json: entity.ownership ? JSON.stringify(entity.ownership) : null, payload_json: JSON.stringify(entity)
  }
  if (isGoal(entity)) return {
    ...common, title: entity.title, status: entity.status || (entity.done ? 'done' : 'open'), progress: entity.progress ?? (entity.done ? 100 : 0),
    problem: entity.problem || null, evidence: entity.evidence || null, next_action: entity.nextAction || null, matter_id: entity.matterId || null,
    ownership_json: entity.ownership ? JSON.stringify(entity.ownership) : null,
    payload_json: JSON.stringify(entity)
  }
  if (isUnifiedOpenEntity(entity)) {
    const readable: OpenFrontmatter = { ...common, source: entity.source, created_at: entity.createdAt, updated_at: entity.updatedAt, ownership_json: entity.ownership ? JSON.stringify(entity.ownership) : null, payload_json: JSON.stringify(entity) }
    switch (entity.entityType) {
      case 'person': return { ...readable, display_name: entity.displayName, status: entity.status, roles: entity.roles, domain: entity.domain || null, notes: entity.notes || null, tags: entity.tags, linked_user_id: entity.linkedUserId || null }
      case 'important_date': return { ...readable, title: entity.title, kind: entity.kind, person_id: entity.personId || null, month_day: entity.monthDay, year: entity.year ?? null, recurrence: entity.recurrence, notes: entity.notes || null }
      case 'organization': return { ...readable, title: entity.title, status: entity.status }
      case 'scene': return { ...readable, title: entity.title, thing_id: entity.thingId || null, space_id: entity.spaceId || null, started_at: entity.startedAt ?? null, ended_at: entity.endedAt ?? null, order: entity.order ?? null, settlements_json: entity.settlements ? JSON.stringify(entity.settlements) : null, status: entity.status }
      case 'scene_participant': return { ...readable, scene_id: entity.sceneId, person_id: entity.personId, role: entity.role || null, joined_at: entity.joinedAt, left_at: entity.leftAt ?? null }
      case 'space': return { ...readable, title: entity.title, purpose: entity.purpose || null, boundary: entity.boundary || null, member_person_ids: entity.memberPersonIds, relationship_ids: entity.relationshipIds, thing_ids: entity.thingIds, scene_ids: entity.sceneIds, owner_ref_json: entity.ownerRef ? JSON.stringify(entity.ownerRef) : null, legacy_boundary_json: entity.legacyBoundary ? JSON.stringify(entity.legacyBoundary) : null, status: entity.status }
      case 'domain': return { ...readable, key: entity.key, display_name: entity.displayName, status: entity.status }
      case 'scope': return { ...readable, person_id: entity.personId || null, domain_id: entity.domainId || null, thing_id: entity.thingId || null, scene_id: entity.sceneId || null, space_id: entity.spaceId || null }
      case 'permission': return { ...readable, principal_user_id: entity.principalUserId, scope_id: entity.scopeId || null, entity_ref_json: entity.entityRef ? JSON.stringify(entity.entityRef) : null, effect: entity.effect, actions: entity.actions }
      case 'relationship': return { ...readable, person_a_id: entity.personAId, person_b_id: entity.personBId, label: entity.label, status: entity.status, boundary: entity.boundary || null, rhythm: entity.rhythm || null, shared_space_ids: entity.sharedSpaceIds, matter_ids: entity.matterIds, evidence_ids: entity.evidenceIds, owner_id: entity.ownerId || null }
      case 'shared_space': return { ...readable, title: entity.title, status: entity.status, purpose: entity.purpose || null, member_ids: entity.memberIds, relationship_ids: entity.relationshipIds, matter_ids: entity.matterIds, owner_id: entity.ownerId || null }
      case 'cycle': return { ...readable, matter_id: entity.matterId, title: entity.title, theme: entity.theme, current_stage: entity.currentStage, status: entity.status, trajectory: entity.trajectory, stage_ids: entity.stageIds, parent_cycle_id: entity.parentCycleId || null, parent_stage: entity.parentStage || null, owner_id: entity.ownerId || null }
      case 'stage': return { ...readable, cycle_id: entity.cycleId, title: entity.title, element: entity.element, status: entity.status, action_ids: entity.actionIds, record_ids: entity.recordIds, order: entity.order ?? null }
      case 'resource': return { ...readable, title: entity.title, kind: entity.kind, status: entity.status, uri: entity.uri || null, asset_ids: entity.assetIds, matter_ids: entity.matterIds, source_ids: entity.sourceIds, tags: entity.tags, category_option_id: entity.categoryOptionId || null, tag_option_ids: entity.tagOptionIds || [], source_option_id: entity.sourceOptionId || null, expires_at: entity.expiresAt ?? null }
      case 'dictionary_option': return { ...readable, module: entity.module, field: entity.field, system_key: entity.systemKey || null, value: entity.value, status: entity.status, sort_order: entity.sortOrder }
      case 'relation': return { ...readable, from_entity_type: entity.from.entityType, from_id: entity.from.calmyId, to_entity_type: entity.to.entityType, to_id: entity.to.calmyId, relation_type: entity.relationType, directed: entity.directed, confidence: entity.confidence ?? null, source_ids: entity.sourceIds }
      case 'seed': return { ...readable, title: entity.title, status: entity.status, source_record_ids: entity.sourceRecordIds, target_matter_ids: entity.targetMatterIds, tags: entity.tags }
      case 'insight': return { ...readable, title: entity.title, status: entity.status, confidence: entity.confidence ?? null, memory_layer: entity.memoryLayer || null, confirmed_at: entity.confirmedAt ?? null, denied_at: entity.deniedAt ?? null, retirement_reason: entity.retirementReason || null, source_record_ids: entity.sourceRecordIds, matter_ids: entity.matterIds, resource_ids: entity.resourceIds }
      case 'outcome': return { ...readable, action_id: entity.actionId, matter_id: entity.matterId || null, summary: entity.summary, result: entity.result || null, status: entity.status, evidence_record_ids: entity.evidenceRecordIds }
      case 'practice': return { ...readable, title: entity.title, status: entity.status, cadence: entity.cadence || null, matter_ids: entity.matterIds, outcome_ids: entity.outcomeIds, evidence_ids: entity.evidenceIds }
      case 'daily_state': return { ...readable, date: entity.date, body_state: entity.bodyState, mental_state: entity.mentalState, load: entity.load, actual_time_minutes: entity.actualTimeMinutes ?? null, trajectory: entity.trajectory, today_plan_id: entity.todayPlanId || null, protected_items: entity.protectedItems }
      case 'asset': return { ...readable, path: entity.path, mime_type: entity.mimeType, size_bytes: entity.sizeBytes, hash: entity.hash, lifecycle: entity.lifecycle, version: entity.version, external_uri: entity.externalUri || null }
    }
  }
  if (isThing(entity)) {
    const legacyMatter = matterFromThing(entity)
    return {
      ...common, source: entity.source || null, title: entity.title, status: entity.status, why: entity.why,
      primary_contradiction: entity.primaryContradiction, problem: entity.problem || null, desired_change: entity.desiredChange || null,
      progress_evidence: entity.progressEvidence || null, current_gap: entity.currentGap || null, next_test: entity.nextTest || null,
      stop_condition: entity.stopCondition || null, current_stage: entity.currentStage, trajectory: entity.trajectory,
      current_cycle_id: entity.currentCycleId || null, evidence_ids: entity.evidenceIds,
      subject_person_ids: entity.subjectPersonIds || [], created_at: entity.createdAt, updated_at: entity.updatedAt,
      ownership_json: entity.ownership ? JSON.stringify(entity.ownership) : null,
      payload_json: JSON.stringify({ ...entity, ...legacyMatter, entityType: 'thing', source: entity.source, subjectPersonIds: entity.subjectPersonIds })
    }
  }
  if (isMatter(entity)) {
    return {
      ...common, title: entity.title, status: entity.status, why: entity.why,
      primary_contradiction: entity.primaryContradiction, problem: entity.problem || null, desired_change: entity.desiredChange || null,
      progress_evidence: entity.progressEvidence || null, current_gap: entity.currentGap || null, next_test: entity.nextTest || null, stop_condition: entity.stopCondition || null,
      current_stage: entity.currentStage,
      trajectory: entity.trajectory, current_cycle_id: entity.currentCycleId || null,
      evidence_ids: entity.evidenceIds, created_at: entity.createdAt, updated_at: entity.updatedAt,
      ownership_json: entity.ownership ? JSON.stringify(entity.ownership) : null,
      settlements_json: entity.settlements ? JSON.stringify(entity.settlements) : null
    }
  }
  if (isAction(entity)) {
    return {
      ...common, title: entity.title, date: entity.date, status: entity.status,
      matter_id: entity.matterId || null, person_id: entity.personId || null, cycle_id: entity.cycleId || null,
      result_note: entity.resultNote || null, created_at: entity.createdAt, updated_at: entity.updatedAt,
      ownership_json: entity.ownership ? JSON.stringify(entity.ownership) : null
    }
  }
  if (isRecord(entity)) {
    return {
      ...common, record_type: entity.type, occurred_at: entity.occurredAt, created_at: entity.createdAt,
      updated_at: entity.updatedAt, matter_id: entity.matterId || null, cycle_id: entity.cycleId || null,
      stage_id: entity.stageId || null, action_id: entity.actionId || null,
      source: entity.source, evidence_ids: entity.evidenceIds, impact: entity.impact || null, redacted_at: entity.redactedAt || null,
      ownership_json: entity.ownership ? JSON.stringify(entity.ownership) : null
    }
  }
  if (isCapture(entity)) {
    const portable = {
      calmyId: entity.calmyId, body: entity.body, status: entity.status,
      createdAt: entity.createdAt, updatedAt: entity.updatedAt, revision: entity.revision,
      ...(entity.sourceMaterialIds?.length ? { sourceMaterialIds: [...entity.sourceMaterialIds] } : {}),
      ...(entity.history?.length ? { history: entity.history } : {})
    }
    return {
      ...common, status: entity.status, created_at: entity.createdAt, updated_at: entity.updatedAt,
      source_material_ids: entity.sourceMaterialIds || [], payload_json: JSON.stringify(portable)
    }
  }
  if (isDiary(entity)) {
    const portable = { date: entity.date, content: entity.content, revision: entityRevision(entity), ownership: entity.ownership, history: entity.history?.map(item => ({ ...item, sourceMaterialIds: item.sourceMaterialIds && [...item.sourceMaterialIds] })), ...(entity.sourceMaterialIds?.length ? { sourceMaterialIds: [...entity.sourceMaterialIds] } : {}) }
    return {
      ...common, date: entity.date, ...(entity.sourceMaterialIds?.length ? { source_material_ids: entity.sourceMaterialIds } : {}),
      ...(entity.ownership ? { ownership_json: JSON.stringify(entity.ownership) } : {}),
      payload_json: JSON.stringify(portable)
    }
  }
  return {
    ...common, date: entity.date, load: entity.load, focus_action_ids: entity.focusActionIds,
    why: entity.why, must_protect: entity.mustProtect, let_go: entity.letGo,
    review_observation: entity.review.observation, review_analysis: entity.review.analysis,
    review_adjustment: entity.review.adjustment, review_seed: entity.review.seed,
    review_observation_source_material_ids: entity.review.sourceMaterialIds?.observation || [],
    review_analysis_source_material_ids: entity.review.sourceMaterialIds?.analysis || [],
    review_adjustment_source_material_ids: entity.review.sourceMaterialIds?.adjustment || [],
    review_seed_source_material_ids: entity.review.sourceMaterialIds?.seed || [], updated_at: entity.updatedAt
  }
}

function bodyFor(entity: OpenEntity): string {
  if (isInboxHistory(entity)) return `# Inbox 历史 ${entity.id}\n\n操作：${entity.operation}\n\n原始内容：${entity.before.text || '（无文本）'}`
  if (isUnifiedOpenEntity(entity)) {
    if (entity.entityType === 'resource' || entity.entityType === 'seed' || entity.entityType === 'insight') return `# ${entity.title}\n\n${entity.body || '尚未填写正文。'}`
    if (entity.entityType === 'dictionary_option') return `# ${entity.value}\n\n模块：${entity.module}\n\n字段：${entity.field}\n\n状态：${entity.status}`
    if (entity.entityType === 'practice') return `# ${entity.title}\n\n${entity.description}`
    if (entity.entityType === 'outcome') return `# ${entity.summary}\n\n${entity.result || '尚未填写结果补充。'}`
    const title = 'title' in entity && typeof entity.title === 'string' ? entity.title : entity.entityType
    return `# ${title}\n\n实体类型：${entity.entityType}\n\n稳定 ID：${entity.calmyId}`
  }
  if (isMatter(entity)) {
    const sections = [
      entity.problem && `## 现实问题\n\n${entity.problem}`,
      entity.desiredChange && `## 期望变化\n\n${entity.desiredChange}`,
      entity.progressEvidence && `## 进展证据\n\n${entity.progressEvidence}`,
      entity.currentGap && `## 当前缺口\n\n${entity.currentGap}`,
      entity.nextTest && `## 下一次验证\n\n${entity.nextTest}`,
      entity.stopCondition && `## 停止条件\n\n${entity.stopCondition}`
    ].filter(Boolean).join('\n\n')
    return `# ${entity.title}\n\n${entity.why || '尚未写下为什么。'}${sections ? `\n\n${sections}` : ''}`
  }
  if (isThing(entity)) return bodyFor(matterFromThing(entity))
  if (isAction(entity)) return `# ${entity.title}\n\n${entity.resultNote || '尚未记录结果。'}`
  if (isRecord(entity)) return entity.body
  if (isCapture(entity)) return entity.body
  if (isDiary(entity)) return entity.content
  if (isPost(entity)) return entity.content
  if (isFinanceEntry(entity)) return '# ' + (entity.category || '其他') + String.fromCharCode(10, 10) + (entity.note || '没有备注。')
  if (isHabit(entity)) return `# ${entity.name}\n\n已记录 ${entity.days} 天。`
  if (isGoal(entity)) return `# ${entity.title}\n\n${entity.problem ? `问题：${entity.problem}\n\n` : ''}${entity.evidence ? `证据：${entity.evidence}\n\n` : ''}${entity.nextAction ? `下一步：${entity.nextAction}` : '尚未填写下一步行动。'}`
  return `# ${entity.date}\n\n## 今日保护\n${entity.mustProtect.map(item => `- ${item}`).join('\n') || '- 暂无'}\n\n## 今日放下\n${entity.letGo.map(item => `- ${item}`).join('\n') || '- 暂无'}`
}

export function serializeOpenEntity(entity: OpenEntity): string {
  const serialized = `---\n${yaml(frontmatterFor(entity))}\n---\n\n${bodyFor(entity)}`
  return isDiary(entity) || isCapture(entity) ? serialized : `${serialized}\n`
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
  const source = input.replace(/^\ufeff/, '')
  const header = source.match(/^[ \t]*---[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*---[ \t]*\r?\n(?:\r?\n)?/)
  if (!header) throw new Error(/^[ \t]*---[ \t]*(?:\r?\n)/.test(source) ? 'frontmatter-end-missing' : 'frontmatter-start-missing')
  const frontmatter: OpenFrontmatter = {}
  for (const line of header[1].split(/\r?\n/)) {
    if (!line.trim()) continue
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
    if (!match) throw new Error(`frontmatter-line-invalid:${line}`)
    if (match[1] in frontmatter) throw new Error(`frontmatter-duplicate:${match[1]}`)
    frontmatter[match[1]] = parseScalar(match[2])
  }
  return { frontmatter, body: source.slice(header[0].length) }
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
  const ownership = optionalString(frontmatter, 'ownership_json')
  return {
    calmyId: id, entityType: type, source: requiredString(frontmatter, 'source') as CoreEntitySource,
    createdAt: requiredNumber(frontmatter, 'created_at'), updatedAt: requiredNumber(frontmatter, 'updated_at'), revision,
    ownership: ownership ? JSON.parse(ownership) : undefined
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
    person: 'display_name', important_date: 'month_day', organization: 'title', scene: 'thing_id', scene_participant: 'scene_id', space: 'member_person_ids', domain: 'key', scope: 'person_id', permission: 'principal_user_id', relationship: 'person_a_id', shared_space: 'member_ids', cycle: 'matter_id', stage: 'cycle_id',
    resource: 'kind', relation: 'from_entity_type', seed: 'status', insight: 'status', outcome: 'action_id', practice: 'title',
    daily_state: 'body_state', asset: 'path', dictionary_option: 'field'
  }
  return frontmatter[markers[type]] !== undefined
}

function parseUnifiedEntity(frontmatter: OpenFrontmatter, body: string, id: string, type: CoreEntityType, revision: number): CoreEntity {
  if (!hasReadableUnifiedFields(frontmatter, type)) return unifiedPayload(frontmatter, id, type)
  // Keep canonical fields that have no separate readable column (for example
  // durable revision snapshots) while letting edited readable fields win.
  const payload = unifiedPayload(frontmatter, id, type)
  const meta = { ...payload, ...unifiedMeta(frontmatter, id, type, revision) }
  switch (type) {
    case 'person': return { ...meta, entityType: 'person', displayName: requiredString(frontmatter, 'display_name'), status: requiredString(frontmatter, 'status') as 'active' | 'archived', roles: stringArray(frontmatter, 'roles'), domain: optionalString(frontmatter, 'domain'), notes: optionalString(frontmatter, 'notes'), tags: stringArray(frontmatter, 'tags'), linkedUserId: optionalString(frontmatter, 'linked_user_id') }
    case 'important_date': return { ...meta, entityType: 'important_date', title: requiredString(frontmatter, 'title'), kind: requiredString(frontmatter, 'kind') as 'birthday' | 'anniversary' | 'memorial' | 'other', personId: optionalString(frontmatter, 'person_id'), monthDay: requiredString(frontmatter, 'month_day'), year: optionalNumber(frontmatter, 'year'), recurrence: requiredString(frontmatter, 'recurrence') as 'yearly' | 'once', notes: optionalString(frontmatter, 'notes') }
    case 'organization': return { ...meta, entityType: 'organization', title: requiredString(frontmatter, 'title'), status: requiredString(frontmatter, 'status') as 'active' | 'archived' }
    case 'scene': return { ...meta, entityType: 'scene', title: requiredString(frontmatter, 'title'), thingId: optionalString(frontmatter, 'thing_id'), spaceId: optionalString(frontmatter, 'space_id'), startedAt: optionalNumber(frontmatter, 'started_at'), endedAt: optionalNumber(frontmatter, 'ended_at'), order: optionalNumber(frontmatter, 'order'), settlements: optionalString(frontmatter, 'settlements_json') ? JSON.parse(requiredString(frontmatter, 'settlements_json')) : undefined, status: requiredString(frontmatter, 'status') as 'draft' | 'active' | 'paused' | 'completed' | 'archived' }
    case 'scene_participant': return { ...meta, entityType: 'scene_participant', sceneId: requiredString(frontmatter, 'scene_id'), personId: requiredString(frontmatter, 'person_id'), role: optionalString(frontmatter, 'role'), joinedAt: requiredNumber(frontmatter, 'joined_at'), leftAt: optionalNumber(frontmatter, 'left_at') }
    case 'space': return { ...meta, entityType: 'space', title: requiredString(frontmatter, 'title'), purpose: optionalString(frontmatter, 'purpose'), boundary: optionalString(frontmatter, 'boundary'), memberPersonIds: stringArray(frontmatter, 'member_person_ids'), relationshipIds: stringArray(frontmatter, 'relationship_ids'), thingIds: stringArray(frontmatter, 'thing_ids'), sceneIds: stringArray(frontmatter, 'scene_ids'), ownerRef: optionalString(frontmatter, 'owner_ref_json') ? JSON.parse(requiredString(frontmatter, 'owner_ref_json')) : undefined, legacyBoundary: optionalString(frontmatter, 'legacy_boundary_json') ? JSON.parse(requiredString(frontmatter, 'legacy_boundary_json')) : undefined, status: requiredString(frontmatter, 'status') as 'active' | 'closed' | 'archived' }
    case 'domain': return { ...meta, entityType: 'domain', key: requiredString(frontmatter, 'key'), displayName: requiredString(frontmatter, 'display_name'), status: requiredString(frontmatter, 'status') as 'active' | 'retired' }
    case 'scope': return { ...meta, entityType: 'scope', personId: optionalString(frontmatter, 'person_id'), domainId: optionalString(frontmatter, 'domain_id'), thingId: optionalString(frontmatter, 'thing_id'), sceneId: optionalString(frontmatter, 'scene_id'), spaceId: optionalString(frontmatter, 'space_id') }
    case 'permission': return { ...meta, entityType: 'permission', principalUserId: requiredString(frontmatter, 'principal_user_id'), scopeId: optionalString(frontmatter, 'scope_id'), entityRef: optionalString(frontmatter, 'entity_ref_json') ? JSON.parse(requiredString(frontmatter, 'entity_ref_json')) as EntityRef : undefined, effect: requiredString(frontmatter, 'effect') as 'allow' | 'deny', actions: stringArray(frontmatter, 'actions') as ('view' | 'comment' | 'edit' | 'manage')[] }
    case 'relationship': return { ...meta, entityType: 'relationship', personAId: requiredString(frontmatter, 'person_a_id'), personBId: requiredString(frontmatter, 'person_b_id'), label: requiredString(frontmatter, 'label'), status: requiredString(frontmatter, 'status') as 'active' | 'paused' | 'ended', boundary: optionalString(frontmatter, 'boundary'), rhythm: optionalString(frontmatter, 'rhythm'), sharedSpaceIds: stringArray(frontmatter, 'shared_space_ids'), matterIds: stringArray(frontmatter, 'matter_ids'), evidenceIds: stringArray(frontmatter, 'evidence_ids'), ownerId: optionalString(frontmatter, 'owner_id') }
    case 'shared_space': return { ...meta, entityType: 'shared_space', title: requiredString(frontmatter, 'title'), status: requiredString(frontmatter, 'status') as 'active' | 'archived', purpose: optionalString(frontmatter, 'purpose'), memberIds: stringArray(frontmatter, 'member_ids'), relationshipIds: stringArray(frontmatter, 'relationship_ids'), matterIds: stringArray(frontmatter, 'matter_ids'), ownerId: optionalString(frontmatter, 'owner_id') }
    case 'cycle': return { ...meta, entityType: 'cycle', matterId: requiredString(frontmatter, 'matter_id'), title: requiredString(frontmatter, 'title'), theme: requiredString(frontmatter, 'theme'), currentStage: requiredString(frontmatter, 'current_stage') as 'wood' | 'fire' | 'earth' | 'metal' | 'water', status: requiredString(frontmatter, 'status') as 'planned' | 'active' | 'paused' | 'completed' | 'archived', trajectory: requiredString(frontmatter, 'trajectory') as 'advancing' | 'stable' | 'stalled' | 'retreating' | 'diverging' | 'lost' | 'recovering' | 'restarting' | 'unknown', stageIds: stringArray(frontmatter, 'stage_ids'), parentCycleId: optionalString(frontmatter, 'parent_cycle_id'), parentStage: optionalString(frontmatter, 'parent_stage') as 'wood' | 'fire' | 'earth' | 'metal' | 'water' | undefined, ownerId: optionalString(frontmatter, 'owner_id') }
    case 'stage': return { ...meta, entityType: 'stage', cycleId: requiredString(frontmatter, 'cycle_id'), title: requiredString(frontmatter, 'title'), element: requiredString(frontmatter, 'element') as 'wood' | 'fire' | 'earth' | 'metal' | 'water', status: requiredString(frontmatter, 'status') as 'planned' | 'active' | 'paused' | 'completed' | 'skipped', actionIds: stringArray(frontmatter, 'action_ids'), recordIds: stringArray(frontmatter, 'record_ids'), order: optionalNumber(frontmatter, 'order') }
    case 'resource': return { ...meta, entityType: 'resource', title: requiredString(frontmatter, 'title'), kind: requiredString(frontmatter, 'kind') as 'reference' | 'tool' | 'template' | 'knowledge' | 'person_asset' | 'other', status: requiredString(frontmatter, 'status') as 'active' | 'expired' | 'retired', body: readableBody(body, requiredString(frontmatter, 'title')), uri: optionalString(frontmatter, 'uri'), assetIds: stringArray(frontmatter, 'asset_ids'), matterIds: stringArray(frontmatter, 'matter_ids'), sourceIds: stringArray(frontmatter, 'source_ids'), tags: stringArray(frontmatter, 'tags'), categoryOptionId: optionalString(frontmatter, 'category_option_id'), tagOptionIds: stringArray(frontmatter, 'tag_option_ids'), sourceOptionId: optionalString(frontmatter, 'source_option_id'), expiresAt: optionalNumber(frontmatter, 'expires_at') }
    case 'relation': return { ...meta, entityType: 'relation', from: { entityType: requiredString(frontmatter, 'from_entity_type') as EntityRef['entityType'], calmyId: requiredString(frontmatter, 'from_id') }, to: { entityType: requiredString(frontmatter, 'to_entity_type') as EntityRef['entityType'], calmyId: requiredString(frontmatter, 'to_id') }, relationType: requiredString(frontmatter, 'relation_type') as RelationType, directed: requiredBoolean(frontmatter, 'directed'), confidence: optionalNumber(frontmatter, 'confidence'), sourceIds: stringArray(frontmatter, 'source_ids') }
    case 'seed': { const title = requiredString(frontmatter, 'title'); return { ...meta, entityType: 'seed', title, body: readableBody(body, title), status: requiredString(frontmatter, 'status') as 'open' | 'cultivating' | 'promoted' | 'retired', sourceRecordIds: stringArray(frontmatter, 'source_record_ids'), targetMatterIds: stringArray(frontmatter, 'target_matter_ids'), tags: stringArray(frontmatter, 'tags') } }
    case 'insight': { const title = requiredString(frontmatter, 'title'); return { ...meta, entityType: 'insight', title, body: readableBody(body, title), status: requiredString(frontmatter, 'status') as 'draft' | 'confirmed' | 'retired', confidence: optionalNumber(frontmatter, 'confidence'), memoryLayer: optionalString(frontmatter, 'memory_layer') as 'ai_inference' | 'preference' | 'principle' | undefined, confirmedAt: optionalNumber(frontmatter, 'confirmed_at'), deniedAt: optionalNumber(frontmatter, 'denied_at'), retirementReason: optionalString(frontmatter, 'retirement_reason') as 'denied' | 'removed' | undefined, sourceRecordIds: stringArray(frontmatter, 'source_record_ids'), matterIds: stringArray(frontmatter, 'matter_ids'), resourceIds: stringArray(frontmatter, 'resource_ids') } }
    case 'outcome': return { ...meta, entityType: 'outcome', actionId: requiredString(frontmatter, 'action_id'), matterId: optionalString(frontmatter, 'matter_id'), summary: requiredString(frontmatter, 'summary'), result: optionalString(frontmatter, 'result'), status: requiredString(frontmatter, 'status') as 'observed' | 'accepted' | 'revised', evidenceRecordIds: stringArray(frontmatter, 'evidence_record_ids') }
    case 'practice': { const title = requiredString(frontmatter, 'title'); return { ...meta, entityType: 'practice', title, description: readableBody(body, title), status: requiredString(frontmatter, 'status') as 'candidate' | 'active' | 'paused' | 'retired', matterIds: stringArray(frontmatter, 'matter_ids'), outcomeIds: stringArray(frontmatter, 'outcome_ids'), evidenceIds: stringArray(frontmatter, 'evidence_ids'), cadence: optionalString(frontmatter, 'cadence') } }
    case 'daily_state': return { ...meta, entityType: 'daily_state', date: requiredString(frontmatter, 'date'), bodyState: requiredString(frontmatter, 'body_state') as 'good' | 'normal' | 'tired' | 'bad', mentalState: requiredString(frontmatter, 'mental_state') as 'clear' | 'normal' | 'heavy' | 'overloaded', load: requiredNumber(frontmatter, 'load'), actualTimeMinutes: optionalNumber(frontmatter, 'actual_time_minutes'), trajectory: requiredString(frontmatter, 'trajectory') as 'advancing' | 'stable' | 'stalled' | 'retreating' | 'diverging' | 'lost' | 'recovering' | 'restarting' | 'unknown', todayPlanId: optionalString(frontmatter, 'today_plan_id'), protectedItems: stringArray(frontmatter, 'protected_items') }
    case 'asset': return { ...meta, entityType: 'asset', path: requiredString(frontmatter, 'path'), mimeType: requiredString(frontmatter, 'mime_type'), sizeBytes: requiredNumber(frontmatter, 'size_bytes'), hash: requiredString(frontmatter, 'hash'), lifecycle: requiredString(frontmatter, 'lifecycle') as 'active' | 'expired' | 'retired' | 'missing', version: requiredNumber(frontmatter, 'version'), externalUri: optionalString(frontmatter, 'external_uri') }
    case 'dictionary_option': return { ...meta, entityType: 'dictionary_option', module: requiredString(frontmatter, 'module') as 'resource' | 'asset' | 'seed' | 'insight' | 'action' | 'capture' | 'finance' | 'goal' | 'matter' | 'person', field: requiredString(frontmatter, 'field') as 'category' | 'tag' | 'source' | 'status', systemKey: optionalString(frontmatter, 'system_key'), value: requiredString(frontmatter, 'value'), status: requiredString(frontmatter, 'status') as 'active' | 'retired', sortOrder: requiredNumber(frontmatter, 'sort_order') }
  }
}

function isOpenHabitSnapshot(value: unknown): value is OpenHabitSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Partial<OpenHabitSnapshot>
  return typeof item.name === 'string' && typeof item.color === 'string'
    && Number.isInteger(item.days) && (item.days as number) >= 0
    && Array.isArray(item.dates) && item.dates.every(date => typeof date === 'string')
}

function parseEntity(input: string): OpenEntity {
  const { frontmatter, body } = parseMarkdown(input)
  if (![1, 2, OPEN_FORMAT_VERSION].includes(Number(frontmatter.b_version))) throw new Error('unsupported-format-version')
  const id = requiredString(frontmatter, 'calmy_id')
  const type = requiredString(frontmatter, 'calmy_type')
  const revision = optionalNumber(frontmatter, 'revision') ?? 0
  if (type === 'habit_entry') {
    const payload = JSON.parse(requiredString(frontmatter, 'payload_json')) as Partial<OpenHabit>
    const name = requiredString(frontmatter, 'title')
    const color = requiredString(frontmatter, 'color')
    const days = requiredNumber(frontmatter, 'days')
    const dates = stringArray(frontmatter, 'dates')
    if (payload.id !== id || typeof payload.name !== 'string' || typeof payload.color !== 'string'
      || !Number.isInteger(days) || days < 0 || !Array.isArray(payload.dates) || payload.dates.some(date => typeof date !== 'string')) throw new Error('habit-payload-invalid')
    if (payload.history !== undefined && (!Array.isArray(payload.history) || payload.history.some(item => !item
      || !Number.isInteger(item.revision) || item.revision < 1 || !['created', 'updated'].includes(item.operation)
      || !['user', 'system'].includes(item.source) || !Number.isFinite(item.occurredAt)
      || (item.actorUserId !== undefined && typeof item.actorUserId !== 'string')
      || !isOpenHabitSnapshot(item.after)
      || (item.operation === 'created' && item.before !== undefined)
      || (item.operation === 'updated' && !isOpenHabitSnapshot(item.before))))) throw new Error('habit-history-invalid')
    return { ...payload, entityType: 'habit_entry', id, name, color, days, dates, revision, ...(payload.history ? { history: payload.history } : {}) } as OpenHabit
  }
  if (type === 'inbox_history') {
    const payload = JSON.parse(requiredString(frontmatter, 'payload_json')) as Partial<OpenLegacyInboxHistory>
    const before = payload.before
    const target = payload.target
    if (payload.entityType !== 'inbox_history' || payload.id !== id || payload.revision !== revision
      || !['removed', 'converted-to-task', 'converted-to-case'].includes(String(payload.operation))
      || payload.source !== 'user' || !Number.isFinite(payload.occurredAt)
      || (payload.actorUserId !== undefined && typeof payload.actorUserId !== 'string')
      || !before || typeof before !== 'object' || Array.isArray(before)
      || (before.id !== undefined && typeof before.id !== 'string')
      || (before.text !== undefined && typeof before.text !== 'string')
      || (before.date !== undefined && typeof before.date !== 'string')
      || payload.after !== null
      || (target !== undefined && (!target || !['task', 'case'].includes(target.type) || typeof target.id !== 'string'))) throw new Error('inbox-history-payload-invalid')
    if ((payload.operation === 'converted-to-task' && target?.type !== 'task') || (payload.operation === 'converted-to-case' && target?.type !== 'case') || (payload.operation === 'removed' && target !== undefined)) throw new Error('inbox-history-target-invalid')
    return payload as OpenLegacyInboxHistory
  }
  if (type === 'post') {
    const raw = optionalString(frontmatter, 'payload_json')
    const payload = raw ? JSON.parse(raw) as Partial<OpenPost> : {}
    if (payload.id !== undefined && payload.id !== id) throw new Error('post-payload-invalid')
    if (payload.history !== undefined && (!Array.isArray(payload.history) || payload.history.some(item => !item || !Number.isInteger(item.revision) || item.revision < 1 || !['created', 'updated'].includes(item.operation) || !Number.isFinite(item.occurredAt) || typeof item.title !== 'string' || typeof item.content !== 'string' || typeof item.date !== 'string'))) throw new Error('post-history-invalid')
    return {
      ...payload, entityType: 'post', id, title: requiredString(frontmatter, 'title'), content: typeof payload.content === 'string' ? payload.content : body,
      date: optionalString(frontmatter, 'date') ?? payload.date ?? '', archivedAt: optionalNumber(frontmatter, 'archived_at') ?? payload.archivedAt,
      revision, ownership: optionalString(frontmatter, 'ownership_json') ? JSON.parse(requiredString(frontmatter, 'ownership_json')) as Ownership : payload.ownership
    }
  }
  if (type === 'goal') {
    const raw = optionalString(frontmatter, 'payload_json')
    const payload = raw ? JSON.parse(raw) as Partial<OpenGoal> : {}
    const title = requiredString(frontmatter, 'title')
    const progress = optionalNumber(frontmatter, 'progress') ?? payload.progress ?? (payload.done ? 100 : 0)
    if (payload.id !== undefined && payload.id !== id) throw new Error('goal-payload-invalid')
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) throw new Error('goal-progress-invalid')
    return {
      ...payload, id, title, progress,
      done: optionalString(frontmatter, 'status') === 'done' || payload.done,
      status: optionalString(frontmatter, 'status') || payload.status,
      problem: optionalString(frontmatter, 'problem') ?? payload.problem,
      evidence: optionalString(frontmatter, 'evidence') ?? payload.evidence,
      nextAction: optionalString(frontmatter, 'next_action') ?? payload.nextAction,
      matterId: optionalString(frontmatter, 'matter_id') ?? payload.matterId,
      ownership: optionalString(frontmatter, 'ownership_json') ? JSON.parse(requiredString(frontmatter, 'ownership_json')) as Ownership : payload.ownership
    }
  }
  if (type === 'matter') {
    return {
      calmyId: id, title: requiredString(frontmatter, 'title'), why: requiredString(frontmatter, 'why'),
      primaryContradiction: requiredString(frontmatter, 'primary_contradiction'), problem: optionalString(frontmatter, 'problem'), desiredChange: optionalString(frontmatter, 'desired_change'),
      progressEvidence: optionalString(frontmatter, 'progress_evidence'), currentGap: optionalString(frontmatter, 'current_gap'), nextTest: optionalString(frontmatter, 'next_test'), stopCondition: optionalString(frontmatter, 'stop_condition'),
      status: requiredString(frontmatter, 'status') as Matter['status'],
      currentStage: requiredString(frontmatter, 'current_stage') as Matter['currentStage'], trajectory: requiredString(frontmatter, 'trajectory') as Matter['trajectory'],
      currentCycleId: optionalString(frontmatter, 'current_cycle_id'), evidenceIds: stringArray(frontmatter, 'evidence_ids'),
      createdAt: requiredNumber(frontmatter, 'created_at'), updatedAt: requiredNumber(frontmatter, 'updated_at'), revision,
      ownership: optionalString(frontmatter, 'ownership_json') ? JSON.parse(requiredString(frontmatter, 'ownership_json')) : undefined,
      settlements: optionalString(frontmatter, 'settlements_json') ? JSON.parse(requiredString(frontmatter, 'settlements_json')) : undefined
    }
  }
  if (type === 'thing') {
    const payloadJson = optionalString(frontmatter, 'payload_json')
    const payload = payloadJson ? JSON.parse(payloadJson) as Partial<Thing> : {}
    return {
      ...payload,
      entityType: 'thing', calmyId: id, title: requiredString(frontmatter, 'title'), why: requiredString(frontmatter, 'why'),
      primaryContradiction: requiredString(frontmatter, 'primary_contradiction'), problem: optionalString(frontmatter, 'problem'),
      desiredChange: optionalString(frontmatter, 'desired_change'), progressEvidence: optionalString(frontmatter, 'progress_evidence'),
      currentGap: optionalString(frontmatter, 'current_gap'), nextTest: optionalString(frontmatter, 'next_test'),
      stopCondition: optionalString(frontmatter, 'stop_condition'), status: requiredString(frontmatter, 'status') as Matter['status'],
      currentStage: requiredString(frontmatter, 'current_stage') as Matter['currentStage'], trajectory: requiredString(frontmatter, 'trajectory') as Matter['trajectory'],
      currentCycleId: optionalString(frontmatter, 'current_cycle_id'), evidenceIds: stringArray(frontmatter, 'evidence_ids'),
      createdAt: requiredNumber(frontmatter, 'created_at'), updatedAt: requiredNumber(frontmatter, 'updated_at'), revision,
      source: optionalString(frontmatter, 'source') as Thing['source'], subjectPersonIds: stringArray(frontmatter, 'subject_person_ids'),
      ownership: optionalString(frontmatter, 'ownership_json') ? JSON.parse(requiredString(frontmatter, 'ownership_json')) : payload.ownership
    }
  }
  if (type === 'action') {
    return {
      calmyId: id, title: requiredString(frontmatter, 'title'), date: requiredString(frontmatter, 'date'),
      status: requiredString(frontmatter, 'status') as ActionItem['status'], matterId: optionalString(frontmatter, 'matter_id'),
      personId: optionalString(frontmatter, 'person_id'), cycleId: optionalString(frontmatter, 'cycle_id'), resultNote: optionalString(frontmatter, 'result_note'),
      createdAt: requiredNumber(frontmatter, 'created_at'), updatedAt: requiredNumber(frontmatter, 'updated_at'), revision,
      ownership: optionalString(frontmatter, 'ownership_json') ? JSON.parse(requiredString(frontmatter, 'ownership_json')) : undefined
    }
  }
  if (type === 'record') {
    return {
      calmyId: id, type: requiredString(frontmatter, 'record_type') as RealityRecord['type'], body: normalizeBody(body),
      occurredAt: requiredNumber(frontmatter, 'occurred_at'), createdAt: requiredNumber(frontmatter, 'created_at'),
      updatedAt: requiredNumber(frontmatter, 'updated_at'), matterId: optionalString(frontmatter, 'matter_id'),
      cycleId: optionalString(frontmatter, 'cycle_id'), stageId: optionalString(frontmatter, 'stage_id'),
      actionId: optionalString(frontmatter, 'action_id'), source: requiredString(frontmatter, 'source') as RealityRecord['source'],
      evidenceIds: stringArray(frontmatter, 'evidence_ids'), revision, impact: optionalString(frontmatter, 'impact') as RealityRecord['impact'], redactedAt: optionalNumber(frontmatter, 'redacted_at'),
      ownership: optionalString(frontmatter, 'ownership_json') ? JSON.parse(requiredString(frontmatter, 'ownership_json')) : undefined
    }
  }
  if (type === 'daily') {
    const date = requiredString(frontmatter, 'date')
    const sourceMaterialIds: Partial<Record<'observation' | 'analysis' | 'adjustment' | 'seed', string[]>> = {}
    for (const field of ['observation', 'analysis', 'adjustment', 'seed'] as const) {
      const ids = stringArray(frontmatter, `review_${field}_source_material_ids`)
      if (ids.length) sourceMaterialIds[field] = ids
    }
    return {
      date, load: frontmatter.load === null ? null : requiredString(frontmatter, 'load') as TodayPlan['load'],
      focusActionIds: stringArray(frontmatter, 'focus_action_ids'), why: requiredString(frontmatter, 'why'),
      mustProtect: stringArray(frontmatter, 'must_protect'), letGo: stringArray(frontmatter, 'let_go'),
      review: {
        observation: requiredString(frontmatter, 'review_observation'), analysis: requiredString(frontmatter, 'review_analysis'),
        adjustment: requiredString(frontmatter, 'review_adjustment'), seed: requiredString(frontmatter, 'review_seed'),
        ...(Object.keys(sourceMaterialIds).length ? { sourceMaterialIds } : {})
      }, revision, updatedAt: requiredNumber(frontmatter, 'updated_at')
    }
  }
  if (type === 'diary') {
    const date = requiredString(frontmatter, 'date')
    if (!isValidDiaryDate(date)) throw new Error('diary-date-invalid')
    if (id !== `diary_${date}`) throw new Error('diary-id-date-mismatch')
    const revision = optionalNumber(frontmatter, 'revision') ?? 0
    if (!Number.isInteger(revision) || revision < 0) throw new Error('diary-revision-invalid')
    const sourceMaterialIds = stringArray(frontmatter, 'source_material_ids')
    const payload = optionalString(frontmatter, 'payload_json') ? JSON.parse(requiredString(frontmatter, 'payload_json')) as Partial<DiaryEntry> : {}
    const history = payload.history
    if (history !== undefined && (!Array.isArray(history) || history.some(item => !item || !Number.isInteger(item.revision) || item.revision < 1
      || !['created', 'content_updated', 'ownership_updated'].includes(item.operation) || !Number.isFinite(item.occurredAt) || typeof item.content !== 'string'
      || (item.sourceMaterialIds !== undefined && (!Array.isArray(item.sourceMaterialIds) || item.sourceMaterialIds.some(id => typeof id !== 'string')))))) throw new Error('diary-history-invalid')
    return { date, content: body, ...(sourceMaterialIds.length ? { sourceMaterialIds } : {}), revision,
      ...(optionalString(frontmatter, 'ownership_json') ? { ownership: JSON.parse(requiredString(frontmatter, 'ownership_json')) } : payload.ownership ? { ownership: payload.ownership } : {}),
      ...(history ? { history } : {}) }
  }
  if (type === 'capture') {
    const status = requiredString(frontmatter, 'status')
    if (!(CAPTURE_STATUSES as readonly string[]).includes(status)) throw new Error('capture-status-invalid')
    const revision = requiredNumber(frontmatter, 'revision')
    if (!Number.isInteger(revision) || revision < 0) throw new Error('capture-revision-invalid')
    const createdAt = requiredNumber(frontmatter, 'created_at')
    const updatedAt = requiredNumber(frontmatter, 'updated_at')
    const sourceMaterialIds = stringArray(frontmatter, 'source_material_ids')
    const payload = optionalString(frontmatter, 'payload_json') ? JSON.parse(requiredString(frontmatter, 'payload_json')) as Partial<CaptureItem> : {}
    const history = payload.history
    if (history !== undefined && (!Array.isArray(history) || history.some(item => !item || !Number.isInteger(item.revision) || item.revision < 1
      || !['created', 'updated', 'suggested', 'accepted', 'modified', 'rejected', 'expired'].includes(item.operation)
      || !['user', 'ai_assisted', 'system', 'import', 'sync'].includes(item.source)
      || !Number.isFinite(item.occurredAt) || !Number.isInteger(item.fromRevision) || !Number.isInteger(item.toRevision)
      || !item.snapshot || typeof item.snapshot !== 'object' || Array.isArray(item.snapshot)
      || (item.previousSnapshot !== undefined && (!item.previousSnapshot || typeof item.previousSnapshot !== 'object' || Array.isArray(item.previousSnapshot)))
      || !Array.isArray(item.sourceIds) || item.sourceIds.some(id => typeof id !== 'string')))) throw new Error('capture-history-invalid')
    return {
      calmyId: id, body, status: status as CaptureItem['status'], suggestionIds: [], createdAt, updatedAt, revision,
      ...(sourceMaterialIds.length ? { sourceMaterialIds } : {}), ...(history ? { history } : {})
    }
  }
  if (type === 'finance_entry') {
    const payload = JSON.parse(requiredString(frontmatter, 'payload_json')) as Partial<OpenFinanceEntry>
    const category = requiredString(frontmatter, 'category')
    const amount = optionalNumber(frontmatter, 'amount')
    const amountCents = optionalNumber(frontmatter, 'amount_cents')
    if (payload.id !== id || payload.entityType !== 'finance_entry') throw new Error('finance-entry-payload-invalid')
    return {
      ...payload, id, entityType: 'finance_entry', type: requiredString(frontmatter, 'finance_type'),
      ...(amount !== undefined ? { amount } : {}), ...(amountCents !== undefined ? { amountCents } : {}),
      category, ...(optionalString(frontmatter, 'category_option_id') ? { categoryOptionId: optionalString(frontmatter, 'category_option_id') } : {}),
      note: readableBody(body, category), date: requiredString(frontmatter, 'date'), revision,
      ownership: optionalString(frontmatter, 'ownership_json') ? JSON.parse(requiredString(frontmatter, 'ownership_json')) : payload.ownership
    } as OpenFinanceEntry
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
  identityKey: string
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
  const localValues = portableComparisonValues(local)
  const incomingValues = portableComparisonValues(incoming)
  const keys = new Set([...Object.keys(localValues), ...Object.keys(incomingValues)])
  return [...keys].sort().filter(key => JSON.stringify(localValues[key]) !== JSON.stringify(incomingValues[key])).map(key => ({
    key, localValue: localValues[key], incomingValue: incomingValues[key]
  }))
}

function portableComparisonValues(entity: OpenEntity): Record<string, unknown> {
  const values = { ...(entity as unknown as Record<string, unknown>) }
  if (isCapture(entity)) delete values.suggestionIds
  if (isDiary(entity)) values.revision = entity.revision ?? 0
  return values
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
  const localById = new Map(local.map(entity => [openEntityKey(entity), entity]))
  const comparison: OpenEntityComparison = { added: [], unchanged: [], conflicts: [] }
  for (const entity of incoming) {
    const key = openEntityKey(entity)
    const current = localById.get(key)
    if (!current) {
      comparison.added.push(entity)
      continue
    }
    if (JSON.stringify(portableComparisonValues(current)) === JSON.stringify(portableComparisonValues(entity))) {
      comparison.unchanged.push(entity)
      continue
    }
    comparison.conflicts.push({
      calmyId: openEntityId(entity), calmyType: openEntityType(entity),
      identityKey: key, localRevision: entityRevision(current), incomingRevision: entityRevision(entity), reason: 'content-changed',
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
  const entities: OpenEntity[] = [...(input.matters || []), ...(input.things || []), ...(input.actions || []), ...(input.records || []), ...(input.dailies || []), ...(input.diaries || []), ...(input.captures || []), ...(input.finance || []), ...(input.habits || []), ...(input.goals || []), ...(input.posts || []), ...(input.inboxHistory || []), ...(input.unified || [])]
  const assets = (input.assets || []).map(asset => ({ ...asset, path: assetPath(asset.path) }))
  const files: Record<string, string> = {}
  const manifestEntries: OpenManifestEntry[] = []
  const seenEntityIds = new Set<string>()
  const mattersById = new Set((input.matters || []).map(entity => entity.calmyId))
  const thingsById = new Set((input.things || []).map(entity => entity.calmyId))
  for (const entity of entities) {
    const id = entityId(entity)
    const key = openEntityKey(entity)
    if (seenEntityIds.has(key)) throw new Error(`duplicate-entity-identity:${key}`)
    if ((isMatter(entity) && thingsById.has(id)) || (isThing(entity) && mattersById.has(id))) throw new Error(`duplicate-entity-id:${id}`)
    seenEntityIds.add(key)
    const path = pathFor(entity)
    const content = serializeOpenEntity(entity)
    if (files[path]) throw new Error(`duplicate-path:${path}`)
    files[path] = content
    manifestEntries.push({ calmy_id: id, calmy_type: entityType(entity), path, revision: entityRevision(entity), hash: hashOpenText(content) })
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
  const financeMutations = (input.financeMutations || []).slice().sort((a, b) => a.occurredAt - b.occurredAt || a.fromRevision - b.fromRevision || a.id.localeCompare(b.id))
  if (financeMutations.length) {
    const seenMutations = new Map<string, FinanceMutation>()
    for (const mutation of financeMutations) {
      if (!isFinanceMutation(mutation)) throw new Error(`finance-mutation-invalid:${(mutation as Partial<FinanceMutation> | null)?.id || 'unknown'}`)
      const previous = seenMutations.get(mutation.id)
      if (previous && JSON.stringify(previous) !== JSON.stringify(mutation)) throw new Error(`finance-mutation-conflict:${mutation.id}`)
      seenMutations.set(mutation.id, mutation)
    }
    manifest.finance_mutations = [...seenMutations.values()]
  }
  files[OPEN_MANIFEST_PATH] = `${JSON.stringify(manifest, null, 2)}\n`
  return { files, assets, manifest }
}

function parseManifest(files: Record<string, string>, issues: OpenImportIssue[]): OpenManifest | undefined {
  const raw = files[OPEN_MANIFEST_PATH]
  if (raw === undefined) return undefined
  try {
    const parsed = JSON.parse(raw) as OpenManifest & { finance_mutations?: unknown }
    if (parsed.format !== 'calmy-open' || ![1, 2, OPEN_FORMAT_VERSION].includes(parsed.format_version) || !Array.isArray(parsed.entities)) throw new Error(parsed.format === 'calmy-open' && typeof parsed.format_version === 'number' ? `unsupported-format-version:${parsed.format_version}` : 'manifest-shape-invalid')
    const rawFinanceMutations = Array.isArray(parsed.finance_mutations) ? parsed.finance_mutations as unknown[] : []
    if (parsed.finance_mutations !== undefined && (!Array.isArray(parsed.finance_mutations) || rawFinanceMutations.some(item => !isFinanceMutation(item)))) {
      issues.push({ path: OPEN_MANIFEST_PATH, code: 'invalid-entity', message: 'finance_mutations contains an invalid audit record' })
    }
    return {
      ...parsed, assets: Array.isArray(parsed.assets) ? parsed.assets : [], asset_references: Array.isArray(parsed.asset_references) ? parsed.asset_references : [],
      tombstones: Array.isArray(parsed.tombstones) ? parsed.tombstones : [], finance_mutations: rawFinanceMutations.filter(isFinanceMutation)
    }
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
  const seen = new Map<string, { path: string; entity: OpenEntity }>()
  const markdownPathsByHash = new Map<string, string[]>()
  const parsedEntitiesByPath = new Map<string, OpenEntity>()
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
      parsedEntitiesByPath.set(path, entity)
      const id = entityId(entity)
      const key = openEntityKey(entity)
      if (seen.has(key)) {
        const previous = seen.get(key)!
        conflicts.push({ path, calmyId: id, calmyType: entityType(entity), identityKey: key, reason: 'duplicate-id', message: `类型化身份已在 ${previous.path} 出现，拒绝静默覆盖` })
        continue
      }
      seen.set(key, { path, entity })
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
    const seenManifestIdentities = new Set<string>()
    for (const entry of manifest.entities) {
      const identity = `${entry.calmy_type}:${entry.calmy_id}`
      if (seenManifestIdentities.has(identity)) {
        issues.push({ path: entry.path, code: 'duplicate-id', message: `manifest 中重复声明类型化身份 ${identity}` })
        continue
      }
      seenManifestIdentities.add(identity)
      const content = files[entry.path]
      const expectedIdentity = `${entry.calmy_type}:${entry.calmy_id}`
      const movedPath = markdownPathsByHash.get(entry.hash)?.find(path => path !== entry.path && parsedEntitiesByPath.get(path) && openEntityKey(parsedEntitiesByPath.get(path)!) === expectedIdentity)
      if (content === undefined) {
        if (!movedPath) {
          const declared = manifest.tombstones?.find(tombstone => tombstone.calmy_id === entry.calmy_id && tombstone.calmy_type === entry.calmy_type)
          const tombstone = declared || { calmy_id: entry.calmy_id, calmy_type: entry.calmy_type, path: entry.path, revision: entry.revision, deleted_at: new Date().toISOString() }
          if (!tombstones.some(item => item.calmy_id === tombstone.calmy_id && item.calmy_type === tombstone.calmy_type)) tombstones.push(tombstone)
        }
        continue
      }
      const parsedEntity = parsedEntitiesByPath.get(entry.path)
      if (!parsedEntity || openEntityKey(parsedEntity) !== identity) {
        issues.push({ path: entry.path, code: 'manifest-identity-mismatch', message: '文件中的类型或稳定 ID 与 manifest 声明不一致' })
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
  return { entities, assets, assetReferences, missingAssetReferences, orphanAssets, tombstones, financeMutations: manifest?.finance_mutations || [], manifest, issues, conflicts }
}
