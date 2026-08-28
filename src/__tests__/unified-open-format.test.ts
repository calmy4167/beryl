import { beforeEach, describe, expect, it } from 'vitest'
import { importOpenWorkspace, exportOpenWorkspace, serializeOpenEntity } from '@/core/content/open-format'
import { applyOpenEntities } from '@/core/content/open-workspace'
import { unifiedFactories } from '@/domain/unified'

describe('unified entities in Open Format', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips Person and Cycle through Markdown plus payload metadata', () => {
    const person = unifiedFactories.person({ displayName: '周行', tags: ['context'] })
    const cycle = unifiedFactories.cycle({
      matterId: 'matter-1', title: '建立节奏', theme: '先观察再行动', currentStage: 'wood',
      status: 'active', trajectory: 'stable', stageIds: []
    })
    const workspace = exportOpenWorkspace({ unified: [person, cycle] })

    expect(Object.keys(workspace.files).some(path => path.startsWith('10 People/'))).toBe(true)
    expect(Object.keys(workspace.files).some(path => path.startsWith('30 Cycles/'))).toBe(true)

    const imported = importOpenWorkspace(workspace.files, workspace.assets)
    expect(imported.issues).toEqual([])
    expect(imported.entities).toHaveLength(2)
    expect(imported.entities).toEqual(expect.arrayContaining([person, cycle]))
  })

  it('applies imported unified entities without sending them to legacy repositories', () => {
    const person = unifiedFactories.person({ displayName: '只进入统一域' })
    const result = applyOpenEntities([person])

    expect(result.created).toBe(1)
    expect(localStorage.getItem('b_core:person')).toContain('只进入统一域')
    expect(localStorage.getItem('b_cases')).toBeNull()
  })

  it('round-trips every supported unified entity through readable YAML fields', () => {
    const person = unifiedFactories.person({ displayName: '可读人物', roles: ['partner'], domain: '关系', tags: ['context'] })
    const relationship = unifiedFactories.relationship({ personAId: person.calmyId, personBId: 'person-2', label: '合作', status: 'active', boundary: '每周同步', rhythm: 'weekly', sharedSpaceIds: [], matterIds: [], evidenceIds: [] })
    const sharedSpace = unifiedFactories.sharedSpace({ title: '共同空间', status: 'active', purpose: '共同推进', memberIds: [person.calmyId], relationshipIds: [relationship.calmyId], matterIds: [] })
    const cycle = unifiedFactories.cycle({ matterId: 'matter-readable', title: '可读周期', theme: '逐步推进', currentStage: 'wood', status: 'active', trajectory: 'stable', stageIds: [] })
    const stage = unifiedFactories.stage({ cycleId: cycle.calmyId, title: '观察阶段', element: 'wood', status: 'active', actionIds: [], recordIds: [], order: 1 })
    const resource = unifiedFactories.resource({ title: '参考资料', kind: 'reference', status: 'active', body: '资料正文', uri: 'https://example.com', assetIds: [], matterIds: [], sourceIds: [], tags: ['source'] })
    const relation = unifiedFactories.relation({ from: { entityType: 'matter', calmyId: 'matter-readable' }, to: { entityType: 'resource', calmyId: resource.calmyId }, relationType: 'supports', directed: true, sourceIds: [] })
    const seed = unifiedFactories.seed({ title: '一个种子', body: '值得继续观察', status: 'open', sourceRecordIds: [], targetMatterIds: ['matter-readable'], tags: [] })
    const insight = unifiedFactories.insight({ title: '一个洞察', body: '先缩小范围更容易推进', status: 'draft', confidence: 0.72, memoryLayer: 'ai_inference', sourceRecordIds: [], matterIds: ['matter-readable'], resourceIds: [] })
    const outcome = unifiedFactories.outcome({ actionId: 'action-readable', matterId: 'matter-readable', summary: '完成一次验证', result: '得到反馈', status: 'observed', evidenceRecordIds: [] })
    const practice = unifiedFactories.practice({ title: '先做验证', description: '先验证再扩展', status: 'candidate', matterIds: ['matter-readable'], outcomeIds: [outcome.calmyId], evidenceIds: [], cadence: '每次开始前' })
    const daily = unifiedFactories.dailyState({ date: '2026-08-19', bodyState: 'normal', mentalState: 'clear', load: 35, actualTimeMinutes: 90, trajectory: 'advancing', todayPlanId: 'daily_2026-08-19', protectedItems: ['睡眠'] })
    const entities = [person, relationship, sharedSpace, cycle, stage, resource, relation, seed, insight, outcome, practice, daily]
    const workspace = exportOpenWorkspace({ unified: entities })

    expect(workspace.files[Object.keys(workspace.files).find(path => path.includes('可读周期')) || '']).toContain('matter_id: "matter-readable"')
    const imported = importOpenWorkspace(workspace.files)

    expect(imported.issues).toEqual([])
    expect(imported.entities).toHaveLength(entities.length)
    expect(imported.entities).toEqual(expect.arrayContaining(entities))
  })

  it('prefers an externally edited readable field over stale payload_json', () => {
    const cycle = unifiedFactories.cycle({ matterId: 'matter-edit', title: '原始标题', theme: '主题', currentStage: 'wood', status: 'planned', trajectory: 'stable', stageIds: [] })
    const workspace = exportOpenWorkspace({ unified: [cycle] })
    const path = Object.keys(workspace.files).find(item => item.endsWith('.md')) as string
    const edited = workspace.files[path].replace('title: "原始标题"', 'title: "外部改名"')
    const imported = importOpenWorkspace({ [path]: edited })

    expect(imported.issues).toEqual([])
    expect(imported.entities[0]).toMatchObject({ calmyId: cycle.calmyId, title: '外部改名' })
  })

  it('keeps importing legacy unified files that only expose payload_json', () => {
    const person = unifiedFactories.person({ displayName: '旧格式人物', roles: ['context'], tags: [] })
    const content = serializeOpenEntity(person).replace(/^(display_name|status|roles|domain|notes|tags):.*\r?\n/gm, '')
    const imported = importOpenWorkspace({ '10 People/legacy.md': content })

    expect(imported.issues).toEqual([])
    expect(imported.entities).toEqual([person])
  })
})
