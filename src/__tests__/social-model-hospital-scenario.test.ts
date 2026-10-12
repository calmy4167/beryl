import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setActiveAccount } from '@/core/account-context'
import { resetStoreCache } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import { matterAsyncRepository } from '@/domain/matter/repository'
import { recordAsyncRepository } from '@/domain/record/repository'
import { financeAsyncRepository } from '@/domain/finance/repository'
import { projectEntityContexts, buildContextualView } from '@/domain/reality/contextual-view'
import type { RealityDocument } from '@/domain/reality'
import { unifiedAsyncRepository, unifiedFactories, type Permission, type Relation, type Scope } from '@/domain/unified'

describe('hospital care scenario acceptance', () => {
  beforeEach(() => { setActiveAccount('hospital-scenario-user'); localStorage.clear(); resetStoreCache() })
  afterEach(() => setActiveAccount(null))

  it('keeps one Thing and Scene fact set while hiding the owner private note from a sibling view', async () => {
    const dad = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '爸爸' }))
    const sibling = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '妹妹', linkedUserId: 'sibling-user' }))
    const thing = await matterAsyncRepository.create({ title: '爸爸住院' })
    const space = await unifiedAsyncRepository.create(unifiedFactories.space({ title: '家庭照护', memberPersonIds: [dad.calmyId, sibling.calmyId], relationshipIds: [], thingIds: [thing.calmyId], sceneIds: [], status: 'active' }))
    const scene = await unifiedAsyncRepository.create(unifiedFactories.scene({ title: '本次住院', thingId: thing.calmyId, spaceId: space.calmyId, status: 'active' }))
    await unifiedAsyncRepository.update('space', space.calmyId, { sceneIds: [scene.calmyId] }, { expectedRevision: (await unifiedAsyncRepository.find('space', space.calmyId))!.revision })
    await unifiedAsyncRepository.create(unifiedFactories.sceneParticipant({ sceneId: scene.calmyId, personId: dad.calmyId, role: '患者', joinedAt: 10 }))
    await unifiedAsyncRepository.create(unifiedFactories.sceneParticipant({ sceneId: scene.calmyId, personId: sibling.calmyId, role: '陪护', joinedAt: 20 }))

    const health = await unifiedAsyncRepository.create(unifiedFactories.domain({ key: 'health', displayName: '健康' }))
    const scope: Scope = await unifiedAsyncRepository.create(unifiedFactories.scope({ sceneId: scene.calmyId }))
    const grant: Permission = await unifiedAsyncRepository.create(unifiedFactories.permission({ principalUserId: 'sibling-user', scopeId: scope.calmyId, effect: 'allow', actions: ['view'] }))
    const ownership = { ownerRef: { type: 'user' as const, id: 'caregiver-user' }, stewardRefs: [], subjectRef: { entityType: 'person' as const, calmyId: dad.calmyId } }
    const medical = await recordAsyncRepository.create({ body: '复诊时间已确认', matterId: thing.calmyId, ownership: { ...ownership, privacy: 'scene' } })
    const privateNote = await recordAsyncRepository.create({ body: '我其实很害怕', matterId: thing.calmyId, ownership: { ...ownership, privacy: 'private' } })
    const action = await actionAsyncRepository.create({ title: '取检查报告', date: '2026-10-01', matterId: thing.calmyId, ownership: { ...ownership, privacy: 'scene' } })
    const expense = await financeAsyncRepository.create({ id: 'hospital-expense-shared', type: 'expense', amountCents: 128000, category: '医疗', note: '住院费用', date: '2026-10-01', ownership: { ...ownership, privacy: 'scene' } })
    const privateExpense = await financeAsyncRepository.create({ id: 'hospital-expense-private', type: 'expense', amountCents: 2500, category: '餐饮', note: '照护者私人支出', date: '2026-10-01', ownership: { ...ownership, privacy: 'private' } })
    const medicalDocument: RealityDocument = { id: medical.calmyId, calmyId: medical.calmyId, entityType: 'record', source: 'legacy', title: medical.body, summary: medical.body, route: '/app/review', updatedAt: medical.updatedAt, occurredAt: medical.occurredAt, searchText: medical.body, matterId: thing.calmyId, ownership: medical.ownership }
    const privateDocument: RealityDocument = { ...medicalDocument, id: privateNote.calmyId, calmyId: privateNote.calmyId, title: privateNote.body, summary: privateNote.body, searchText: privateNote.body, ownership: privateNote.ownership }
    const actionDocument: RealityDocument = { ...medicalDocument, id: action.calmyId, calmyId: action.calmyId, entityType: 'action', source: 'legacy', title: action.title, summary: action.title, searchText: action.title, updatedAt: action.updatedAt, occurredAt: action.updatedAt, status: action.status, ownership: action.ownership }
    const expenseDocument: RealityDocument = { ...medicalDocument, id: expense.id, calmyId: expense.id, entityType: 'transaction', source: 'legacy', title: expense.category, summary: expense.note, searchText: expense.note, updatedAt: 1, occurredAt: 1, category: expense.category, amountCents: expense.amountCents, ownership: expense.ownership }
    const privateExpenseDocument: RealityDocument = { ...expenseDocument, id: privateExpense.id, calmyId: privateExpense.id, title: privateExpense.category, summary: privateExpense.note, searchText: privateExpense.note, amountCents: privateExpense.amountCents, ownership: privateExpense.ownership }
    const domainRelation = await unifiedAsyncRepository.create(unifiedFactories.relation({ from: { entityType: 'record', calmyId: medical.calmyId }, to: { entityType: 'domain', calmyId: health.calmyId }, relationType: 'belongs_to_domain', directed: true, sourceIds: [] }))
    const sceneRelation = await unifiedAsyncRepository.create(unifiedFactories.relation({ from: { entityType: 'record', calmyId: medical.calmyId }, to: { entityType: 'scene', calmyId: scene.calmyId }, relationType: 'used_in', directed: true, sourceIds: [] }))
    const actionRelation = await unifiedAsyncRepository.create(unifiedFactories.relation({ from: { entityType: 'action', calmyId: action.calmyId }, to: { entityType: 'scene', calmyId: scene.calmyId }, relationType: 'used_in', directed: true, sourceIds: [] }))
    const expenseDomainRelation = await unifiedAsyncRepository.create(unifiedFactories.relation({ from: { entityType: 'finance_entry', calmyId: expense.id }, to: { entityType: 'domain', calmyId: health.calmyId }, relationType: 'belongs_to_domain', directed: true, sourceIds: [] }))
    const expenseSceneRelation = await unifiedAsyncRepository.create(unifiedFactories.relation({ from: { entityType: 'finance_entry', calmyId: expense.id }, to: { entityType: 'scene', calmyId: scene.calmyId }, relationType: 'used_in', directed: true, sourceIds: [] }))
    const relations: Relation[] = [domainRelation, sceneRelation, actionRelation, expenseDomainRelation, expenseSceneRelation]
    const documents = [medicalDocument, privateDocument, actionDocument, expenseDocument, privateExpenseDocument]
    const docsInContext = projectEntityContexts(documents, relations)
    const scopeRows = [scope]
    const permissionRows = [grant]

    const siblingView = buildContextualView({ documents, principalUserId: 'sibling-user', action: 'view', permissions: permissionRows, scopes: scopeRows, requestedContext: { sceneId: scene.calmyId }, documentContexts: docsInContext, sceneParticipantUserIds: ['sibling-user'] })
    const ownerView = buildContextualView({ documents, principalUserId: 'caregiver-user', action: 'view', permissions: [], scopes: [], requestedContext: { thingId: thing.calmyId }, documentContexts: docsInContext })
    const unboundDadView = buildContextualView({ documents, principalUserId: dad.linkedUserId, action: 'view', permissions: permissionRows, scopes: scopeRows, requestedContext: { sceneId: scene.calmyId }, documentContexts: docsInContext, sceneParticipantUserIds: ['sibling-user'] })

    expect(siblingView.visible.map(item => item.calmyId)).toEqual([medical.calmyId, action.calmyId, expense.id])
    expect(siblingView.visible).not.toContain(privateDocument)
    expect(siblingView.visible).not.toContain(privateExpenseDocument)
    expect(ownerView.visible.map(item => item.calmyId)).toEqual(expect.arrayContaining([medical.calmyId, privateNote.calmyId, expense.id, privateExpense.id]))
    expect(unboundDadView.visible).toEqual([])
    expect(await matterAsyncRepository.find(thing.calmyId)).toEqual(expect.objectContaining({ calmyId: scene.thingId }))
    expect(await unifiedAsyncRepository.find('scene', scene.calmyId)).toBeDefined()
    expect((await unifiedAsyncRepository.list('permission'))).toEqual([grant])
  })
})
