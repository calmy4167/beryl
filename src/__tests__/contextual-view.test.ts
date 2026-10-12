import { describe, expect, it } from 'vitest'
import { buildContextualView, projectEntityContexts, projectTimeContexts } from '@/domain/reality/contextual-view'
import { unifiedFactories } from '@/domain/unified'
import type { RealityDocument } from '@/domain/reality'

const document = (id: string, entityType: RealityDocument['entityType'], ownership?: RealityDocument['ownership']): RealityDocument => ({
  id, calmyId: id, entityType, source: 'unified', title: id, summary: '', route: '/app/library', updatedAt: 1, searchText: '', ownership
})

describe('contextual view projection', () => {
  it('defaults to hidden when ownership or a matching Permission is absent', () => {
    const result = buildContextualView({
      documents: [document('private-note', 'record', { ownerRef: { type: 'user', id: 'owner' }, stewardRefs: [], privacy: 'private' }), document('legacy-note', 'record')],
      principalUserId: 'viewer', action: 'view', permissions: [], scopes: []
    })
    expect(result.visible).toEqual([])
    expect(result.decisions.every(decision => !decision.allowed)).toBe(true)
  })

  it('keeps private Entity data visible to its recorded owner without inferring it from the subject', () => {
    const owned = document('private-owned', 'record', { ownerRef: { type: 'user', id: 'owner' }, subjectRef: { entityType: 'person', calmyId: 'dad' }, stewardRefs: [], privacy: 'private' })
    const result = buildContextualView({ documents: [owned], principalUserId: 'owner', action: 'view', permissions: [], scopes: [] })
    expect(result.visible).toEqual([owned])
    expect(result.decisions[0].permissionDecision).toMatchObject({ decisiveRule: 'ownership-owner' })
  })

  it('applies the same owner and Private boundary to legacy Posts', () => {
    const article = document('post-private', 'post', { ownerRef: { type: 'user', id: 'owner' }, stewardRefs: [], privacy: 'private' })
    expect(buildContextualView({ documents: [article], principalUserId: 'owner', action: 'view', permissions: [], scopes: [] }).visible).toEqual([article])
    expect(buildContextualView({ documents: [article], principalUserId: 'reader', action: 'view', permissions: [], scopes: [] }).visible).toEqual([])
  })

  it('keeps a private ImportantDate with its owner and does not reveal it to the related Person', () => {
    const birthday = document('birthday-1', 'important_date', {
      ownerRef: { type: 'user', id: 'caregiver' }, subjectRef: { entityType: 'person', calmyId: 'dad' }, stewardRefs: [], privacy: 'private'
    })
    expect(buildContextualView({ documents: [birthday], principalUserId: 'caregiver', action: 'view', permissions: [], scopes: [] }).visible).toEqual([birthday])
    expect(buildContextualView({ documents: [birthday], principalUserId: 'dad-user', action: 'view', permissions: [], scopes: [], personUserBindings: [{ personId: 'dad', userId: 'dad-user' }] }).visible).toEqual([])
  })

  it('resolves a Person owner only through an explicit User binding', () => {
    const owned = document('person-owned', 'record', { ownerRef: { type: 'person', id: 'caregiver' }, stewardRefs: [], privacy: 'private' })
    const base = { documents: [owned], principalUserId: 'user-caregiver', action: 'view' as const, permissions: [], scopes: [] }
    expect(buildContextualView(base).visible).toEqual([])
    expect(buildContextualView({ ...base, personUserBindings: [{ personId: 'caregiver', userId: 'user-caregiver' }] }).visible).toEqual([owned])
  })

  it('projects the same document once and uses Scene membership without copying its payload', () => {
    const scope = unifiedFactories.scope({ sceneId: 'scene-1' })
    const permission = unifiedFactories.permission({ principalUserId: 'sibling', scopeId: scope.calmyId, effect: 'allow', actions: ['view'] })
    const medicalRecord = document('record-1', 'record', { ownerRef: { type: 'user', id: 'owner' }, subjectRef: { entityType: 'person', calmyId: 'dad' }, stewardRefs: [], privacy: 'scene' })
    const result = buildContextualView({
      documents: [medicalRecord, medicalRecord], principalUserId: 'sibling', action: 'view', permissions: [permission], scopes: [scope],
      documentContexts: new Map([['record:record-1', [{ sceneId: 'scene-1' }]]]), sceneParticipantUserIds: ['sibling']
    })
    expect(result.visible).toEqual([medicalRecord])
    expect(result.visible[0]).toBe(medicalRecord)
    expect(result.decisions.filter(decision => decision.allowed)).toHaveLength(1)
  })

  it('does not grant Space data access from real-world membership alone', () => {
    const scopedRecord = document('space-private', 'record', {
      ownerRef: { type: 'user', id: 'owner' }, stewardRefs: [], privacy: 'space'
    })
    const spaceScope = unifiedFactories.scope({ spaceId: 'space-1' })
    const result = buildContextualView({
      documents: [scopedRecord], principalUserId: 'member-user', action: 'view', permissions: [], scopes: [spaceScope],
      documentContexts: new Map([['record:space-private', [{ spaceId: 'space-1' }]]]),
      spaceMembersBySpace: new Map([['space-1', ['member-user']]])
    })

    expect(result.visible).toEqual([])
    expect(result.decisions[0].allowed).toBe(false)
  })

  it('denies legacy Diary data when no matching Permission exists', () => {
    const result = buildContextualView({
      documents: [document('diary-1', 'diary')], principalUserId: 'owner', action: 'view', permissions: [], scopes: []
    })
    expect(result.visible).toEqual([])
    expect(result.decisions[0]).toMatchObject({ allowed: false, reason: 'No matching permission; access is denied by default' })
  })

  it('requires an Entity to actually relate to the selected Domain before a Domain Scope applies', () => {
    const scope = unifiedFactories.scope({ domainId: 'health' })
    const permission = unifiedFactories.permission({ principalUserId: 'caregiver', scopeId: scope.calmyId, effect: 'allow', actions: ['view'] })
    const record = document('record-domain', 'record')
    const input = { documents: [record], principalUserId: 'caregiver', action: 'view' as const, permissions: [permission], scopes: [scope], requestedContext: { domainId: 'health' } }
    expect(buildContextualView(input).visible).toEqual([])
    expect(buildContextualView({ ...input, documentContexts: new Map([['record:record-domain', [{ domainId: 'health' }]]]) }).visible).toEqual([record])
  })

  it('projects active typed Relations into combined, linked contexts and ignores archived links', () => {
    const record = document('record-context', 'record')
    const usedIn = unifiedFactories.relation({
      from: { entityType: 'record', calmyId: record.calmyId },
      to: { entityType: 'scene', calmyId: 'scene-1' }, relationType: 'used_in', directed: true, sourceIds: []
    })
    const belongsTo = unifiedFactories.relation({
      from: { entityType: 'record', calmyId: record.calmyId },
      to: { entityType: 'domain', calmyId: 'health' }, relationType: 'belongs_to_domain', directed: true, sourceIds: []
    })
    const archived = unifiedFactories.relation({
      from: { entityType: 'record', calmyId: record.calmyId },
      to: { entityType: 'scene', calmyId: 'old-scene' }, relationType: 'used_in', directed: true, sourceIds: [], archivedAt: 9
    })

    expect(projectEntityContexts([record], [usedIn, belongsTo, archived]).get('record:record-context')).toEqual([
      { sceneId: 'scene-1', domainId: 'health' }
    ])
  })

  it('maps the legacy Finance view to its typed Entity and applies Scene permission without duplicating the record', () => {
    const expense = document('expense-1', 'transaction', {
      ownerRef: { type: 'user', id: 'caregiver' }, stewardRefs: [], privacy: 'scene'
    })
    const scope = unifiedFactories.scope({ sceneId: 'hospital-scene' })
    const permission = unifiedFactories.permission({ principalUserId: 'sibling', scopeId: scope.calmyId, effect: 'allow', actions: ['view'] })
    const relation = unifiedFactories.relation({
      from: { entityType: 'finance_entry', calmyId: expense.calmyId },
      to: { entityType: 'scene', calmyId: 'hospital-scene' }, relationType: 'used_in', directed: true, sourceIds: []
    })
    const documentContexts = projectEntityContexts([expense], [relation])
    const shared = buildContextualView({
      documents: [expense], principalUserId: 'sibling', action: 'view', permissions: [permission], scopes: [scope],
      documentContexts, sceneParticipantUserIds: ['sibling']
    })

    expect(documentContexts.get('finance_entry:expense-1')).toEqual([{ sceneId: 'hospital-scene' }])
    expect(shared.visible).toEqual([expense])
    expect(shared.visible[0]).toBe(expense)
    expect(buildContextualView({
      documents: [expense], principalUserId: 'stranger', action: 'view', permissions: [permission], scopes: [scope],
      documentContexts, sceneParticipantUserIds: ['sibling']
    }).visible).toEqual([])
  })

  it('filters by a requested Time reference without treating date context as an access grant', () => {
    const record = document('dated-record', 'record', { ownerRef: { type: 'user', id: 'owner' }, stewardRefs: [], privacy: 'private' })
    const relation = unifiedFactories.relation({
      from: { entityType: 'record', calmyId: record.calmyId }, to: { entityType: 'time', calmyId: '2026-09' },
      relationType: 'context_of', directed: true, sourceIds: []
    })
    const timeContexts = projectTimeContexts([record], [relation])
    const base = { documents: [record], principalUserId: 'owner', action: 'view' as const, permissions: [], scopes: [], requestedTimeId: '2026-09', timeContexts }
    expect(timeContexts.get('record:dated-record')).toEqual(['2026-09'])
    expect(buildContextualView(base).visible).toEqual([record])
    expect(buildContextualView({ ...base, principalUserId: 'sibling' }).visible).toEqual([])
    expect(buildContextualView({ ...base, requestedTimeId: '2026-10' }).decisions[0].reason).toBe('Entity is not linked to the requested time')
  })
})
