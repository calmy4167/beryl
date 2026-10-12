import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BACKUP_ALLOWED_KEYS, createBackup, parseBackup } from '@/core/backup'
import { applyEntityRecords, supportsEntitySyncRecord } from '@/core/entity-sync'
import { accountStorageKey, setActiveAccount } from '@/core/account-context'
import { resetStoreCache } from '@/core/storage'

describe('reality model backup compatibility', () => {
  beforeEach(() => { setActiveAccount('reality-backup-test-user'); localStorage.clear(); resetStoreCache() })
  afterEach(() => setActiveAccount(null))

  it('includes every canonical core store in backup and restore parsing', () => {
    const source = new StorageMock()
    const keys = ['b_core:important_date', 'b_core:organization', 'b_core:scene', 'b_core:scene_participant', 'b_core:space', 'b_core:domain', 'b_core:scope', 'b_core:permission', 'b_core:relation']
    for (const key of keys) source.setItem(key, '[]')

    const backup = createBackup(source)
    expect(keys.every(key => BACKUP_ALLOWED_KEYS.has(key))).toBe(true)
    expect(Object.keys(parseBackup(backup))).toEqual(expect.arrayContaining(keys))
  })

  it('preserves DailyState owner and privacy through backup and entity sync', async () => {
    const ownership = { createdByUserId: 'daily-owner', ownerRef: { type: 'user', id: 'daily-owner' }, stewardRefs: [], privacy: 'private' }
    const state = { calmyId: 'daily-state-private-sync', entityType: 'daily_state', date: '2026-10-02', bodyState: 'tired', mentalState: 'heavy', load: 70, trajectory: 'stable', protectedItems: [], createdAt: 1, updatedAt: 2, revision: 2, source: 'user', ownership, history: [{ revision: 1, operation: 'created', occurredAt: 1, actorUserId: 'daily-owner', date: '2026-10-02', bodyState: 'normal', mentalState: 'normal', load: 40, trajectory: 'unknown', protectedItems: [], ownership }, { revision: 2, operation: 'updated', occurredAt: 2, actorUserId: 'daily-owner', date: '2026-10-02', bodyState: 'tired', mentalState: 'heavy', load: 70, trajectory: 'stable', protectedItems: [], ownership }] }
    expect(supportsEntitySyncRecord({ entity: 'core:daily_state', entityId: state.calmyId, value: state, updatedAt: 2, device: 'local' })).toBe(true)
    await expect(applyEntityRecords([{ entity: 'core:daily_state', entityId: state.calmyId, value: state, updatedAt: 2, device: 'remote' }], [])).resolves.toBe(1)
    expect(localStorage.getItem(accountStorageKey('b_core:daily_state'))).toContain('daily-owner')
    const source = new StorageMock()
    source.setItem('b_core:daily_state', JSON.stringify([state]))
    const backup = createBackup(source)
    expect(JSON.parse(parseBackup(backup)['b_core:daily_state'])).toEqual([state])
  })

  it('keeps the shared Matter/Thing fact store in the entity-sync allowlist', async () => {
    localStorage.clear()
    await expect(applyEntityRecords([{
      entity: 'matters', entityId: 'thing-sync-1', updatedAt: 10, device: 'remote',
      value: { calmyId: 'thing-sync-1', title: '同步 Thing 来源' }
    }], [])).resolves.toBe(1)
    expect(localStorage.getItem(accountStorageKey('b_matters'))).toContain('同步 Thing 来源')
  })

  it('round-trips settlement history through the Core Scene backup and sync stores', async () => {
    const scene = {
      calmyId: 'scene-settlement-sync', entityType: 'scene', title: '住院', status: 'completed',
      createdAt: 1, updatedAt: 2, revision: 2, source: 'user',
      settlements: [{ commandId: 'settle-sync', settledAt: 2, decisions: [{ entityRef: { entityType: 'record', calmyId: 'record-stable' }, choice: 'keep', decidedAt: 2 }] }]
    }
    await expect(applyEntityRecords([{ entity: 'core:scene', entityId: scene.calmyId, updatedAt: 2, device: 'remote', value: scene }], [])).resolves.toBe(1)
    expect(localStorage.getItem(accountStorageKey('b_core:scene'))).toContain('settle-sync')
    const source = new StorageMock()
    source.setItem('b_core:scene', JSON.stringify([scene]))
    const backup = createBackup(source)
    expect(JSON.parse(backup['b_core:scene'])).toEqual([scene])
  })

  it('backs up and syncs typed subject/context relations with stable endpoint references', async () => {
    const relations = [
      { calmyId: 'relation-person-subject', entityType: 'relation', relationType: 'subject_of', from: { entityType: 'person', calmyId: 'person-1' }, to: { entityType: 'record', calmyId: 'record-1' }, status: 'active', revision: 1 },
      { calmyId: 'relation-thing-context', entityType: 'relation', relationType: 'context_of', from: { entityType: 'record', calmyId: 'record-1' }, to: { entityType: 'thing', calmyId: 'thing-1' }, status: 'active', revision: 2 },
      { calmyId: 'relation-post-context', entityType: 'relation', relationType: 'context_of', from: { entityType: 'post', calmyId: 'post-1' }, to: { entityType: 'scene', calmyId: 'scene-1' }, status: 'active', revision: 1 }
    ]
    const source = new StorageMock()
    source.setItem('b_core:relation', JSON.stringify(relations))
    const ownership = { createdByUserId: 'owner-1', ownerRef: { type: 'user', id: 'owner-1' }, stewardRefs: [], privacy: 'private' }
    const post = { id: 'post-1', title: '复诊经验', content: '正文', date: '2026-10-02', revision: 2, ownership, history: [
      { revision: 1, operation: 'created', occurredAt: 1, actorUserId: 'owner-1', title: '复诊经验', content: '初始正文', date: '2026-10-01', ownership },
      { revision: 2, operation: 'updated', occurredAt: 2, actorUserId: 'owner-1', title: '复诊经验', content: '正文', date: '2026-10-02', ownership }
    ] }
    source.setItem('b_posts', JSON.stringify([post]))
    const backup = createBackup(source)
    expect(JSON.parse(parseBackup(backup)['b_core:relation'])).toEqual(relations)
    expect(JSON.parse(parseBackup(backup).b_posts)).toEqual([post])
    expect(supportsEntitySyncRecord({ entity: 'core:relation', entityId: relations[0].calmyId, value: relations[0], updatedAt: 10, device: 'local' })).toBe(true)
    expect(supportsEntitySyncRecord({ entity: 'posts', entityId: post.id, value: post, updatedAt: 10, device: 'local' })).toBe(true)

    await expect(applyEntityRecords(relations.map((relation, index) => ({
      entity: 'core:relation', entityId: relation.calmyId, value: relation, updatedAt: 10 + index, device: 'remote'
    })), [])).resolves.toBe(relations.length)
    expect(JSON.parse(localStorage.getItem(accountStorageKey('b_core:relation')) || '[]')).toEqual(expect.arrayContaining(relations))
    await expect(applyEntityRecords([{ entity: 'posts', entityId: post.id, value: post, updatedAt: 10, device: 'remote' }], [])).resolves.toBe(1)
    expect(JSON.parse(localStorage.getItem(accountStorageKey('b_posts')) || '[]')).toEqual([post])
  })

  it('preserves explicit ownership across legacy stores and Core Entity backup and sync payloads', async () => {
    const ownership = { createdByUserId: 'creator-1', ownerRef: { type: 'user', id: 'owner-1' }, coOwnerRefs: [{ type: 'organization', id: 'org-1' }], subjectRef: { entityType: 'person', calmyId: 'person-1' }, stewardRefs: [{ type: 'person', id: 'person-2' }], privacy: 'restricted' }
    const matter = { calmyId: 'owned-thing', title: '爸爸住院', ownership }
    const action = { calmyId: 'owned-action', title: '联系医院', ownership }
    const record = { calmyId: 'owned-record', body: '复诊安排', ownership }
    const resource = { calmyId: 'owned-resource', entityType: 'resource', title: '报告', ownership }
    const source = new StorageMock()
    source.setItem('b_matters', JSON.stringify([matter]))
    source.setItem('b_mvpActions', JSON.stringify([action]))
    source.setItem('b_realityRecords', JSON.stringify([record]))
    source.setItem('b_core:resource', JSON.stringify([resource]))
    const backup = createBackup(source)
    expect(JSON.parse(backup.b_matters)).toEqual([matter])
    expect(JSON.parse(backup.b_mvpActions)).toEqual([action])
    expect(JSON.parse(backup.b_realityRecords)).toEqual([record])
    expect(JSON.parse(backup['b_core:resource'])).toEqual([resource])

    await applyEntityRecords([
      { entity: 'matters', entityId: matter.calmyId, updatedAt: 1, device: 'remote', value: matter },
      { entity: 'core:resource', entityId: resource.calmyId, updatedAt: 1, device: 'remote', value: resource },
      { entity: 'setting', entityId: 'mvpActions', updatedAt: 1, device: 'remote', value: [action] },
      { entity: 'setting', entityId: 'realityRecords', updatedAt: 1, device: 'remote', value: [record] },
    ], [])
    expect(localStorage.getItem(accountStorageKey('b_matters'))).toContain('owner-1')
    expect(localStorage.getItem(accountStorageKey('b_core:resource'))).toContain('owner-1')
    expect(localStorage.getItem(accountStorageKey('b_mvpActions'))).toContain('owner-1')
    expect(localStorage.getItem(accountStorageKey('b_realityRecords'))).toContain('owner-1')
  })

  it('backs up and syncs Finance ownership plus its revision history collection', async () => {
    const initial = { id: 'finance-owned-sync', type: 'expense', amountCents: 7900, category: '医疗', note: '医院费用', revision: 1, updatedAt: 9 }
    const revised = { ...initial, amountCents: 8200, note: '新增检查费用', revision: 2, updatedAt: 10, updatedByUserId: 'owner-1' }
    const entry = { ...revised, ownership: { ownerRef: { type: 'user', id: 'owner-1' }, stewardRefs: [], privacy: 'private' }, revision: 3, updatedAt: 11 }
    const created = { id: 'finance:create:finance-owned-sync:1', entityId: initial.id, operation: 'created', commandId: 'finance:create:finance-owned-sync:1', actorId: 'owner-1', occurredAt: 9, fromRevision: 0, toRevision: 1, snapshot: initial }
    const contentUpdate = { id: 'finance:update:finance-owned-sync:2', entityId: entry.id, operation: 'updated', commandId: 'finance:update:finance-owned-sync:2', actorId: 'owner-1', occurredAt: 10, fromRevision: 1, toRevision: 2, previousSnapshot: initial, snapshot: revised }
    const mutation = { id: 'finance:ownership:finance-owned-sync:3', entityId: entry.id, operation: 'ownership-updated', commandId: 'finance:ownership:finance-owned-sync:3', actorId: 'owner-1', occurredAt: 11, fromRevision: 2, toRevision: 3, previousSnapshot: revised, snapshot: entry, ownership: entry.ownership }
    const mutations = [created, contentUpdate, mutation]
    const source = new StorageMock()
    source.setItem('b_finance', JSON.stringify([entry]))
    source.setItem('b_financeMutations', JSON.stringify(mutations))
    const backup = createBackup(source)

    expect(JSON.parse(backup.b_finance)).toEqual([entry])
    expect(JSON.parse(backup.b_financeMutations)).toEqual(mutations)
    expect(supportsEntitySyncRecord({ entity: 'financeMutations', entityId: created.id, value: created, updatedAt: 9, device: 'local' })).toBe(true)
    expect(supportsEntitySyncRecord({ entity: 'financeMutations', entityId: contentUpdate.id, value: contentUpdate, updatedAt: 10, device: 'local' })).toBe(true)
    expect(supportsEntitySyncRecord({ entity: 'financeMutations', entityId: mutation.id, value: mutation, updatedAt: 10, device: 'local' })).toBe(true)
    await expect(applyEntityRecords([
      { entity: 'finance', entityId: entry.id, value: entry, updatedAt: 10, device: 'remote' },
      { entity: 'financeMutations', entityId: created.id, value: created, updatedAt: 9, device: 'remote' },
      { entity: 'financeMutations', entityId: contentUpdate.id, value: contentUpdate, updatedAt: 10, device: 'remote' },
      { entity: 'financeMutations', entityId: mutation.id, value: mutation, updatedAt: 10, device: 'remote' }
    ], [])).resolves.toBe(4)
    expect(localStorage.getItem(accountStorageKey('b_finance'))).toContain('owner-1')
    expect((JSON.parse(localStorage.getItem(accountStorageKey('b_financeMutations')) || '[]') as typeof mutations).sort((a, b) => a.occurredAt - b.occurredAt)).toEqual(mutations)
  })

  it('backs up and syncs Diary revision snapshots as part of the canonical date-keyed record', async () => {
    const diary = {
      date: '2026-10-01', content: '现在的正文。', revision: 2,
      ownership: { ownerRef: { type: 'user', id: 'writer' }, stewardRefs: [], privacy: 'private' },
      history: [
        { revision: 1, operation: 'created', occurredAt: 1, actorUserId: 'writer', content: '最初的正文。', ownership: { ownerRef: { type: 'user', id: 'writer' }, stewardRefs: [], privacy: 'private' } },
        { revision: 2, operation: 'content_updated', occurredAt: 2, actorUserId: 'writer', content: '现在的正文。', ownership: { ownerRef: { type: 'user', id: 'writer' }, stewardRefs: [], privacy: 'private' } }
      ]
    }
    const source = new StorageMock()
    source.setItem('b_diary', JSON.stringify([diary]))
    const backup = createBackup(source)
    expect(BACKUP_ALLOWED_KEYS.has('b_diary')).toBe(true)
    expect(JSON.parse(backup.b_diary)).toEqual([diary])

    await expect(applyEntityRecords([{ entity: 'diary', entityId: diary.date, updatedAt: 10, device: 'remote', value: diary }], [])).resolves.toBe(1)
    expect(localStorage.getItem(accountStorageKey('b_diary'))).toContain('最初的正文。')
  })

  it('backs up and syncs Goal ownership and revision snapshots in the existing goals collection', async () => {
    const goal = {
      id: 'goal-history-backup-sync', title: '照护安排', status: 'open', progress: 40, revision: 2,
      ownership: { ownerRef: { type: 'user', id: 'goal-owner' }, stewardRefs: [], privacy: 'private' },
      history: [
        { revision: 1, operation: 'created', occurredAt: 10, actorUserId: 'goal-owner', title: '照护安排', done: false, status: 'open', progress: 0 },
        { revision: 2, operation: 'updated', occurredAt: 20, actorUserId: 'goal-owner', title: '照护安排', done: false, status: 'open', progress: 40, ownership: { ownerRef: { type: 'user', id: 'goal-owner' }, stewardRefs: [], privacy: 'private' } }
      ]
    }
    const source = new StorageMock()
    source.setItem('b_goals', JSON.stringify([goal]))
    const backup = createBackup(source)
    expect(JSON.parse(backup.b_goals)).toEqual([goal])

    await expect(applyEntityRecords([{ entity: 'goals', entityId: goal.id, updatedAt: 20, device: 'remote', value: goal }], [])).resolves.toBe(1)
    expect(JSON.parse(localStorage.getItem(accountStorageKey('b_goals')) || '[]')).toEqual([goal])
  })
})

class StorageMock implements Storage {
  private values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, String(value)) }
}
