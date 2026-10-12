import { describe, expect, it } from 'vitest'
import { evaluatePermission } from '@/domain/permission/policy'
import { unifiedFactories } from '@/domain/unified'
import type { Permission } from '@/domain/unified/model'

const resourceRef = { entityType: 'thing' as const, calmyId: 'thing-1' }
const allow = (ref = resourceRef): Permission => unifiedFactories.permission({
  principalUserId: 'user-1', entityRef: ref, effect: 'allow', actions: ['view']
}) as Permission & { calmyId: string }

describe('ownership and Permission evaluation', () => {
  it('defaults to deny and reports why', () => {
    expect(evaluatePermission({ principalUserId: 'user-1', action: 'view', resourceRef, permissions: [], scopes: [] })).toMatchObject({
      allowed: false, matchedRuleIds: [], reason: 'No matching permission; access is denied by default'
    })
  })

  it('allows an explicit entity permission and gives deny precedence', () => {
    const explicitAllow = { ...allow(), calmyId: 'allow-1' }
    const explicitDeny = { ...explicitAllow, calmyId: 'deny-1', effect: 'deny' as const }
    const base = { principalUserId: 'user-1', action: 'view' as const, resourceRef, scopes: [] }
    expect(evaluatePermission({ ...base, permissions: [explicitAllow] })).toMatchObject({ allowed: true, matchedRuleIds: ['allow-1'] })
    expect(evaluatePermission({ ...base, permissions: [explicitAllow, explicitDeny] })).toMatchObject({ allowed: false, matchedRuleIds: ['deny-1'] })
  })

  it('allows matching attached Scope grants but keeps private entities private', () => {
    const scope = unifiedFactories.scope({ personId: 'person-1', thingId: 'thing-1' })
    const grant = unifiedFactories.permission({ principalUserId: 'user-1', scopeId: scope.calmyId, effect: 'allow', actions: ['view'] })
    const input = { principalUserId: 'user-1', action: 'view' as const, resourceRef, permissions: [grant], scopes: [scope], context: { personId: 'person-1', thingId: 'thing-1' } }
    expect(evaluatePermission(input)).toMatchObject({ allowed: true, matchedRuleIds: [grant.calmyId] })
    expect(evaluatePermission({ ...input, resourcePrivate: true })).toMatchObject({ allowed: false, reason: 'Private entity settings block inherited access' })
  })

  it('does not turn an unbound Person or Scene Participant into a User principal', () => {
    const decision = evaluatePermission({
      action: 'view', resourceRef: { entityType: 'scene', calmyId: 'scene-1' }, principalUserId: undefined,
      permissions: [], scopes: [], context: { sceneId: 'scene-1' }
    })
    expect(decision).toMatchObject({ allowed: false, matchedRuleIds: [], reason: 'No User principal is bound to this request' })
  })

  it('requires an explicit Entity permission for Restricted content', () => {
    const scope = unifiedFactories.scope({ personId: 'person-1' })
    const grant = unifiedFactories.permission({ principalUserId: 'user-1', scopeId: scope.calmyId, effect: 'allow', actions: ['view'] })
    const input = { principalUserId: 'user-1', action: 'view' as const, resourceRef, permissions: [grant], scopes: [scope], context: { personId: 'person-1' }, resourcePrivacy: 'restricted' as const }
    expect(evaluatePermission(input)).toMatchObject({ allowed: false, decisiveRule: 'privacy-boundary' })
    const direct = allow()
    expect(evaluatePermission({ ...input, permissions: [direct] })).toMatchObject({ allowed: true, decisiveRule: 'explicit-allow', contextLevel: 'entity' })
  })

  it('lets the recorded owner access their own Entity while never inferring ownership from Subject', () => {
    const ownership = { ownerRef: { type: 'user' as const, id: 'user-1' }, subjectRef: { entityType: 'person' as const, calmyId: 'person-1' }, stewardRefs: [], privacy: 'private' as const }
    expect(evaluatePermission({ principalUserId: 'user-1', action: 'view', resourceRef, permissions: [], scopes: [], ownership })).toMatchObject({
      allowed: true, decisiveRule: 'ownership-owner', reason: 'The current User owns this Entity'
    })
    expect(evaluatePermission({ principalUserId: 'user-2', action: 'view', resourceRef, permissions: [], scopes: [], ownership })).toMatchObject({
      allowed: false, decisiveRule: 'default-deny'
    })
  })

  it('limits Scene and Space visibility to explicitly resolved members and explains the matched context', () => {
    const sceneScope = unifiedFactories.scope({ sceneId: 'scene-1' })
    const grant = unifiedFactories.permission({ principalUserId: 'user-1', scopeId: sceneScope.calmyId, effect: 'allow', actions: ['view'] })
    const base = { principalUserId: 'user-1', action: 'view' as const, resourceRef, permissions: [grant], scopes: [sceneScope], context: { sceneId: 'scene-1' } }
    expect(evaluatePermission({ ...base, resourcePrivacy: 'scene' })).toMatchObject({ allowed: false, decisiveRule: 'privacy-boundary' })
    expect(evaluatePermission({ ...base, resourcePrivacy: 'scene', sceneParticipantUserIds: ['user-1'] })).toMatchObject({
      allowed: true, matchedPrincipalUserId: 'user-1', matchedScopeId: sceneScope.calmyId, contextLevel: 'scene', decisiveRule: 'inherited-allow'
    })
    expect(evaluatePermission({ ...base, resourcePrivacy: 'space', spaceMemberUserIds: ['user-1'] })).toMatchObject({ allowed: false, decisiveRule: 'privacy-boundary' })
  })

  it('keeps a specific Entity deny above Scene and Space inherited allows', () => {
    const spaceScope = unifiedFactories.scope({ spaceId: 'space-1' })
    const sceneScope = unifiedFactories.scope({ spaceId: 'space-1', sceneId: 'scene-1' })
    const spaceAllow = unifiedFactories.permission({ principalUserId: 'user-1', scopeId: spaceScope.calmyId, effect: 'allow', actions: ['view'] })
    const sceneAllow = unifiedFactories.permission({ principalUserId: 'user-1', scopeId: sceneScope.calmyId, effect: 'allow', actions: ['view'] })
    const entityDeny = unifiedFactories.permission({ principalUserId: 'user-1', entityRef: resourceRef, effect: 'deny', actions: ['view'] })

    const result = evaluatePermission({
      principalUserId: 'user-1', action: 'view', resourceRef,
      permissions: [spaceAllow, sceneAllow, entityDeny], scopes: [spaceScope, sceneScope],
      context: { spaceId: 'space-1', sceneId: 'scene-1' }, resourcePrivacy: 'scene', sceneParticipantUserIds: ['user-1']
    })

    expect(result).toMatchObject({ allowed: false, decisiveRule: 'explicit-deny', contextLevel: 'entity', matchedRuleIds: [entityDeny.calmyId] })
  })

  it('selects the most specific matching inherited context and keeps Space below Scene', () => {
    const spaceScope = unifiedFactories.scope({ spaceId: 'space-1' })
    const sceneScope = unifiedFactories.scope({ spaceId: 'space-1', sceneId: 'scene-1' })
    const spaceAllow = unifiedFactories.permission({ principalUserId: 'user-1', scopeId: spaceScope.calmyId, effect: 'allow', actions: ['view'] })
    const sceneAllow = unifiedFactories.permission({ principalUserId: 'user-1', scopeId: sceneScope.calmyId, effect: 'allow', actions: ['view'] })

    expect(evaluatePermission({
      principalUserId: 'user-1', action: 'view', resourceRef, permissions: [spaceAllow, sceneAllow], scopes: [spaceScope, sceneScope],
      context: { spaceId: 'space-1', sceneId: 'scene-1' }, resourcePrivacy: 'scene', sceneParticipantUserIds: ['user-1']
    })).toMatchObject({ allowed: true, decisiveRule: 'inherited-allow', matchedScopeId: sceneScope.calmyId, contextLevel: 'scene' })
  })

  it.each([
    ['Scope', { personId: 'person-1' }, { personId: 'person-1' }, 'scope'],
    ['Scene', { sceneId: 'scene-1' }, { sceneId: 'scene-1' }, 'scene'],
    ['Space', { spaceId: 'space-1' }, { spaceId: 'space-1' }, 'space']
  ] as const)('applies explicit Entity precedence over inherited %s grants and denies', (_level, scopeFields, context, contextLevel) => {
    const scope = unifiedFactories.scope(scopeFields)
    const inheritedAllow = unifiedFactories.permission({ principalUserId: 'user-1', scopeId: scope.calmyId, effect: 'allow', actions: ['view'] })
    const inheritedDeny = unifiedFactories.permission({ principalUserId: 'user-1', scopeId: scope.calmyId, effect: 'deny', actions: ['view'] })
    const entityAllow = allow()
    const entityDeny = { ...entityAllow, calmyId: 'entity-deny', effect: 'deny' as const }
    const base = { principalUserId: 'user-1', action: 'view' as const, resourceRef, scopes: [scope], context }

    expect(evaluatePermission({ ...base, permissions: [entityAllow, inheritedAllow] })).toMatchObject({
      allowed: true, decisiveRule: 'explicit-allow', contextLevel: 'entity'
    })
    expect(evaluatePermission({ ...base, permissions: [entityDeny, inheritedAllow] })).toMatchObject({
      allowed: false, decisiveRule: 'explicit-deny', contextLevel: 'entity'
    })
    expect(evaluatePermission({ ...base, permissions: [entityAllow, inheritedDeny] })).toMatchObject({
      allowed: false, decisiveRule: 'explicit-deny', contextLevel
    })
    expect(evaluatePermission({ ...base, permissions: [entityDeny, inheritedDeny] })).toMatchObject({
      allowed: false, decisiveRule: 'explicit-deny', contextLevel: 'entity'
    })
  })

  it('orders matching inherited grants by the specified Scope then Scene then Space hierarchy', () => {
    const generalScope = unifiedFactories.scope({ personId: 'person-1' })
    const spaceScope = unifiedFactories.scope({ personId: 'person-1', spaceId: 'space-1' })
    const sceneScope = unifiedFactories.scope({ personId: 'person-1', spaceId: 'space-1', sceneId: 'scene-1' })
    const grants = [generalScope, spaceScope, sceneScope].map(scope => unifiedFactories.permission({
      principalUserId: 'user-1', scopeId: scope.calmyId, effect: 'allow', actions: ['view']
    }))
    const result = evaluatePermission({
      principalUserId: 'user-1', action: 'view', resourceRef, permissions: grants,
      scopes: [generalScope, spaceScope, sceneScope], context: { personId: 'person-1', spaceId: 'space-1', sceneId: 'scene-1' }
    })

    expect(result).toMatchObject({
      allowed: true, decisiveRule: 'inherited-allow', matchedScopeId: generalScope.calmyId, contextLevel: 'scope',
      matchedRuleIds: grants.map(grant => grant.calmyId).sort()
    })
  })

  it('applies any matching inherited deny before an allow at every other context level', () => {
    const contexts = [
      { contextLevel: 'scope' as const, fields: { personId: 'person-1' } },
      { contextLevel: 'scene' as const, fields: { sceneId: 'scene-1' } },
      { contextLevel: 'space' as const, fields: { spaceId: 'space-1' } }
    ]
    const context = { personId: 'person-1', sceneId: 'scene-1', spaceId: 'space-1' }

    for (const denyContext of contexts) {
      for (const allowContext of contexts) {
        const denyScope = unifiedFactories.scope(denyContext.fields)
        const allowScope = unifiedFactories.scope(allowContext.fields)
        const deny = unifiedFactories.permission({ principalUserId: 'user-1', scopeId: denyScope.calmyId, effect: 'deny', actions: ['view'] })
        const inheritedAllow = unifiedFactories.permission({ principalUserId: 'user-1', scopeId: allowScope.calmyId, effect: 'allow', actions: ['view'] })
        const result = evaluatePermission({
          principalUserId: 'user-1', action: 'view', resourceRef, permissions: [inheritedAllow, deny],
          scopes: [denyScope, allowScope], context
        })

        expect(result).toMatchObject({
          allowed: false, decisiveRule: 'explicit-deny', matchedRuleIds: [deny.calmyId], contextLevel: denyContext.contextLevel
        })
      }
    }
  })
})
