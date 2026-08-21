import { actionRepository } from '@/domain/action/repository'
import type { ActionItem } from '@/domain/action/model'
import { matterRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
import { recordRepository } from '@/domain/record/repository'
import type { RealityRecord, RecordRevision } from '@/domain/record/model'
import { unifiedRepository, type CoreEntityMutation, type Relationship, type SharedSpace } from '@/domain/unified'
import { listSharedAudit } from './collaboration'

export type SharedMatterAccess = 'shared' | 'allowed' | 'blocked'
export type SharedContextOwner = 'relationship' | 'shared_space'

export interface SharedHistoryItem {
  id: string
  owner: SharedContextOwner
  scope: 'relationship' | 'shared_space' | 'matter' | 'action' | 'record'
  entityId: string
  revision?: number
  occurredAt: number
  reason: string
  actorId?: string
  body?: string
}

export interface SharedMatterContext {
  owner: SharedContextOwner
  ownerId: string
  matterId: string
  matter: Matter | undefined
  access: SharedMatterAccess
  actions: ActionItem[]
  records: RealityRecord[]
  history: SharedHistoryItem[]
}

export interface MatterSharedBoundary {
  owner: SharedContextOwner
  ownerId: string
  title: string
  access: SharedMatterAccess
  boundary?: string
}

type SharedBoundaryEntity = Pick<Relationship, 'matterIds' | 'allowedMatterIds' | 'blockedMatterIds'> | Pick<SharedSpace, 'matterIds' | 'allowedMatterIds' | 'blockedMatterIds'>

export function sharedMatterAccess(entity: SharedBoundaryEntity, matterId: string): SharedMatterAccess | undefined {
  if (entity.blockedMatterIds?.includes(matterId)) return 'blocked'
  if (entity.matterIds.includes(matterId)) return 'shared'
  if (entity.allowedMatterIds?.includes(matterId)) return 'allowed'
  return undefined
}

function configuredMatterIds(entity: SharedBoundaryEntity): string[] {
  return [...new Set([
    ...entity.matterIds,
    ...(entity.allowedMatterIds || []),
    ...(entity.blockedMatterIds || [])
  ])]
}

function mutationHistory(owner: SharedContextOwner, scope: SharedContextOwner, entityId: string): SharedHistoryItem[] {
  return unifiedRepository.mutations(scope === owner ? owner : scope, entityId).map((item: CoreEntityMutation) => ({
    id: item.id, owner, scope, entityId, revision: item.toRevision, occurredAt: item.occurredAt,
    reason: `${item.operation} · ${item.actor}`, actorId: item.actorId
  }))
}

function recordHistory(owner: SharedContextOwner, record: RealityRecord): SharedHistoryItem[] {
  return recordRepository.history(record.calmyId).map((item: RecordRevision) => ({
    id: item.id, owner, scope: 'record', entityId: record.calmyId, revision: item.revision,
    occurredAt: item.changedAt, reason: item.reason, actorId: item.actorId, body: item.body
  }))
}

function matterHistory(owner: SharedContextOwner, matterId: string): SharedHistoryItem[] {
  return matterRepository.mutations(matterId).map(item => ({
    id: item.id, owner, scope: 'matter', entityId: matterId, revision: item.toRevision,
    occurredAt: item.occurredAt, reason: `${item.operation} · ${item.actor}`, actorId: item.actorId
  }))
}

function collaborationHistory(owner: SharedContextOwner, ownerId: string, matterId: string): SharedHistoryItem[] {
  return listSharedAudit(owner, ownerId, matterId).map(item => ({
    id: item.id, owner, scope: item.entityType === 'matter' ? 'matter' : item.entityType === 'action' ? 'action' : item.entityType === 'record' ? 'record' : owner, entityId: item.entityId,
    revision: item.toRevision, occurredAt: item.occurredAt, actorId: item.actorId,
    reason: `shared:${item.operation} · ${item.entityType} · ${item.actorId}`
  }))
}

function contextFor(owner: SharedContextOwner, ownerId: string, entity: SharedBoundaryEntity): SharedMatterContext[] {
  return configuredMatterIds(entity).map(matterId => {
    const access = sharedMatterAccess(entity, matterId)
    if (!access) return undefined
    const matter = matterRepository.find(matterId)
    const actions = access === 'blocked' ? [] : actionRepository.listForMatter(matterId)
    const records = access === 'blocked' ? [] : recordRepository.listForMatter(matterId)
    const history = access === 'blocked'
      ? []
      : [
          ...mutationHistory(owner, owner, ownerId),
          ...matterHistory(owner, matterId),
          ...records.flatMap(record => recordHistory(owner, record)),
          ...collaborationHistory(owner, ownerId, matterId)
        ].sort((a, b) => a.occurredAt - b.occurredAt || a.id.localeCompare(b.id))
    return { owner, ownerId, matterId, matter, access, actions, records, history }
  }).filter((item): item is SharedMatterContext => !!item)
}

export function listSharedContextForRelationship(relationshipId: string): SharedMatterContext[] {
  const relationship = unifiedRepository.find<Relationship>('relationship', relationshipId)
  if (!relationship || relationship.status !== 'active') return []
  return contextFor('relationship', relationshipId, relationship)
}

export function listSharedContextForSpace(spaceId: string): SharedMatterContext[] {
  const space = unifiedRepository.find<SharedSpace>('shared_space', spaceId)
  if (!space || space.status !== 'active') return []
  return contextFor('shared_space', spaceId, space)
}

export function listSharedBoundariesForMatter(matterId: string): MatterSharedBoundary[] {
  const relationships = unifiedRepository.list<Relationship>('relationship')
    .filter(item => item.status === 'active')
    .flatMap(item => {
      const access = sharedMatterAccess(item, matterId)
      return access ? [{ owner: 'relationship' as const, ownerId: item.calmyId, title: item.label, access, boundary: item.boundary }] : []
    })
  const spaces = unifiedRepository.list<SharedSpace>('shared_space')
    .filter(item => item.status === 'active')
    .flatMap(item => {
      const access = sharedMatterAccess(item, matterId)
      return access ? [{ owner: 'shared_space' as const, ownerId: item.calmyId, title: item.title, access, boundary: item.boundary }] : []
    })
  return [...relationships, ...spaces]
}
