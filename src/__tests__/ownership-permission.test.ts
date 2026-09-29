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
})
