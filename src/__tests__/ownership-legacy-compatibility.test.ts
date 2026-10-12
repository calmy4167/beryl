import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setActiveAccount } from '@/core/account-context'
import { resetStoreCache } from '@/core/storage'
import { clearSession, writeServerSession } from '@/core/auth'
import { actionAsyncRepository, actionRepository } from '@/domain/action/repository'
import { matterAsyncRepository, matterRepository } from '@/domain/matter/repository'
import { recordAsyncRepository, recordRepository } from '@/domain/record/repository'
import { financeAsyncRepository } from '@/domain/finance/repository'
import { listRealityActivityAsync } from '@/domain/social/collaboration'
import { listRealityDocumentsAsync } from '@/domain/reality/query'
import type { Ownership } from '@/domain/unified/model'

describe('legacy canonical store ownership compatibility', () => {
  beforeEach(() => { setActiveAccount('ownership-legacy-test-user'); localStorage.clear(); sessionStorage.clear(); resetStoreCache() })
  afterEach(() => { clearSession(); setActiveAccount(null) })

  it('defaults signed-in user-created Actions and Records to the current private User while preserving snapshots', async () => {
    writeServerSession({ token: 'ownership-session', apiOrigin: 'https://api.example.test', expiresAt: Date.now() + 60_000, user: { id: 'current-owner', username: 'current-owner', displayName: 'Current Owner', role: 'user' }, mustChangePassword: false })

    const action = await actionAsyncRepository.create({ title: '联系医院', date: '2026-10-02' })
    const record = await recordAsyncRepository.create({ body: '复诊时间已确认' })
    const explicitOwnership = { ownerRef: { type: 'person' as const, id: 'person-dad' }, subjectRef: { entityType: 'person' as const, calmyId: 'person-dad' }, stewardRefs: [{ type: 'user' as const, id: 'current-owner' }], privacy: 'space' as const }
    const authoredForAnotherOwner = await recordAsyncRepository.create({ body: '为爸爸记录血压', ownership: explicitOwnership })
    const syncAction = actionRepository.create({ title: '同步仓库任务', date: '2026-10-02' })
    const syncRecord = recordRepository.create({ body: '同步仓库事实' })
    const matter = matterRepository.create({ title: '同步仓库处境' })
    const asyncMatter = await matterAsyncRepository.create({ title: '异步仓库处境' })
    const history = await recordAsyncRepository.history(record.calmyId)
    const syncHistory = recordRepository.history(syncRecord.calmyId)

    expect(action.ownership).toEqual({ createdByUserId: 'current-owner', ownerRef: { type: 'user', id: 'current-owner' }, stewardRefs: [], privacy: 'private' })
    expect((await actionAsyncRepository.mutations()).find(item => item.entityId === action.calmyId)).toMatchObject({ operation: 'create', actorId: 'current-owner', patch: expect.objectContaining({ ownership: action.ownership }) })
    expect(record.ownership).toEqual({ createdByUserId: 'current-owner', ownerRef: { type: 'user', id: 'current-owner' }, stewardRefs: [], privacy: 'private' })
    expect(history[0]).toMatchObject({ reason: 'created', actorId: 'current-owner', ownership: record.ownership })
    expect(authoredForAnotherOwner.ownership).toEqual({ ...explicitOwnership, createdByUserId: 'current-owner' })
    expect((await recordAsyncRepository.history(authoredForAnotherOwner.calmyId))[0]?.ownership).toEqual(authoredForAnotherOwner.ownership)
    expect(syncAction.ownership).toEqual(action.ownership)
    expect(syncRecord.ownership).toEqual(record.ownership)
    expect(syncHistory[0]).toMatchObject({ reason: 'created', actorId: 'current-owner', ownership: record.ownership })
    expect(matter.ownership).toEqual(action.ownership)
    expect(asyncMatter.ownership).toEqual(action.ownership)
  })

  it('does not infer ownership for imported legacy Actions or Records, even with a signed-in session', async () => {
    writeServerSession({ token: 'ownership-session', apiOrigin: 'https://api.example.test', expiresAt: Date.now() + 60_000, user: { id: 'current-owner', username: 'current-owner', displayName: 'Current Owner', role: 'user' }, mustChangePassword: false })

    const action = { calmyId: 'legacy-action-without-owner', title: '旧任务', date: '2026-10-02', status: 'planned' as const, createdAt: 1, updatedAt: 1, revision: 1 }
    const record = { calmyId: 'legacy-record-without-owner', type: 'fact' as const, body: '旧事实', occurredAt: 1, createdAt: 1, updatedAt: 1, source: 'import' as const, evidenceIds: [], revision: 1 }
    const matter = { calmyId: 'legacy-matter-without-owner', title: '旧处境', why: '', primaryContradiction: '', status: 'active' as const, currentStage: 'wood' as const, trajectory: 'stable' as const, evidenceIds: [], createdAt: 1, updatedAt: 1, revision: 1 }
    await actionAsyncRepository.importEntity(action)
    await recordAsyncRepository.importEntity(record)
    await matterAsyncRepository.importEntity(matter)

    expect((await actionAsyncRepository.find(action.calmyId))?.ownership).toBeUndefined()
    expect((await recordAsyncRepository.find(record.calmyId))?.ownership).toBeUndefined()
    expect((await matterAsyncRepository.find(matter.calmyId))?.ownership).toBeUndefined()
  })

  it('persists explicit ownership across Matter, Action, and Record updates and projections', async () => {
    const ownership: Ownership = {
      createdByUserId: 'caregiver', ownerRef: { type: 'user', id: 'owner' },
      subjectRef: { entityType: 'person', calmyId: 'person-dad' },
      stewardRefs: [{ type: 'person', id: 'person-mom' }], privacy: 'private'
    }
    const matter = matterRepository.create({ title: '住院安排', ownership })
    const action = actionRepository.create({ title: '联系医院', date: '2026-10-01', matterId: matter.calmyId, ownership })
    const record = recordRepository.create({ body: '复诊时间已确认', matterId: matter.calmyId, ownership })

    matterRepository.update(matter.calmyId, { ownership }, { expectedRevision: matter.revision })
    actionRepository.update(action.calmyId, { ownership }, { expectedRevision: action.revision })
    const revisedRecord = recordRepository.revise(record.calmyId, '复诊时间已确认并短信提醒', '补充提醒')
    const reassignedRecord = await recordAsyncRepository.setOwnership(record.calmyId, { ...ownership, privacy: 'restricted' }, revisedRecord.revision, 'owner')
    const recordHistory = await recordAsyncRepository.history(record.calmyId)
    const documents = await listRealityDocumentsAsync({ types: ['matter', 'action', 'record'] })

    expect(reassignedRecord.ownership).toMatchObject({ ...ownership, privacy: 'restricted' })
    expect(recordHistory.at(-1)).toMatchObject({ ownership: { ...ownership, privacy: 'restricted' }, reason: 'ownership-updated', actorId: 'owner' })
    expect(documents.find(item => item.calmyId === matter.calmyId)?.ownership).toEqual(ownership)
    expect(documents.find(item => item.calmyId === action.calmyId)?.ownership).toEqual(ownership)
    expect(documents.find(item => item.calmyId === record.calmyId)?.ownership).toEqual({ ...ownership, privacy: 'restricted' })
  })

  it('leaves legacy ownership unspecified rather than inferring it from Matter linkage', async () => {
    const matter = matterRepository.create({ title: '旧资料所属事项' })
    const action = actionRepository.create({ title: '旧行动', date: '2026-10-01', matterId: matter.calmyId })
    const record = recordRepository.create({ body: '旧记录', matterId: matter.calmyId })
    const documents = await listRealityDocumentsAsync({ types: ['matter', 'action', 'record'] })
    expect(matter.ownership).toBeUndefined()
    expect(documents.filter(item => [matter.calmyId, action.calmyId, record.calmyId].includes(item.calmyId)).every(item => item.ownership === undefined)).toBe(true)
  })

  it('records Finance ownership revisions and exposes ownership without changing the legacy entity ID', async () => {
    const entry = await financeAsyncRepository.create({ id: 'finance-owned-entry', type: 'expense', amountCents: 16700, category: '医疗', note: '住院费用', date: '2026-10-01' })
    const ownership: Ownership = {
      createdByUserId: 'caregiver-user', ownerRef: { type: 'user', id: 'caregiver-user' },
      subjectRef: { entityType: 'person', calmyId: 'person-dad' },
      stewardRefs: [{ type: 'person', id: 'person-sibling' }], privacy: 'private'
    }

    const revised = await financeAsyncRepository.revise(entry.id, { amountCents: 17200, note: '新增复查费用' }, 1, 'caregiver-user')
    const updated = await financeAsyncRepository.setOwnership(entry.id, ownership, 2, 'caregiver-user')
    const history = await financeAsyncRepository.history(entry.id)
    const activity = await listRealityActivityAsync({ entityType: 'finance_entry', calmyId: entry.id })
    const [document] = await listRealityDocumentsAsync({ types: ['transaction'] })

    expect(revised).toMatchObject({ id: entry.id, revision: 2, amountCents: 17200, updatedByUserId: 'caregiver-user' })
    expect(updated).toMatchObject({ id: entry.id, revision: 3, ownership })
    expect(history).toEqual([
      expect.objectContaining({ operation: 'created', fromRevision: 0, toRevision: 1, snapshot: expect.objectContaining({ id: entry.id, createdAt: expect.any(Number), source: 'finance-page' }) }),
      expect.objectContaining({ operation: 'updated', actorId: 'caregiver-user', fromRevision: 1, toRevision: 2, snapshot: expect.objectContaining({ amountCents: 17200 }), previousSnapshot: expect.objectContaining({ amountCents: 16700 }) }),
      expect.objectContaining({ operation: 'ownership-updated', fromRevision: 2, toRevision: 3, ownership })
    ])
    expect(activity).toEqual(expect.arrayContaining([expect.objectContaining({
      source: 'finance_mutation', entityRef: { entityType: 'finance_entry', calmyId: entry.id },
      operation: 'created', fromRevision: 0, toRevision: 1
    }), expect.objectContaining({ source: 'finance_mutation', operation: 'updated', fromRevision: 1, toRevision: 2 }), expect.objectContaining({
      source: 'finance_mutation', entityRef: { entityType: 'finance_entry', calmyId: entry.id },
      operation: 'ownership-updated', fromRevision: 2, toRevision: 3
    })]))
    expect(document).toMatchObject({ calmyId: entry.id, entityType: 'transaction', ownership })
    expect(await financeAsyncRepository.find(entry.id)).toMatchObject({ id: entry.id, amountCents: 17200, ownership, updatedByUserId: 'caregiver-user' })
    expect(await financeAsyncRepository.find(entry.id)).not.toHaveProperty('createdByUserId')
  })
})
