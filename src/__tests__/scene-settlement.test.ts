import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setActiveAccount } from '@/core/account-context'
import { resetStoreCache } from '@/core/storage'
import { financeAsyncRepository } from '@/domain/finance/repository'
import { settleRealityContext, settleThingContext } from '@/application/use-cases/settle-reality-context'
import { unifiedFactories, unifiedRepository, unifiedAsyncRepository, type Relation, type Scene, type Space } from '@/domain/unified'

describe('Scene settlement', () => {
  beforeEach(() => { setActiveAccount('scene-settlement-test-user'); localStorage.clear(); resetStoreCache() })
  afterEach(() => setActiveAccount(null))

  function scene(title: string, status: Scene['status'] = 'completed'): Scene {
    return unifiedRepository.create(unifiedFactories.scene({ title, status }))
  }
  function resource(title: string) {
    return unifiedRepository.create(unifiedFactories.resource({ title, kind: 'reference', status: 'active', assetIds: [], matterIds: [], sourceIds: [], tags: [] }))
  }
  function usedIn(resourceId: string, sceneId: string): Relation {
    return unifiedRepository.create(unifiedFactories.relation({
      from: { entityType: 'resource', calmyId: resourceId }, to: { entityType: 'scene', calmyId: sceneId },
      relationType: 'used_in', directed: true, sourceIds: []
    }))
  }

  it('keeps the existing Entity ID and links it to the completed Scene', async () => {
    const current = scene('住院')
    const file = resource('检查报告')
    const settled = await settleRealityContext(current.calmyId, [{ entityRef: { entityType: 'resource', calmyId: file.calmyId }, choice: 'keep' }], { commandId: 'settle-keep' })
    const links = await unifiedAsyncRepository.list<Relation>('relation')
    expect(settled.settlements?.[0].decisions[0]).toMatchObject({ entityRef: { calmyId: file.calmyId }, choice: 'keep' })
    expect(links.filter(item => !item.archivedAt && item.from.calmyId === file.calmyId)).toHaveLength(1)
  })

  it('keeps an existing context_of Scene link instead of creating a duplicate used_in Relation', async () => {
    const current = scene('复诊')
    const file = resource('检查报告')
    const existing = unifiedRepository.create(unifiedFactories.relation({
      from: { entityType: 'resource', calmyId: file.calmyId }, to: { entityType: 'scene', calmyId: current.calmyId },
      relationType: 'context_of', directed: true, sourceIds: ['context-picker']
    }))

    await settleRealityContext(current.calmyId, [{ entityRef: { entityType: 'resource', calmyId: file.calmyId }, choice: 'keep' }], { commandId: 'settle-context-keep' })

    const links = (await unifiedAsyncRepository.list<Relation>('relation')).filter(item => !item.archivedAt
      && item.from.calmyId === file.calmyId && item.to.calmyId === current.calmyId)
    expect(links).toEqual([expect.objectContaining({ calmyId: existing.calmyId, relationType: 'context_of' })])
  })

  it('retires an existing context_of Scene link without deleting its Entity', async () => {
    const current = scene('复诊')
    const file = resource('检查报告')
    const existing = unifiedRepository.create(unifiedFactories.relation({
      from: { entityType: 'resource', calmyId: file.calmyId }, to: { entityType: 'scene', calmyId: current.calmyId },
      relationType: 'context_of', directed: true, sourceIds: ['context-picker']
    }))

    await settleRealityContext(current.calmyId, [{ entityRef: { entityType: 'resource', calmyId: file.calmyId }, choice: 'retire' }], { commandId: 'settle-context-retire' })

    expect((await unifiedAsyncRepository.find<Relation>('relation', existing.calmyId))?.archivedAt).toBeTypeOf('number')
    expect(await unifiedAsyncRepository.find('resource', file.calmyId)).toBeDefined()
  })

  it('retires a Scene link with a tombstone while preserving the referenced Entity', async () => {
    const current = scene('住院')
    const file = resource('检查报告')
    const link = usedIn(file.calmyId, current.calmyId)
    const settled = await settleRealityContext(current.calmyId, [{ entityRef: { entityType: 'resource', calmyId: file.calmyId }, choice: 'retire' }], { commandId: 'settle-retire' })
    const archivedLink = await unifiedAsyncRepository.find<Relation>('relation', link.calmyId)
    expect(archivedLink?.archivedAt).toBeTypeOf('number')
    expect(await unifiedAsyncRepository.find('resource', file.calmyId)).toBeDefined()
    expect(settled.settlements?.[0].decisions[0].choice).toBe('retire')
  })

  it('records retirement when a legacy Thing reference has no Scene Relation to tombstone', async () => {
    const current = scene('住院')
    const file = resource('检查报告')
    const settled = await settleRealityContext(current.calmyId, [{ entityRef: { entityType: 'resource', calmyId: file.calmyId }, choice: 'retire' }], { commandId: 'settle-retire-legacy' })
    expect(settled.settlements?.[0].decisions[0].choice).toBe('retire')
    expect(await unifiedAsyncRepository.find('resource', file.calmyId)).toBeDefined()
  })

  it('re-associates a stable Entity reference with another Scene and keeps the prior decision', async () => {
    const current = scene('住院')
    const next = scene('康复', 'active')
    const file = resource('检查报告')
    const oldLink = usedIn(file.calmyId, current.calmyId)
    const settled = await settleRealityContext(current.calmyId, [{
      entityRef: { entityType: 'resource', calmyId: file.calmyId }, choice: 'reassociate', targetRef: { entityType: 'scene', calmyId: next.calmyId }
    }], { commandId: 'settle-reassociate' })
    const links = await unifiedAsyncRepository.list<Relation>('relation')
    expect((await unifiedAsyncRepository.find<Relation>('relation', oldLink.calmyId))?.archivedAt).toBeTypeOf('number')
    expect(links.some(item => !item.archivedAt && item.from.calmyId === file.calmyId && item.to.calmyId === next.calmyId)).toBe(true)
    expect(settled.settlements?.[0].decisions[0].targetRef?.calmyId).toBe(next.calmyId)
  })

  it('settles a legacy Finance entry by its stable ID and preserves the expense payload', async () => {
    const current = scene('住院')
    const entry = await financeAsyncRepository.create({ id: 'settle-finance-expense', type: 'expense', amountCents: 9200, category: '医疗', note: '检查费用', date: '2026-10-01' })
    const link = await unifiedAsyncRepository.create(unifiedFactories.relation({
      from: { entityType: 'finance_entry', calmyId: entry.id }, to: { entityType: 'scene', calmyId: current.calmyId },
      relationType: 'used_in', directed: true, sourceIds: []
    }))

    const settled = await settleRealityContext(current.calmyId, [{ entityRef: { entityType: 'finance_entry', calmyId: entry.id }, choice: 'retire' }], { commandId: 'settle-finance-entry' })

    expect((await unifiedAsyncRepository.find<Relation>('relation', link.calmyId))?.archivedAt).toBeTypeOf('number')
    expect(await financeAsyncRepository.find(entry.id)).toEqual(entry)
    expect(settled.settlements?.[0].decisions[0]).toMatchObject({ entityRef: { entityType: 'finance_entry', calmyId: entry.id }, choice: 'retire' })
  })

  it('keeps an existing relationship change by linking the same typed Entity to the Scene', async () => {
    const current = scene('家庭照护')
    const relationChange = unifiedRepository.create(unifiedFactories.relationship({
      personAId: 'person-a', personBId: 'person-b', label: '照护分工调整', status: 'active',
      sharedSpaceIds: [], matterIds: [], evidenceIds: []
    }))
    const settled = await settleRealityContext(current.calmyId, [{
      entityRef: { entityType: 'relationship', calmyId: relationChange.calmyId }, choice: 'keep'
    }], { commandId: 'settle-relationship' })
    const links = await unifiedAsyncRepository.list<Relation>('relation')
    expect(links).toContainEqual(expect.objectContaining({ from: { entityType: 'relationship', calmyId: relationChange.calmyId }, to: { entityType: 'scene', calmyId: current.calmyId }, relationType: 'used_in' }))
    expect(await unifiedAsyncRepository.find('relationship', relationChange.calmyId)).toEqual(relationChange)
    expect(settled.settlements?.[0].decisions[0].choice).toBe('keep')
  })

  it('settles an important date by its canonical ID and preserves its Person relation', async () => {
    const current = scene('家庭照护')
    const person = unifiedRepository.create(unifiedFactories.person({ displayName: '爸爸' }))
    const importantDate = unifiedRepository.create(unifiedFactories.importantDate({ title: '爸爸生日', kind: 'birthday', personId: person.calmyId, monthDay: '02-29', recurrence: 'yearly' }))
    const personLink = unifiedRepository.create(unifiedFactories.relation({
      from: { entityType: 'important_date', calmyId: importantDate.calmyId }, to: { entityType: 'person', calmyId: person.calmyId },
      relationType: 'subject_of', directed: true, sourceIds: []
    }))

    const settled = await settleRealityContext(current.calmyId, [{ entityRef: { entityType: 'important_date', calmyId: importantDate.calmyId }, choice: 'keep' }], { commandId: 'settle-important-date' })

    const links = await unifiedAsyncRepository.list<Relation>('relation')
    expect(links).toContainEqual(expect.objectContaining({ calmyId: personLink.calmyId, relationType: 'subject_of' }))
    expect(links).toContainEqual(expect.objectContaining({ from: { entityType: 'important_date', calmyId: importantDate.calmyId }, to: { entityType: 'scene', calmyId: current.calmyId }, relationType: 'used_in' }))
    expect(await unifiedAsyncRepository.find('important_date', importantDate.calmyId)).toEqual(importantDate)
    expect(settled.settlements?.[0].decisions[0].entityRef).toEqual({ entityType: 'important_date', calmyId: importantDate.calmyId })
  })

  it('settles an archived Thing onto its canonical Matter record and retains the same resource ID', async () => {
    const { matterAsyncRepository } = await import('@/domain/matter/repository')
    const thing = await matterAsyncRepository.create({ title: '爸爸住院' })
    const archived = await matterAsyncRepository.archive(thing.calmyId, { expectedRevision: thing.revision })
    expect(archived.status).toBe('archived')
    const file = resource('出院指导')
    const link = unifiedRepository.create(unifiedFactories.relation({
      from: { entityType: 'resource', calmyId: file.calmyId }, to: { entityType: 'thing', calmyId: thing.calmyId },
      relationType: 'used_in', directed: true, sourceIds: []
    }))
    const settled = await settleThingContext(thing.calmyId, [{ entityRef: { entityType: 'resource', calmyId: file.calmyId }, choice: 'keep' }], { commandId: 'settle-thing' })
    expect(settled.settlements?.[0].decisions[0]).toMatchObject({ entityRef: { entityType: 'resource', calmyId: file.calmyId }, targetRef: { entityType: 'thing', calmyId: thing.calmyId } })
    expect(await matterAsyncRepository.find(thing.calmyId)).toEqual(settled)
    expect(await unifiedAsyncRepository.find('resource', file.calmyId)).toEqual(file)
    expect(await unifiedAsyncRepository.find<Relation>('relation', link.calmyId)).toEqual(link)
  })

  it('closes a Space while retaining its Scene, Entity, and typed Relation rows', async () => {
    const thing = await import('@/domain/matter/repository').then(({ matterAsyncRepository }) => matterAsyncRepository.create({ title: '爸爸住院' }))
    const space = await unifiedAsyncRepository.create(unifiedFactories.space({
      title: '家庭照护', memberPersonIds: [], relationshipIds: [], thingIds: [thing.calmyId], sceneIds: [], status: 'active'
    }))
    const sceneRow = await unifiedAsyncRepository.create(unifiedFactories.scene({ title: '本次住院', thingId: thing.calmyId, spaceId: space.calmyId, status: 'active' }))
    const file = await unifiedAsyncRepository.create(unifiedFactories.resource({ title: '检查报告', kind: 'reference', status: 'active', assetIds: [], matterIds: [], sourceIds: [], tags: [] }))
    const link = await unifiedAsyncRepository.create(unifiedFactories.relation({
      from: { entityType: 'resource', calmyId: file.calmyId }, to: { entityType: 'scene', calmyId: sceneRow.calmyId },
      relationType: 'used_in', directed: true, sourceIds: []
    }))
    const currentSpace = await unifiedAsyncRepository.find<Space>('space', space.calmyId)
    const linkedSpace = await unifiedAsyncRepository.update<Space>('space', space.calmyId, { sceneIds: [sceneRow.calmyId] }, { expectedRevision: currentSpace?.revision })
    await unifiedAsyncRepository.transitionSpace(space.calmyId, 'closed', { expectedRevision: linkedSpace.revision })

    expect((await unifiedAsyncRepository.find<Space>('space', space.calmyId))?.status).toBe('closed')
    expect(await unifiedAsyncRepository.find('scene', sceneRow.calmyId)).toBeDefined()
    expect(await unifiedAsyncRepository.find('resource', file.calmyId)).toBeDefined()
    expect(await unifiedAsyncRepository.find<Relation>('relation', link.calmyId)).toEqual(link)
  })
})
