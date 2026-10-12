import type { RealityDocument } from './query'
import { evaluatePermission, type PermissionContext, type PermissionDecision } from '@/domain/permission/policy'
import { CORE_ENTITY_TYPES, type EntityRef, type Permission, type PermissionAction, type Relation, type Scope } from '@/domain/unified/model'

export interface ContextualViewInput {
  documents: RealityDocument[]
  principalUserId?: string
  action: PermissionAction
  permissions: Permission[]
  scopes: Scope[]
  context?: PermissionContext
  sceneParticipantUserIds?: string[]
  spaceMemberUserIds?: string[]
  personUserBindings?: Array<{ personId: string; userId: string }>
  documentContexts?: Map<string, PermissionContext[]>
  /** Time context filters content only; they never participate in permission evaluation. */
  timeContexts?: Map<string, string[]>
  requestedTimeId?: string
  requestedContext?: PermissionContext
  sceneParticipantsByScene?: Map<string, string[]>
  spaceMembersBySpace?: Map<string, string[]>
}

export interface ContextualViewDecision {
  documentId: string
  allowed: boolean
  reason: string
  permissionDecision?: PermissionDecision
}

export interface ContextualViewResult {
  /** References the canonical RealityDocument objects; it never clones payloads or writes a view store. */
  visible: RealityDocument[]
  decisions: ContextualViewDecision[]
}

function typeKey(type: string): string { return type === 'thing' || type === 'matter' ? 'thing' : type === 'transaction' ? 'finance_entry' : type === 'diary' ? 'diary_entry' : type }
function refKey(ref: Pick<EntityRef, 'entityType' | 'calmyId'>): string { return `${typeKey(ref.entityType)}:${ref.calmyId}` }
function documentKey(document: RealityDocument): string { return refKey({ entityType: document.entityType as EntityRef['entityType'], calmyId: document.calmyId }) }

function contextForRef(ref: EntityRef): PermissionContext | undefined {
  if (ref.entityType === 'person') return { personId: ref.calmyId }
  if (ref.entityType === 'domain') return { domainId: ref.calmyId }
  if (ref.entityType === 'thing' || ref.entityType === 'matter') return { thingId: ref.calmyId }
  if (ref.entityType === 'scene') return { sceneId: ref.calmyId }
  if (ref.entityType === 'space' || ref.entityType === 'shared_space') return { spaceId: ref.calmyId }
  return undefined
}

/** Projects typed Relation and canonical parent references into permission context without copying entity payloads. */
export function projectEntityContexts(documents: RealityDocument[], relations: Relation[]): Map<string, PermissionContext[]> {
  const contexts = new Map<string, PermissionContext[]>()
  const add = (key: string, context: PermissionContext) => {
    let rows = contexts.get(key) || [{}]
    for (const [field, value] of Object.entries(context) as [keyof PermissionContext, string][]) {
      const next: PermissionContext[] = []
      for (const row of rows) {
        const current = row[field]
        if (current === undefined) next.push({ ...row, [field]: value })
        else if (current === value) next.push(row)
        else next.push(row, { ...row, [field]: value })
      }
      rows = next.filter((row, index, all) => all.findIndex(candidate =>
      Object.keys(row).length === Object.keys(candidate).length
      && Object.entries(row).every(([field, value]) => candidate[field as keyof PermissionContext] === value)
      ) === index)
    }
    contexts.set(key, rows)
  }
  for (const document of documents) {
    const key = documentKey(document)
    if (document.entityType === 'person') add(key, { personId: document.calmyId })
    if (document.entityType === 'scene') add(key, { sceneId: document.calmyId })
    if (document.entityType === 'space' || document.entityType === 'shared_space') add(key, { spaceId: document.calmyId })
    if (document.entityType === 'matter') add(key, { thingId: document.calmyId })
    if (document.matterId) add(key, { thingId: document.matterId })
    if (document.ownership?.subjectRef?.entityType === 'person') add(key, { personId: document.ownership.subjectRef.calmyId })
  }
  for (const relation of relations.filter(item => !item.archivedAt)) {
    const fromKey = refKey(relation.from)
    const toKey = refKey(relation.to)
    const toContext = contextForRef(relation.to)
    const fromContext = contextForRef(relation.from)
    if (relation.relationType === 'belongs_to_domain' && toContext?.domainId) add(fromKey, toContext)
    if (relation.relationType === 'subject_of' && toContext?.personId) add(fromKey, toContext)
    if (relation.relationType === 'has_related_content' && fromContext?.personId) add(toKey, fromContext)
    if (relation.relationType === 'used_in' && toContext && ('sceneId' in toContext || 'thingId' in toContext)) add(fromKey, toContext)
    if (relation.relationType === 'context_of') {
      if (toContext) add(fromKey, toContext)
      if (fromContext) add(toKey, fromContext)
    }
  }
  return contexts
}

/** Projects value-based Time references separately from grant-bearing Permission contexts. */
export function projectTimeContexts(documents: RealityDocument[], relations: Relation[]): Map<string, string[]> {
  const documentKeys = new Set(documents.map(documentKey))
  const contexts = new Map<string, string[]>()
  for (const relation of relations) {
    if (relation.archivedAt || relation.relationType !== 'context_of' || relation.to.entityType !== 'time') continue
    const key = refKey(relation.from)
    if (!documentKeys.has(key)) continue
    const dates = contexts.get(key) || []
    if (!dates.includes(relation.to.calmyId)) contexts.set(key, [...dates, relation.to.calmyId].sort())
  }
  return contexts
}

const permissionEntityTypes = new Set<string>([...CORE_ENTITY_TYPES, 'thing', 'matter', 'action', 'record', 'today', 'transaction', 'diary', 'diary_entry', 'goal', 'post'])

function permissionRef(document: RealityDocument): EntityRef | undefined {
  if (!permissionEntityTypes.has(document.entityType)) return undefined
  const entityType = document.entityType === 'transaction' ? 'finance_entry' : document.entityType === 'diary' ? 'diary_entry' : document.entityType
  return { entityType: entityType as EntityRef['entityType'], calmyId: document.calmyId }
}

export function buildContextualView(input: ContextualViewInput): ContextualViewResult {
  const seen = new Set<string>()
  const visible: RealityDocument[] = []
  const decisions: ContextualViewDecision[] = []

  for (const document of input.documents) {
    const key = `${document.source}:${document.entityType}:${document.calmyId}`
    if (seen.has(key)) continue
    seen.add(key)

    const resourceRef = permissionRef(document)
    if (!resourceRef) {
      decisions.push({ documentId: document.calmyId, allowed: false, reason: 'Entity type has no canonical permission reference' })
      continue
    }
    if (input.requestedTimeId && !input.timeContexts?.get(documentKey(document))?.includes(input.requestedTimeId)) {
      decisions.push({ documentId: document.calmyId, allowed: false, reason: 'Entity is not linked to the requested time' })
      continue
    }
    const ownership = document.ownership
    const ownedPersonIds = [
      ...(ownership?.ownerRef.type === 'person' ? [ownership.ownerRef.id] : []),
      ...(ownership?.coOwnerRefs || []).filter(ref => ref.type === 'person').map(ref => ref.id)
    ]
    const ownershipPersonUserIds = (input.personUserBindings || []).filter(binding => ownedPersonIds.includes(binding.personId)).map(binding => binding.userId)
    const contexts = input.documentContexts?.get(documentKey(document)) || [{}]
    const requested = input.requestedContext || {}
    const requestFilters = Object.entries(requested).filter(([, value]) => value !== undefined) as [keyof PermissionContext, string][]
    const matchingContexts = contexts.filter(context => requestFilters.every(([field, value]) => context[field] === value))
    if (requestFilters.length && !matchingContexts.length) {
      decisions.push({ documentId: document.calmyId, allowed: false, reason: 'Entity is not linked to the requested context' })
      continue
    }
    const candidates = matchingContexts.length ? matchingContexts : contexts
    const candidateDecisions = candidates.map(context => evaluatePermission({
      principalUserId: input.principalUserId, action: input.action, resourceRef,
      permissions: input.permissions, scopes: input.scopes, context,
      ownership,
      ownershipPersonUserIds,
      resourcePrivacy: document.ownership?.privacy,
      sceneParticipantUserIds: (context.sceneId && input.sceneParticipantsByScene?.get(context.sceneId)) || input.sceneParticipantUserIds,
      spaceMemberUserIds: (context.spaceId && input.spaceMembersBySpace?.get(context.spaceId)) || input.spaceMemberUserIds
    }))
    const permissionDecision = candidateDecisions.find(decision => decision.allowed) || candidateDecisions[0]
    decisions.push({ documentId: document.calmyId, allowed: permissionDecision.allowed, reason: permissionDecision.reason, permissionDecision })
    if (permissionDecision.allowed) visible.push(document)
  }
  return { visible, decisions }
}
