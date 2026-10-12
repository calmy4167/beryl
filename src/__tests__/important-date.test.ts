import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setActiveAccount } from '@/core/account-context'
import { resetStoreCache } from '@/core/storage'
import { exportOpenWorkspace, importOpenWorkspace } from '@/core/content/open-format'
import { unifiedAsyncRepository, unifiedFactories, type ImportantDate, type Person, type Relation } from '@/domain/unified'
import { listRealityDocumentsAsync } from '@/domain/reality'
import { listRealityActivityAsync } from '@/domain/social/collaboration'

describe('canonical ImportantDate', () => {
  beforeEach(() => { setActiveAccount('important-date-test-user'); localStorage.clear(); resetStoreCache() })
  afterEach(() => setActiveAccount(null))

  it('stores a recurring date as one canonical object linked to its Person', async () => {
    const person = unifiedFactories.person({ displayName: '爸爸', roles: [], tags: [], status: 'active' })
    await unifiedAsyncRepository.create<Person>(person)
    const date = unifiedFactories.importantDate({
      title: '爸爸生日', kind: 'birthday', personId: person.calmyId, monthDay: '02-29', recurrence: 'yearly'
    })
    await unifiedAsyncRepository.create<ImportantDate>(date)
    const relation = unifiedFactories.relation({
      from: { entityType: 'important_date', calmyId: date.calmyId },
      to: { entityType: 'person', calmyId: person.calmyId }, relationType: 'subject_of', directed: true, sourceIds: []
    })
    await unifiedAsyncRepository.create<Relation>(relation)

    expect(await unifiedAsyncRepository.find<ImportantDate>('important_date', date.calmyId)).toMatchObject({ title: '爸爸生日', personId: person.calmyId, monthDay: '02-29', recurrence: 'yearly' })
    expect(await unifiedAsyncRepository.find<Relation>('relation', relation.calmyId)).toBeDefined()
    const document = (await listRealityDocumentsAsync({ types: ['important_date'] })).find(item => item.calmyId === date.calmyId)
    expect(document).toMatchObject({ title: '爸爸生日', route: '/app/people' })
    const nextOccurrence = new Date(document!.occurredAt!)
    expect(nextOccurrence.getUTCMonth()).toBe(1)
    expect(nextOccurrence.getUTCDate()).toBe(29)
    expect(nextOccurrence.getUTCFullYear() % 4).toBe(0)
  })

  it('rejects impossible recurring dates', async () => {
    const date = unifiedFactories.importantDate({ title: '无效日期', kind: 'other', monthDay: '02-30', recurrence: 'yearly' })
    await expect(unifiedAsyncRepository.create<ImportantDate>(date)).rejects.toThrow(/date/i)
  })

  it('round-trips the canonical date and its typed Person relation through Open Format', () => {
    const person = unifiedFactories.person({ displayName: '妈妈', roles: [], tags: [], status: 'active' })
    const date = unifiedFactories.importantDate({ title: '相识纪念日', kind: 'anniversary', personId: person.calmyId, monthDay: '06-15', year: 2008, recurrence: 'yearly' })
    const relation = unifiedFactories.relation({
      from: { entityType: 'important_date', calmyId: date.calmyId },
      to: { entityType: 'person', calmyId: person.calmyId }, relationType: 'subject_of', directed: true, sourceIds: []
    })
    const workspace = exportOpenWorkspace({ unified: [person, date, relation] })
    const imported = importOpenWorkspace(workspace.files)
    expect(imported.entities).toEqual(expect.arrayContaining([person, date, relation]))
    expect(imported.issues).toEqual([])
  })

  it('projects ImportantDate create and revisions through the canonical history repository', async () => {
    const date = await unifiedAsyncRepository.create(unifiedFactories.importantDate({ title: '爸爸生日', kind: 'birthday', monthDay: '02-18', recurrence: 'yearly' }))
    await unifiedAsyncRepository.update('important_date', date.calmyId, { notes: '提前准备礼物' }, { expectedRevision: date.revision, actorId: 'date-owner' })

    const activity = await listRealityActivityAsync({ entityType: 'important_date', calmyId: date.calmyId })

    expect(activity).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'core_entity_mutation', operation: 'create', actorUserId: 'local-user', fromRevision: 0, toRevision: 1 }),
      expect.objectContaining({ source: 'core_entity_mutation', operation: 'update', actorUserId: 'date-owner', fromRevision: 1, toRevision: 2, patch: { notes: '提前准备礼物' } })
    ]))
  })
})
