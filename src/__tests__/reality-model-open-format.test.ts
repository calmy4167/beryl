import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setActiveAccount } from '@/core/account-context'
import { store } from '@/core/storage'
import { resetStoreCache } from '@/core/storage'
import { exportOpenWorkspace, hashOpenText, importOpenWorkspace, OPEN_FORMAT_VERSION, OPEN_MANIFEST_PATH, serializeOpenEntity } from '@/core/content/open-format'
import { applyOpenEntities, applyOpenEntitiesDurable, currentOpenEntities, exportCurrentOpenWorkspace } from '@/core/content/open-workspace'
import { unifiedAsyncRepository, unifiedFactories, type Relation } from '@/domain/unified'
import { thingFromMatter } from '@/domain/matter/model'
import { matterRepository } from '@/domain/matter/repository'
import { spaceFromSharedSpace } from '@/domain/unified/model'
import { financeAsyncRepository } from '@/domain/finance/repository'
import { createAsyncCollectionRepository } from '@/core/repository'

describe('reality model Open Format compatibility', () => {
  beforeEach(() => { setActiveAccount('reality-open-format-test-user'); localStorage.clear(); resetStoreCache() })
  afterEach(() => setActiveAccount(null))

  it('round-trips canonical records, ownership, and entity references under the new format version', () => {
    const owner = { type: 'user' as const, id: 'user-owner' }
    const person = unifiedFactories.person({ displayName: '照护者', linkedUserId: 'user-owner' })
    const legacyMatter = { calmyId: 'thing-open-format', title: '复诊安排', why: '确认安排', primaryContradiction: '时间安排冲突', problem: '复诊时间未定', desiredChange: '确定时间', progressEvidence: '已联系医院', currentGap: '等待回复', nextTest: '今日回访', stopCondition: '预约完成', status: 'paused' as const, currentStage: 'earth' as const, trajectory: 'recovering' as const, currentCycleId: 'cycle-1', evidenceIds: ['record-1'], createdAt: 1, updatedAt: 2, revision: 3 }
    const thing = { ...thingFromMatter(legacyMatter), source: 'import' as const, subjectPersonIds: [person.calmyId] }
    const thingId = thing.calmyId
    const scene = unifiedFactories.scene({ title: '复诊', thingId, startedAt: 100, order: 0, status: 'completed', settlements: [{ commandId: 'settle-test', settledAt: 120, decisions: [{ entityRef: { entityType: 'record', calmyId: 'record-1' }, choice: 'keep', decidedAt: 120 }] }] })
    const participant = unifiedFactories.sceneParticipant({ sceneId: scene.calmyId, personId: person.calmyId, joinedAt: 110 })
    const space = unifiedFactories.space({ title: '家庭照护', purpose: '共同安排', memberPersonIds: [person.calmyId], relationshipIds: [], thingIds: [thingId], sceneIds: [scene.calmyId], ownerRef: owner, status: 'active' })
    const domain = unifiedFactories.domain({ key: 'health', displayName: 'Health' })
    const scope = unifiedFactories.scope({ personId: person.calmyId, domainId: domain.calmyId })
    const permission = unifiedFactories.permission({ principalUserId: 'user-owner', scopeId: scope.calmyId, effect: 'allow', actions: ['view', 'edit'] })
    const relation = unifiedFactories.relation({ from: { entityType: 'thing', calmyId: thingId }, to: { entityType: 'person', calmyId: person.calmyId }, relationType: 'subject_of', directed: true, sourceIds: [] })
    const ownedPerson = { ...person, ownership: { ownerRef: owner, stewardRefs: [], privacy: 'private' as const } }
    const entities = [ownedPerson, scene, participant, space, domain, scope, permission, relation]

    const workspace = exportOpenWorkspace({ unified: entities, things: [thing] })
    const imported = importOpenWorkspace(workspace.files, workspace.assets)

    expect(OPEN_FORMAT_VERSION).toBe(3)
    expect(workspace.manifest.format_version).toBe(3)
    expect(imported.issues).toEqual([])
    expect(imported.entities).toEqual(expect.arrayContaining([...entities, thing]))
  })

  it('round-trips a legacy Post and its stable-ID Scene relation in Open Format', () => {
    const post = { entityType: 'post' as const, id: 'post-portable-1', title: '复诊经验', content: '按原记录保留。', date: '2026-10-02' }
    const scene = unifiedFactories.scene({ title: '复诊期间' })
    const relation = unifiedFactories.relation({
      from: { entityType: 'post', calmyId: post.id }, to: { entityType: 'scene', calmyId: scene.calmyId },
      relationType: 'context_of', directed: true, sourceIds: []
    })
    const workspace = exportOpenWorkspace({ posts: [post], unified: [scene, relation] })
    const imported = importOpenWorkspace(workspace.files)

    expect(imported.issues).toEqual([])
    expect(imported.entities).toEqual(expect.arrayContaining([expect.objectContaining(post), scene, relation]))
  })

  it('durably exports and imports a Post before its Relation endpoint', async () => {
    const postRepository = createAsyncCollectionRepository<{ id: string; title: string; content: string; date: string }>('posts', item => item.id)
    const post = { id: 'post-durable-1', title: '可迁移文章', content: '文章正文', date: '2026-10-02' }
    await postRepository.create(post)
    const scene = await unifiedAsyncRepository.create(unifiedFactories.scene({ title: '文章相关情境' }))
    const relation = await unifiedAsyncRepository.create(unifiedFactories.relation({
      from: { entityType: 'post', calmyId: post.id }, to: { entityType: 'scene', calmyId: scene.calmyId },
      relationType: 'context_of', directed: true, sourceIds: []
    }))
    const workspace = exportCurrentOpenWorkspace()
    const imported = importOpenWorkspace(workspace.files)

    expect(imported.issues).toEqual([])
    expect(imported.entities).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: 'post', id: post.id })]))
    setActiveAccount('reality-open-format-import-user')
    resetStoreCache()
    const applied = await applyOpenEntitiesDurable(imported.entities)
    expect(applied.errors).toEqual([])
    expect(await postRepository.find(post.id)).toEqual(expect.objectContaining(post))
    const importedRelations = await unifiedAsyncRepository.list<Relation>('relation')
    expect(importedRelations).toEqual(expect.arrayContaining([expect.objectContaining({ calmyId: relation.calmyId, from: { entityType: 'post', calmyId: post.id } })]))
  })

  it('round-trips organization ownership and the four declared visibility levels without treating them as grants', () => {
    const organization = unifiedFactories.organization({ title: '家庭照护小组' })
    const ownership = {
      createdByUserId: 'user-recorder',
      ownerRef: { type: 'organization' as const, id: organization.calmyId },
      coOwnerRefs: [{ type: 'user' as const, id: 'user-sibling' }],
      subjectRef: { entityType: 'person' as const, calmyId: 'person-dad' },
      stewardRefs: [{ type: 'person' as const, id: 'person-mom' }],
      privacy: 'restricted' as const
    }
    const owned = { ...unifiedFactories.resource({ title: '照护安排', kind: 'reference', status: 'active', assetIds: [], matterIds: [], sourceIds: [], tags: [] }), ownership }
    const sceneOwned = { ...unifiedFactories.scene({ title: '复诊安排' }), ownership: { ...ownership, privacy: 'scene' as const } }
    const spaceOwned = { ...unifiedFactories.space({ title: '照护空间', memberPersonIds: [], relationshipIds: [], thingIds: [], sceneIds: [], ownerRef: { type: 'organization', id: organization.calmyId }, status: 'active' }), ownership: { ...ownership, privacy: 'space' as const } }
    const imported = importOpenWorkspace(exportOpenWorkspace({ unified: [organization, owned, sceneOwned, spaceOwned] }).files)
    expect(imported.issues).toEqual([])
    expect(imported.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: 'organization', calmyId: organization.calmyId, title: '家庭照护小组' }),
      expect.objectContaining({ calmyId: owned.calmyId, ownership: { ...ownership, privacy: 'restricted' } }),
      expect.objectContaining({ calmyId: sceneOwned.calmyId, ownership: { ...ownership, privacy: 'scene' } }),
      expect.objectContaining({ calmyId: spaceOwned.calmyId, ownerRef: { type: 'organization', id: organization.calmyId }, ownership: { ...ownership, privacy: 'space' } })
    ]))
    expect(organization).toMatchObject({ entityType: 'organization', title: '家庭照护小组' })
  })

  it('round-trips ownership roles for the canonical Thing, Action, and Record stores', () => {
    const ownership = {
      createdByUserId: 'user-recorder', ownerRef: { type: 'user' as const, id: 'user-owner' },
      subjectRef: { entityType: 'person' as const, calmyId: 'person-dad' },
      stewardRefs: [{ type: 'person' as const, id: 'person-mom' }], privacy: 'private' as const
    }
    const matter = { calmyId: 'owned-matter', title: '爸爸住院', why: '', primaryContradiction: '', status: 'active' as const, currentStage: 'wood' as const, trajectory: 'stable' as const, evidenceIds: [], createdAt: 1, updatedAt: 1, revision: 1, ownership }
    const action = { calmyId: 'owned-action', title: '联系医院', date: '2026-10-01', status: 'planned' as const, matterId: matter.calmyId, createdAt: 1, updatedAt: 1, revision: 1, ownership }
    const record = { calmyId: 'owned-record', type: 'fact' as const, body: '复诊安排', occurredAt: 1, createdAt: 1, updatedAt: 1, matterId: matter.calmyId, source: 'user' as const, evidenceIds: [], revision: 1, ownership }
    const imported = importOpenWorkspace(exportOpenWorkspace({ matters: [matter], actions: [action], records: [record] }).files)
    expect(imported.issues).toEqual([])
    expect(imported.entities).toEqual(expect.arrayContaining([matter, action, record]))
  })

  it('round-trips Thing settlement decisions without changing the Thing stable ID', () => {
    const thing = {
      calmyId: 'thing-settlement-open-format', entityType: 'thing' as const, title: '爸爸住院', why: '', primaryContradiction: '',
      status: 'archived' as const, currentStage: 'earth' as const, trajectory: 'stable' as const, evidenceIds: [], createdAt: 1, updatedAt: 2, revision: 3,
      settlements: [{ commandId: 'thing-settle-1', settledAt: 2, decisions: [{ entityRef: { entityType: 'relationship' as const, calmyId: 'relationship-care' }, choice: 'keep' as const, targetRef: { entityType: 'thing' as const, calmyId: 'thing-settlement-open-format' }, decidedAt: 2 }] }]
    }
    const workspace = exportOpenWorkspace({ things: [thing] })
    const imported = importOpenWorkspace(workspace.files)
    expect(imported.issues).toEqual([])
    expect(imported.entities).toEqual(expect.arrayContaining([expect.objectContaining({ calmyId: thing.calmyId, entityType: 'thing', settlements: thing.settlements })]))
    expect(workspace.manifest.entities).toContainEqual(expect.objectContaining({ calmy_id: thing.calmyId, calmy_type: 'thing' }))
  })

  it('round-trips settlement history on the legacy Matter repository record', () => {
    const matter = {
      calmyId: 'matter-settlement-open-format', title: '照护安排', why: '', primaryContradiction: '', status: 'archived' as const,
      currentStage: 'earth' as const, trajectory: 'stable' as const, evidenceIds: [], createdAt: 1, updatedAt: 2, revision: 3,
      settlements: [{ commandId: 'matter-settle-1', settledAt: 2, decisions: [{ entityRef: { entityType: 'record' as const, calmyId: 'reflection-1' }, choice: 'keep' as const, targetRef: { entityType: 'thing' as const, calmyId: 'matter-settlement-open-format' }, decidedAt: 2 }] }]
    }
    const imported = importOpenWorkspace(exportOpenWorkspace({ matters: [matter] }).files)
    expect(imported.issues).toEqual([])
    expect(imported.entities).toEqual(expect.arrayContaining([expect.objectContaining({ calmyId: matter.calmyId, settlements: matter.settlements })]))
  })

  it('round-trips Finance entries with ownership and typed references while preserving the legacy stable ID', () => {
    const finance = {
      id: 'expense-open-format-1', entityType: 'finance_entry' as const, type: 'expense', amountCents: 24500,
      category: '医疗', note: '住院费用', date: '2026-10-01', revision: 2,
      ownership: { ownerRef: { type: 'user' as const, id: 'user-owner' }, stewardRefs: [], privacy: 'private' as const }
    }
    const person = unifiedFactories.person({ displayName: '爸爸' })
    const domain = unifiedFactories.domain({ key: 'health-open-format', displayName: '健康' })
    const scene = unifiedFactories.scene({ title: '9月住院', status: 'completed' })
    const matter = { calmyId: 'thing-open-format-finance', title: '爸爸住院', why: '', primaryContradiction: '', status: 'active' as const, currentStage: 'wood' as const, trajectory: 'stable' as const, evidenceIds: [], createdAt: 1, updatedAt: 1, revision: 1 }
    const thing = thingFromMatter(matter)
    const space = unifiedFactories.space({ title: '我的家庭', memberPersonIds: [person.calmyId], relationshipIds: [], thingIds: [thing.calmyId], sceneIds: [scene.calmyId], status: 'active' })
    const relations = [
      unifiedFactories.relation({ from: { entityType: 'finance_entry', calmyId: finance.id }, to: { entityType: 'person', calmyId: person.calmyId }, relationType: 'subject_of', directed: true, sourceIds: [] }),
      unifiedFactories.relation({ from: { entityType: 'finance_entry', calmyId: finance.id }, to: { entityType: 'domain', calmyId: domain.calmyId }, relationType: 'belongs_to_domain', directed: true, sourceIds: [] }),
      unifiedFactories.relation({ from: { entityType: 'finance_entry', calmyId: finance.id }, to: { entityType: 'thing', calmyId: thing.calmyId }, relationType: 'context_of', directed: true, sourceIds: [] }),
      unifiedFactories.relation({ from: { entityType: 'finance_entry', calmyId: finance.id }, to: { entityType: 'scene', calmyId: scene.calmyId }, relationType: 'used_in', directed: true, sourceIds: [] }),
      unifiedFactories.relation({ from: { entityType: 'finance_entry', calmyId: finance.id }, to: { entityType: 'space', calmyId: space.calmyId }, relationType: 'context_of', directed: true, sourceIds: [] }),
      unifiedFactories.relation({ from: { entityType: 'finance_entry', calmyId: finance.id }, to: { entityType: 'time', calmyId: '2026-10' }, relationType: 'context_of', directed: true, sourceIds: [] })
    ]
    const unified = [person, domain, scene, space, ...relations]
    const workspace = exportOpenWorkspace({ unified, things: [thing], finance: [finance] })
    const imported = importOpenWorkspace(workspace.files)

    expect(imported.issues).toEqual([])
    expect(imported.entities).toContainEqual(expect.objectContaining({ entityType: 'finance_entry', id: finance.id, ownership: finance.ownership }))
    expect(imported.entities).toContainEqual(expect.objectContaining({ entityType: 'thing', calmyId: thing.calmyId, title: thing.title }))
    expect(imported.entities).toEqual(expect.arrayContaining(unified.map(entity => expect.objectContaining({ entityType: entity.entityType, calmyId: entity.calmyId }))))
    for (const relation of relations) expect(imported.entities).toContainEqual(expect.objectContaining({
      entityType: 'relation', calmyId: relation.calmyId, from: relation.from, to: relation.to, relationType: relation.relationType
    }))
    expect(imported.entities.filter(entity => 'entityType' in entity && entity.entityType === 'finance_entry')).toHaveLength(1)
    expect(imported.entities.filter(entity => 'entityType' in entity && entity.entityType === 'relation' && 'from' in entity && entity.from.entityType === 'finance_entry')).toHaveLength(6)
    expect(workspace.manifest.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ calmy_id: finance.id, calmy_type: 'finance_entry' })
    ]))
  })

  it('round-trips a legacy Goal and its typed Person, Thing, Scene, Space, Domain and Time references', () => {
    const goal = { id: 'goal-open-ref-1', title: '每周运动', status: 'open', progress: 25, problem: '久坐', evidence: '每周三次', nextAction: '今晚散步', matterId: 'thing-goal-open-ref', ownership: { ownerRef: { type: 'user' as const, id: 'goal-owner' }, stewardRefs: [], privacy: 'private' as const } }
    const person = unifiedFactories.person({ displayName: '本人' })
    const domain = unifiedFactories.domain({ key: 'health-goal-open-ref', displayName: '健康' })
    const scene = unifiedFactories.scene({ title: '建立运动习惯', thingId: goal.matterId })
    const space = unifiedFactories.space({ title: '家庭', memberPersonIds: [person.calmyId], relationshipIds: [], thingIds: [goal.matterId], sceneIds: [scene.calmyId], status: 'active' })
    const relations = [
      unifiedFactories.relation({ from: { entityType: 'goal', calmyId: goal.id }, to: { entityType: 'person', calmyId: person.calmyId }, relationType: 'subject_of', directed: true, sourceIds: [] }),
      unifiedFactories.relation({ from: { entityType: 'goal', calmyId: goal.id }, to: { entityType: 'thing', calmyId: goal.matterId }, relationType: 'context_of', directed: true, sourceIds: [] }),
      unifiedFactories.relation({ from: { entityType: 'goal', calmyId: goal.id }, to: { entityType: 'scene', calmyId: scene.calmyId }, relationType: 'context_of', directed: true, sourceIds: [] }),
      unifiedFactories.relation({ from: { entityType: 'goal', calmyId: goal.id }, to: { entityType: 'space', calmyId: space.calmyId }, relationType: 'context_of', directed: true, sourceIds: [] }),
      unifiedFactories.relation({ from: { entityType: 'goal', calmyId: goal.id }, to: { entityType: 'domain', calmyId: domain.calmyId }, relationType: 'belongs_to_domain', directed: true, sourceIds: [] }),
      unifiedFactories.relation({ from: { entityType: 'goal', calmyId: goal.id }, to: { entityType: 'time', calmyId: '2026-10' }, relationType: 'context_of', directed: true, sourceIds: [] })
    ]
    const workspace = exportOpenWorkspace({ goals: [goal], unified: [person, domain, scene, space, ...relations] })
    const imported = importOpenWorkspace(workspace.files)

    expect(imported.issues).toEqual([])
    expect(imported.entities).toContainEqual(goal)
    for (const relation of relations) expect(imported.entities).toContainEqual(expect.objectContaining({ calmyId: relation.calmyId, from: relation.from, to: relation.to, relationType: relation.relationType }))
    expect(workspace.manifest.entities).toContainEqual(expect.objectContaining({ calmy_id: goal.id, calmy_type: 'goal' }))
  })

  it('durably imports a legacy Goal into its original collection and can then import its Relation', async () => {
    const goal = { id: 'goal-durable-open-1', title: '复诊前准备', status: 'open', progress: 10, nextAction: '联系医院' }
    const person = unifiedFactories.person({ displayName: '爸爸' })
    const relation = unifiedFactories.relation({ from: { entityType: 'goal', calmyId: goal.id }, to: { entityType: 'person', calmyId: person.calmyId }, relationType: 'subject_of', directed: true, sourceIds: [] })
    const imported = importOpenWorkspace(exportOpenWorkspace({ goals: [goal], unified: [person, relation] }).files)
    expect(imported.issues).toEqual([])

    const result = await applyOpenEntitiesDurable([...imported.entities].reverse())

    expect(result.errors).toEqual([])
    expect((await createAsyncCollectionRepository<{ id: string; title: string }>('goals', item => item.id).find(goal.id))?.title).toBe(goal.title)
    expect(await (await import('@/domain/unified')).unifiedAsyncRepository.find<Relation>('relation', relation.calmyId)).toMatchObject({ from: relation.from, to: relation.to })
  })

  it('includes legacy Goals in current Open Format export without changing their IDs or payloads', async () => {
    const goal = { id: 'goal-current-open-1', title: '复诊准备', status: 'open', progress: 30, problem: '资料待整理', nextAction: '收集检查报告' }
    await createAsyncCollectionRepository<typeof goal>('goals', item => item.id).create(goal)

    const workspace = exportCurrentOpenWorkspace()
    const imported = importOpenWorkspace(workspace.files)

    expect(workspace.manifest.entities).toContainEqual(expect.objectContaining({ calmy_id: goal.id, calmy_type: 'goal' }))
    expect(imported.issues).toEqual([])
    expect(imported.entities).toContainEqual(goal)
  })

  it('round-trips DailyState Domain and Scene Relations by the original date-keyed Entity ID', () => {
    const state = unifiedFactories.dailyState({ date: '2026-09-14', bodyState: 'tired', mentalState: 'heavy', load: 70, trajectory: 'recovering', protectedItems: [] })
    const domain = unifiedFactories.domain({ key: 'daily-state-health-open', displayName: '健康' })
    const scene = unifiedFactories.scene({ title: '照护中的状态' })
    const relations = [
      unifiedFactories.relation({ from: { entityType: 'daily_state', calmyId: state.calmyId }, to: { entityType: 'domain', calmyId: domain.calmyId }, relationType: 'belongs_to_domain', directed: true, sourceIds: [] }),
      unifiedFactories.relation({ from: { entityType: 'daily_state', calmyId: state.calmyId }, to: { entityType: 'scene', calmyId: scene.calmyId }, relationType: 'context_of', directed: true, sourceIds: [] })
    ]

    const workspace = exportOpenWorkspace({ unified: [state, domain, scene, ...relations] })
    const imported = importOpenWorkspace(workspace.files)

    expect(imported.issues).toEqual([])
    expect(imported.entities).toContainEqual(expect.objectContaining({ entityType: 'daily_state', calmyId: state.calmyId, date: state.date }))
    for (const relation of relations) expect(imported.entities).toContainEqual(expect.objectContaining({
      entityType: 'relation', calmyId: relation.calmyId, from: relation.from, to: relation.to, relationType: relation.relationType
    }))
  })

  it('durably imports Finance Open Format entities into the existing finance collection', async () => {
    await financeAsyncRepository.replace([])
    store.set('financeMutations', [])
    const entry = {
      id: 'finance-durable-open-1', entityType: 'finance_entry' as const, type: 'expense', amountCents: 3100,
      category: '交通', note: '前往医院', date: '2026-10-01', revision: 1,
      ownership: { ownerRef: { type: 'user' as const, id: 'user-owner' }, stewardRefs: [], privacy: 'private' as const }
    }
    const imported = importOpenWorkspace(exportOpenWorkspace({ finance: [entry] }).files)

    await expect(applyOpenEntitiesDurable(imported.entities)).resolves.toMatchObject({ created: 1, errors: [] })
    expect(await financeAsyncRepository.find(entry.id)).toMatchObject(entry)
    expect(currentOpenEntities()).toEqual(expect.arrayContaining([expect.objectContaining(entry)]))
  })

  it('round-trips Finance ownership history through full Open Workspace export and durable import', async () => {
    await financeAsyncRepository.replace([])
    store.set('financeMutations', [])
    const entry = await financeAsyncRepository.create({ id: 'finance-history-portable-1', type: 'expense', amountCents: 8400, category: '医疗', note: '复诊费用', date: '2026-10-01' })
    const ownership = { ownerRef: { type: 'user' as const, id: 'finance-owner' }, stewardRefs: [], privacy: 'private' as const }
    await financeAsyncRepository.revise(entry.id, { amountCents: 9100, note: '新增检查费用' }, 1, 'finance-owner')
    await financeAsyncRepository.setOwnership(entry.id, ownership, 2, 'finance-owner')
    const workspace = exportCurrentOpenWorkspace()
    expect(workspace.manifest.finance_mutations).toEqual(await financeAsyncRepository.history(entry.id))

    setActiveAccount('reality-open-format-finance-import-user')
    resetStoreCache()
    const imported = importOpenWorkspace(workspace.files)
    expect(imported.issues).toEqual([])
    await expect(applyOpenEntitiesDurable(imported.entities, {}, imported.financeMutations)).resolves.toMatchObject({ created: 1, errors: [] })
    expect(await financeAsyncRepository.find(entry.id)).toMatchObject({ id: entry.id, amountCents: 9100, note: '新增检查费用', ownership })
    expect(await financeAsyncRepository.history(entry.id)).toEqual(imported.financeMutations)
  })

  it('continues to read v1 entity files', () => {
    const person = unifiedFactories.person({ displayName: 'v1 人物' })
    const oldFile = serializeOpenEntity(person).replace('b_version: 2', 'b_version: 1')

    expect(importOpenWorkspace({ '10 People/old.md': oldFile }).entities).toEqual([person])
  })

  it('continues to read v1 manifests with v1 entity files', () => {
    const person = unifiedFactories.person({ displayName: 'v1 清单' })
    const workspace = exportOpenWorkspace({ unified: [person] })
    const path = workspace.manifest.entities[0].path
    const content = workspace.files[path].replace('b_version: 2', 'b_version: 1')
    const manifest = {
      ...workspace.manifest,
      format_version: 1,
      entities: [{ ...workspace.manifest.entities[0], hash: hashOpenText(content) }]
    }
    const imported = importOpenWorkspace({ ...workspace.files, [path]: content, [OPEN_MANIFEST_PATH]: JSON.stringify(manifest) })

    expect(imported.issues).toEqual([])
    expect(imported.entities).toEqual([person])
    expect(imported.manifest?.format_version).toBe(1)
  })

  it('applies imported canonical Things through the single Matter store', () => {
    const thing = thingFromMatter({
      calmyId: 'thing-imported', title: '兼容导入', why: '', primaryContradiction: '', status: 'active',
      currentStage: 'wood', trajectory: 'stable', evidenceIds: [], createdAt: 1, updatedAt: 1, revision: 1
    })
    expect(applyOpenEntities([thing]).created).toBe(1)
    expect(matterRepository.find(thing.calmyId)).toMatchObject({ title: '兼容导入', revision: 1 })
  })

  it('does not export Matter and its Thing projection as two independent files', () => {
    const matter = {
      calmyId: 'one-fact', title: '同一事实', why: '', primaryContradiction: '', status: 'active' as const,
      currentStage: 'wood' as const, trajectory: 'stable' as const, evidenceIds: [], createdAt: 1, updatedAt: 1, revision: 1
    }
    expect(() => exportOpenWorkspace({ matters: [matter], things: [thingFromMatter(matter)] })).toThrow('duplicate-entity-id:one-fact')
  })

  it('round-trips legacy Space access boundaries as adapter metadata', () => {
    const shared = unifiedFactories.sharedSpace({
      title: '迁移边界', status: 'active', memberIds: ['legacy-user'], relationshipIds: [], matterIds: ['matter-shared'],
      allowedMatterIds: ['matter-allowed'], blockedMatterIds: ['matter-private'], ownerId: 'legacy-user'
    })
    const { space } = spaceFromSharedSpace(shared)
    const imported = importOpenWorkspace(exportOpenWorkspace({ unified: [space] }).files)

    expect(imported.issues).toEqual([])
    expect(imported.entities).toEqual([space])
    expect(imported.entities[0]).toMatchObject({
      entityType: 'space', legacyBoundary: { allowedMatterIds: ['matter-allowed'], blockedMatterIds: ['matter-private'], legacyMemberIds: ['legacy-user'] }
    })
  })

  it('preserves unknown legacy fields in the payload fallback', () => {
    const person = { ...unifiedFactories.person({ displayName: '旧字段' }), legacyField: { importedBy: 'v1', value: 42 } }
    const content = serializeOpenEntity(person).replace(/^(display_name|status|roles|domain|notes|tags|linked_user_id):.*\r?\n/gm, '')
    const imported = importOpenWorkspace({ '10 People/legacy-field.md': content })

    expect(imported.issues).toEqual([])
    expect(imported.entities[0]).toEqual(person)
  })
})
