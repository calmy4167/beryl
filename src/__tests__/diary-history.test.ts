import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setActiveAccount } from '@/core/account-context'
import { resetStoreCache } from '@/core/storage'
import { exportOpenWorkspace, importOpenWorkspace, openEntityType } from '@/core/content/open-format'
import { diaryRepository } from '@/domain/diary/repository'
import { listRealityActivityAsync } from '@/domain/social/collaboration'
import { localEntitySnapshot, supportsEntitySyncRecord } from '@/core/entity-sync'
import type { DiaryEntry } from '@/domain/diary/model'

describe('Diary append-only revision history', () => {
  beforeEach(() => { setActiveAccount('diary-history-test-user'); localStorage.clear(); resetStoreCache() })
  afterEach(() => setActiveAccount(null))

  it('retains immutable content and ownership snapshots and exposes them as read-only activity', async () => {
    const date = '2026-10-01'
    const initial = await diaryRepository.createVersioned({
      date, content: '复诊之前。', revision: 1,
      ownership: { ownerRef: { type: 'user', id: 'writer' }, stewardRefs: [], privacy: 'private' }
    }, 'writer')
    const second = await diaryRepository.updateVersioned(date, { content: '复诊之后。' }, 'content_updated', initial.revision!, 'writer')
    const final = await diaryRepository.updateVersioned(date, {
      ownership: { ownerRef: { type: 'user', id: 'writer' }, stewardRefs: [], privacy: 'restricted' }
    }, 'ownership_updated', second.revision!, 'writer')

    expect(final.history?.map(item => [item.revision, item.operation, item.content, item.ownership?.privacy])).toEqual([
      [1, 'created', '复诊之前。', 'private'],
      [2, 'content_updated', '复诊之后。', 'private'],
      [3, 'ownership_updated', '复诊之后。', 'restricted']
    ])
    await expect(diaryRepository.updateVersioned(date, { content: '冲突写入' }, 'content_updated', 2)).rejects.toThrow('diary-revision-conflict')

    const activity = await listRealityActivityAsync({ entityType: 'diary_entry', calmyId: date })
    expect(activity.filter(item => item.source === 'diary_revision').map(item => item.toRevision)).toEqual([1, 2, 3])

    const workspace = exportOpenWorkspace({ diaries: [final] })
    const imported = importOpenWorkspace(workspace.files)
    expect(imported.issues).toEqual([])
    expect(imported.entities.find(item => openEntityType(item) === 'diary')).toMatchObject({ date, history: final.history })
    const syncRecord = localEntitySnapshot().find(item => item.entity === 'diary' && item.entityId === date)
    expect(syncRecord?.value).toMatchObject({ history: final.history })
    expect(supportsEntitySyncRecord({ entity: 'diary', entityId: date, updatedAt: 1, device: 'local', value: final })).toBe(true)
  })

  it('does not discard history when legacy snapshots omit the revision field', async () => {
    const legacy: DiaryEntry = { date: '2026-09-30', content: '旧正文。' }
    await diaryRepository.create(legacy)
    const updated = await diaryRepository.updateVersioned(legacy.date, { content: '新正文。' }, 'content_updated', 0)
    expect(updated.history).toHaveLength(1)
    expect(updated.history?.[0]).toMatchObject({ revision: 1, operation: 'content_updated', content: '新正文。' })
  })
})
