import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setActiveAccount } from '@/core/account-context'
import { createCollectionRepository } from '@/core/repository'
import { resetStoreCache } from '@/core/storage'
import { actionRepository } from '@/domain/action/repository'
import { matterRepository } from '@/domain/matter/repository'
import { buildGraphSnapshot } from '@/domain/graph'
import { unifiedFactories, unifiedRepository } from '@/domain/unified'

describe('Graph relation query', () => {
  beforeEach(() => { setActiveAccount('graph-query-test-user'); localStorage.clear(); resetStoreCache() })
  afterEach(() => setActiveAccount(null))

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

  it('projects the existing Finance entry into the graph and resolves typed Relation edges', () => {
    const finance = createCollectionRepository<{ id: string; type: string; amountCents: number; category: string; note: string; date: string }>('finance', item => item.id)
    const entry = finance.create({ id: 'expense-graph-1', type: 'expense', amountCents: 8400, category: '交通', note: '往返医院', date: '2026-10-01' })
    const domain = unifiedRepository.create(unifiedFactories.domain({ key: 'finance-graph-test', displayName: '财务图谱测试' }))
    unifiedRepository.create(unifiedFactories.relation({
      from: { entityType: 'finance_entry', calmyId: entry.id },
      to: { entityType: 'domain', calmyId: domain.calmyId },
      relationType: 'belongs_to_domain', directed: true, sourceIds: []
    }))

    const graph = buildGraphSnapshot()

    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: entry.id, type: 'finance_entry', label: '交通', route: '/app/finance' }))
    expect(graph.edges).toContainEqual(expect.objectContaining({ from: entry.id, to: domain.calmyId, label: 'belongs_to_domain', source: 'relation' }))
    expect(finance.find(entry.id)).toEqual(entry)
  })

  it('projects virtual month and date endpoints as collision-safe Time nodes', () => {
    const matter = matterRepository.create({ title: '复诊安排' })
    unifiedRepository.create(unifiedFactories.relation({
      from: { entityType: 'matter', calmyId: matter.calmyId }, to: { entityType: 'time', calmyId: '2026-09' },
      relationType: 'context_of', directed: true, sourceIds: []
    }))
    const graph = buildGraphSnapshot()
    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: 'time:2026-09', refId: '2026-09', type: 'time', label: '2026-09', route: '/app/calendar' }))
    expect(graph.edges).toContainEqual(expect.objectContaining({ from: matter.calmyId, to: 'time:2026-09', label: 'context_of', source: 'relation' }))
  })

  it('projects a legacy Goal by its original ID as a typed Relation graph node', () => {
    const goals = createCollectionRepository<{ id: string; title: string; problem: string }>('goals', item => item.id)
    const goal = goals.create({ id: 'goal-graph-stable', title: '恢复日常运动', problem: '久坐' })
    const person = unifiedRepository.create(unifiedFactories.person({ displayName: '本人' }))
    unifiedRepository.create(unifiedFactories.relation({
      from: { entityType: 'goal', calmyId: goal.id }, to: { entityType: 'person', calmyId: person.calmyId },
      relationType: 'subject_of', directed: true, sourceIds: []
    }))

    const graph = buildGraphSnapshot()

    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: goal.id, type: 'goal', label: goal.title, route: '/app/module/goals' }))
    expect(graph.edges).toContainEqual(expect.objectContaining({ from: goal.id, to: person.calmyId, label: 'subject_of', source: 'relation' }))
    expect(goals.find(goal.id)).toEqual(goal)
  })

  it('projects a legacy Post by its original ID as a typed Relation graph node', () => {
    const posts = createCollectionRepository<{ id: string; title: string; content: string; date: string }>('posts', item => item.id)
    const post = posts.create({ id: 'post-graph-stable', title: '就医沟通要点', content: '记录家属沟通安排', date: '2026-10-01' })
    const person = unifiedRepository.create(unifiedFactories.person({ displayName: '家属' }))
    unifiedRepository.create(unifiedFactories.relation({
      from: { entityType: 'post', calmyId: post.id }, to: { entityType: 'person', calmyId: person.calmyId },
      relationType: 'subject_of', directed: true, sourceIds: []
    }))

    const graph = buildGraphSnapshot()

    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: post.id, type: 'post', label: post.title, route: '/app/module/posts' }))
    expect(graph.edges).toContainEqual(expect.objectContaining({ from: post.id, to: person.calmyId, label: 'subject_of', source: 'relation' }))
    expect(posts.find(post.id)).toEqual(post)
  })
})
