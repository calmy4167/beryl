import { beforeEach, describe, expect, it } from 'vitest'
import { captureRepository } from '@/domain/capture'
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
})
