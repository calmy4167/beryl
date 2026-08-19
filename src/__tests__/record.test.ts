import { beforeEach, describe, expect, it } from 'vitest'
import { RecordDomainError } from '@/domain/record/model'
import { recordRepository } from '@/domain/record/repository'

describe('recordRepository', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stores a reality fact with occurredAt separate from createdAt', () => {
    const occurredAt = Date.now() - 60_000
    const record = recordRepository.create({ body: '昨晚学习 40 分钟', occurredAt })

    expect(record.type).toBe('fact')
    expect(record.occurredAt).toBe(occurredAt)
    expect(record.createdAt).toBeGreaterThanOrEqual(occurredAt)
    expect(recordRepository.revisions(record.calmyId)).toHaveLength(1)
  })

  it('requires evidence for AI observations', () => {
    expect(() => recordRepository.create({ type: 'observation', source: 'ai', body: '可能睡眠影响学习' })).toThrowError(RecordDomainError)
    expect(recordRepository.list()).toHaveLength(0)
  })

  it('preserves revisions when a fact is corrected', () => {
    const record = recordRepository.create({ body: '学习 20 分钟' })
    const revised = recordRepository.revise(record.calmyId, '学习 40 分钟', '补充真实用时', 'user', 1)

    expect(revised.body).toBe('学习 40 分钟')
    expect(revised.revision).toBe(2)
    expect(recordRepository.revisions(record.calmyId).map(item => item.body)).toEqual(['学习 20 分钟', '学习 40 分钟'])
  })

  it('rejects stale corrections instead of overwriting a newer revision', () => {
    const record = recordRepository.create({ body: '原始记录' })
    recordRepository.revise(record.calmyId, '第一次修订', '修正', 'user', 1)

    expect(() => recordRepository.revise(record.calmyId, '过期修订', '过期', 'user', 1)).toThrowError(/revision/)
    expect(recordRepository.find(record.calmyId)?.body).toBe('第一次修订')
  })

  it('redacts content without deleting the record identity or history', () => {
    const record = recordRepository.create({ body: '包含隐私的现实记录' })
    const redacted = recordRepository.redact(record.calmyId, '用户要求隐藏', 1)

    expect(redacted.body).toBe('[已隐藏]')
    expect(redacted.redactedAt).toBeTruthy()
    expect(recordRepository.find(record.calmyId)?.calmyId).toBe(record.calmyId)
    expect(recordRepository.revisions(record.calmyId)).toHaveLength(2)
  })
})
