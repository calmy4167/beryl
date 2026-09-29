import { beforeEach, describe, expect, it } from 'vitest'
import { exportOpenWorkspace, hashOpenText, importOpenWorkspace, OPEN_FORMAT_VERSION, OPEN_MANIFEST_PATH, serializeOpenEntity } from '@/core/content/open-format'
import { applyOpenEntities } from '@/core/content/open-workspace'
import { unifiedFactories } from '@/domain/unified'
import { thingFromMatter } from '@/domain/matter/model'
import { matterRepository } from '@/domain/matter/repository'
import { spaceFromSharedSpace } from '@/domain/unified/model'

describe('reality model Open Format compatibility', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips canonical records, ownership, and entity references under the new format version', () => {
    const owner = { type: 'user' as const, id: 'user-owner' }
    const person = unifiedFactories.person({ displayName: '照护者', linkedUserId: 'user-owner' })
    const legacyMatter = { calmyId: 'thing-open-format', title: '复诊安排', why: '确认安排', primaryContradiction: '时间安排冲突', problem: '复诊时间未定', desiredChange: '确定时间', progressEvidence: '已联系医院', currentGap: '等待回复', nextTest: '今日回访', stopCondition: '预约完成', status: 'paused' as const, currentStage: 'earth' as const, trajectory: 'recovering' as const, currentCycleId: 'cycle-1', evidenceIds: ['record-1'], createdAt: 1, updatedAt: 2, revision: 3 }
    const thing = { ...thingFromMatter(legacyMatter), source: 'import' as const, subjectPersonIds: [person.calmyId] }
    const thingId = thing.calmyId
    const scene = unifiedFactories.scene({ title: '复诊', thingId, startedAt: 100, status: 'active' })
    const participant = unifiedFactories.sceneParticipant({ sceneId: scene.calmyId, personId: person.calmyId, joinedAt: 110 })
    const space = unifiedFactories.space({ title: '家庭照护', purpose: '共同安排', memberPersonIds: [person.calmyId], relationshipIds: [], thingIds: [thingId], sceneIds: [scene.calmyId], ownerRef: owner, status: 'active' })
    const domain = unifiedFactories.domain({ key: 'health', displayName: 'Health' })
    const scope = unifiedFactories.scope({ personId: person.calmyId, domainId: domain.calmyId })
    const permission = unifiedFactories.permission({ principalUserId: 'user-owner', scopeId: scope.calmyId, effect: 'allow', actions: ['view', 'edit'] })
    const relation = unifiedFactories.relation({ from: { entityType: 'person', calmyId: person.calmyId }, to: { entityType: 'thing', calmyId: thingId }, relationType: 'subject_of', directed: true, sourceIds: [] })
    const ownedPerson = { ...person, ownership: { ownerRef: owner, stewardRefs: [], privacy: 'private' as const } }
    const entities = [ownedPerson, scene, participant, space, domain, scope, permission, relation]

    const workspace = exportOpenWorkspace({ unified: entities, things: [thing] })
    const imported = importOpenWorkspace(workspace.files, workspace.assets)

    expect(OPEN_FORMAT_VERSION).toBe(2)
    expect(workspace.manifest.format_version).toBe(2)
    expect(imported.issues).toEqual([])
    expect(imported.entities).toEqual(expect.arrayContaining([...entities, thing]))
  })

  it('continues to read v1 entity files', () => {
    const person = unifiedFactories.person({ displayName: 'v1 人物' })
    const oldFile = serializeOpenEntity(person).replace('b_version: 2', 'b_version: 1')

    expect(importOpenWorkspace({ '10 People/old.md': oldFile }).entities).toEqual([person])
  })

  it('continues to read v1 manifests with v1 entity files', () => {
    const person = unifiedFactories.person({ displayName: 'v1 清单' })
    const workspace = exportOpenWorkspace({ unified: [person] })
    const path = workspace.manifest.entities[0].path
    const content = workspace.files[path].replace('b_version: 2', 'b_version: 1')
    const manifest = {
      ...workspace.manifest,
      format_version: 1,
      entities: [{ ...workspace.manifest.entities[0], hash: hashOpenText(content) }]
    }
    const imported = importOpenWorkspace({ ...workspace.files, [path]: content, [OPEN_MANIFEST_PATH]: JSON.stringify(manifest) })

    expect(imported.issues).toEqual([])
    expect(imported.entities).toEqual([person])
    expect(imported.manifest?.format_version).toBe(1)
  })

  it('applies imported canonical Things through the single Matter store', () => {
    const thing = thingFromMatter({
      calmyId: 'thing-imported', title: '兼容导入', why: '', primaryContradiction: '', status: 'active',
      currentStage: 'wood', trajectory: 'stable', evidenceIds: [], createdAt: 1, updatedAt: 1, revision: 1
    })
    expect(applyOpenEntities([thing]).created).toBe(1)
    expect(matterRepository.find(thing.calmyId)).toMatchObject({ title: '兼容导入', revision: 1 })
  })

  it('does not export Matter and its Thing projection as two independent files', () => {
    const matter = {
      calmyId: 'one-fact', title: '同一事实', why: '', primaryContradiction: '', status: 'active' as const,
      currentStage: 'wood' as const, trajectory: 'stable' as const, evidenceIds: [], createdAt: 1, updatedAt: 1, revision: 1
    }
    expect(() => exportOpenWorkspace({ matters: [matter], things: [thingFromMatter(matter)] })).toThrow('duplicate-entity-id:one-fact')
  })

  it('round-trips legacy Space access boundaries as adapter metadata', () => {
    const shared = unifiedFactories.sharedSpace({
      title: '迁移边界', status: 'active', memberIds: ['legacy-user'], relationshipIds: [], matterIds: ['matter-shared'],
      allowedMatterIds: ['matter-allowed'], blockedMatterIds: ['matter-private'], ownerId: 'legacy-user'
    })
    const { space } = spaceFromSharedSpace(shared)
    const imported = importOpenWorkspace(exportOpenWorkspace({ unified: [space] }).files)

    expect(imported.issues).toEqual([])
    expect(imported.entities).toEqual([space])
    expect(imported.entities[0]).toMatchObject({
      entityType: 'space', legacyBoundary: { allowedMatterIds: ['matter-allowed'], blockedMatterIds: ['matter-private'], legacyMemberIds: ['legacy-user'] }
    })
  })

  it('preserves unknown legacy fields in the payload fallback', () => {
    const person = { ...unifiedFactories.person({ displayName: '旧字段' }), legacyField: { importedBy: 'v1', value: 42 } }
    const content = serializeOpenEntity(person).replace(/^(display_name|status|roles|domain|notes|tags|linked_user_id):.*\r?\n/gm, '')
    const imported = importOpenWorkspace({ '10 People/legacy-field.md': content })

    expect(imported.issues).toEqual([])
    expect(imported.entities[0]).toEqual(person)
  })
})
