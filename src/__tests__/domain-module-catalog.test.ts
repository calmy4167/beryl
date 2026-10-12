import { describe, expect, it } from 'vitest'
import { appPageRegistry } from '@/router/route-manifest'
import { CANONICAL_ENTITY_IDENTITIES, MODULE_CATALOG, MODULE_CONCEPTS, validateModuleCatalog } from '@/domain/unified/module-catalog'

describe('canonical module catalog', () => {
  it('covers every visible route and represents pages as views over canonical stores', () => {
    expect(MODULE_CATALOG.map(module => module.key).sort()).toEqual(appPageRegistry.map(page => page.id).sort())
    expect(MODULE_CATALOG.every(module => module.classification === 'view')).toBe(true)
    expect(MODULE_CATALOG.find(module => module.key === 'finance')).toMatchObject({ domainKey: 'finance', domainAssignment: 'via-relation', viewRole: 'domain-view' })
    expect(MODULE_CATALOG.find(module => module.key === 'today')?.domainAssignment).toBe('partial')
    expect(MODULE_CATALOG.find(module => module.key === 'today')?.supportedRealityObjectRefs).toEqual(['person', 'thing', 'scene', 'space', 'time'])
    expect(MODULE_CATALOG.find(module => module.key === 'pomo')?.supportedRealityObjectRefs).toEqual(['person', 'thing', 'scene', 'space', 'time'])
    expect(MODULE_CATALOG.find(module => module.key === 'goals')?.domainAssignment).toBe('via-relation')
    expect(MODULE_CATALOG.find(module => module.key === 'posts')?.domainAssignment).toBe('via-relation')
    expect(MODULE_CATALOG.find(module => module.key === 'cycle')?.supportedRealityObjectRefs).toEqual(['person', 'thing', 'scene', 'space', 'time'])
    expect(MODULE_CATALOG.find(module => module.key === 'scene')).toMatchObject({ canonicalEntityTypes: [], canonicalRepositories: [], viewRole: 'configuration' })
    expect(MODULE_CONCEPTS).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'person', classification: 'entity-type', canonicalRepository: 'core:person' }),
      expect.objectContaining({ key: 'organization', classification: 'entity-type', canonicalRepository: 'core:organization' }),
      expect.objectContaining({ key: 'thing', classification: 'reality-object', canonicalRepository: 'matter' }),
      expect.objectContaining({ key: 'scene', classification: 'reality-object', canonicalRepository: 'core:scene' }),
      expect.objectContaining({ key: 'domain', classification: 'domain', canonicalRepository: 'core:domain' }),
      expect.objectContaining({ key: 'domain:health', classification: 'domain', canonicalRepository: 'core:domain' }),
      expect.objectContaining({ key: 'domain:finance', classification: 'domain', canonicalRepository: 'core:domain' })
    ]))
  })

  it('rejects duplicate module keys, unknown entity types, and noncanonical repositories', () => {
    const valid = MODULE_CATALOG[0]
    expect(() => validateModuleCatalog([valid, valid])).toThrow(/duplicate module key/i)
    expect(() => validateModuleCatalog([{ ...valid, canonicalEntityTypes: ['mystery'] as never }])).toThrow(/unknown entity type/i)
    expect(() => validateModuleCatalog([{ ...valid, canonicalRepositories: ['localStorage'] as never }])).toThrow(/noncanonical repository/i)
    expect(() => validateModuleCatalog([{ ...valid, canonicalRepositories: ['core:person', 'today'] as never }])).toThrow(/unassigned repository/i)
  })

  it('requires every entity type to resolve to exactly one canonical repository', () => {
    const actionViews = MODULE_CATALOG.filter(module => module.canonicalEntityTypes.includes('action'))
    expect(actionViews.length).toBeGreaterThan(1)
    expect(new Set(actionViews.flatMap(module => module.canonicalRepositories.filter(repository => repository === 'action')))).toEqual(new Set(['action']))
    expect(CANONICAL_ENTITY_IDENTITIES.get('thing')).toEqual({ repository: 'matter', stableIdField: 'calmyId' })
    expect(CANONICAL_ENTITY_IDENTITIES.get('today')).toEqual({ repository: 'today', stableIdField: 'date' })
    for (const module of MODULE_CATALOG) for (const entityType of module.canonicalEntityTypes) {
      expect(CANONICAL_ENTITY_IDENTITIES.get(entityType)).toBeDefined()
    }
    expect(validateModuleCatalog(MODULE_CATALOG)).toEqual({ valid: true, moduleCount: MODULE_CATALOG.length })
  })
})
