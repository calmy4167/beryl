import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setActiveAccount } from '@/core/account-context'
import { createCollectionRepository } from '@/core/repository'
import { resetStoreCache } from '@/core/storage'
import { actionRepository } from '@/domain/action/repository'
import { recordRepository } from '@/domain/record/repository'
import { RELATION_DEFINITIONS, unifiedFactories, unifiedRepository, validateRelation } from '@/domain/unified'

describe('Domain and RelationDefinition', () => {
  beforeEach(() => { setActiveAccount('domain-relation-test-user'); localStorage.clear(); resetStoreCache() })
  afterEach(() => setActiveAccount(null))

  it('registers typed definitions for the canonical relationship vocabulary', () => {
    expect(RELATION_DEFINITIONS.map(definition => definition.relationType)).toEqual(expect.arrayContaining([
      'subject_of', 'related_to', 'used_in', 'belongs_to_domain', 'context_of'
    ]))
    expect(unifiedFactories.domain({ key: 'health', displayName: 'Health' })).toMatchObject({
      entityType: 'domain', key: 'health', displayName: 'Health', status: 'active'
    })
  })

  it('declares inverse relations and enforces one-to-many cardinality at the repository boundary', () => {
    const subjectOf = RELATION_DEFINITIONS.find(definition => definition.relationType === 'subject_of')
    const inverse = RELATION_DEFINITIONS.find(definition => definition.relationType === 'has_related_content')
    expect(subjectOf?.inverseType).toBe('has_related_content')
    expect(inverse).toMatchObject({ fromTypes: ['person'], inverseType: 'subject_of', cardinality: 'many-to-many' })

    const person = unifiedRepository.create(unifiedFactories.person({ displayName: '归属测试人物' }))
    const firstDomain = unifiedRepository.create(unifiedFactories.domain({ key: 'health-test', displayName: '健康测试' }))
    const secondDomain = unifiedRepository.create(unifiedFactories.domain({ key: 'work-test', displayName: '工作测试' }))
    unifiedRepository.create(unifiedFactories.relation({
      from: { entityType: 'person', calmyId: person.calmyId },
      to: { entityType: 'domain', calmyId: firstDomain.calmyId },
      relationType: 'belongs_to_domain', directed: true, sourceIds: []
    }))
    expect(() => unifiedRepository.create(unifiedFactories.relation({
      from: { entityType: 'person', calmyId: person.calmyId },
      to: { entityType: 'domain', calmyId: secondDomain.calmyId },
      relationType: 'belongs_to_domain', directed: true, sourceIds: []
    }))).toThrow(/cardinality/)
  })

  it('resolves canonical Action and Reality Record repositories for Domain relations', () => {
    const action = actionRepository.create({ title: '打电话确认', date: '2026-10-01' })
    const record = recordRepository.create({ type: 'fact', body: '已确认时间' })
    const domain = unifiedRepository.create(unifiedFactories.domain({ key: 'care', displayName: '照护' }))
    const actionRelation = unifiedFactories.relation({
      from: { entityType: 'action', calmyId: action.calmyId }, to: { entityType: 'domain', calmyId: domain.calmyId },
      relationType: 'belongs_to_domain', directed: true, sourceIds: []
    })
    const recordRelation = unifiedFactories.relation({
      from: { entityType: 'record', calmyId: record.calmyId }, to: { entityType: 'domain', calmyId: domain.calmyId },
      relationType: 'belongs_to_domain', directed: true, sourceIds: []
    })
    expect(() => unifiedRepository.create(actionRelation)).not.toThrow()
    expect(() => unifiedRepository.create(recordRelation)).not.toThrow()
  })

  it('resolves legacy Finance entries by their stable ID without copying their payload', () => {
    const finance = createCollectionRepository<{ id: string; type: string; amountCents: number; category: string }>('finance', item => item.id)
    const entry = finance.create({ id: 'expense-health-1', type: 'expense', amountCents: 12500, category: '医疗' })
    const domain = unifiedRepository.create(unifiedFactories.domain({ key: 'finance-rel-test', displayName: '财务测试' }))
    const relation = unifiedFactories.relation({
      from: { entityType: 'finance_entry', calmyId: entry.id },
      to: { entityType: 'domain', calmyId: domain.calmyId },
      relationType: 'belongs_to_domain', directed: true, sourceIds: []
    })

    expect(() => unifiedRepository.create(relation)).not.toThrow()
    expect(finance.find(entry.id)).toEqual(entry)
    expect(unifiedRepository.list('relation')).toContainEqual(expect.objectContaining({
      from: { entityType: 'finance_entry', calmyId: entry.id }
    }))
  })

  it('rejects a typed Finance relation when its stable ID is missing', () => {
    const domain = unifiedRepository.create(unifiedFactories.domain({ key: 'finance-missing-test', displayName: '财务测试' }))
    const relation = unifiedFactories.relation({
      from: { entityType: 'finance_entry', calmyId: 'missing-expense' },
      to: { entityType: 'domain', calmyId: domain.calmyId },
      relationType: 'belongs_to_domain', directed: true, sourceIds: []
    })

    expect(() => unifiedRepository.create(relation)).toThrow(/endpoint is missing/)
  })

  it('allows the same Finance entry to be linked into a real Scene context', () => {
    const finance = createCollectionRepository<{ id: string; type: string; amountCents: number; category: string }>('finance', item => item.id)
    const entry = finance.create({ id: 'expense-scene-1', type: 'expense', amountCents: 5800, category: '医疗' })
    const scene = unifiedRepository.create(unifiedFactories.scene({ title: '住院期间' }))
    const relation = unifiedFactories.relation({
      from: { entityType: 'finance_entry', calmyId: entry.id },
      to: { entityType: 'scene', calmyId: scene.calmyId },
      relationType: 'used_in', directed: true, sourceIds: []
    })

    expect(() => unifiedRepository.create(relation)).not.toThrow()
    expect(finance.find(entry.id)).toEqual(entry)
  })

  it('links a legacy Finance entry to a validated date context without a duplicate Time entity', () => {
    const finance = createCollectionRepository<{ id: string; type: string; amountCents: number; category: string }>('finance', item => item.id)
    const entry = finance.create({ id: 'expense-time-1', type: 'expense', amountCents: 5800, category: '医疗' })
    const relation = unifiedFactories.relation({
      from: { entityType: 'finance_entry', calmyId: entry.id },
      to: { entityType: 'time', calmyId: '2026-09-03' },
      relationType: 'context_of', directed: true, sourceIds: []
    })
    expect(() => unifiedRepository.create(relation)).not.toThrow()
    expect(finance.find(entry.id)).toEqual(entry)
    expect(unifiedRepository.list('relation')).toContainEqual(expect.objectContaining({ to: { entityType: 'time', calmyId: '2026-09-03' } }))
    expect(validateRelation({ ...relation, to: { entityType: 'time', calmyId: '2026-02-30' } }, RELATION_DEFINITIONS)).toMatchObject({ valid: false, code: 'ENDPOINT_NOT_FOUND' })
  })

  it('rejects invalid endpoint types and missing endpoint IDs', () => {
    const subject = unifiedFactories.relation({
      from: { entityType: 'thing', calmyId: 'thing-1' },
      to: { entityType: 'person', calmyId: 'person-1' },
      relationType: 'subject_of', directed: true, sourceIds: []
    })
    expect(validateRelation(subject, RELATION_DEFINITIONS, () => true)).toEqual({ valid: true })
    expect(validateRelation({ ...subject, to: { entityType: 'resource', calmyId: 'resource-1' } }, RELATION_DEFINITIONS, () => true)).toMatchObject({ valid: false, code: 'INVALID_TYPE_PAIR' })
    expect(validateRelation(subject, RELATION_DEFINITIONS, ref => ref.calmyId !== 'thing-1')).toMatchObject({ valid: false, code: 'ENDPOINT_NOT_FOUND' })
  })

  it('keeps imported legacy relation strings under explicit compatibility definitions', () => {
    const legacy = unifiedFactories.relation({
      from: { entityType: 'matter', calmyId: 'matter-old' },
      to: { entityType: 'resource', calmyId: 'resource-old' },
      relationType: 'supports', directed: true, sourceIds: []
    })
    expect(validateRelation(legacy, RELATION_DEFINITIONS, () => true)).toEqual({ valid: true })
    expect(() => unifiedRepository.create(legacy)).not.toThrow()
  })

  it('rejects missing canonical endpoints before repository writes', () => {
    const relation = unifiedFactories.relation({
      from: { entityType: 'thing', calmyId: 'missing-thing' },
      to: { entityType: 'person', calmyId: 'missing-person' },
      relationType: 'subject_of', directed: true, sourceIds: []
    })
    expect(() => unifiedRepository.create(relation)).toThrow(/endpoint is missing/)
  })
})
