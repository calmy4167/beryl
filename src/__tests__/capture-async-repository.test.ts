import { beforeEach, describe, expect, it, vi } from 'vitest'

const durable = vi.hoisted(() => {
  const values = new Map<string, string>()
  const pending = new Set<string>()
  let available = true
  let chain: Promise<void> = Promise.resolve()

  const dbPut = vi.fn((key: string, value: string) => {
    pending.add(key)
    if (!available) return Promise.resolve()
    const next = chain.then(async () => {
      values.set(key, value)
      pending.delete(key)
    })
    chain = next.catch(() => undefined)
    return next
  })

  return {
    values,
    dbPut,
    flushPendingDbWrites: vi.fn(async () => {
      await chain
    }),
    getDbStatus: vi.fn(() => ({
      state: available ? 'ready' : 'degraded',
      available,
      pendingWrites: pending.size,
      restoredKeys: 0,
      lastMirrorAt: null,
      lastError: available ? null : 'indexedDB unavailable'
    })),
    readKvSnapshot: vi.fn(async () => available ? Object.fromEntries(values) : undefined),
    reset() {
      values.clear()
      pending.clear()
      available = true
      chain = Promise.resolve()
      this.dbPut.mockClear()
      this.flushPendingDbWrites.mockClear()
      this.getDbStatus.mockClear()
      this.readKvSnapshot.mockClear()
    },
    setAvailable(next: boolean) {
      available = next
    }
  }
})

vi.mock('../core/db.ts', () => ({
  DEVICE_ID: 'test-device',
  dbDelete: vi.fn(async () => undefined),
  dbPut: durable.dbPut,
  flushPendingDbWrites: durable.flushPendingDbWrites,
  getDbStatus: durable.getDbStatus,
  readKvSnapshot: durable.readKvSnapshot,
  recordEntityChanges: vi.fn(async () => undefined)
}))

import { resetStoreCache } from '../core/storage'
import { captureAsyncRepository } from '../domain/capture/repository'
import type { AiSuggestion, CaptureItem } from '../domain/capture/model'

function capture(calmyId: string, body = '持久化 Capture'): CaptureItem {
  return { calmyId, body, status: 'inbox', suggestionIds: [], createdAt: 1, updatedAt: 1, revision: 1 }
}

function suggestion(calmyId: string, captureId: string): AiSuggestion {
  return {
    calmyId, captureId, sourceText: '完成供应商确认',
    candidates: [{ entityType: 'action', label: 'Action 行动', fields: { title: '完成供应商确认' }, evidence: [] }],
    rationale: '本地规则', confidence: 0.8, modelVersion: 'test', privacyBoundary: 'local-only',
    status: 'suggested', createdAt: 1, updatedAt: 1, revision: 1
  }
}

describe('captureAsyncRepository', () => {
  beforeEach(() => {
    durable.reset()
    localStorage.clear()
    resetStoreCache()
  })

  it('prefers durable captures and suggestions over stale localStorage', async () => {
    localStorage.setItem('b_calmyCaptures', JSON.stringify([capture('stale', '旧缓存')]))
    localStorage.setItem('b_calmySuggestions', JSON.stringify([suggestion('stale-suggestion', 'stale')]))
    durable.values.set('b_calmyCaptures', JSON.stringify([capture('durable', '持久快照')]))
    durable.values.set('b_calmySuggestions', JSON.stringify([suggestion('durable-suggestion', 'durable')]))

    await expect(captureAsyncRepository.list()).resolves.toEqual([capture('durable', '持久快照')])
    await expect(captureAsyncRepository.find('stale')).resolves.toBeUndefined()
    await expect(captureAsyncRepository.listSuggestions()).resolves.toEqual([suggestion('durable-suggestion', 'durable')])
  })

  it('creates, suggests, rejects, and reports durable readiness', async () => {
    const created = await captureAsyncRepository.create('  完成供应商确认邮件  ')
    const proposed = await captureAsyncRepository.suggest(created.calmyId)

    expect(created).toMatchObject({ body: '完成供应商确认邮件', status: 'inbox', revision: 1 })
    expect(proposed).toMatchObject({ status: 'suggested', captureId: created.calmyId, privacyBoundary: 'local-only' })
    await expect(captureAsyncRepository.find(created.calmyId)).resolves.toMatchObject({ status: 'suggested', suggestionIds: [proposed.calmyId] })

    const rejected = await captureAsyncRepository.rejectSuggestion(proposed.calmyId)
    expect(rejected).toMatchObject({ status: 'rejected', revision: 2 })
    await expect(captureAsyncRepository.find(created.calmyId)).resolves.toMatchObject({ status: 'rejected' })
    await expect(captureAsyncRepository.ready()).resolves.toMatchObject({ durable: true, state: 'ready', pendingWrites: 0 })
    expect(durable.values.get('b_calmySuggestions')).toContain('rejected')
  })

  it('covers not-found and invalid-status errors without changing decided suggestions', async () => {
    await expect(captureAsyncRepository.suggest('missing-capture')).rejects.toMatchObject({ code: 'NOT_FOUND' })

    const created = await captureAsyncRepository.create('也许下个月尝试新的节奏')
    const proposed = await captureAsyncRepository.suggest(created.calmyId)
    await captureAsyncRepository.rejectSuggestion(proposed.calmyId)

    await expect(captureAsyncRepository.rejectSuggestion(proposed.calmyId)).rejects.toMatchObject({ code: 'INVALID_STATUS' })
    await expect(captureAsyncRepository.expireSuggestion(proposed.calmyId, { now: proposed.createdAt + 1 })).rejects.toMatchObject({ code: 'INVALID_STATUS' })
  })

  it('keeps the pre-expiry boundary actionable and expires suggestions at the boundary', async () => {
    const first = await captureAsyncRepository.create('以后也许尝试新的节奏')
    const firstSuggestion = await captureAsyncRepository.suggest(first.calmyId)
    const maxAgeMs = 60_000

    await expect(captureAsyncRepository.expireSuggestion(firstSuggestion.calmyId, { now: firstSuggestion.createdAt + maxAgeMs - 1, maxAgeMs }))
      .resolves.toMatchObject({ status: 'suggested', revision: 1 })
    await expect(captureAsyncRepository.expireSuggestion(firstSuggestion.calmyId, { now: firstSuggestion.createdAt + maxAgeMs, maxAgeMs }))
      .resolves.toMatchObject({ status: 'expired', revision: 2 })

    const second = await captureAsyncRepository.create('以后也许学习新的工具')
    const secondSuggestion = await captureAsyncRepository.suggest(second.calmyId)
    const expired = await captureAsyncRepository.expireSuggestions({ now: secondSuggestion.createdAt + maxAgeMs, maxAgeMs })

    expect(expired).toHaveLength(1)
    expect(expired[0]).toMatchObject({ calmyId: secondSuggestion.calmyId, status: 'expired' })
    await expect(captureAsyncRepository.find(second.calmyId)).resolves.toMatchObject({ status: 'suggested' })
  })

  it('imports and replaces Capture and Suggestion entities', async () => {
    const importedCapture = capture('imported-capture')
    const importedSuggestion = suggestion('imported-suggestion', importedCapture.calmyId)

    await expect(captureAsyncRepository.importEntity(importedCapture)).resolves.toBe('created')
    await expect(captureAsyncRepository.importEntity(importedCapture)).resolves.toBe('unchanged')
    await expect(captureAsyncRepository.replaceImported({ ...importedCapture, body: '替换后的 Capture', revision: 2 })).resolves.toBe('replaced')
    await expect(captureAsyncRepository.find(importedCapture.calmyId)).resolves.toMatchObject({ body: '替换后的 Capture', revision: 2 })

    await expect(captureAsyncRepository.importEntity(importedSuggestion)).resolves.toBe('created')
    await expect(captureAsyncRepository.replaceImported({ ...importedSuggestion, status: 'expired', revision: 2 })).resolves.toBe('replaced')
    await expect(captureAsyncRepository.findSuggestion(importedSuggestion.calmyId)).resolves.toMatchObject({ status: 'expired', revision: 2 })
  })

  it('falls back to the synchronous cache when durable storage is unavailable', async () => {
    const created = await captureAsyncRepository.create('离线 Capture')
    durable.setAvailable(false)

    await expect(captureAsyncRepository.find(created.calmyId)).resolves.toMatchObject({ body: '离线 Capture' })
    await expect(captureAsyncRepository.ready()).resolves.toMatchObject({ durable: false, state: 'degraded', available: false })
  })
})
