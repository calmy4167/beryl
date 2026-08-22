import { beforeEach, describe, expect, it } from 'vitest'
import { captureRepository, DEFAULT_SUGGESTION_EXPIRY_MS } from '@/domain/capture'
import { actionRepository } from '@/domain/action/repository'
import { unifiedRepository } from '@/domain/unified'

describe('Capture and local Suggestion pipeline', () => {
  beforeEach(() => localStorage.clear())

  it('keeps the original text and creates a reviewable local Action suggestion', () => {
    const capture = captureRepository.create('完成供应商确认邮件')
    const suggestion = captureRepository.suggest(capture.calmyId)

    expect(suggestion.status).toBe('suggested')
    expect(suggestion.privacyBoundary).toBe('local-only')
    expect(suggestion.candidates[0]).toMatchObject({ entityType: 'action', fields: { title: '完成供应商确认邮件' } })
    expect(captureRepository.find(capture.calmyId)?.body).toBe('完成供应商确认邮件')
  })

  it('writes a modified Action only after explicit acceptance', () => {
    const capture = captureRepository.create('联系供应商')
    const suggestion = captureRepository.suggest(capture.calmyId)
    const result = captureRepository.acceptSuggestion(suggestion.calmyId, 0, { title: '联系供应商并确认时间' })

    expect(result.suggestion.status).toBe('modified')
    expect(actionRepository.find(result.entity.calmyId)).toMatchObject({ title: '联系供应商并确认时间', status: 'planned' })
    expect(captureRepository.find(capture.calmyId)?.status).toBe('accepted')
  })

  it('rejects a suggestion without writing a fact and preserves the Capture', () => {
    const capture = captureRepository.create('也许下个月尝试新的节奏')
    const suggestion = captureRepository.suggest(capture.calmyId)
    captureRepository.rejectSuggestion(suggestion.calmyId)

    expect(captureRepository.findSuggestion(suggestion.calmyId)?.status).toBe('rejected')
    expect(captureRepository.find(capture.calmyId)).toMatchObject({ body: '也许下个月尝试新的节奏', status: 'rejected' })
    expect(actionRepository.list()).toEqual([])
    expect(unifiedRepository.list('seed')).toEqual([])
  })

  it('rejects empty Capture input and reusing a decided suggestion', () => {
    expect(() => captureRepository.create('   ')).toThrow(/Capture body is required/)
    const capture = captureRepository.create('https://example.com/reference')
    const suggestion = captureRepository.suggest(capture.calmyId)
    captureRepository.acceptSuggestion(suggestion.calmyId)

    expect(() => captureRepository.acceptSuggestion(suggestion.calmyId)).toThrow(/not actionable/)
  })

  it('expires an old suggestion without writing an entity or changing the original Capture', () => {
    const capture = captureRepository.create('以后也许尝试新的节奏')
    const suggestion = captureRepository.suggest(capture.calmyId)
    const now = suggestion.createdAt + DEFAULT_SUGGESTION_EXPIRY_MS

    const expired = captureRepository.expireSuggestion(suggestion.calmyId, { now })

    expect(expired).toMatchObject({ status: 'expired', updatedAt: now, revision: suggestion.revision + 1 })
    expect(captureRepository.findSuggestion(suggestion.calmyId)?.status).toBe('expired')
    expect(captureRepository.find(capture.calmyId)).toMatchObject({ body: '以后也许尝试新的节奏', status: 'suggested' })
    expect(actionRepository.list()).toEqual([])
    expect(unifiedRepository.list('seed')).toEqual([])
  })

  it('keeps a suggestion actionable just before the expiry boundary and expires it at the boundary', () => {
    const capture = captureRepository.create('以后也许学习新的工具')
    const suggestion = captureRepository.suggest(capture.calmyId)
    const maxAgeMs = 60_000

    expect(captureRepository.expireSuggestion(suggestion.calmyId, { now: suggestion.createdAt + maxAgeMs - 1, maxAgeMs }).status).toBe('suggested')
    expect(captureRepository.expireSuggestion(suggestion.calmyId, { now: suggestion.createdAt + maxAgeMs, maxAgeMs }).status).toBe('expired')
  })

  it('rejects invalid expiry inputs and never changes decided suggestions', () => {
    const capture = captureRepository.create('完成一次复盘')
    const suggestion = captureRepository.suggest(capture.calmyId)

    expect(() => captureRepository.expireSuggestion(suggestion.calmyId, { now: Number.NaN })).toThrow(/must be finite/)
    expect(() => captureRepository.expireSuggestion(suggestion.calmyId, { maxAgeMs: -1 })).toThrow(/non-negative/)
    captureRepository.acceptSuggestion(suggestion.calmyId)
    expect(() => captureRepository.expireSuggestion(suggestion.calmyId, { now: suggestion.createdAt + DEFAULT_SUGGESTION_EXPIRY_MS })).toThrow(/not actionable/)
    expect(captureRepository.findSuggestion(suggestion.calmyId)?.status).toBe('accepted')

    const modifiedCapture = captureRepository.create('联系团队')
    const modified = captureRepository.suggest(modifiedCapture.calmyId)
    captureRepository.acceptSuggestion(modified.calmyId, 0, { title: '联系团队并确认时间' })
    expect(() => captureRepository.expireSuggestion(modified.calmyId, { now: modified.createdAt + DEFAULT_SUGGESTION_EXPIRY_MS })).toThrow(/not actionable/)
    expect(captureRepository.findSuggestion(modified.calmyId)?.status).toBe('modified')

    const rejectedCapture = captureRepository.create('也许换个方向')
    const rejected = captureRepository.suggest(rejectedCapture.calmyId)
    captureRepository.rejectSuggestion(rejected.calmyId)
    expect(() => captureRepository.expireSuggestion(rejected.calmyId, { now: rejected.createdAt + DEFAULT_SUGGESTION_EXPIRY_MS })).toThrow(/not actionable/)
    expect(captureRepository.findSuggestion(rejected.calmyId)?.status).toBe('rejected')
  })
})
