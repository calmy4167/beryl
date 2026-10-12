import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setActiveAccount } from '@/core/account-context'
import { resetStoreCache } from '@/core/storage'
import { exportOpenWorkspace, importOpenWorkspace, openEntityType } from '@/core/content/open-format'
import { applyOpenEntitiesDurable } from '@/core/content/open-workspace'
import { diaryRepository } from '@/domain/diary/repository'
import { buildGraphSnapshot } from '@/domain/graph/query'
import { buildContextualView, projectEntityContexts } from '@/domain/reality/contextual-view'
import { unifiedAsyncRepository, unifiedFactories, type Domain, type Person, type Relation } from '@/domain/unified'
import type { RealityDocument } from '@/domain/reality'

describe('Diary typed context relations', () => {
  beforeEach(() => { setActiveAccount('diary-relations-test-user'); localStorage.clear(); resetStoreCache() })
  afterEach(() => setActiveAccount(null))

  it('uses the existing date-keyed Diary record, accepts typed Relations, and round-trips them', async () => {
    const date = '2026-09-23'
    const person = await unifiedAsyncRepository.create<Person>(unifiedFactories.person({ displayName: '爸爸' }))
    const domain = await unifiedAsyncRepository.create<Domain>(unifiedFactories.domain({ key: 'health-diary', displayName: '健康' }))
    const diary = await diaryRepository.create({ date, content: '复诊后爸爸精神好些。', revision: 1, ownership: { ownerRef: { type: 'user', id: 'writer' }, subjectRef: { entityType: 'person', calmyId: person.calmyId }, stewardRefs: [], privacy: 'private' } })
    const personRelation = unifiedFactories.relation({ from: { entityType: 'diary_entry', calmyId: date }, to: { entityType: 'person', calmyId: person.calmyId }, relationType: 'subject_of', directed: true, sourceIds: [] })
    const domainRelation = unifiedFactories.relation({ from: { entityType: 'diary_entry', calmyId: date }, to: { entityType: 'domain', calmyId: domain.calmyId }, relationType: 'belongs_to_domain', directed: true, sourceIds: [] })
    await unifiedAsyncRepository.create<Relation>(personRelation)
    await unifiedAsyncRepository.create<Relation>(domainRelation)

    expect(buildGraphSnapshot().nodes).toContainEqual(expect.objectContaining({ type: 'diary_entry', label: `日记 ${date}` }))
    const workspace = exportOpenWorkspace({ diaries: [diary], unified: [person, domain, personRelation, domainRelation] })
    const imported = importOpenWorkspace(workspace.files)
    expect(imported.entities).toEqual(expect.arrayContaining([personRelation, domainRelation]))
    expect(imported.issues).toEqual([])
    expect(imported.entities.find(item => openEntityType(item) === 'diary')).toMatchObject({ date, ownership: { privacy: 'private' } })
  })

  it('uses Diary relations as contexts while the diary owner remains the only implicit viewer', () => {
    const doc: RealityDocument = { id: '2026-09-23', calmyId: '2026-09-23', source: 'legacy', entityType: 'diary', title: '复诊日记', summary: '', route: '/app/diary?date=2026-09-23', updatedAt: 1, searchText: '', ownership: { ownerRef: { type: 'user', id: 'writer' }, stewardRefs: [], privacy: 'private' } }
    const relation = unifiedFactories.relation({ from: { entityType: 'diary_entry', calmyId: doc.calmyId }, to: { entityType: 'person', calmyId: 'dad' }, relationType: 'subject_of', directed: true, sourceIds: [] })
    expect(projectEntityContexts([doc], [relation]).get('diary_entry:2026-09-23')).toEqual([{ personId: 'dad' }])
    expect(buildContextualView({ documents: [doc], principalUserId: 'writer', action: 'view', permissions: [], scopes: [], documentContexts: projectEntityContexts([doc], [relation]) }).visible).toEqual([doc])
    expect(buildContextualView({ documents: [doc], principalUserId: 'dad-user', action: 'view', permissions: [], scopes: [], personUserBindings: [{ personId: 'dad', userId: 'dad-user' }], documentContexts: projectEntityContexts([doc], [relation]) }).visible).toEqual([])
  })

  it('imports Diary before typed Relations that reference its durable date ID', async () => {
    const date = '2026-09-24'
    const person = unifiedFactories.person({ displayName: '爸爸' })
    const diary = { date, content: '一起复诊。', revision: 1, ownership: { ownerRef: { type: 'user' as const, id: 'writer' }, stewardRefs: [], privacy: 'private' as const } }
    const relation = unifiedFactories.relation({ from: { entityType: 'diary_entry', calmyId: date }, to: { entityType: 'person', calmyId: person.calmyId }, relationType: 'subject_of', directed: true, sourceIds: [] })
    const workspace = exportOpenWorkspace({ diaries: [diary], unified: [person, relation] })
    const parsed = importOpenWorkspace(workspace.files)

    const result = await applyOpenEntitiesDurable(parsed.entities)
    expect(result.errors).toEqual([])
    expect(await diaryRepository.findDurable(date)).toMatchObject({ date, content: '一起复诊。' })
    expect(await unifiedAsyncRepository.find<Relation>('relation', relation.calmyId)).toMatchObject({ from: { entityType: 'diary_entry', calmyId: date } })
  })
})
