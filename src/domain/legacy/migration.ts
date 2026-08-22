import { createAsyncCollectionRepository, createCollectionRepository } from '@/core/repository'
import { todayKey } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import type { ActionItem } from '@/domain/action/model'
import { caseAsyncRepository, caseRelationRepository } from '@/domain/case/repository'
import type { CaseItem } from '@/domain/case/model'
import { captureAsyncRepository } from '@/domain/capture'
import type { CaptureItem } from '@/domain/capture'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter, MatterStatus, MatterStage } from '@/domain/matter/model'

type LegacySourceType = 'case' | 'task' | 'inbox'
type LegacyTargetType = 'matter' | 'action' | 'capture'

export interface LegacyEntityMapping {
  id: string
  sourceType: LegacySourceType
  sourceId: string
  targetType: LegacyTargetType
  targetId: string
  migratedAt: number
  sourceUpdatedAt: number
}

export interface LegacyMigrationReport {
  version: 1
  status: 'completed' | 'partial'
  migrated: { cases: number; tasks: number; inbox: number }
  skipped: { cases: number; tasks: number; inbox: number }
  errors: string[]
  completedAt: number
}

export interface LegacyRollbackReport {
  removed: { cases: number; tasks: number; inbox: number }
  preserved: { cases: number; tasks: number; inbox: number }
  missing: { cases: number; tasks: number; inbox: number }
  errors: string[]
  completedAt: number
}

interface LegacyTask {
  id?: string
  title?: string
  priority?: string
  date?: string
  dueAt?: string
  done?: boolean
}

interface LegacyInboxItem {
  id?: string
  text?: string
  date?: string
}

const mappings = createAsyncCollectionRepository<LegacyEntityMapping>('legacyEntityMappings', item => item.id)
const syncMappings = createCollectionRepository<LegacyEntityMapping>('legacyEntityMappings', item => item.id)
const legacyTasks = createAsyncCollectionRepository<LegacyTask>('tasks', item => item.id)
const legacyInbox = createAsyncCollectionRepository<LegacyInboxItem>('inbox', item => item.id)

let migrationPromise: Promise<LegacyMigrationReport> | undefined

function mappingId(sourceType: LegacySourceType, sourceId: string): string {
  return `${sourceType}:${sourceId}`
}

export function legacyTargetId(sourceType: LegacySourceType, sourceId: string): string {
  return `legacy-${sourceType}-${encodeURIComponent(sourceId)}`
}

export function legacyMapping(sourceType: LegacySourceType, sourceId: string): LegacyEntityMapping | undefined {
  return syncMappings.find(mappingId(sourceType, sourceId))
}

export function legacyTargetFor(sourceType: LegacySourceType, sourceId: string): string | undefined {
  return legacyMapping(sourceType, sourceId)?.targetId
}

function timestamp(value?: string, fallback = Date.now()): number {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

function dateOnly(value?: string): string {
  const raw = value?.trim() || ''
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const parsed = timestamp(raw, NaN)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : todayKey()
}

function matterStatus(status: CaseItem['status']): MatterStatus {
  if (status === 'inbox') return 'draft'
  if (status === 'paused') return 'paused'
  if (status === 'archived' || status === 'resolved') return 'archived'
  return 'active'
}

function matterFromCase(item: CaseItem): Matter {
  const why = [item.problem.trim(), item.desiredOutcome.trim() ? `目标：${item.desiredOutcome.trim()}` : ''].filter(Boolean).join('\n\n')
  return {
    calmyId: legacyTargetId('case', item.id),
    title: item.title.trim(),
    why,
    primaryContradiction: item.phaseNotes?.wood || '',
    status: matterStatus(item.status),
    currentStage: item.currentPhase as MatterStage,
    trajectory: item.status === 'paused' ? 'stalled' : 'stable',
    evidenceIds: [],
    createdAt: item.createdAt || Date.now(),
    updatedAt: item.updatedAt || item.createdAt || Date.now(),
    revision: 1
  }
}

function actionFromTask(item: LegacyTask, matterId?: string): ActionItem | undefined {
  if (!item.id || !item.title?.trim()) return undefined
  const updatedAt = timestamp(item.date)
  return {
    calmyId: legacyTargetId('task', item.id),
    title: item.title.trim(),
    date: dateOnly(item.date || item.dueAt),
    status: item.done ? 'done' : 'planned',
    matterId,
    resultNote: item.priority ? `旧任务优先级：${item.priority}` : undefined,
    createdAt: updatedAt,
    updatedAt,
    revision: 1
  }
}

function captureFromInbox(item: LegacyInboxItem, index: number): CaptureItem | undefined {
  const body = item.text?.trim()
  if (!body) return undefined
  const sourceId = item.id || `row-${index}-${encodeURIComponent(body.slice(0, 32))}`
  const updatedAt = timestamp(item.date)
  return {
    calmyId: legacyTargetId('inbox', sourceId),
    body,
    status: 'inbox',
    suggestionIds: [],
    createdAt: updatedAt,
    updatedAt,
    revision: 1
  }
}

async function saveMapping(sourceType: LegacySourceType, sourceId: string, targetType: LegacyTargetType, targetId: string, sourceUpdatedAt: number): Promise<void> {
  const mapping: LegacyEntityMapping = {
    id: mappingId(sourceType, sourceId), sourceType, sourceId, targetType, targetId,
    migratedAt: Date.now(), sourceUpdatedAt
  }
  if (!await mappings.find(mapping.id)) await mappings.create(mapping)
}

async function migrateCases(report: LegacyMigrationReport, caseTargets: Map<string, string>): Promise<void> {
  for (const item of await caseAsyncRepository.list()) {
    const targetId = legacyTargetId('case', item.id)
    caseTargets.set(item.id, targetId)
    try {
      const existing = await matterAsyncRepository.find(targetId)
      if (!existing) await matterAsyncRepository.importEntity(matterFromCase(item))
      await saveMapping('case', item.id, 'matter', targetId, item.updatedAt)
      if (!existing) report.migrated.cases++
      else report.skipped.cases++
    } catch (error) {
      report.errors.push(`case:${item.id}:${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

async function migrateTasks(report: LegacyMigrationReport, caseTargets: Map<string, string>): Promise<void> {
  for (const item of await legacyTasks.list()) {
    if (!item.id || !item.title?.trim()) { report.skipped.tasks++; continue }
    const relation = caseRelationRepository.listForTarget('task', item.id)[0]
    const matterId = relation ? caseTargets.get(relation.caseId) : undefined
    const action = actionFromTask(item, matterId)
    if (!action) { report.skipped.tasks++; continue }
    try {
      const existing = await actionAsyncRepository.find(action.calmyId)
      if (!existing) await actionAsyncRepository.importEntity(action)
      await saveMapping('task', item.id, 'action', action.calmyId, timestamp(item.date))
      if (!existing) report.migrated.tasks++
      else report.skipped.tasks++
    } catch (error) {
      report.errors.push(`task:${item.id}:${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

async function migrateInbox(report: LegacyMigrationReport): Promise<void> {
  const items = await legacyInbox.list()
  for (const [index, item] of items.entries()) {
    const sourceId = item.id || `row-${index}-${encodeURIComponent((item.text || '').trim().slice(0, 32))}`
    const capture = captureFromInbox(item, index)
    if (!capture) { report.skipped.inbox++; continue }
    try {
      const existing = await captureAsyncRepository.find(capture.calmyId)
      if (!existing) await captureAsyncRepository.importEntity(capture)
      await saveMapping('inbox', sourceId, 'capture', capture.calmyId, timestamp(item.date))
      if (!existing) report.migrated.inbox++
      else report.skipped.inbox++
    } catch (error) {
      report.errors.push(`inbox:${sourceId}:${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

async function migrateLegacyEntities(): Promise<LegacyMigrationReport> {
  const report: LegacyMigrationReport = {
    version: 1, status: 'completed', migrated: { cases: 0, tasks: 0, inbox: 0 },
    skipped: { cases: 0, tasks: 0, inbox: 0 }, errors: [], completedAt: Date.now()
  }
  const caseTargets = new Map<string, string>()
  await migrateCases(report, caseTargets)
  await migrateTasks(report, caseTargets)
  await migrateInbox(report)
  report.status = report.errors.length ? 'partial' : 'completed'
  report.completedAt = Date.now()
  return report
}

/**
 * 增量迁移旧 Case/Task/inbox。旧集合永远不删除、不更新；映射和新实体可安全重跑。
 */
export function ensureLegacyMigration(): Promise<LegacyMigrationReport> {
  if (!migrationPromise) migrationPromise = migrateLegacyEntities().catch(error => ({
    version: 1, status: 'partial' as const, migrated: { cases: 0, tasks: 0, inbox: 0 },
    skipped: { cases: 0, tasks: 0, inbox: 0 }, errors: [error instanceof Error ? error.message : String(error)], completedAt: Date.now()
  }))
  return migrationPromise
}

function sourceBucket(sourceType: LegacySourceType): keyof LegacyRollbackReport['removed'] {
  return sourceType === 'case' ? 'cases' : sourceType === 'task' ? 'tasks' : 'inbox'
}

function isUnchangedMigrationTarget(item: { revision: number; updatedAt: number }, mapping: LegacyEntityMapping): boolean {
  return item.revision === 1 && item.updatedAt === mapping.sourceUpdatedAt
}

/**
 * 安全回滚迁移产物：只删除 revision=1 且时间戳仍与源记录一致的对象。
 * 任何被用户修改过的对象都会保留，映射也会保留，避免旧数据重新形成双事实源。
 */
export async function rollbackLegacyMigration(): Promise<LegacyRollbackReport> {
  await ensureLegacyMigration()
  const report: LegacyRollbackReport = {
    removed: { cases: 0, tasks: 0, inbox: 0 },
    preserved: { cases: 0, tasks: 0, inbox: 0 },
    missing: { cases: 0, tasks: 0, inbox: 0 },
    errors: [], completedAt: Date.now()
  }
  for (const mapping of await mappings.list()) {
    const bucket = sourceBucket(mapping.sourceType)
    try {
      const current = mapping.targetType === 'matter'
        ? await matterAsyncRepository.find(mapping.targetId)
        : mapping.targetType === 'action'
          ? await actionAsyncRepository.find(mapping.targetId)
          : await captureAsyncRepository.find(mapping.targetId)
      if (!current) {
        await mappings.remove(mapping.id)
        report.missing[bucket]++
        continue
      }
      if (!isUnchangedMigrationTarget(current, mapping)) {
        report.preserved[bucket]++
        continue
      }
      const removed = mapping.targetType === 'matter'
        ? await matterAsyncRepository.remove(mapping.targetId)
        : mapping.targetType === 'action'
          ? await actionAsyncRepository.remove(mapping.targetId)
          : await captureAsyncRepository.remove(mapping.targetId)
      if (removed) {
        await mappings.remove(mapping.id)
        report.removed[bucket]++
      } else {
        report.missing[bucket]++
      }
    } catch (error) {
      report.errors.push(`${mapping.sourceType}:${mapping.sourceId}:${error instanceof Error ? error.message : String(error)}`)
    }
  }
  report.completedAt = Date.now()
  migrationPromise = undefined
  return report
}
