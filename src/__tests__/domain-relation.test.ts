import { describe, expect, it } from 'vitest'
import { RELATION_DEFINITIONS, unifiedFactories, unifiedRepository, validateRelation } from '@/domain/unified'

describe('Domain and RelationDefinition', () => {
  it('registers typed definitions for the canonical relationship vocabulary', () => {
    expect(RELATION_DEFINITIONS.map(definition => definition.relationType)).toEqual(expect.arrayContaining([
      'subject_of', 'related_to', 'used_in', 'belongs_to_domain', 'context_of'
    ]))
    expect(unifiedFactories.domain({ key: 'health', displayName: 'Health' })).toMatchObject({
      entityType: 'domain', key: 'health', displayName: 'Health', status: 'active'
    })
  })

  it('rejects invalid endpoint types and missing endpoint IDs', () => {
    const subject = unifiedFactories.relation({
      from: { entityType: 'person', calmyId: 'person-1' },
      to: { entityType: 'thing', calmyId: 'thing-1' },
      relationType: 'subject_of', directed: true, sourceIds: []
    })
    expect(validateRelation(subject, RELATION_DEFINITIONS, () => true)).toEqual({ valid: true })
    expect(validateRelation({ ...subject, from: { entityType: 'resource', calmyId: 'resource-1' } }, RELATION_DEFINITIONS, () => true)).toMatchObject({ valid: false, code: 'INVALID_TYPE_PAIR' })
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
      from: { entityType: 'person', calmyId: 'missing-person' },
      to: { entityType: 'thing', calmyId: 'missing-thing' },
      relationType: 'subject_of', directed: true, sourceIds: []
    })
    expect(() => unifiedRepository.create(relation)).toThrow(/endpoint is missing/)
  })
})
