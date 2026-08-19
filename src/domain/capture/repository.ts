import { createCollectionRepository, createEntityId } from '@/core/repository'
import { todayKey } from '@/core/storage'
import { actionRepository } from '@/domain/action/repository'
import type { ActionItem } from '@/domain/action/model'
import { matterRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
import { recordRepository } from '@/domain/record/repository'
import type { RealityRecord } from '@/domain/record/model'
import { unifiedFactories, unifiedRepository, type Resource, type Seed } from '@/domain/unified'
import { CaptureDomainError, type AiSuggestion, type CaptureItem, type SuggestionCandidate, type SuggestionEntityType } from './model'

const captures = createCollectionRepository<CaptureItem>('calmyCaptures', item => item.calmyId)
const suggestions = createCollectionRepository<AiSuggestion>('calmySuggestions', item => item.calmyId)

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

function updateCapture(capture: CaptureItem, patch: Partial<CaptureItem>): CaptureItem {
  const next = { ...capture, ...patch, updatedAt: Date.now(), revision: capture.revision + 1 }
  captures.update(capture.calmyId, () => next)
  return next
}

export type AcceptedCaptureEntity = Matter | ActionItem | RealityRecord | Resource | Seed

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
