import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const durable = vi.hoisted(() => {
  const values = new Map<string, string>()
  let available = true
  let chain: Promise<void> = Promise.resolve()
  return {
    values,
    flushPendingDbWrites: vi.fn(async () => { await chain }),
    getDbStatus: vi.fn(() => ({
      state: available ? 'ready' : 'degraded',
      available,
      pendingWrites: 0,
      restoredKeys: 0,
      lastMirrorAt: null,
      lastError: available ? null : 'indexedDB unavailable'
    })),
    readKvSnapshot: vi.fn(async () => available ? Object.fromEntries(values) : undefined),
    dbPut: vi.fn((key: string, value: string) => {
      const next = chain.then(async () => { if (available) values.set(key, value) })
      chain = next.catch(() => undefined)
      return next
    }),
    dbDelete: vi.fn(async (key: string) => { values.delete(key) }),
    recordEntityChanges: vi.fn(async () => undefined),
    reset() {
      values.clear()
      available = true
      chain = Promise.resolve()
      this.flushPendingDbWrites.mockClear()
      this.getDbStatus.mockClear()
      this.readKvSnapshot.mockClear()
      this.dbPut.mockClear()
      this.dbDelete.mockClear()
      this.recordEntityChanges.mockClear()
    },
    setAvailable(next: boolean) { available = next }
  }
})

vi.mock('../core/db.ts', () => ({
  DEVICE_ID: 'test-device',
  dbDelete: durable.dbDelete,
  dbPut: durable.dbPut,
  flushPendingDbWrites: durable.flushPendingDbWrites,
  getDbStatus: durable.getDbStatus,
  readKvSnapshot: durable.readKvSnapshot,
  recordEntityChanges: durable.recordEntityChanges
}))

import { resetStoreCache } from '../core/storage'
import { accountStorageKey, setActiveAccount } from '../core/account-context'
import { clearSession, writeServerSession } from '../core/auth'
import { unifiedAsyncRepository, unifiedFactories, unifiedRepository } from '../domain/unified/repository'
import type { CoreEntityMutation } from '../domain/unified/model'

describe('unifiedAsyncRepository', () => {
  beforeEach(() => {
    setActiveAccount('unified-async-repository-test-user')
    durable.reset()
    localStorage.clear()
    resetStoreCache()
  })
  afterEach(() => { clearSession(); setActiveAccount(null) })

  it('defaults signed-in user-created Core Entities to private ownership without assigning ownership to access-control metadata', async () => {
    writeServerSession({ token: 'core-owner-token', apiOrigin: 'https://api.example.test', expiresAt: Date.now() + 60_000, user: { id: 'core-owner', username: 'core-owner', displayName: 'Core Owner', role: 'user' }, mustChangePassword: false })
    const person = unifiedFactories.person({ displayName: '由当前用户创建' })
    const asyncPerson = unifiedFactories.person({ displayName: '异步当前用户创建' })
    const importedPerson = { ...unifiedFactories.person({ displayName: '导入的人物' }), calmyId: 'imported-person-no-owner', source: 'import' as const }
    const permission = unifiedFactories.permission({ principalUserId: 'reader', entityRef: { entityType: 'person', calmyId: person.calmyId }, effect: 'allow', actions: ['view'] })

    const createdSync = unifiedRepository.create(person)
    const createdAsync = await unifiedAsyncRepository.create(asyncPerson)
    const createdPermission = await unifiedAsyncRepository.create(permission)
    await unifiedAsyncRepository.importEntity(importedPerson)

    const expectedOwnership = { createdByUserId: 'core-owner', ownerRef: { type: 'user', id: 'core-owner' }, stewardRefs: [], privacy: 'private' }
    expect(createdSync.ownership).toEqual(expectedOwnership)
    expect(createdAsync.ownership).toEqual(expectedOwnership)
    expect(createdPermission.ownership).toBeUndefined()
    expect((await unifiedAsyncRepository.find('person', importedPerson.calmyId))?.ownership).toBeUndefined()
    expect((await unifiedAsyncRepository.mutations('person', asyncPerson.calmyId))[0]).toMatchObject({ actorId: 'core-owner', patch: expect.objectContaining({ ownership: expectedOwnership }) })
  })

  it('reads the entity-type store from the durable snapshot', async () => {
    const durablePerson = unifiedFactories.person({ displayName: '持久化联系人' })
    localStorage.setItem('core:person', JSON.stringify([{ ...durablePerson, displayName: '过期缓存' }]))
    durable.values.set('b_core:person', JSON.stringify([durablePerson]))

    await expect(unifiedAsyncRepository.list('person')).resolves.toEqual([durablePerson])
    await expect(unifiedAsyncRepository.find('person', durablePerson.calmyId)).resolves.toEqual(durablePerson)
  })

  it('creates and updates an entity through the async durable facade', async () => {
    const person = unifiedFactories.person({ displayName: '异步联系人' })
    await expect(unifiedAsyncRepository.create(person)).resolves.toMatchObject({ ...person, revisionHistory: [expect.objectContaining({ revision: 1, operation: 'created', snapshot: expect.objectContaining({ displayName: person.displayName }) })] })

    const updated = await unifiedAsyncRepository.update('person', person.calmyId, { displayName: '更新后的联系人' }, { expectedRevision: 1 })

    expect(updated).toMatchObject({ calmyId: person.calmyId, displayName: '更新后的联系人', revision: 2 })
    await expect(unifiedAsyncRepository.find('person', person.calmyId)).resolves.toMatchObject({ displayName: '更新后的联系人', revision: 2 })
    await expect(unifiedAsyncRepository.ready('person')).resolves.toMatchObject({ durable: true, state: 'ready', pendingWrites: 0 })
    expect(durable.values.get('b_core:person')).toContain('更新后的联系人')

    const mutations = JSON.parse(durable.values.get('b_coreEntityMutations') || '[]') as CoreEntityMutation[]
    const commands = JSON.parse(durable.values.get('b_coreEntityCommands') || '[]') as Array<{ id: string; result: unknown }>
    expect(mutations).toHaveLength(2)
    expect(mutations.map(item => item.operation)).toEqual(['update', 'create'])
    expect(commands).toHaveLength(2)
    expect(commands.every(item => item.id && item.result)).toBe(true)
  })

  it('uses durable mutation and command snapshots instead of stale localStorage values', async () => {
    const person = unifiedFactories.person({ displayName: '快照联系人' })
    const mutation: CoreEntityMutation = {
      id: 'mutation-durable', entityType: 'person', entityId: person.calmyId, operation: 'create', commandId: 'snapshot-command',
      actor: 'user', actorId: 'local-user', sourceIds: [], fromRevision: 0, toRevision: 1, occurredAt: 10, patch: person
    }
    durable.values.set('b_coreEntityMutations', JSON.stringify([mutation]))
    durable.values.set('b_coreEntityCommands', JSON.stringify([{ id: 'snapshot-command', result: person }]))
    localStorage.setItem(accountStorageKey('b_coreEntityMutations'), JSON.stringify([]))
    localStorage.setItem(accountStorageKey('b_coreEntityCommands'), JSON.stringify([]))

    await expect(unifiedAsyncRepository.mutations('person', person.calmyId)).resolves.toEqual([mutation])
    await expect(unifiedAsyncRepository.create(person, { commandId: 'snapshot-command' })).resolves.toEqual(person)
  })

  it('makes repeated command ids idempotent without appending another durable mutation', async () => {
    const first = unifiedFactories.person({ displayName: '第一次创建' })
    const replay = unifiedFactories.person({ displayName: '重放不应覆盖' })
    const created = await unifiedAsyncRepository.create(first, { commandId: 'idempotent-create' })
    expect(created).toMatchObject({ ...first, revisionHistory: [expect.objectContaining({ revision: 1, operation: 'created' })] })
    await expect(unifiedAsyncRepository.create(replay, { commandId: 'idempotent-create' })).resolves.toEqual(created)

    await expect(unifiedAsyncRepository.mutations('person', first.calmyId)).resolves.toHaveLength(1)
    await expect(unifiedAsyncRepository.find('person', replay.calmyId)).resolves.toBeUndefined()
    expect(JSON.parse(durable.values.get('b_coreEntityCommands') || '[]')).toHaveLength(1)
  })

  it('supports imported replacement and persists its async mutation history', async () => {
    const imported = unifiedFactories.person({ displayName: '导入联系人' })
    await expect(unifiedAsyncRepository.importEntity(imported)).resolves.toBe('created')
    await expect(unifiedAsyncRepository.importEntity(imported)).resolves.toBe('unchanged')
    await expect(unifiedAsyncRepository.replaceImported({ ...imported, displayName: '替换联系人', revision: 2 })).resolves.toBe('replaced')
    await expect(unifiedAsyncRepository.mutations('person', imported.calmyId)).resolves.toHaveLength(2)
    expect(JSON.parse(durable.values.get('b_coreEntityMutations') || '[]')).toHaveLength(2)
  })

  it('runs async Cycle/Stage/Outcome/Practice commands with revision checks', async () => {
    const matterId = 'matter-for-async-process'
    const cycle = await unifiedAsyncRepository.createCycleForMatter({ matterId, title: '异步周期', theme: '验证', currentStage: 'wood', status: 'planned', trajectory: 'stable', stageIds: [] })
    const stage = await unifiedAsyncRepository.createStageForCycle({ cycleId: cycle.calmyId, title: '异步阶段', element: 'wood', status: 'planned', actionIds: [], recordIds: [], order: 1 })
    const actionId = 'action-for-async-outcome'
    const outcome = await unifiedAsyncRepository.createOutcomeForAction({ actionId, matterId, summary: '已验证', result: '可以重复', status: 'observed', evidenceRecordIds: [] })
    const practice = await unifiedAsyncRepository.createPracticeFromOutcome({ title: '重复做法', description: '保持最小验证', status: 'candidate', matterIds: [matterId], outcomeIds: [outcome.calmyId], evidenceIds: [] })

    await expect(unifiedAsyncRepository.transitionCycle(cycle.calmyId, 'active', { expectedRevision: cycle.revision + 1 })).resolves.toMatchObject({ status: 'active', revision: 3 })
    await expect(unifiedAsyncRepository.transitionStage(stage.calmyId, 'active', { expectedRevision: stage.revision })).resolves.toMatchObject({ status: 'active', revision: 2 })
    await expect(unifiedAsyncRepository.update('practice', practice.calmyId, { status: 'active' }, { expectedRevision: practice.revision })).resolves.toMatchObject({ status: 'active', revision: 2 })
    await expect(unifiedAsyncRepository.update('practice', practice.calmyId, { status: 'candidate' }, { expectedRevision: 1 })).rejects.toThrow('is at revision 2')
  })

  it('rejects missing entities and stale revisions without writing async logs', async () => {
    await expect(unifiedAsyncRepository.update('person', 'missing-person', { displayName: '不存在' }))
      .rejects.toThrow('person missing-person not found')

    const imported = unifiedFactories.person({ displayName: '版本边界' })
    await unifiedAsyncRepository.importEntity(imported)
    await unifiedAsyncRepository.replaceImported({ ...imported, displayName: '版本边界更新', revision: 2 })
    await expect(unifiedAsyncRepository.update('person', imported.calmyId, { displayName: '过期更新' }, { expectedRevision: 1 }))
      .rejects.toThrow('is at revision 2')
  })
})
