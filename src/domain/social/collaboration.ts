import { readSession } from '@/core/auth'
import { createCollectionRepository, createEntityId } from '@/core/repository'
import { actionRepository } from '@/domain/action/repository'
import type { ActionCommandMeta, ActionCreateInput, ActionItem, ActionStatus } from '@/domain/action/model'
import { matterRepository } from '@/domain/matter/repository'
import type { Matter, MatterCommandMeta, MatterUpdatePatch } from '@/domain/matter/model'
import { recordRepository } from '@/domain/record/repository'
import type { RealityRecord, RecordCreateInput } from '@/domain/record/model'
import { unifiedFactories, unifiedRepository, type Relationship, type SharedSpace } from '@/domain/unified'

export type SharedOwnerType = 'relationship' | 'shared_space'
export type SharedMemberRole = 'owner' | 'member' | 'none'
export type SharedWriteOperation = 'create' | 'update' | 'transition' | 'revise'

export interface SharedWriteAccess {
  allowed: boolean
  role: SharedMemberRole
  owner: SharedOwnerType
  ownerId: string
  matterId?: string
  reason: string
}

export interface SharedAuditEntry {
  id: string
  owner: SharedOwnerType
  ownerId: string
  matterId?: string
  entityType: 'relationship' | 'shared_space' | 'matter' | 'action' | 'record'
  entityId: string
  operation: SharedWriteOperation
  commandId: string
  actorId: string
  fromRevision: number
  toRevision: number
  occurredAt: number
  patch?: unknown
}

export class SharedPermissionError extends Error {
  readonly code = 'PERMISSION_DENIED' as const
  constructor(message: string) { super(message); this.name = 'SharedPermissionError' }
}

const audit = createCollectionRepository<SharedAuditEntry>('sharedCollaborationAudit')

export function currentCollaboratorId(): string { return readSession()?.u || 'local-user' }

function ownerEntity(owner: SharedOwnerType, ownerId: string): Relationship | SharedSpace | undefined {
  return owner === 'relationship'
    ? unifiedRepository.find<Relationship>('relationship', ownerId)
    : unifiedRepository.find<SharedSpace>('shared_space', ownerId)
}

function roleFor(owner: SharedOwnerType, entity: Relationship | SharedSpace, actorId: string): SharedMemberRole {
  if (entity.ownerId === actorId) return 'owner'
  if (owner === 'relationship') {
    const relationship = entity as Relationship
    return relationship.personAId === actorId || relationship.personBId === actorId ? 'member' : 'none'
  }
  return (entity as SharedSpace).memberIds.includes(actorId) ? 'member' : 'none'
}

function matterAccess(entity: Relationship | SharedSpace, matterId: string): 'shared' | 'allowed' | 'blocked' | undefined {
  if (entity.blockedMatterIds?.includes(matterId)) return 'blocked'
  if (entity.matterIds.includes(matterId)) return 'shared'
  if (entity.allowedMatterIds?.includes(matterId)) return 'allowed'
  return undefined
}

export function sharedWriteAccess(owner: SharedOwnerType, ownerId: string, actorId = currentCollaboratorId(), matterId?: string): SharedWriteAccess {
  const entity = ownerEntity(owner, ownerId)
  if (!entity) return { allowed: false, role: 'none', owner, ownerId, matterId, reason: '共享上下文不存在' }
  const role = roleFor(owner, entity, actorId)
  if (entity.status !== 'active') return { allowed: false, role, owner, ownerId, matterId, reason: '共享上下文已暂停或归档' }
  if (role === 'none') return { allowed: false, role, owner, ownerId, matterId, reason: '操作者不是该共享上下文成员' }
  if (matterId) {
    const access = matterAccess(entity, matterId)
    if (access === 'blocked') return { allowed: false, role, owner, ownerId, matterId, reason: '该 Matter 被共享边界阻止' }
    if (!access) return { allowed: false, role, owner, ownerId, matterId, reason: '该 Matter 不在共享边界内' }
  }
  return { allowed: true, role, owner, ownerId, matterId, reason: '允许写入' }
}

function assertWrite(owner: SharedOwnerType, ownerId: string, actorId: string, matterId?: string, manage = false): SharedWriteAccess {
  const access = sharedWriteAccess(owner, ownerId, actorId, matterId)
  if (!access.allowed || (manage && access.role !== 'owner' && ownerEntity(owner, ownerId)?.ownerId)) {
    throw new SharedPermissionError(`${access.reason}：${owner}:${ownerId}`)
  }
  return access
}

function commandId(): string { return createEntityId() }

function auditWrite(entry: Omit<SharedAuditEntry, 'id' | 'occurredAt'>): void {
  audit.create({ ...entry, id: createEntityId(), occurredAt: Date.now() })
}

export function listSharedAudit(owner?: SharedOwnerType, ownerId?: string, matterId?: string): SharedAuditEntry[] {
  return audit.list()
    .filter(item => (!owner || item.owner === owner) && (!ownerId || item.ownerId === ownerId) && (!matterId || item.matterId === matterId))
    .sort((a, b) => a.occurredAt - b.occurredAt || a.id.localeCompare(b.id))
}

export function createCollaborativeRelationship(input: Omit<Relationship, 'calmyId' | 'entityType' | 'createdAt' | 'updatedAt' | 'revision' | 'source'>, actorId = currentCollaboratorId()): Relationship {
  const id = commandId()
  const relationship = unifiedRepository.create(unifiedFactories.relationship({ ...input, ownerId: actorId }), { commandId: id, actorId, sourceIds: ['shared:relationship'] })
  auditWrite({ owner: 'relationship', ownerId: relationship.calmyId, entityType: 'relationship', entityId: relationship.calmyId, operation: 'create', commandId: id, actorId, fromRevision: 0, toRevision: relationship.revision, patch: relationship })
  return relationship
}

export function createCollaborativeSharedSpace(input: Omit<SharedSpace, 'calmyId' | 'entityType' | 'createdAt' | 'updatedAt' | 'revision' | 'source'>, actorId = currentCollaboratorId()): SharedSpace {
  const id = commandId()
  const space = unifiedRepository.create(unifiedFactories.sharedSpace({ ...input, ownerId: actorId }), { commandId: id, actorId, sourceIds: ['shared:shared_space'] })
  auditWrite({ owner: 'shared_space', ownerId: space.calmyId, entityType: 'shared_space', entityId: space.calmyId, operation: 'create', commandId: id, actorId, fromRevision: 0, toRevision: space.revision, patch: space })
  return space
}

export function updateCollaborativeRelationship(id: string, patch: Partial<Relationship>, expectedRevision: number | undefined, actorId = currentCollaboratorId()): Relationship {
  const current = unifiedRepository.find<Relationship>('relationship', id)
  if (!current) throw new SharedPermissionError('Relationship 不存在')
  assertWrite('relationship', id, actorId, undefined, true)
  const command = commandId()
  const next = unifiedRepository.update<Relationship>('relationship', id, patch, { commandId: command, actorId, expectedRevision, sourceIds: ['shared:relationship'] })
  auditWrite({ owner: 'relationship', ownerId: id, entityType: 'relationship', entityId: id, operation: 'update', commandId: command, actorId, fromRevision: current.revision, toRevision: next.revision, patch })
  return next
}

export function updateCollaborativeSharedSpace(id: string, patch: Partial<SharedSpace>, expectedRevision: number | undefined, actorId = currentCollaboratorId()): SharedSpace {
  const current = unifiedRepository.find<SharedSpace>('shared_space', id)
  if (!current) throw new SharedPermissionError('Shared Space 不存在')
  assertWrite('shared_space', id, actorId, undefined, true)
  const command = commandId()
  const next = unifiedRepository.update<SharedSpace>('shared_space', id, patch, { commandId: command, actorId, expectedRevision, sourceIds: ['shared:shared_space'] })
  auditWrite({ owner: 'shared_space', ownerId: id, entityType: 'shared_space', entityId: id, operation: 'update', commandId: command, actorId, fromRevision: current.revision, toRevision: next.revision, patch })
  return next
}

export function updateSharedMatter(owner: SharedOwnerType, ownerId: string, matterId: string, patch: MatterUpdatePatch, expectedRevision: number | undefined, actorId = currentCollaboratorId()): Matter {
  assertWrite(owner, ownerId, actorId, matterId)
  const current = matterRepository.find(matterId)
  if (!current) throw new SharedPermissionError('Matter 不存在')
  const command = commandId()
  const next = matterRepository.update(matterId, patch, { commandId: command, actorId, expectedRevision, sourceIds: [`shared:${owner}:${ownerId}`] } satisfies MatterCommandMeta)
  auditWrite({ owner, ownerId, matterId, entityType: 'matter', entityId: matterId, operation: 'update', commandId: command, actorId, fromRevision: current.revision, toRevision: next.revision, patch })
  return next
}

export function updateSharedAction(owner: SharedOwnerType, ownerId: string, actionId: string, patch: Partial<ActionItem>, matterId: string, expectedRevision: number | undefined, actorId = currentCollaboratorId()): ActionItem {
  assertWrite(owner, ownerId, actorId, matterId)
  const current = actionRepository.find(actionId)
  if (!current || current.matterId !== matterId) throw new SharedPermissionError('共享 Action 不存在或不属于该 Matter')
  const command = commandId()
  const next = actionRepository.update(actionId, patch, { commandId: command, actorId, expectedRevision, sourceIds: [`shared:${owner}:${ownerId}`] } satisfies ActionCommandMeta)
  auditWrite({ owner, ownerId, matterId, entityType: 'action', entityId: actionId, operation: 'update', commandId: command, actorId, fromRevision: current.revision, toRevision: next.revision, patch })
  return next
}

export function createSharedAction(owner: SharedOwnerType, ownerId: string, input: ActionCreateInput, matterId: string, actorId = currentCollaboratorId()): ActionItem {
  assertWrite(owner, ownerId, actorId, matterId)
  const command = commandId()
  const action = actionRepository.create({ ...input, matterId }, { commandId: command, actorId, sourceIds: [`shared:${owner}:${ownerId}`] })
  auditWrite({ owner, ownerId, matterId, entityType: 'action', entityId: action.calmyId, operation: 'create', commandId: command, actorId, fromRevision: 0, toRevision: action.revision, patch: input })
  return action
}

export function transitionSharedAction(owner: SharedOwnerType, ownerId: string, actionId: string, status: ActionStatus, matterId: string, expectedRevision: number | undefined, actorId = currentCollaboratorId(), resultNote?: string): ActionItem {
  assertWrite(owner, ownerId, actorId, matterId)
  const current = actionRepository.find(actionId)
  if (!current || current.matterId !== matterId) throw new SharedPermissionError('共享 Action 不存在或不属于该 Matter')
  const command = commandId()
  const next = actionRepository.transition(actionId, status, expectedRevision, resultNote, { commandId: command, actorId, sourceIds: [`shared:${owner}:${ownerId}`] })
  auditWrite({ owner, ownerId, matterId, entityType: 'action', entityId: actionId, operation: 'transition', commandId: command, actorId, fromRevision: current.revision, toRevision: next.revision, patch: { status, resultNote } })
  return next
}

export function createSharedRecord(owner: SharedOwnerType, ownerId: string, input: RecordCreateInput, actorId = currentCollaboratorId()): RealityRecord {
  const matterId = input.matterId
  if (!matterId) throw new SharedPermissionError('共享 Record 必须归属 Matter')
  assertWrite(owner, ownerId, actorId, matterId)
  const record = recordRepository.create(input, { actorId, sourceIds: [`shared:${owner}:${ownerId}`] })
  auditWrite({ owner, ownerId, matterId, entityType: 'record', entityId: record.calmyId, operation: 'create', commandId: commandId(), actorId, fromRevision: 0, toRevision: record.revision, patch: input })
  return record
}

export function reviseSharedRecord(owner: SharedOwnerType, ownerId: string, recordId: string, body: string, reason: string, expectedRevision: number | undefined, actorId = currentCollaboratorId()): RealityRecord {
  const current = recordRepository.find(recordId)
  if (!current?.matterId) throw new SharedPermissionError('共享 Record 不存在或没有 Matter')
  assertWrite(owner, ownerId, actorId, current.matterId)
  const record = recordRepository.revise(recordId, body, reason, 'user', expectedRevision, actorId)
  auditWrite({ owner, ownerId, matterId: current.matterId, entityType: 'record', entityId: recordId, operation: 'revise', commandId: commandId(), actorId, fromRevision: current.revision, toRevision: record.revision, patch: { body, reason } })
  return record
}
