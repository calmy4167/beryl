import type { EntityRef, Ownership, Permission, PermissionAction, Scope } from '@/domain/unified/model'

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
  resourcePrivacy?: Ownership['privacy']
  sceneParticipantUserIds?: string[]
  spaceMemberUserIds?: string[]
  ownership?: Ownership
  ownershipPersonUserIds?: string[]
}

export type PermissionDecisionRule = 'ownership-owner' | 'explicit-deny' | 'explicit-allow' | 'inherited-allow' | 'privacy-boundary' | 'default-deny'
export type PermissionContextLevel = 'entity' | 'scope' | 'scene' | 'space' | 'none'

export interface PermissionDecision {
  allowed: boolean
  action: PermissionAction
  resourceRef: EntityRef
  matchedRuleIds: string[]
  reason: string
  decisiveRule: PermissionDecisionRule
  matchedPrincipalUserId?: string
  matchedScopeId?: string
  contextLevel: PermissionContextLevel
}

function scopeMatches(scope: Scope, context: PermissionContext = {}): boolean {
  const filters: (keyof PermissionContext)[] = ['personId', 'domainId', 'thingId', 'sceneId', 'spaceId']
  return filters.every(key => scope[key] === undefined || scope[key] === context[key])
}

export function evaluatePermission(input: PermissionEvaluationInput): PermissionDecision {
  const { action, resourceRef } = input
  const decision = (allowed: boolean, matchedRuleIds: string[], reason: string, decisiveRule: PermissionDecisionRule, matchedScopeId?: string, contextLevel: PermissionContextLevel = 'none'): PermissionDecision => ({
    allowed, action, resourceRef, matchedRuleIds, reason, decisiveRule,
    matchedPrincipalUserId: input.principalUserId, matchedScopeId, contextLevel
  })
  if (!input.principalUserId) return decision(false, [], 'No User principal is bound to this request', 'default-deny')

  const ownership = input.ownership
  const isOwner = ownership?.ownerRef.type === 'user' && ownership.ownerRef.id === input.principalUserId
    || ownership?.coOwnerRefs?.some(ref => ref.type === 'user' && ref.id === input.principalUserId)
    || !!input.ownershipPersonUserIds?.includes(input.principalUserId)

  const principalRules = input.permissions.filter(rule =>
    rule.principalUserId === input.principalUserId && rule.actions.includes(action)
  )
  const directRules = principalRules.filter(rule => rule.entityRef &&
    rule.entityRef.entityType === resourceRef.entityType && rule.entityRef.calmyId === resourceRef.calmyId
  )
  const scopeById = new Map(input.scopes.map(scope => [scope.calmyId, scope]))
  const contextLevelFor = (rule: Permission): PermissionContextLevel => {
    if (rule.entityRef) return 'entity'
    const scope = rule.scopeId ? scopeById.get(rule.scopeId) : undefined
    return scope?.sceneId ? 'scene' : scope?.spaceId ? 'space' : 'scope'
  }
  const contextLevelRank = (rule: Permission): number => {
    const level = contextLevelFor(rule)
    return level === 'entity' ? 4 : level === 'scope' ? 3 : level === 'scene' ? 2 : level === 'space' ? 1 : 0
  }
  const inheritedRules = principalRules.filter(rule => {
    if (!rule.scopeId || rule.entityRef) return false
    const scope = scopeById.get(rule.scopeId)
    return !!scope && scopeMatches(scope, input.context)
  })
  const denies = [...directRules, ...inheritedRules].filter(rule => rule.effect === 'deny')
  if (denies.length) {
    const matched = denies.map(rule => rule.calmyId).sort()
    const first = denies.slice().sort((a, b) => contextLevelRank(b) - contextLevelRank(a) || a.calmyId.localeCompare(b.calmyId))[0]
    return decision(false, matched, 'An explicit deny rule applies', 'explicit-deny', first.scopeId, contextLevelFor(first))
  }

  if (isOwner) return decision(true, [], 'The current User owns this Entity', 'ownership-owner', undefined, 'entity')

  const privacy = input.resourcePrivacy || (input.resourcePrivate ? 'private' : undefined)
  if ((privacy === 'scene' && !input.sceneParticipantUserIds?.includes(input.principalUserId))
    || (privacy === 'space' && !input.spaceMemberUserIds?.includes(input.principalUserId))) {
    return decision(false, [], privacy === 'scene' ? 'Scene participant status is not confirmed' : 'Space membership is not confirmed', 'privacy-boundary')
  }

  const directAllows = directRules.filter(rule => rule.effect === 'allow')
  if (directAllows.length) return decision(true, directAllows.map(rule => rule.calmyId).sort(), 'An explicit entity permission allows this action', 'explicit-allow', undefined, 'entity')

  const allInheritedAllows = inheritedRules.filter(rule => rule.effect === 'allow')
  const inheritedAllows = allInheritedAllows.filter(rule => {
    if (!rule.scopeId) return false
    const scope = scopeById.get(rule.scopeId)
    if (privacy === 'scene') return !!scope?.sceneId && scope.sceneId === input.context?.sceneId
    if (privacy === 'space') return !!scope?.spaceId && scope.spaceId === input.context?.spaceId
    return true
  })
  if ((privacy === 'scene' || privacy === 'space') && allInheritedAllows.length && !inheritedAllows.length) {
    return decision(false, allInheritedAllows.map(rule => rule.calmyId).sort(), privacy === 'scene' ? 'No matching Scene permission applies' : 'No matching Space permission applies', 'privacy-boundary')
  }
  if (inheritedAllows.length && (privacy === 'private' || privacy === 'restricted')) {
    return decision(false, inheritedAllows.map(rule => rule.calmyId).sort(), privacy === 'private' ? 'Private entity settings block inherited access' : 'Restricted content requires an explicit entity permission', 'privacy-boundary')
  }
  if (inheritedAllows.length) {
    const ordered = inheritedAllows.slice().sort((a, b) => contextLevelRank(b) - contextLevelRank(a) || a.calmyId.localeCompare(b.calmyId))
    const matched = ordered[0]
    return decision(true, inheritedAllows.map(rule => rule.calmyId).sort(), 'An attached Scope permission allows this action', 'inherited-allow', matched.scopeId, contextLevelFor(matched))
  }
  return decision(false, [], 'No matching permission; access is denied by default', 'default-deny')
}
