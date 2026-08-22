import { createAsyncCollectionRepository, createCollectionRepository, createEntityId } from '@/core/repository'
import { todayKey } from '@/core/storage'
import { actionAsyncRepository, actionRepository } from '@/domain/action/repository'
import type { ActionItem } from '@/domain/action/model'
import { matterAsyncRepository, matterRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
import { recordAsyncRepository, recordRepository } from '@/domain/record/repository'
import type { RealityRecord } from '@/domain/record/model'
import { unifiedAsyncRepository, unifiedFactories, unifiedRepository, type Resource, type Seed } from '@/domain/unified'
import { CaptureDomainError, type AiSuggestion, type CaptureItem, type SuggestionCandidate, type SuggestionEntityType } from './model'

const captures = createCollectionRepository<CaptureItem>('calmyCaptures', item => item.calmyId)
const suggestions = createCollectionRepository<AiSuggestion>('calmySuggestions', item => item.calmyId)
const asyncCaptures = createAsyncCollectionRepository<CaptureItem>('calmyCaptures', item => item.calmyId)
const asyncSuggestions = createAsyncCollectionRepository<AiSuggestion>('calmySuggestions', item => item.calmyId)

export const DEFAULT_SUGGESTION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000

export interface SuggestionExpiryOptions {
  now?: number
  maxAgeMs?: number
  expiryMs?: number
  ttlMs?: number
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

function suggestionForCapture(capture: CaptureItem): AiSuggestion {
  const inferred = inferCandidate(capture.body)
  const now = Date.now()
  return {
    calmyId: createEntityId(), captureId: capture.calmyId, sourceText: capture.body, candidates: [inferred.candidate],
    rationale: inferred.rationale, confidence: inferred.confidence, modelVersion: 'local-rules-v1', privacyBoundary: 'local-only',
    status: 'suggested', createdAt: now, updatedAt: now, revision: 1
  }
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

function updateCapture(capture: CaptureItem, patch: Partial<CaptureItem>): CaptureItem {
  const next = { ...capture, ...patch, updatedAt: Date.now(), revision: capture.revision + 1 }
  captures.update(capture.calmyId, () => next)
  return next
}

async function updateCaptureAsync(capture: CaptureItem, patch: Partial<CaptureItem>): Promise<CaptureItem> {
  const next = { ...capture, ...patch, updatedAt: Date.now(), revision: capture.revision + 1 }
  if (!await asyncCaptures.update(capture.calmyId, () => next)) throw new CaptureDomainError('NOT_FOUND', `Capture ${capture.calmyId} disappeared`)
  return next
}

type CaptureAsyncEntity = CaptureItem | AiSuggestion

function isSuggestionEntity(item: CaptureAsyncEntity): item is AiSuggestion {
  return 'captureId' in item
}

function sameCaptureEntity(left: CaptureAsyncEntity, right: CaptureAsyncEntity): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function importAsyncEntity<T extends CaptureAsyncEntity>(
  repository: ReturnType<typeof createAsyncCollectionRepository<T>>,
  item: T,
): Promise<'created' | 'unchanged'> {
  const current = await repository.find(item.calmyId)
  if (current) {
    if (sameCaptureEntity(current, item)) return 'unchanged'
    throw new Error(`Capture entity ${item.calmyId} has local changes`)
  }
  await repository.create(item)
  return 'created'
}

async function replaceAsyncEntity<T extends CaptureAsyncEntity>(
  repository: ReturnType<typeof createAsyncCollectionRepository<T>>,
  item: T,
): Promise<'replaced' | 'unchanged'> {
  const current = await repository.find(item.calmyId)
  if (!current) return (await importAsyncEntity(repository, item)) === 'created' ? 'replaced' : 'unchanged'
  if (sameCaptureEntity(current, item)) return 'unchanged'
  if (!await repository.update(item.calmyId, () => item)) throw new CaptureDomainError('NOT_FOUND', `Capture entity ${item.calmyId} disappeared`)
  return 'replaced'
}

export type AcceptedCaptureEntity = Matter | ActionItem | RealityRecord | Resource | Seed

/**
 * 异步迁移入口：Capture 与 Suggestion 分别从 durable snapshot 读取，并在写入
 * 完成 durable flush 后返回。acceptSuggestion 仍保留在下方同步 API，因为它
 * 会跨领域创建 Matter/Action/Record/Unified 实体；本切片不改变该兼容路径。
 */
export const captureAsyncRepository = {
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
  async create(body: string): Promise<CaptureItem> {
    const now = Date.now()
    const capture: CaptureItem = { calmyId: createEntityId(), body: requiredBody(body), status: 'inbox', suggestionIds: [], createdAt: now, updatedAt: now, revision: 1 }
    return asyncCaptures.create(capture)
  },
  async suggest(captureId: string): Promise<AiSuggestion> {
    const capture = await asyncCaptures.find(captureId)
    if (!capture) throw new CaptureDomainError('NOT_FOUND', `Capture ${captureId} not found`)
    const suggestion = await asyncSuggestions.create(suggestionForCapture(capture))
    await updateCaptureAsync(capture, { status: 'suggested', suggestionIds: [...capture.suggestionIds, suggestion.calmyId] })
    return suggestion
  },
  async rejectSuggestion(suggestionId: string): Promise<AiSuggestion> {
    const current = await asyncSuggestions.find(suggestionId)
    if (!current) throw new CaptureDomainError('NOT_FOUND', `Suggestion ${suggestionId} not found`)
    if (current.status !== 'suggested') throw new CaptureDomainError('INVALID_STATUS', `Suggestion ${suggestionId} is not actionable`)
    const next = { ...current, status: 'rejected' as const, updatedAt: Date.now(), revision: current.revision + 1 }
    if (!await asyncSuggestions.update(suggestionId, () => next)) throw new CaptureDomainError('NOT_FOUND', `Suggestion ${suggestionId} disappeared`)
    const capture = await asyncCaptures.find(current.captureId)
    if (capture) await updateCaptureAsync(capture, { status: 'rejected' })
    return next
  },
  async expireSuggestion(suggestionId: string, nowOrOptions?: number | SuggestionExpiryOptions, positionalMaxAgeMs = DEFAULT_SUGGESTION_EXPIRY_MS): Promise<AiSuggestion> {
    const current = await asyncSuggestions.find(suggestionId)
    if (!current) throw new CaptureDomainError('NOT_FOUND', `Suggestion ${suggestionId} not found`)
    if (current.status !== 'suggested') throw new CaptureDomainError('INVALID_STATUS', `Suggestion ${suggestionId} is not actionable`)
    const { now, maxAgeMs } = resolveSuggestionExpiry(nowOrOptions, positionalMaxAgeMs)
    if (now - current.createdAt < maxAgeMs) return current
    const next = { ...current, status: 'expired' as const, updatedAt: now, revision: current.revision + 1 }
    if (!await asyncSuggestions.update(suggestionId, () => next)) throw new CaptureDomainError('NOT_FOUND', `Suggestion ${suggestionId} disappeared`)
    return next
  },
  async expireSuggestions(nowOrOptions?: number | SuggestionExpiryOptions, positionalMaxAgeMs = DEFAULT_SUGGESTION_EXPIRY_MS): Promise<AiSuggestion[]> {
    const { now, maxAgeMs } = resolveSuggestionExpiry(nowOrOptions, positionalMaxAgeMs)
    const candidates = (await asyncSuggestions.list()).filter(suggestion => suggestion.status === 'suggested' && now - suggestion.createdAt >= maxAgeMs)
    return Promise.all(candidates.map(suggestion => this.expireSuggestion(suggestion.calmyId, { now, maxAgeMs })))
  },
  async acceptSuggestion(suggestionId: string, candidateIndex = 0, overrides: Record<string, string> = {}): Promise<{ suggestion: AiSuggestion; entity: AcceptedCaptureEntity }> {
    const current = await asyncSuggestions.find(suggestionId)
    if (!current) throw new CaptureDomainError('NOT_FOUND', `Suggestion ${suggestionId} not found`)
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
    const next = { ...current, status: Object.keys(overrides).length ? 'modified' as const : 'accepted' as const, acceptedEntityType: candidate.entityType, acceptedEntityId: 'calmyId' in entity ? entity.calmyId : undefined, updatedAt: Date.now(), revision: current.revision + 1 }
    if (!await asyncSuggestions.update(suggestionId, () => next)) throw new CaptureDomainError('NOT_FOUND', `Suggestion ${suggestionId} disappeared`)
    const capture = await asyncCaptures.find(current.captureId)
    if (capture) await updateCaptureAsync(capture, { status: 'accepted' })
    return { suggestion: next, entity }
  },
  async importEntity(item: CaptureAsyncEntity): Promise<'created' | 'unchanged'> {
    return isSuggestionEntity(item) ? importAsyncEntity(asyncSuggestions, item) : importAsyncEntity(asyncCaptures, item)
  },
  async replaceImported(item: CaptureAsyncEntity): Promise<'replaced' | 'unchanged'> {
    return isSuggestionEntity(item) ? replaceAsyncEntity(asyncSuggestions, item) : replaceAsyncEntity(asyncCaptures, item)
  },
  ready: asyncCaptures.ready
}

export const captureRepository = {
  list(): CaptureItem[] { return captures.list().slice().sort((a, b) => b.updatedAt - a.updatedAt) },
  listSuggestions(): AiSuggestion[] { return suggestions.list().slice().sort((a, b) => b.updatedAt - a.updatedAt) },
  find(calmyId: string): CaptureItem | undefined { return captures.find(calmyId) },
  findSuggestion(calmyId: string): AiSuggestion | undefined { return suggestions.find(calmyId) },
  create(body: string): CaptureItem {
    const now = Date.now()
    return captures.create({ calmyId: createEntityId(), body: requiredBody(body), status: 'inbox', suggestionIds: [], createdAt: now, updatedAt: now, revision: 1 })
  },
  suggest(captureId: string): AiSuggestion {
    const capture = captures.find(captureId)
    if (!capture) throw new CaptureDomainError('NOT_FOUND', `Capture ${captureId} not found`)
    const suggestion = suggestions.create(suggestionForCapture(capture))
    updateCapture(capture, { status: 'suggested', suggestionIds: [...capture.suggestionIds, suggestion.calmyId] })
    return suggestion
  },
  rejectSuggestion(suggestionId: string): AiSuggestion {
    const current = suggestions.find(suggestionId)
    if (!current) throw new CaptureDomainError('NOT_FOUND', `Suggestion ${suggestionId} not found`)
    if (current.status !== 'suggested') throw new CaptureDomainError('INVALID_STATUS', `Suggestion ${suggestionId} is not actionable`)
    const next = { ...current, status: 'rejected' as const, updatedAt: Date.now(), revision: current.revision + 1 }
    suggestions.update(suggestionId, () => next)
    const capture = captures.find(current.captureId)
    if (capture) updateCapture(capture, { status: 'rejected' })
    return next
  },
  expireSuggestion(suggestionId: string, nowOrOptions?: number | SuggestionExpiryOptions, positionalMaxAgeMs = DEFAULT_SUGGESTION_EXPIRY_MS): AiSuggestion {
    const current = suggestions.find(suggestionId)
    if (!current) throw new CaptureDomainError('NOT_FOUND', `Suggestion ${suggestionId} not found`)
    if (current.status !== 'suggested') throw new CaptureDomainError('INVALID_STATUS', `Suggestion ${suggestionId} is not actionable`)
    const { now, maxAgeMs } = resolveSuggestionExpiry(nowOrOptions, positionalMaxAgeMs)
    if (now - current.createdAt < maxAgeMs) return current
    const next = { ...current, status: 'expired' as const, updatedAt: now, revision: current.revision + 1 }
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
    const next = { ...current, status: Object.keys(overrides).length ? 'modified' as const : 'accepted' as const, acceptedEntityType: candidate.entityType, acceptedEntityId: 'calmyId' in entity ? entity.calmyId : undefined, updatedAt: Date.now(), revision: current.revision + 1 }
    suggestions.update(suggestionId, () => next)
    const capture = captures.find(current.captureId)
    if (capture) updateCapture(capture, { status: 'accepted' })
    return { suggestion: next, entity }
  }
}

export function isSuggestionEntityType(value: string): value is SuggestionEntityType {
  return ['matter', 'action', 'record', 'resource', 'seed'].includes(value)
}
