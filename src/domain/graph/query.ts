import { actionRepository } from '@/domain/action/repository'
import { matterRepository } from '@/domain/matter/repository'
import { recordRepository } from '@/domain/record/repository'
import { todayRepository } from '@/domain/today/repository'
import { CORE_ENTITY_TYPES, unifiedRepository, type CoreEntity, type CoreEntityType, type Cycle, type DailyState, type Insight, type Outcome, type Practice, type Relation, type Relationship, type Resource, type Seed, type SharedSpace, type Stage } from '@/domain/unified'

export type GraphNodeType = CoreEntityType | 'matter' | 'action' | 'record' | 'today'

export interface GraphNode {
  id: string
  type: GraphNodeType
  label: string
  summary: string
  route: string
  updatedAt: number
  placeholder?: boolean
}

export interface GraphEdge {
  id: string
  from: string
  to: string
  label: string
  directed: boolean
  source: 'relation' | 'reference'
  confidence?: number
}

export interface GraphSnapshot {
  nodes: GraphNode[]
  availableNodes: GraphNode[]
  edges: GraphEdge[]
  totalNodes: number
  totalEdges: number
}

interface GraphContext {
  matterId?: string
  actionId?: string
  cycleId?: string
  matterIds?: string[]
}

const TYPE_LABEL: Record<GraphNodeType, string> = {
  matter: 'Matter', action: 'Action', record: 'Record', today: 'Today',
  person: 'Person', relationship: 'Relationship', shared_space: 'Shared Space',
  cycle: 'Cycle', stage: 'Stage', resource: 'Resource', relation: 'Relation',
  seed: 'Seed', insight: 'Insight', outcome: 'Outcome', practice: 'Practice',
  daily_state: 'Daily State', asset: 'Asset'
}

function routeFor(type: GraphNodeType, id: string, context: GraphContext = {}): string {
  if (type === 'matter') return `/app/matters/${id}`
  if (type === 'action' || type === 'record') return context.matterId ? `/app/matters/${context.matterId}` : '/app/today'
  if (type === 'today' || type === 'daily_state') return '/app/today'
  if (type === 'person' || type === 'relationship' || type === 'shared_space') return '/app/people'
  if (type === 'cycle') return context.matterId ? `/app/matters/${context.matterId}` : '/app/library'
  if (type === 'stage') {
    const cycle = context.cycleId ? unifiedRepository.find<{ entityType: 'cycle' } & CoreEntity>('cycle', context.cycleId) as CoreEntity | undefined : undefined
    return cycle && cycle.entityType === 'cycle' && cycle.matterId ? `/app/matters/${cycle.matterId}` : '/app/library'
  }
  if (type === 'outcome') {
    const action = context.actionId ? actionRepository.find(context.actionId) : undefined
    return context.matterId || action?.matterId ? `/app/matters/${context.matterId || action?.matterId}` : '/app/today'
  }
  if (type === 'practice') return context.matterIds?.[0] ? `/app/matters/${context.matterIds[0]}` : '/app/library'
  return '/app/library'
}

function graphContext(entity: CoreEntity): GraphContext {
  switch (entity.entityType) {
    case 'cycle': return { matterId: entity.matterId }
    case 'stage': return { cycleId: entity.cycleId }
    case 'outcome': return { actionId: entity.actionId, matterId: entity.matterId }
    case 'practice': return { matterIds: entity.matterIds }
    default: return {}
  }
}

function coreLabel(entity: CoreEntity): string {
  switch (entity.entityType) {
    case 'person': return entity.displayName
    case 'relationship': return entity.label
    case 'shared_space': return entity.title
    case 'cycle': return entity.title
    case 'stage': return entity.title
    case 'resource': return entity.title
    case 'seed': return entity.title
    case 'insight': return entity.title
    case 'outcome': return entity.summary
    case 'practice': return entity.title
    case 'daily_state': return `Today ${entity.date}`
    case 'asset': return entity.path
    case 'relation': return `${entity.from.entityType} ${entity.relationType} ${entity.to.entityType}`
  }
}

function coreSummary(entity: CoreEntity): string {
  switch (entity.entityType) {
    case 'person': return [entity.domain, entity.notes, ...entity.roles].filter(Boolean).join(' ')
    case 'relationship': return [entity.boundary, entity.rhythm].filter(Boolean).join(' ')
    case 'shared_space': return entity.purpose || ''
    case 'cycle': return [entity.theme, entity.status, entity.trajectory].join(' · ')
    case 'stage': return [entity.element, entity.status].join(' · ')
    case 'resource': return [entity.kind, entity.body, entity.uri].filter(Boolean).join(' · ')
    case 'seed': return entity.body
    case 'insight': return entity.body
    case 'outcome': return [entity.result, entity.status].filter(Boolean).join(' · ')
    case 'practice': return [entity.description, entity.status, entity.cadence].filter(Boolean).join(' · ')
    case 'daily_state': return [entity.bodyState, entity.mentalState, entity.trajectory].join(' · ')
    case 'asset': return [entity.mimeType, entity.lifecycle].join(' · ')
    case 'relation': return entity.relationType
  }
}

function legacyNodes(): GraphNode[] {
  return [
    ...matterRepository.list().map(item => ({ id: item.calmyId, type: 'matter' as const, label: item.title, summary: item.why, route: routeFor('matter', item.calmyId), updatedAt: item.updatedAt })),
    ...actionRepository.list().map(item => ({ id: item.calmyId, type: 'action' as const, label: item.title, summary: `${item.date} · ${item.status}`, route: routeFor('action', item.calmyId, item), updatedAt: item.updatedAt })),
    ...recordRepository.list().map(item => ({ id: item.calmyId, type: 'record' as const, label: item.body.split(/\r?\n/, 1)[0].slice(0, 100), summary: item.type, route: routeFor('record', item.calmyId, item), updatedAt: item.updatedAt })),
    ...todayRepository.list().map(item => ({ id: item.date, type: 'today' as const, label: `Today ${item.date}`, summary: item.why || item.review.observation, route: '/app/today', updatedAt: item.updatedAt }))
  ]
}

function unifiedNodes(): GraphNode[] {
  return CORE_ENTITY_TYPES.flatMap(type => (unifiedRepository.list(type) as CoreEntity[]).map(entity => ({
    id: entity.calmyId,
    type: entity.entityType,
    label: coreLabel(entity),
    summary: coreSummary(entity),
    route: routeFor(entity.entityType, entity.calmyId, graphContext(entity)),
    updatedAt: entity.updatedAt
  })))
}

export function buildGraphSnapshot(query = ''): GraphSnapshot {
  const nodeMap = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const edgeKeys = new Set<string>()
  for (const node of [...legacyNodes(), ...unifiedNodes()]) if (!nodeMap.has(node.id)) nodeMap.set(node.id, node)

  const ensureNode = (id: string, type: GraphNodeType): void => {
    if (nodeMap.has(id)) return
    nodeMap.set(id, { id, type, label: id, summary: '未解析引用', route: '/app/graph', updatedAt: 0, placeholder: true })
  }
  const addEdge = (from: string, to: string, label: string, source: GraphEdge['source'], directed = true, confidence?: number, fromType: GraphNodeType = 'relation', toType: GraphNodeType = 'relation'): void => {
    if (!from || !to || from === to) return
    ensureNode(from, fromType); ensureNode(to, toType)
    const key = `${from}|${to}|${label}`
    if (edgeKeys.has(key)) return
    edgeKeys.add(key)
    edges.push({ id: `${source}:${key}`, from, to, label, directed, source, confidence })
  }
  const addRef = (from: string, to: string | undefined, label: string, fromType: GraphNodeType, toType: GraphNodeType = 'matter'): void => {
    if (to) addEdge(from, to, label, 'reference', true, undefined, fromType, toType)
  }

  for (const relation of unifiedRepository.list<Relation>('relation')) {
    addEdge(relation.from.calmyId, relation.to.calmyId, relation.relationType, 'relation', relation.directed, relation.confidence, relation.from.entityType, relation.to.entityType)
  }
  for (const cycle of unifiedRepository.list<Cycle>('cycle')) addRef(cycle.calmyId, cycle.matterId, 'belongs_to', 'cycle')
  for (const action of actionRepository.list()) { addRef(action.calmyId, action.matterId, 'belongs_to', 'action'); addRef(action.calmyId, action.cycleId, 'part_of', 'action', 'cycle') }
  for (const record of recordRepository.list()) { addRef(record.calmyId, record.matterId, 'evidences', 'record'); addRef(record.calmyId, record.actionId, 'derived_from', 'record', 'action') }
  for (const stage of unifiedRepository.list<Stage>('stage')) addRef(stage.calmyId, stage.cycleId, 'part_of', 'stage', 'cycle')
  for (const entity of unifiedRepository.list<Relationship>('relationship')) { addRef(entity.calmyId, entity.personAId, 'connects', 'relationship', 'person'); addRef(entity.calmyId, entity.personBId, 'connects', 'relationship', 'person'); for (const id of entity.sharedSpaceIds) addRef(entity.calmyId, id, 'uses', 'relationship', 'shared_space'); for (const id of entity.matterIds) addRef(entity.calmyId, id, 'context', 'relationship') }
  for (const entity of unifiedRepository.list<SharedSpace>('shared_space')) { for (const id of entity.memberIds) addRef(entity.calmyId, id, 'includes', 'shared_space', 'person'); for (const id of entity.relationshipIds) addRef(entity.calmyId, id, 'hosts', 'shared_space', 'relationship'); for (const id of entity.matterIds) addRef(entity.calmyId, id, 'context', 'shared_space') }
  for (const entity of unifiedRepository.list<Resource>('resource')) for (const id of entity.matterIds) addRef(entity.calmyId, id, 'supports', 'resource')
  for (const entity of unifiedRepository.list<Seed>('seed')) { for (const id of entity.targetMatterIds) addRef(entity.calmyId, id, 'points_to', 'seed'); for (const id of entity.sourceRecordIds) addRef(entity.calmyId, id, 'derived_from', 'seed', 'record') }
  for (const entity of unifiedRepository.list<Insight>('insight')) { for (const id of entity.matterIds) addRef(entity.calmyId, id, 'explains', 'insight'); for (const id of entity.resourceIds) addRef(entity.calmyId, id, 'uses', 'insight', 'resource'); for (const id of entity.sourceRecordIds) addRef(entity.calmyId, id, 'derived_from', 'insight', 'record') }
  for (const entity of unifiedRepository.list<Outcome>('outcome')) { addRef(entity.calmyId, entity.actionId, 'result_of', 'outcome', 'action'); addRef(entity.calmyId, entity.matterId, 'context', 'outcome'); for (const id of entity.evidenceRecordIds) addRef(entity.calmyId, id, 'evidences', 'outcome', 'record') }
  for (const entity of unifiedRepository.list<Practice>('practice')) { for (const id of entity.matterIds) addRef(entity.calmyId, id, 'applies_to', 'practice'); for (const id of entity.outcomeIds) addRef(entity.calmyId, id, 'learned_from', 'practice', 'outcome'); for (const id of entity.evidenceIds) addRef(entity.calmyId, id, 'evidences', 'practice', 'record') }
  for (const entity of unifiedRepository.list<DailyState>('daily_state')) addRef(entity.calmyId, entity.todayPlanId, 'plans', 'daily_state', 'today')

  const availableNodes = [...nodeMap.values()].sort((a, b) => b.updatedAt - a.updatedAt || a.label.localeCompare(b.label))
  const normalized = query.trim().toLocaleLowerCase()
  const matched = normalized ? new Set(availableNodes.filter(node => `${node.label} ${node.summary} ${TYPE_LABEL[node.type]}`.toLocaleLowerCase().includes(normalized)).map(node => node.id)) : new Set(availableNodes.map(node => node.id))
  if (normalized) for (const edge of edges) if (matched.has(edge.from) || matched.has(edge.to)) { matched.add(edge.from); matched.add(edge.to) }
  const nodes = availableNodes.filter(node => matched.has(node.id)).slice(0, 100)
  const visible = new Set(nodes.map(node => node.id))
  return { nodes, availableNodes, edges: edges.filter(edge => visible.has(edge.from) && visible.has(edge.to)), totalNodes: availableNodes.length, totalEdges: edges.length }
}

export const graphTypeLabel = (type: GraphNodeType): string => TYPE_LABEL[type]
