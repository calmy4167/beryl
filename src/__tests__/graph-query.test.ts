import { beforeEach, describe, expect, it } from 'vitest'
import { actionRepository } from '@/domain/action/repository'
import { matterRepository } from '@/domain/matter/repository'
import { buildGraphSnapshot } from '@/domain/graph'
import { unifiedFactories, unifiedRepository } from '@/domain/unified'

describe('Graph relation query', () => {
  beforeEach(() => localStorage.clear())

  it('combines explicit Relations with existing Matter and Action references', () => {
    const matter = matterRepository.create({ title: '供应商交付' })
    const action = actionRepository.create({ title: '确认时间', date: '2026-08-19', matterId: matter.calmyId })
    const person = unifiedRepository.create(unifiedFactories.person({ displayName: '供应商联系人' }))
    unifiedRepository.create(unifiedFactories.relation({
      from: { entityType: 'matter', calmyId: matter.calmyId },
      to: { entityType: 'person', calmyId: person.calmyId },
      relationType: 'supports', directed: true, sourceIds: []
    }))

    const graph = buildGraphSnapshot()

    expect(graph.nodes.map(node => node.id)).toEqual(expect.arrayContaining([matter.calmyId, action.calmyId, person.calmyId]))
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: matter.calmyId, to: person.calmyId, label: 'supports', source: 'relation' }),
      expect.objectContaining({ from: action.calmyId, to: matter.calmyId, label: 'belongs_to', source: 'reference' })
    ]))
  })

  it('keeps one-hop context when filtering and exposes unresolved references as placeholders', () => {
    const matter = matterRepository.create({ title: '深度工作' })
    const action = actionRepository.create({ title: '安排深度工作', date: '2026-08-19', matterId: matter.calmyId })
    unifiedRepository.create(unifiedFactories.relation({
      from: { entityType: 'matter', calmyId: matter.calmyId },
      to: { entityType: 'resource', calmyId: 'missing-resource' },
      relationType: 'supports', directed: true, sourceIds: []
    }))

    const graph = buildGraphSnapshot('深度工作')
    const missing = buildGraphSnapshot().nodes.find(node => node.id === 'missing-resource')

    expect(graph.nodes.map(node => node.id)).toEqual(expect.arrayContaining([matter.calmyId, action.calmyId]))
    expect(missing).toMatchObject({ id: 'missing-resource', placeholder: true, route: '/app/graph' })
    expect(graph.totalNodes).toBeGreaterThanOrEqual(graph.nodes.length)
    expect(graph.totalEdges).toBeGreaterThanOrEqual(graph.edges.length)
  })

  it('returns an empty visible graph for an unmatched query without mutating stored entities', () => {
    const matter = matterRepository.create({ title: '普通事项' })

    const graph = buildGraphSnapshot('不存在的节点')

    expect(graph.nodes).toEqual([])
    expect(graph.edges).toEqual([])
    expect(matterRepository.find(matter.calmyId)).toMatchObject({ title: '普通事项', revision: 1 })
  })
})
