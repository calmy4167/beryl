import { describe, expect, it } from 'vitest'
import { auditRealityModelMigration, type RealityModelSnapshot } from '@/domain/migration/reality-model-audit'
import { matterFromThing, thingFromMatter } from '@/domain/matter/model'
import { unifiedFactories } from '@/domain/unified'

function matterFixture() {
  return {
    calmyId: 'thing-1', title: '照护安排', why: '需要协调', primaryContradiction: '', status: 'active' as const,
    currentStage: 'wood' as const, trajectory: 'stable' as const, evidenceIds: [], createdAt: 1, updatedAt: 2, revision: 1
  }
}

function emptySnapshot(): RealityModelSnapshot {
  return { people: [], matters: [], things: [], scenes: [], sceneParticipants: [], spaces: [], legacySpaceBoundaries: [], relations: [], domains: [], scopes: [], permissions: [] }
}

describe('read-only Reality Model migration audit', () => {
  it('reports no issues for legacy-only and same-ID Matter/Thing projection snapshots', () => {
    const matter = matterFixture()
    expect(auditRealityModelMigration({ ...emptySnapshot(), matters: [matter] }).issueCount).toBe(0)
    const thing = thingFromMatter(matter)
    const mixed = { ...emptySnapshot(), matters: [matter], things: [thing] }
    const before = JSON.stringify(mixed)

    expect(auditRealityModelMigration(mixed)).toMatchObject({ issueCount: 0, counts: { matters: 1, things: 1 } })
    expect(JSON.stringify(mixed)).toBe(before)
    expect(matterFromThing(thing)).toEqual(matter)
  })

  it('emits stable issues for identity, projection, relation, ownership, permission, scope, and legacy Scene problems', () => {
    const person = {
      ...unifiedFactories.person({ displayName: 'Person' }),
      calmyId: 'duplicate-id', linkedUserId: 'missing-user',
      ownership: { ownerRef: { type: 'person' as const, id: 'unknown-owner' }, stewardRefs: [] }
    }
    const sameIdScene = { ...unifiedFactories.scene({ title: 'Collision', status: 'draft' }), calmyId: 'duplicate-id' }
    const legacyConfigScene = { ...unifiedFactories.scene({ title: '旧静态配置同 ID' }), calmyId: 'personal' }
    const matter = matterFixture()
    const thing = { ...thingFromMatter(matter), title: '被改过的投影' }
    const relation = unifiedFactories.relation({
      from: { entityType: 'person', calmyId: person.calmyId }, to: { entityType: 'thing', calmyId: 'missing-thing' },
      relationType: 'subject_of', directed: true, sourceIds: []
    })
    const scope = unifiedFactories.scope({ personId: 'missing-person', domainId: 'missing-domain', thingId: 'missing-thing', sceneId: 'missing-scene', spaceId: 'missing-space' })
    const permission = unifiedFactories.permission({ principalUserId: 'missing-user', scopeId: 'missing-scope', effect: 'allow', actions: ['view'] })
    const snapshot = {
      ...emptySnapshot(), people: [person], matters: [matter], things: [thing], scenes: [sameIdScene, legacyConfigScene],
      relations: [relation], scopes: [scope], permissions: [permission], knownUserIds: []
    }
    const codes = auditRealityModelMigration(snapshot).issues.map(issue => issue.code)

    expect(codes).toEqual([...codes].sort((a, b) => a.localeCompare(b) || 0))
    expect(codes).toEqual(expect.arrayContaining([
      'DISTINCT_OBJECT_ID_COLLISION', 'UNRESOLVED_PERSON_USER_LINK', 'MATTER_THING_PROJECTION_DIFFERENCE',
      'INVALID_RELATION_ENDPOINT', 'UNKNOWN_OWNERSHIP_REFERENCE', 'INVALID_SCOPE_PRINCIPAL',
      'INVALID_PERMISSION_PRINCIPAL', 'INVALID_PERMISSION_SCOPE', 'LEGACY_SCENE_CONFIG_COLLISION'
    ]))
  })
})
