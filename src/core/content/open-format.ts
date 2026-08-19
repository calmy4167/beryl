import type { ActionItem } from '@/domain/action/model'
import type { Matter } from '@/domain/matter/model'
import type { RealityRecord } from '@/domain/record/model'
import type { TodayPlan } from '@/domain/today/model'

export const OPEN_FORMAT_VERSION = 1
export const OPEN_MANIFEST_PATH = '_calmy/manifest.json'

export type OpenEntity = Matter | ActionItem | RealityRecord | TodayPlan
export type OpenEntityType = 'matter' | 'action' | 'record' | 'daily'
type OpenScalar = string | number | boolean | null | string[]
type OpenFrontmatter = Record<string, OpenScalar>

export interface OpenManifestEntry {
  calmy_id: string
  calmy_type: OpenEntityType
  path: string
  revision: number
  hash: string
}

export interface OpenManifest {
  format: 'calmy-open'
  format_version: number
  generated_at: string
  entities: OpenManifestEntry[]
}

export interface OpenWorkspace {
  files: Record<string, string>
  manifest: OpenManifest
}

export interface OpenWorkspaceInput {
  matters?: Matter[]
  actions?: ActionItem[]
  records?: RealityRecord[]
  dailies?: TodayPlan[]
}

export interface OpenImportIssue {
  path: string
  code: 'invalid-frontmatter' | 'invalid-entity' | 'duplicate-id' | 'manifest-hash-mismatch' | 'unsupported-file'
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

function isMatter(entity: OpenEntity): entity is Matter { return 'currentStage' in entity }
function isAction(entity: OpenEntity): entity is ActionItem { return 'title' in entity && 'status' in entity && !('currentStage' in entity) }
function isRecord(entity: OpenEntity): entity is RealityRecord { return 'occurredAt' in entity }

function entityType(entity: OpenEntity): OpenEntityType {
  if (isMatter(entity)) return 'matter'
  if (isAction(entity)) return 'action'
  if (isRecord(entity)) return 'record'
  return 'daily'
}

function entityId(entity: OpenEntity): string {
  return 'calmyId' in entity ? entity.calmyId : `daily_${entity.date}`
}

function entityRevision(entity: OpenEntity): number { return entity.revision }

function safeName(value: string, fallback: string): string {
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').trim()
  return (cleaned || fallback).slice(0, 90)
}

function pathFor(entity: OpenEntity): string {
  const id = entityId(entity)
  if (isMatter(entity)) return `20 Matters/${safeName(entity.title, id)}__${id}.md`
  if (isAction(entity)) return `40 Actions/${entity.date}__${safeName(entity.title, id)}__${id}.md`
  if (isRecord(entity)) return `50 Records/${new Date(entity.occurredAt).toISOString().slice(0, 10)}__${id}.md`
  return `80 Daily/${entity.date}.md`
}

function frontmatterFor(entity: OpenEntity): OpenFrontmatter {
  const common = { calmy_id: entityId(entity), calmy_type: entityType(entity), b_version: OPEN_FORMAT_VERSION, revision: entityRevision(entity) }
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
      source: entity.source, evidence_ids: entity.evidenceIds, redacted_at: entity.redactedAt || null
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
  return [...value]
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
      evidenceIds: stringArray(frontmatter, 'evidence_ids'), revision, redactedAt: optionalNumber(frontmatter, 'redacted_at')
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

export function exportOpenWorkspace(input: OpenWorkspaceInput): OpenWorkspace {
  const entities: OpenEntity[] = [...(input.matters || []), ...(input.actions || []), ...(input.records || []), ...(input.dailies || [])]
  const files: Record<string, string> = {}
  const manifestEntries: OpenManifestEntry[] = []
  for (const entity of entities) {
    const path = pathFor(entity)
    const content = serializeOpenEntity(entity)
    if (files[path]) throw new Error(`duplicate-path:${path}`)
    files[path] = content
    manifestEntries.push({ calmy_id: entityId(entity), calmy_type: entityType(entity), path, revision: entityRevision(entity), hash: hashOpenText(content) })
  }
  manifestEntries.sort((a, b) => a.path.localeCompare(b.path))
  const manifest: OpenManifest = { format: 'calmy-open', format_version: OPEN_FORMAT_VERSION, generated_at: new Date().toISOString(), entities: manifestEntries }
  files[OPEN_MANIFEST_PATH] = `${JSON.stringify(manifest, null, 2)}\n`
  return { files, manifest }
}

function parseManifest(files: Record<string, string>, issues: OpenImportIssue[]): OpenManifest | undefined {
  const raw = files[OPEN_MANIFEST_PATH]
  if (raw === undefined) return undefined
  try {
    const parsed = JSON.parse(raw) as OpenManifest
    if (parsed.format !== 'calmy-open' || parsed.format_version !== OPEN_FORMAT_VERSION || !Array.isArray(parsed.entities)) throw new Error('manifest-shape-invalid')
    return parsed
  } catch (error) {
    issues.push({ path: OPEN_MANIFEST_PATH, code: 'invalid-entity', message: error instanceof Error ? error.message : 'manifest-invalid' })
    return undefined
  }
}

export function importOpenWorkspace(files: Record<string, string>): OpenImportResult {
  const issues: OpenImportIssue[] = []
  const conflicts: OpenImportConflict[] = []
  const manifest = parseManifest(files, issues)
  const entities: OpenEntity[] = []
  const seen = new Map<string, string>()
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
  if (manifest) {
    for (const entry of manifest.entities) {
      const content = files[entry.path]
      if (content === undefined) issues.push({ path: entry.path, code: 'invalid-entity', message: 'manifest-file-missing' })
      else if (hashOpenText(content) !== entry.hash) issues.push({ path: entry.path, code: 'manifest-hash-mismatch', message: '文件内容与 manifest hash 不一致' })
    }
  }
  return { entities, manifest, issues, conflicts }
}
