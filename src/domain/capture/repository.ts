import { createAsyncCollectionRepository, createCollectionRepository, createEntityId } from '@/core/repository'
import { todayKey } from '@/core/storage'
import { readServerSession } from '@/core/auth'
import { actionAsyncRepository, actionRepository } from '@/domain/action/repository'
import type { ActionItem } from '@/domain/action/model'
import { matterAsyncRepository, matterRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
import { recordAsyncRepository, recordRepository } from '@/domain/record/repository'
import type { RealityRecord } from '@/domain/record/model'
import { unifiedAsyncRepository, unifiedFactories, unifiedRepository, type Resource, type Seed } from '@/domain/unified'
import { CaptureDomainError, type AiSuggestion, type CaptureHistoryOperation, type CaptureHistorySource, type CaptureItem, type CaptureStatus, type SuggestionCandidate, type SuggestionEntityType } from './model'

const captures = createCollectionRepository<CaptureItem>('calmyCaptures', item => item.calmyId)
const suggestions = createCollectionRepository<AiSuggestion>('calmySuggestions', item => item.calmyId)
const asyncCaptures = createAsyncCollectionRepository<CaptureItem>('calmyCaptures', item => item.calmyId)
const asyncSuggestions = createAsyncCollectionRepository<AiSuggestion>('calmySuggestions', item => item.calmyId)

interface CaptureCompensation {
  id: string
  captureId: string
  kind: 'remove' | 'restore'
  capture: CaptureItem
  phase: 'started' | 'completed' | 'aborted'
  removalStarted?: boolean
}
const captureCompensations = createCollectionRepository<CaptureCompensation>('captureCompensations')
const asyncCaptureCompensations = createAsyncCollectionRepository<CaptureCompensation>('captureCompensations')
let captureCreateChain: Promise<void> = Promise.resolve()
const captureSourceChains = new Map<string, Promise<void>>()

/** Drain already admitted cross-domain acceptance before an undo acquires its guard. */
function withCaptureSourceExclusion<T>(captureId: string, work: () => Promise<T>): Promise<T> {
  const previous = captureSourceChains.get(captureId) || Promise.resolve()
  const next = previous.then(work, work)
  const settled = next.then(() => undefined, () => undefined)
  captureSourceChains.set(captureId, settled)
  void settled.then(() => { if (captureSourceChains.get(captureId) === settled) captureSourceChains.delete(captureId) })
  return next
}

/** Application decisions share undo's source queue for their entire target sequence. */
export function withCaptureDecisionExclusion<T>(captureId: string, work: () => Promise<T>): Promise<T> {
  return withCaptureSourceExclusion(captureId, async () => {
    assertCaptureWritable(captureId)
    if (!await asyncCaptures.find(captureId)) throw new CaptureDomainError('NOT_FOUND', `Capture ${captureId} not found`)
    assertCaptureWritable(captureId)
    return work()
  })
}

function assertCaptureWritable(captureId: string, compensationId?: string): void {
  const active = captureCompensations.list().find(item => item.captureId === captureId && item.phase === 'started')
  if (active && active.id !== compensationId) throw new CaptureDomainError('REVISION_CONFLICT', 'Capture undo is pending; retry it before making changes')
}

function captureMutationGuard(captureId: string, compensationId?: string): () => void {
  const fingerprint = () => JSON.stringify(captureCompensations.list().filter(item => item.captureId === captureId && item.id !== compensationId).map(item => [item.id, item.phase]))
  assertCaptureWritable(captureId, compensationId)
  const admitted = fingerprint()
  return () => {
    assertCaptureWritable(captureId, compensationId)
    if (fingerprint() !== admitted) throw new CaptureDomainError('REVISION_CONFLICT', 'Capture undo changed while this write was queued; refresh before retrying')
  }
}

export const DEFAULT_SUGGESTION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000

export interface SuggestionExpiryOptions {
  now?: number
  maxAgeMs?: number
  expiryMs?: number
  ttlMs?: number
}

type CaptureAsyncEntity = CaptureItem | AiSuggestion

function captureSnapshot(entity: CaptureAsyncEntity): Record<string, unknown> {
  const { history: _history, ...snapshot } = entity
  return JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>
}

function withCaptureHistory<T extends CaptureAsyncEntity>(
  entity: T,
  operation: CaptureHistoryOperation,
  source: CaptureHistorySource,
  occurredAt: number,
  previous?: T,
  sourceIds: string[] = [],
): T {
  const actorUserId = source === 'user' ? readServerSession()?.user.id || 'local-user' : undefined
  const previousSnapshot = previous ? captureSnapshot(previous) : undefined
  const entry = {
    revision: entity.revision, operation, source, ...(actorUserId ? { actorUserId } : {}), sourceIds: [...sourceIds],
    occurredAt, fromRevision: previous?.revision || 0, toRevision: entity.revision,
    ...(previousSnapshot ? { previousSnapshot } : {}), snapshot: captureSnapshot(entity)
  }
  return { ...entity, history: [...(entity.history || []), entry] } as T
}

function requiredBody(body: string): string {
  const value = body.trim()
  if (!value) throw new CaptureDomainError('VALIDATION_FAILED', 'Capture body is required')
  return value
}

function firstLine(body: string): string { return body.split(/\r?\n/, 1)[0].trim().slice(0, 120) }

function inferCandidate(body: string): { candidate: SuggestionCandidate; rationale: string; confidence: number } {
  const title = firstLine(body)
  const url = body.match(/https?:\/\/\S+/)?.[0]
  if (url) return {
    candidate: { entityType: 'resource', label: 'Resource 资料', fields: { title, body, uri: url, kind: 'reference' }, evidence: ['文本包含 URL'] },
    rationale: '检测到 URL，先作为可复用资料候选，不直接写入 Library。', confidence: 0.86
  }
  if (/^(要|需要|完成|联系|发|整理|准备|实现|修复|预约|确认)/.test(title)) return {
    candidate: { entityType: 'action', label: 'Action 行动', fields: { title, date: todayKey() }, evidence: ['句首使用行动动词'] },
    rationale: '句子以行动动词开头，适合作为今天或之后可执行的最小行动。', confidence: 0.82
  }
  if (/(也许|可能|想法|以后|值得试|种子)/.test(body)) return {
    candidate: { entityType: 'seed', label: 'Seed 种子', fields: { title, body }, evidence: ['文本包含可能性或未来探索表达'] },
    rationale: '内容表达了尚未成熟的可能性，先保留为 Seed，避免过早变成目标。', confidence: 0.78
  }
  if (/(课题|问题|正在面对|矛盾|matter)/i.test(body)) return {
    candidate: { entityType: 'matter', label: 'Matter 现实事项', fields: { title, why: body }, evidence: ['文本包含现实问题或矛盾表达'] },
    rationale: '内容更像需要持续理解和推进的现实事项。', confidence: 0.7
  }
  return {
    candidate: { entityType: 'record', label: 'Record 现实记录', fields: { body }, evidence: ['未检测到足够结构，保留原文作为事实记录'] },
    rationale: '没有足够依据安全推断为其他实体，默认保留为 Record。', confidence: 0.6
  }
}

function suggestionForCapture(capture: CaptureItem, suggestionId?: string): AiSuggestion {
  const inferred = inferCandidate(capture.body)
  const now = Date.now()
  const suggestion: AiSuggestion = {
    calmyId: suggestionId || createEntityId(), captureId: capture.calmyId, sourceText: capture.body, candidates: [inferred.candidate],
    rationale: inferred.rationale, confidence: inferred.confidence, modelVersion: 'local-rules-v1', privacyBoundary: 'local-only',
    status: 'suggested', createdAt: now, updatedAt: now, revision: 1
  }
  return withCaptureHistory(suggestion, 'created', 'ai_assisted', now, undefined, [capture.calmyId])
}

function resolveSuggestionExpiry(
  nowOrOptions?: number | SuggestionExpiryOptions,
  positionalMaxAgeMs = DEFAULT_SUGGESTION_EXPIRY_MS,
): { now: number; maxAgeMs: number } {
  const options = typeof nowOrOptions === 'number' ? { now: nowOrOptions } : (nowOrOptions || {})
  const now = options.now ?? Date.now()
  const maxAgeMs = options.maxAgeMs ?? options.expiryMs ?? options.ttlMs ?? positionalMaxAgeMs
  if (!Number.isFinite(now)) throw new CaptureDomainError('VALIDATION_FAILED', 'Suggestion expiry now must be finite')
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) throw new CaptureDomainError('VALIDATION_FAILED', 'Suggestion expiry must be a non-negative finite duration')
  return { now, maxAgeMs }
}

function updateCapture(capture: CaptureItem, patch: Partial<CaptureItem>, operation: CaptureHistoryOperation = 'updated', source: CaptureHistorySource = 'user', sourceIds: string[] = []): CaptureItem {
  assertCaptureWritable(capture.calmyId)
  const occurredAt = Date.now()
  const next = withCaptureHistory({ ...capture, ...patch, updatedAt: occurredAt, revision: capture.revision + 1 }, operation, source, occurredAt, capture, sourceIds)
  captures.update(capture.calmyId, () => next)
  return next
}

async function updateCaptureAsync(capture: CaptureItem, patch: Partial<CaptureItem>, operation: CaptureHistoryOperation = 'updated', source: CaptureHistorySource = 'user', sourceIds: string[] = [], compensationId?: string): Promise<CaptureItem> {
  const beforeWrite = captureMutationGuard(capture.calmyId, compensationId)
  const occurredAt = Date.now()
  const next = withCaptureHistory({ ...capture, ...patch, updatedAt: occurredAt, revision: capture.revision + 1 }, operation, source, occurredAt, capture, sourceIds)
  if (!await asyncCaptures.update(capture.calmyId, current => {
    beforeWrite()
    if (current.revision !== capture.revision) throw new CaptureDomainError('REVISION_CONFLICT', `Capture ${capture.calmyId} has changed`)
    return next
  })) throw new CaptureDomainError('NOT_FOUND', `Capture ${capture.calmyId} disappeared`)
  return next
}

function updateSuggestion(suggestion: AiSuggestion, patch: Partial<AiSuggestion>, operation: CaptureHistoryOperation, source: CaptureHistorySource): AiSuggestion {
  assertCaptureWritable(suggestion.captureId)
  const occurredAt = Date.now()
  return withCaptureHistory({ ...suggestion, ...patch, updatedAt: occurredAt, revision: suggestion.revision + 1 }, operation, source, occurredAt, suggestion, [suggestion.captureId])
}

function isSuggestionEntity(item: CaptureAsyncEntity): item is AiSuggestion {
  return 'captureId' in item
}

function sameCaptureEntity(left: CaptureAsyncEntity, right: CaptureAsyncEntity): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function samePortableCapture(left: CaptureItem, right: CaptureItem): boolean {
  return JSON.stringify({ ...left, suggestionIds: [] }) === JSON.stringify({ ...right, suggestionIds: [] })
}

async function importAsyncEntity<T extends CaptureAsyncEntity>(
  repository: ReturnType<typeof createAsyncCollectionRepository<T>>,
  item: T,
  beforeWrite = captureMutationGuard(isSuggestionEntity(item) ? item.captureId : item.calmyId),
): Promise<'created' | 'unchanged'> {
  const current = await repository.find(item.calmyId)
  if (current) {
    if (sameCaptureEntity(current, item)) return 'unchanged'
    throw new Error(`Capture entity ${item.calmyId} has local changes`)
  }
  await repository.create(item, { beforeWrite })
  return 'created'
}

async function replaceAsyncEntity<T extends CaptureAsyncEntity>(
  repository: ReturnType<typeof createAsyncCollectionRepository<T>>,
  item: T,
  beforeWrite = captureMutationGuard(isSuggestionEntity(item) ? item.captureId : item.calmyId),
): Promise<'replaced' | 'unchanged'> {
  const current = await repository.find(item.calmyId)
  if (!current) return (await importAsyncEntity(repository, item, beforeWrite)) === 'created' ? 'replaced' : 'unchanged'
  if (sameCaptureEntity(current, item)) return 'unchanged'
  if (!await repository.update(item.calmyId, () => {
    beforeWrite()
    return item
  })) throw new CaptureDomainError('NOT_FOUND', `Capture entity ${item.calmyId} disappeared`)
  return 'replaced'
}

export type AcceptedCaptureEntity = Matter | ActionItem | RealityRecord | Resource | Seed

/**
 * 异步迁移入口：Capture 与 Suggestion 分别从 durable snapshot 读取，并在写入
 * 完成 durable flush 后返回。acceptSuggestion 仍保留在下方同步 API，因为它
 * 会跨领域创建 Matter/Action/Record/Unified 实体；本切片不改变该兼容路径。
 */
export const captureAsyncRepository = {
  assertWritable: assertCaptureWritable,
  async list(): Promise<CaptureItem[]> {
    return (await asyncCaptures.list()).slice().sort((a, b) => b.updatedAt - a.updatedAt)
  },
  async listSuggestions(): Promise<AiSuggestion[]> {
    return (await asyncSuggestions.list()).slice().sort((a, b) => b.updatedAt - a.updatedAt)
  },
  async find(calmyId: string): Promise<CaptureItem | undefined> {
    return asyncCaptures.find(calmyId)
  },
  async findSuggestion(calmyId: string): Promise<AiSuggestion | undefined> {
    return asyncSuggestions.find(calmyId)
  },
  async history(calmyId: string) { return (await asyncCaptures.find(calmyId))?.history || [] },
  async suggestionHistory(calmyId: string) { return (await asyncSuggestions.find(calmyId))?.history || [] },
  async remove(calmyId: string): Promise<boolean> {
    return asyncCaptures.remove(calmyId, captureMutationGuard(calmyId))
  },
  /** Keep a durable snapshot/lock until every cross-collection undo step finishes. */
  async beginDesktopUndo(calmyId: string, expectedRevision: number, commandId: string, kind: CaptureCompensation['kind']): Promise<CaptureItem> {
    return withCaptureSourceExclusion(calmyId, async () => {
      const existing = await asyncCaptureCompensations.find(commandId)
      if (existing && existing.phase !== 'aborted') {
        if (existing.captureId !== calmyId || existing.capture.revision !== expectedRevision || existing.kind !== kind) throw new Error('capture-compensation-command-conflict')
        return existing.capture
      }
      assertCaptureWritable(calmyId)
      const capture = await asyncCaptures.find(calmyId)
      if (!capture || capture.revision !== expectedRevision) throw new CaptureDomainError('REVISION_CONFLICT', 'Capture has changed; refresh before undoing')
      const compensation: CaptureCompensation = { id: commandId, captureId: calmyId, kind, capture, phase: 'started' }
      if (existing) await asyncCaptureCompensations.update(commandId, () => compensation)
      else await asyncCaptureCompensations.create(compensation)
      const guarded = await asyncCaptures.find(calmyId)
      if (!guarded || JSON.stringify(guarded) !== JSON.stringify(capture)) throw new CaptureDomainError('REVISION_CONFLICT', 'Capture changed while acquiring its undo guard')
      return capture
    })
  },
  async validateDesktopUndo(calmyId: string, expected: CaptureItem, commandId: string): Promise<void> {
    assertCaptureWritable(calmyId, commandId)
    const current = await asyncCaptures.find(calmyId)
    const compensation = await asyncCaptureCompensations.find(commandId)
    if (!current && compensation?.kind === 'remove' && compensation.removalStarted) return
    if (!current || JSON.stringify(current) !== JSON.stringify(expected)) throw new CaptureDomainError('REVISION_CONFLICT', 'Capture has changed; refresh before undoing')
  },
  async abortDesktopUndo(commandId: string): Promise<boolean> {
    const compensation = await asyncCaptureCompensations.find(commandId)
    if (!compensation || compensation.phase === 'aborted') return true
    if (compensation.phase !== 'started') return false
    const current = await asyncCaptures.find(compensation.captureId)
    if (!current || current.history?.some(entry => entry.sourceIds.includes(commandId))) return false
    if (!await asyncCaptureCompensations.update(commandId, item => ({ ...item, phase: 'aborted' }))) throw new Error('capture-compensation-command-missing')
    return true
  },
  async finishDesktopUndo(commandId: string): Promise<void> {
    if (!await asyncCaptureCompensations.update(commandId, item => ({ ...item, phase: 'completed' }))) throw new Error('capture-compensation-command-missing')
  },
  async removeDesktopCreated(calmyId: string, expectedRevision: number, commandId: string): Promise<void> {
    const original = await this.beginDesktopUndo(calmyId, expectedRevision, commandId, 'remove')
    const current = await asyncCaptures.find(calmyId)
    if (current && (current.revision !== original.revision || current.body !== original.body)) throw new CaptureDomainError('REVISION_CONFLICT', 'Capture has changed; refresh before undoing')
    if (!await asyncCaptureCompensations.update(commandId, item => ({ ...item, removalStarted: true }))) throw new Error('capture-compensation-command-missing')
    if (current && !await asyncCaptures.remove(calmyId, captureMutationGuard(calmyId, commandId))) throw new Error('capture-undo-remove-failed')
    const suggestionIds = new Set([...original.suggestionIds, ...(await asyncSuggestions.list()).filter(item => item.captureId === calmyId).map(item => item.calmyId)])
    for (const suggestionId of suggestionIds) {
      const suggestion = await asyncSuggestions.find(suggestionId)
      if (suggestion && !await asyncSuggestions.remove(suggestionId, captureMutationGuard(calmyId, commandId))) throw new Error('capture-undo-suggestion-remove-failed')
    }
  },
  async restoreInbox(calmyId: string, expectedRevision: number, commandId?: string): Promise<CaptureItem> {
    const current = await asyncCaptures.find(calmyId)
    if (!current) throw new CaptureDomainError('NOT_FOUND', `Capture ${calmyId} not found`)
    if (commandId && current.status === 'inbox' && current.revision === expectedRevision + 1 && current.history?.some(entry => entry.sourceIds.includes(commandId))) return current
    if (current.revision !== expectedRevision) throw new CaptureDomainError('REVISION_CONFLICT', 'Capture has changed; refresh before undoing')
    return updateCaptureAsync(current, { status: 'inbox' }, 'updated', 'system', commandId ? [commandId] : [], commandId)
  },
  async resolve(calmyId: string, status: Extract<CaptureStatus, 'accepted' | 'archived'>, expectedRevision?: number, sourceIds: string[] = []): Promise<CaptureItem> {
    const current = await asyncCaptures.find(calmyId)
    if (!current) throw new CaptureDomainError('NOT_FOUND', `Capture ${calmyId} not found`)
    if (expectedRevision !== undefined && expectedRevision !== current.revision) throw new CaptureDomainError('REVISION_CONFLICT', `Capture ${calmyId} has changed; refresh before deciding`)
    return updateCaptureAsync(current, { status }, status === 'accepted' ? 'accepted' : 'updated', 'user', sourceIds)
  },
  async create(body: string, sourceMaterialIds: string[] = [], options: { captureId?: string } = {}): Promise<CaptureItem> {
    const normalized = requiredBody(body)
    const calmyId = options.captureId || createEntityId()
    const beforeWrite = captureMutationGuard(calmyId)
    const work = async () => {
      const existing = options.captureId ? await asyncCaptures.find(calmyId) : undefined
      if (existing) {
        if (existing.body !== normalized) throw new Error('capture-create-command-conflict')
        return existing
      }
      const now = Date.now()
      const materialIds = [...new Set(sourceMaterialIds.filter(id => typeof id === 'string' && id.trim()))]
      const capture = withCaptureHistory({ calmyId, body: normalized, ...(materialIds.length ? { sourceMaterialIds: materialIds } : {}), status: 'inbox', suggestionIds: [], createdAt: now, updatedAt: now, revision: 1 }, 'created', 'user', now, undefined, materialIds)
      return asyncCaptures.create(capture, {
        beforeWrite,
        ...(options.captureId ? { reuseExisting: (current: CaptureItem) => {
          if (current.body !== normalized) throw new Error('capture-create-command-conflict')
          return current
        } } : {}),
      })
    }
    const next = captureCreateChain.then(work, work)
    captureCreateChain = next.then(() => undefined, () => undefined)
    return next
  },
  async suggest(captureId: string, options: { suggestionId?: string } = {}): Promise<AiSuggestion> {
    const guard = captureMutationGuard(captureId)
    const capture = await asyncCaptures.find(captureId)
    if (!capture) throw new CaptureDomainError('NOT_FOUND', `Capture ${captureId} not found`)
    const existing = options.suggestionId ? await asyncSuggestions.find(options.suggestionId) : undefined
    if (existing && (existing.captureId !== captureId || existing.sourceText !== capture.body)) throw new Error('capture-suggestion-command-conflict')
    const suggestion = existing || await asyncSuggestions.create(suggestionForCapture(capture, options.suggestionId), {
      beforeWrite: () => {
        guard()
        const source = captures.find(captureId)
        if (!source || source.body !== capture.body) throw new CaptureDomainError('REVISION_CONFLICT', 'Suggestion source changed before its write')
      },
      ...(options.suggestionId ? { reuseExisting: (current: AiSuggestion) => {
        if (current.captureId !== captureId || current.sourceText !== capture.body) throw new Error('capture-suggestion-command-conflict')
        return current
      } } : {}),
    })
    if (capture.suggestionIds.includes(suggestion.calmyId)) return suggestion
    const current = await asyncCaptures.find(captureId)
    if (!current) throw new CaptureDomainError('NOT_FOUND', `Capture ${captureId} not found`)
    if (current.suggestionIds.includes(suggestion.calmyId)) return suggestion
    // A background suggestion must not change a Capture already decided by Enter.
    if (current.status !== 'inbox' && current.status !== 'suggested') return suggestion
    guard()
    await updateCaptureAsync(current, { status: 'suggested', suggestionIds: [...current.suggestionIds, suggestion.calmyId] }, 'suggested', 'ai_assisted', [suggestion.calmyId])
    return suggestion
  },
  async rejectSuggestion(suggestionId: string): Promise<AiSuggestion> {
    const current = await asyncSuggestions.find(suggestionId)
    if (!current) throw new CaptureDomainError('NOT_FOUND', `Suggestion ${suggestionId} not found`)
    const beforeWrite = captureMutationGuard(current.captureId)
    if (current.status !== 'suggested') throw new CaptureDomainError('INVALID_STATUS', `Suggestion ${suggestionId} is not actionable`)
    const next = updateSuggestion(current, { status: 'rejected' }, 'rejected', 'user')
    if (!await asyncSuggestions.update(suggestionId, () => {
      beforeWrite()
      return next
    })) throw new CaptureDomainError('NOT_FOUND', `Suggestion ${suggestionId} disappeared`)
    const capture = await asyncCaptures.find(current.captureId)
    if (capture) await updateCaptureAsync(capture, { status: 'rejected' }, 'rejected', 'user', [suggestionId])
    return next
  },
  async expireSuggestion(suggestionId: string, nowOrOptions?: number | SuggestionExpiryOptions, positionalMaxAgeMs = DEFAULT_SUGGESTION_EXPIRY_MS): Promise<AiSuggestion> {
    const current = await asyncSuggestions.find(suggestionId)
    if (!current) throw new CaptureDomainError('NOT_FOUND', `Suggestion ${suggestionId} not found`)
    const beforeWrite = captureMutationGuard(current.captureId)
    if (current.status !== 'suggested') throw new CaptureDomainError('INVALID_STATUS', `Suggestion ${suggestionId} is not actionable`)
    const { now, maxAgeMs } = resolveSuggestionExpiry(nowOrOptions, positionalMaxAgeMs)
    if (now - current.createdAt < maxAgeMs) return current
    const next = withCaptureHistory({ ...current, status: 'expired' as const, updatedAt: now, revision: current.revision + 1 }, 'expired', 'system', now, current, [current.captureId])
    if (!await asyncSuggestions.update(suggestionId, () => {
      beforeWrite()
      return next
    })) throw new CaptureDomainError('NOT_FOUND', `Suggestion ${suggestionId} disappeared`)
    return next
  },
  async expireSuggestions(nowOrOptions?: number | SuggestionExpiryOptions, positionalMaxAgeMs = DEFAULT_SUGGESTION_EXPIRY_MS): Promise<AiSuggestion[]> {
    const { now, maxAgeMs } = resolveSuggestionExpiry(nowOrOptions, positionalMaxAgeMs)
    const candidates = (await asyncSuggestions.list()).filter(suggestion => suggestion.status === 'suggested' && now - suggestion.createdAt >= maxAgeMs)
    return Promise.all(candidates.map(suggestion => this.expireSuggestion(suggestion.calmyId, { now, maxAgeMs })))
  },
  async acceptSuggestion(suggestionId: string, candidateIndex = 0, overrides: Record<string, string> = {}): Promise<{ suggestion: AiSuggestion; entity: AcceptedCaptureEntity }> {
    const source = await asyncSuggestions.find(suggestionId)
    if (!source) throw new CaptureDomainError('NOT_FOUND', `Suggestion ${suggestionId} not found`)
    return withCaptureSourceExclusion(source.captureId, async () => {
      const current = await asyncSuggestions.find(suggestionId)
      if (!current) throw new CaptureDomainError('NOT_FOUND', `Suggestion ${suggestionId} not found`)
      assertCaptureWritable(current.captureId)
      if (!await asyncCaptures.find(current.captureId)) throw new CaptureDomainError('NOT_FOUND', `Capture ${current.captureId} not found`)
      if (current.status !== 'suggested') throw new CaptureDomainError('INVALID_STATUS', `Suggestion ${suggestionId} is not actionable`)
      const candidate = current.candidates[candidateIndex]
      if (!candidate) throw new CaptureDomainError('VALIDATION_FAILED', 'Suggestion candidate not found')
      const fields = { ...candidate.fields, ...overrides }
      let entity: AcceptedCaptureEntity
      if (candidate.entityType === 'matter') entity = await matterAsyncRepository.create({ title: requiredBody(fields.title || ''), why: fields.why })
      else if (candidate.entityType === 'action') entity = await actionAsyncRepository.create({ title: requiredBody(fields.title || ''), date: fields.date || todayKey() })
      else if (candidate.entityType === 'record') entity = await recordAsyncRepository.create({ body: requiredBody(fields.body || '') })
      else if (candidate.entityType === 'resource') entity = await unifiedAsyncRepository.create(unifiedFactories.resource({ title: requiredBody(fields.title || ''), kind: (fields.kind || 'reference') as Resource['kind'], status: 'active', body: fields.body, uri: fields.uri, assetIds: [], matterIds: [], sourceIds: [], tags: [] }))
      else entity = await unifiedAsyncRepository.create(unifiedFactories.seed({ title: requiredBody(fields.title || ''), body: requiredBody(fields.body || ''), status: 'open', sourceRecordIds: [], targetMatterIds: [], tags: [] }))
      const operation = Object.keys(overrides).length ? 'modified' : 'accepted'
      const next = updateSuggestion(current, { status: operation, acceptedEntityType: candidate.entityType, acceptedEntityId: 'calmyId' in entity ? entity.calmyId : undefined }, operation, 'user')
      if (!await asyncSuggestions.update(suggestionId, () => {
        assertCaptureWritable(current.captureId)
        return next
      })) throw new CaptureDomainError('NOT_FOUND', `Suggestion ${suggestionId} disappeared`)
      const capture = await asyncCaptures.find(current.captureId)
      if (capture) await updateCaptureAsync(capture, { status: 'accepted' }, 'accepted', 'user', [suggestionId])
      return { suggestion: next, entity }
    })
  },
  async importEntity(item: CaptureAsyncEntity): Promise<'created' | 'unchanged'> {
    return isSuggestionEntity(item) ? importAsyncEntity(asyncSuggestions, item) : importAsyncEntity(asyncCaptures, item)
  },
  async importPortableCapture(item: CaptureItem): Promise<'created' | 'unchanged'> {
    const beforeWrite = captureMutationGuard(item.calmyId)
    const current = await asyncCaptures.find(item.calmyId)
    if (current) {
      if (samePortableCapture(current, item)) return 'unchanged'
      throw new Error(`Capture entity ${item.calmyId} has local changes`)
    }
    await asyncCaptures.create({ ...item, suggestionIds: [] }, { beforeWrite })
    return 'created'
  },
  async replaceImported(item: CaptureAsyncEntity): Promise<'replaced' | 'unchanged'> {
    return isSuggestionEntity(item) ? replaceAsyncEntity(asyncSuggestions, item) : replaceAsyncEntity(asyncCaptures, item)
  },
  async replacePortableCapture(item: CaptureItem): Promise<'replaced' | 'unchanged'> {
    const beforeWrite = captureMutationGuard(item.calmyId)
    const current = await asyncCaptures.find(item.calmyId)
    const preserved = { ...item, suggestionIds: current?.suggestionIds ? [...current.suggestionIds] : [] }
    return replaceAsyncEntity(asyncCaptures, preserved, beforeWrite)
  },
  ready: asyncCaptures.ready
}

export const captureRepository = {
  list(): CaptureItem[] { return captures.list().slice().sort((a, b) => b.updatedAt - a.updatedAt) },
  listSuggestions(): AiSuggestion[] { return suggestions.list().slice().sort((a, b) => b.updatedAt - a.updatedAt) },
  find(calmyId: string): CaptureItem | undefined { return captures.find(calmyId) },
  history(calmyId: string) { return captures.find(calmyId)?.history || [] },
  importPortableCapture(item: CaptureItem): 'created' | 'unchanged' {
    assertCaptureWritable(item.calmyId)
    const current = captures.find(item.calmyId)
    if (!current) { captures.create({ ...item, suggestionIds: [] }); return 'created' }
    const comparableCurrent = { ...current, suggestionIds: [] }
    if (JSON.stringify(comparableCurrent) === JSON.stringify({ ...item, suggestionIds: [] })) return 'unchanged'
    throw new Error(`Capture entity ${item.calmyId} has local changes`)
  },
  replacePortableCapture(item: CaptureItem): 'replaced' | 'unchanged' {
    assertCaptureWritable(item.calmyId)
    const current = captures.find(item.calmyId)
    const next = { ...item, suggestionIds: current?.suggestionIds ? [...current.suggestionIds] : [] }
    if (current && JSON.stringify(current) === JSON.stringify(next)) return 'unchanged'
    if (!current) { captures.create(next); return 'replaced' }
    captures.update(item.calmyId, () => next)
    return 'replaced'
  },
  findSuggestion(calmyId: string): AiSuggestion | undefined { return suggestions.find(calmyId) },
  suggestionHistory(calmyId: string) { return suggestions.find(calmyId)?.history || [] },
  create(body: string, sourceMaterialIds: string[] = []): CaptureItem {
    const now = Date.now()
    const materialIds = [...new Set(sourceMaterialIds.filter(id => typeof id === 'string' && id.trim()))]
    const capture = withCaptureHistory({ calmyId: createEntityId(), body: requiredBody(body), ...(materialIds.length ? { sourceMaterialIds: materialIds } : {}), status: 'inbox', suggestionIds: [], createdAt: now, updatedAt: now, revision: 1 }, 'created', 'user', now, undefined, materialIds)
    return captures.create(capture)
  },
  suggest(captureId: string): AiSuggestion {
    assertCaptureWritable(captureId)
    const capture = captures.find(captureId)
    if (!capture) throw new CaptureDomainError('NOT_FOUND', `Capture ${captureId} not found`)
    const suggestion = suggestions.create(suggestionForCapture(capture))
    updateCapture(capture, { status: 'suggested', suggestionIds: [...capture.suggestionIds, suggestion.calmyId] }, 'suggested', 'ai_assisted', [suggestion.calmyId])
    return suggestion
  },
  rejectSuggestion(suggestionId: string): AiSuggestion {
    const current = suggestions.find(suggestionId)
    if (!current) throw new CaptureDomainError('NOT_FOUND', `Suggestion ${suggestionId} not found`)
    if (current.status !== 'suggested') throw new CaptureDomainError('INVALID_STATUS', `Suggestion ${suggestionId} is not actionable`)
    const next = updateSuggestion(current, { status: 'rejected' }, 'rejected', 'user')
    suggestions.update(suggestionId, () => next)
    const capture = captures.find(current.captureId)
    if (capture) updateCapture(capture, { status: 'rejected' }, 'rejected', 'user', [suggestionId])
    return next
  },
  expireSuggestion(suggestionId: string, nowOrOptions?: number | SuggestionExpiryOptions, positionalMaxAgeMs = DEFAULT_SUGGESTION_EXPIRY_MS): AiSuggestion {
    const current = suggestions.find(suggestionId)
    if (!current) throw new CaptureDomainError('NOT_FOUND', `Suggestion ${suggestionId} not found`)
    assertCaptureWritable(current.captureId)
    if (current.status !== 'suggested') throw new CaptureDomainError('INVALID_STATUS', `Suggestion ${suggestionId} is not actionable`)
    const { now, maxAgeMs } = resolveSuggestionExpiry(nowOrOptions, positionalMaxAgeMs)
    if (now - current.createdAt < maxAgeMs) return current
    const next = withCaptureHistory({ ...current, status: 'expired' as const, updatedAt: now, revision: current.revision + 1 }, 'expired', 'system', now, current, [current.captureId])
    suggestions.update(suggestionId, () => next)
    return next
  },
  expireSuggestions(nowOrOptions?: number | SuggestionExpiryOptions, positionalMaxAgeMs = DEFAULT_SUGGESTION_EXPIRY_MS): AiSuggestion[] {
    const { now, maxAgeMs } = resolveSuggestionExpiry(nowOrOptions, positionalMaxAgeMs)
    return suggestions.list()
      .filter(suggestion => suggestion.status === 'suggested' && now - suggestion.createdAt >= maxAgeMs)
      .map(suggestion => this.expireSuggestion(suggestion.calmyId, { now, maxAgeMs }))
  },
  acceptSuggestion(suggestionId: string, candidateIndex = 0, overrides: Record<string, string> = {}): { suggestion: AiSuggestion; entity: AcceptedCaptureEntity } {
    const current = suggestions.find(suggestionId)
    if (!current) throw new CaptureDomainError('NOT_FOUND', `Suggestion ${suggestionId} not found`)
    assertCaptureWritable(current.captureId)
    if (current.status !== 'suggested') throw new CaptureDomainError('INVALID_STATUS', `Suggestion ${suggestionId} is not actionable`)
    const candidate = current.candidates[candidateIndex]
    if (!candidate) throw new CaptureDomainError('VALIDATION_FAILED', 'Suggestion candidate not found')
    const fields = { ...candidate.fields, ...overrides }
    let entity: AcceptedCaptureEntity
    if (candidate.entityType === 'matter') entity = matterRepository.create({ title: requiredBody(fields.title || ''), why: fields.why })
    else if (candidate.entityType === 'action') entity = actionRepository.create({ title: requiredBody(fields.title || ''), date: fields.date || todayKey() })
    else if (candidate.entityType === 'record') entity = recordRepository.create({ body: requiredBody(fields.body || '') })
    else if (candidate.entityType === 'resource') entity = unifiedRepository.create(unifiedFactories.resource({ title: requiredBody(fields.title || ''), kind: (fields.kind || 'reference') as Resource['kind'], status: 'active', body: fields.body, uri: fields.uri, assetIds: [], matterIds: [], sourceIds: [], tags: [] }))
    else entity = unifiedRepository.create(unifiedFactories.seed({ title: requiredBody(fields.title || ''), body: requiredBody(fields.body || ''), status: 'open', sourceRecordIds: [], targetMatterIds: [], tags: [] }))
    const operation = Object.keys(overrides).length ? 'modified' : 'accepted'
    const next = updateSuggestion(current, { status: operation, acceptedEntityType: candidate.entityType, acceptedEntityId: 'calmyId' in entity ? entity.calmyId : undefined }, operation, 'user')
    suggestions.update(suggestionId, () => next)
    const capture = captures.find(current.captureId)
    if (capture) updateCapture(capture, { status: 'accepted' }, 'accepted', 'user', [suggestionId])
    return { suggestion: next, entity }
  }
}

export function isSuggestionEntityType(value: string): value is SuggestionEntityType {
  return ['matter', 'action', 'record', 'resource', 'seed'].includes(value)
}
