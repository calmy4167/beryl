import type { EntityRef, Permission, PermissionAction, Scope } from '@/domain/unified/model'

export interface PermissionContext {
  personId?: string
  domainId?: string
  thingId?: string
  sceneId?: string
  spaceId?: string
}

export interface PermissionEvaluationInput {
  principalUserId?: string
  action: PermissionAction
  resourceRef: EntityRef
  permissions: Permission[]
  scopes: Scope[]
  context?: PermissionContext
  resourcePrivate?: boolean
}

export interface PermissionDecision {
  allowed: boolean
  action: PermissionAction
  resourceRef: EntityRef
  matchedRuleIds: string[]
  reason: string
}

function scopeMatches(scope: Scope, context: PermissionContext = {}): boolean {
  const filters: (keyof PermissionContext)[] = ['personId', 'domainId', 'thingId', 'sceneId', 'spaceId']
  return filters.every(key => scope[key] === undefined || scope[key] === context[key])
}

export function evaluatePermission(input: PermissionEvaluationInput): PermissionDecision {
  const { action, resourceRef } = input
  const decision = (allowed: boolean, matchedRuleIds: string[], reason: string): PermissionDecision => ({
    allowed, action, resourceRef, matchedRuleIds, reason
  })
  if (!input.principalUserId) return decision(false, [], 'No User principal is bound to this request')

  const principalRules = input.permissions.filter(rule =>
    rule.principalUserId === input.principalUserId && rule.actions.includes(action)
  )
  const directRules = principalRules.filter(rule => rule.entityRef &&
    rule.entityRef.entityType === resourceRef.entityType && rule.entityRef.calmyId === resourceRef.calmyId
  )
  const scopeById = new Map(input.scopes.map(scope => [scope.calmyId, scope]))
  const inheritedRules = principalRules.filter(rule => {
    if (!rule.scopeId || rule.entityRef) return false
    const scope = scopeById.get(rule.scopeId)
    return !!scope && scopeMatches(scope, input.context)
  })
  const denies = [...directRules, ...inheritedRules].filter(rule => rule.effect === 'deny')
  if (denies.length) return decision(false, denies.map(rule => rule.calmyId).sort(), 'An explicit deny rule applies')

  const directAllows = directRules.filter(rule => rule.effect === 'allow')
  if (directAllows.length) return decision(true, directAllows.map(rule => rule.calmyId).sort(), 'An explicit entity permission allows this action')

  const inheritedAllows = inheritedRules.filter(rule => rule.effect === 'allow')
  if (inheritedAllows.length && input.resourcePrivate) {
    return decision(false, inheritedAllows.map(rule => rule.calmyId).sort(), 'Private entity settings block inherited access')
  }
  if (inheritedAllows.length) return decision(true, inheritedAllows.map(rule => rule.calmyId).sort(), 'An attached Scope permission allows this action')
  return decision(false, [], 'No matching permission; access is denied by default')
}
