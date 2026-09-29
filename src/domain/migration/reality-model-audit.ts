import type { Matter, Thing } from '@/domain/matter/model'
import { matterFromThing } from '@/domain/matter/model'
import { SCENES } from '@/core/scenes'
import { RELATION_DEFINITIONS, validateRelation, type Domain, type EntityRef, type Permission, type Person, type Relation, type Scene, type SceneParticipant, type Scope, type Space, type LegacySpaceBoundary } from '@/domain/unified/model'

export interface RealityModelSnapshot {
  people: Person[]
  matters: Matter[]
  things: Thing[]
  scenes: Scene[]
  sceneParticipants: SceneParticipant[]
  spaces: Space[]
  legacySpaceBoundaries: LegacySpaceBoundary[]
  relations: Relation[]
  domains: Domain[]
  scopes: Scope[]
  permissions: Permission[]
  /** Supply known accounts when available; omitted means account links cannot be checked. */
  knownUserIds?: string[]
  otherEntityRefs?: EntityRef[]
}

export interface RealityModelAuditIssue {
  code: string
  sourceIds: string[]
  detail: string
}

export interface RealityModelAudit {
  counts: Record<keyof Omit<RealityModelSnapshot, 'knownUserIds' | 'otherEntityRefs'>, number>
  issueCount: number
  issues: RealityModelAuditIssue[]
}

function refKey(ref: EntityRef): string { return `${ref.entityType}:${ref.calmyId}` }

export function auditRealityModelMigration(snapshot: RealityModelSnapshot): RealityModelAudit {
  const issues: RealityModelAuditIssue[] = []
  const add = (code: string, ids: string[], detail: string) => issues.push({ code, sourceIds: [...ids].sort(), detail })
  const ids = {
    person: new Set(snapshot.people.map(item => item.calmyId)),
    matter: new Set(snapshot.matters.map(item => item.calmyId)),
    scene: new Set(snapshot.scenes.map(item => item.calmyId)),
    scene_participant: new Set(snapshot.sceneParticipants.map(item => item.calmyId)),
    space: new Set(snapshot.spaces.map(item => item.calmyId)),
    relation: new Set(snapshot.relations.map(item => item.calmyId)),
    domain: new Set(snapshot.domains.map(item => item.calmyId)),
    scope: new Set(snapshot.scopes.map(item => item.calmyId)),
    permission: new Set(snapshot.permissions.map(item => item.calmyId))
  }

  const typedIds = new Map<string, string[]>()
  const addIds = (type: string, values: { calmyId: string }[]) => values.forEach(item => typedIds.set(item.calmyId, [...(typedIds.get(item.calmyId) || []), type]))
  addIds('person', snapshot.people); addIds('matter', snapshot.matters); addIds('thing', snapshot.things); addIds('scene', snapshot.scenes)
  addIds('scene_participant', snapshot.sceneParticipants); addIds('space', snapshot.spaces); addIds('relation', snapshot.relations)
  addIds('domain', snapshot.domains); addIds('scope', snapshot.scopes); addIds('permission', snapshot.permissions)
  for (const [id, types] of typedIds) {
    if (new Set(types).size > 1 && !(new Set(types).size === 2 && types.includes('matter') && types.includes('thing'))) {
      add('DISTINCT_OBJECT_ID_COLLISION', [id], `ID is used by distinct types: ${[...new Set(types)].sort().join(', ')}`)
    }
  }

  const matterById = new Map(snapshot.matters.map(item => [item.calmyId, item]))
  for (const thing of snapshot.things) {
    const matter = matterById.get(thing.calmyId)
    if (!matter) {
      add('THING_WITHOUT_MATTER_PROJECTION', [thing.calmyId], 'Thing has no same-ID Matter source')
      continue
    }
    if (JSON.stringify(matterFromThing(thing)) !== JSON.stringify(matter)) {
      add('MATTER_THING_PROJECTION_DIFFERENCE', [matter.calmyId, thing.calmyId], 'Matter fields differ from its Thing projection')
    }
  }

  if (snapshot.knownUserIds) {
    const users = new Set(snapshot.knownUserIds)
    for (const person of snapshot.people) {
      if (person.linkedUserId && !users.has(person.linkedUserId)) add('UNRESOLVED_PERSON_USER_LINK', [person.calmyId, person.linkedUserId], 'Person points to an account that is not in the supplied account set')
    }
  }

  const endpointExists = (ref: EntityRef): boolean => {
    if (ref.entityType === 'thing' || ref.entityType === 'matter') return ids.matter.has(ref.calmyId)
    if (ref.entityType === 'person') return ids.person.has(ref.calmyId)
    if (ref.entityType === 'scene') return ids.scene.has(ref.calmyId)
    if (ref.entityType === 'scene_participant') return ids.scene_participant.has(ref.calmyId)
    if (ref.entityType === 'space' || ref.entityType === 'shared_space') return ids.space.has(ref.calmyId)
    if (ref.entityType === 'domain') return ids.domain.has(ref.calmyId)
    if (ref.entityType === 'scope') return ids.scope.has(ref.calmyId)
    if (ref.entityType === 'permission') return ids.permission.has(ref.calmyId)
    return (snapshot.otherEntityRefs || []).some(item => refKey(item) === refKey(ref))
  }
  for (const relation of snapshot.relations) {
    const definitionResult = validateRelation(relation, RELATION_DEFINITIONS)
    if (!definitionResult.valid) add('INVALID_RELATION_ENDPOINT', [relation.calmyId, relation.from.calmyId, relation.to.calmyId], definitionResult.reason)
    for (const endpoint of [relation.from, relation.to]) {
      if (!endpointExists(endpoint)) add('INVALID_RELATION_ENDPOINT', [relation.calmyId, endpoint.calmyId], `Missing ${refKey(endpoint)} endpoint`)
    }
  }

  const personIds = ids.person; const spaceIds = ids.space; const users = new Set(snapshot.knownUserIds || [])
  const hasUserSet = snapshot.knownUserIds !== undefined
  const ownerships = [
    ...snapshot.people, ...snapshot.scenes, ...snapshot.sceneParticipants, ...snapshot.spaces,
    ...snapshot.relations, ...snapshot.domains, ...snapshot.scopes, ...snapshot.permissions
  ]
  for (const entity of ownerships) {
    const ownership = entity.ownership
    if (!ownership) continue
    const principals = [ownership.ownerRef, ...ownership.stewardRefs]
    for (const principal of principals) {
      const exists = principal.type === 'person' ? personIds.has(principal.id)
        : principal.type === 'space' ? spaceIds.has(principal.id)
          : !hasUserSet || users.has(principal.id)
      if (!exists) add('UNKNOWN_OWNERSHIP_REFERENCE', [entity.calmyId, principal.id], `Unknown ${principal.type} ownership reference`)
    }
    if (ownership.subjectRef && !endpointExists(ownership.subjectRef)) {
      add('UNKNOWN_OWNERSHIP_REFERENCE', [entity.calmyId, ownership.subjectRef.calmyId], 'Unknown subject entity reference')
    }
  }

  for (const scope of snapshot.scopes) {
    if (scope.personId && !ids.person.has(scope.personId)) add('INVALID_SCOPE_PRINCIPAL', [scope.calmyId, scope.personId], 'Scope references an unknown Person')
    if (scope.domainId && !ids.domain.has(scope.domainId)) add('INVALID_SCOPE_PRINCIPAL', [scope.calmyId, scope.domainId], 'Scope references an unknown Domain')
    if (scope.thingId && !ids.matter.has(scope.thingId)) add('INVALID_SCOPE_PRINCIPAL', [scope.calmyId, scope.thingId], 'Scope references an unknown Thing')
    if (scope.sceneId && !ids.scene.has(scope.sceneId)) add('INVALID_SCOPE_PRINCIPAL', [scope.calmyId, scope.sceneId], 'Scope references an unknown Scene')
    if (scope.spaceId && !ids.space.has(scope.spaceId)) add('INVALID_SCOPE_PRINCIPAL', [scope.calmyId, scope.spaceId], 'Scope references an unknown Space')
  }
  for (const permission of snapshot.permissions) {
    if (!permission.principalUserId || (hasUserSet && !users.has(permission.principalUserId))) {
      add('INVALID_PERMISSION_PRINCIPAL', [permission.calmyId, permission.principalUserId], 'Permission points to an unknown User')
    }
    if (permission.scopeId && !ids.scope.has(permission.scopeId)) add('INVALID_PERMISSION_SCOPE', [permission.calmyId, permission.scopeId], 'Permission references an unknown Scope')
    if (permission.entityRef && !endpointExists(permission.entityRef)) add('INVALID_PERMISSION_RESOURCE', [permission.calmyId, permission.entityRef.calmyId], 'Permission references an unknown entity')
  }
  for (const participant of snapshot.sceneParticipants) {
    if (!ids.scene.has(participant.sceneId)) add('INVALID_PARTICIPANT_SCENE', [participant.calmyId, participant.sceneId], 'Participant references an unknown Scene')
    if (!ids.person.has(participant.personId)) add('INVALID_PARTICIPANT_PERSON', [participant.calmyId, participant.personId], 'Participant references an unknown Person')
  }
  const legacySceneIds = new Set(Object.keys(SCENES))
  for (const scene of snapshot.scenes) {
    if (legacySceneIds.has(scene.calmyId)) add('LEGACY_SCENE_CONFIG_COLLISION', [scene.calmyId], 'Scene ID overlaps a legacy product configuration ID')
  }

  issues.sort((a, b) => a.code.localeCompare(b.code) || a.sourceIds.join('|').localeCompare(b.sourceIds.join('|')) || a.detail.localeCompare(b.detail))
  return {
    counts: {
      people: snapshot.people.length, matters: snapshot.matters.length, things: snapshot.things.length,
      scenes: snapshot.scenes.length, sceneParticipants: snapshot.sceneParticipants.length, spaces: snapshot.spaces.length,
      legacySpaceBoundaries: snapshot.legacySpaceBoundaries.length, relations: snapshot.relations.length,
      domains: snapshot.domains.length, scopes: snapshot.scopes.length, permissions: snapshot.permissions.length
    },
    issueCount: issues.length,
    issues
  }
}
