import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildGraphSnapshot, graphTypeLabel, type GraphNode, type GraphNodeType } from '@/domain/graph'
import { unifiedFactories, unifiedRepository, type RelationType } from '@/domain/unified'

const relationTypes: RelationType[] = [
  'supports',
  'blocks',
  'contradicts',
  'derived_from',
  'related_to',
  'belongs_to',
  'depends_on',
  'practices',
  'evidences',
  'part_of',
]

type NodeFilter = 'all' | GraphNodeType

const toast = (message: string, kind: 'success' | 'warning' | 'error' = 'success') => {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

function nodeClass(node: GraphNode): string {
  return `node-${node.type.replace('_', '-')}`
}

function nodeLabel(nodes: GraphNode[], id: string): string {
  return nodes.find(node => node.id === id)?.label || id
}

function nodeOptionLabel(node: GraphNode): string {
  return `${graphTypeLabel(node.type)} · ${node.label}`
}

export function GraphPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [nodeFilter, setNodeFilter] = useState<NodeFilter>('all')
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [relationType, setRelationType] = useState<RelationType>('related_to')
  const [tick, setTick] = useState(0)

  const snapshot = useMemo(() => {
    void tick
    return buildGraphSnapshot(query)
  }, [query, tick])

  const visibleNodes = useMemo(() => {
    if (nodeFilter === 'all') return snapshot.nodes
    return snapshot.nodes.filter(node => node.type === nodeFilter)
  }, [nodeFilter, snapshot.nodes])

  const visibleIds = useMemo(() => new Set(visibleNodes.map(node => node.id)), [visibleNodes])

  const visibleEdges = useMemo(
    () => snapshot.edges.filter(edge => visibleIds.has(edge.from) && visibleIds.has(edge.to)),
    [snapshot.edges, visibleIds],
  )

  const selectableNodes = useMemo(
    () => snapshot.availableNodes.filter(node => !node.placeholder),
    [snapshot.availableNodes],
  )

  const filterOptions = useMemo(() => {
    const types = new Set(snapshot.availableNodes.map(node => node.type))
    return Array.from(types).sort((a, b) => graphTypeLabel(a).localeCompare(graphTypeLabel(b)))
  }, [snapshot.availableNodes])

  useEffect(() => {
    const refresh = () => setTick(value => value + 1)
    window.addEventListener('beryl-data-synced', refresh)
    return () => window.removeEventListener('beryl-data-synced', refresh)
  }, [])

  function openNode(node: GraphNode): void {
    if (!node.placeholder) navigate(node.route)
  }

  function createRelation(): void {
    if (!fromId || !toId || fromId === toId) {
      toast('请选择两个不同的节点', 'warning')
      return
    }

    const from = selectableNodes.find(node => node.id === fromId)
    const to = selectableNodes.find(node => node.id === toId)
    if (!from || !to) {
      toast('节点已经不存在，请刷新后重试', 'warning')
      return
    }

    try {
      unifiedRepository.create(
        unifiedFactories.relation({
          from: { entityType: from.type, calmyId: from.id },
          to: { entityType: to.type, calmyId: to.id },
          relationType,
          directed: true,
          sourceIds: [],
        }),
      )
      setFromId('')
      setToId('')
      setTick(value => value + 1)
      window.dispatchEvent(new CustomEvent('beryl-data-synced'))
      toast('Relation 已加入图谱')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Relation 保存失败', 'error')
    }
  }

  return (
    <div className="graph-page" style={{ maxWidth: 1120, margin: '0 auto' }}>
      <header className="page-head">
        <div>
          <p className="eyebrow">GRAPH · RELATION</p>
          <h1 className="font-title">看见现实之间的连接</h1>
          <p>显式 Relation 与实体已有引用会一起出现；点击节点可回到对应事实页面。</p>
        </div>
        <div
          aria-label="图谱统计"
          style={{ borderLeft: '1px solid var(--c-border)', padding: '4px 0 4px 20px', display: 'grid' }}
        >
          <b className="font-title" style={{ color: 'var(--scene)', fontSize: 32, lineHeight: 1 }}>
            {snapshot.totalNodes}
          </b>
          <span style={{ color: 'var(--c-text-3)', fontSize: 10, marginTop: 5 }}>
            节点 · {snapshot.totalEdges} 条边
          </span>
        </div>
      </header>

      <section className="beryl-card admin-block" aria-labelledby="add-relation-title">
        <div className="panel-head">
          <div>
            <p className="eyebrow">ADD RELATION</p>
            <h2 id="add-relation-title" className="font-title">写下一条可追踪的关系</h2>
          </div>
          <span style={{ color: 'var(--c-text-3)', fontSize: 10 }}>关系只新增事实，不改变两端实体。</span>
        </div>
        <div
          className="relation-form"
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 160px minmax(0, 1fr) auto', gap: 8, marginTop: 16 }}
        >
          <select aria-label="关系起点" value={fromId} onChange={event => setFromId(event.target.value)}>
            <option value="">起点节点</option>
            {selectableNodes.map(node => (
              <option key={`from-${node.id}`} value={node.id}>
                {nodeOptionLabel(node)}
              </option>
            ))}
          </select>
          <select aria-label="关系类型" value={relationType} onChange={event => setRelationType(event.target.value as RelationType)}>
            {relationTypes.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
          <select aria-label="关系终点" value={toId} onChange={event => setToId(event.target.value)}>
            <option value="">终点节点</option>
            {selectableNodes.map(node => (
              <option key={`to-${node.id}`} value={node.id}>
                {nodeOptionLabel(node)}
              </option>
            ))}
          </select>
          <button className="primary" type="button" onClick={createRelation}>建立连接</button>
        </div>
      </section>

      <section className="beryl-card admin-block" aria-labelledby="graph-explore-title">
        <div className="panel-head" style={{ alignItems: 'end' }}>
          <div>
            <p className="eyebrow">EXPLORE</p>
            <h2 id="graph-explore-title" className="font-title">关系图谱</h2>
          </div>
          <span style={{ color: 'var(--c-text-3)', fontSize: 10 }}>
            {visibleNodes.length} 个可见节点 · {visibleEdges.length} 条可见边
          </span>
        </div>
        <div
          className="graph-toolbar"
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 180px', gap: 8, marginTop: 14 }}
        >
          <input
            aria-label="筛选图谱"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="筛选节点、摘要或类型"
          />
          <select aria-label="筛选节点类型" value={nodeFilter} onChange={event => setNodeFilter(event.target.value as NodeFilter)}>
            <option value="all">全部类型</option>
            {filterOptions.map(type => <option key={type} value={type}>{graphTypeLabel(type)}</option>)}
          </select>
        </div>
      </section>

      <section
        className="graph-layout"
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, .8fr)', gap: 16, marginTop: 16 }}
      >
        <section className="beryl-card admin-block" aria-labelledby="node-list-title" style={{ marginTop: 0 }}>
          <div className="panel-head">
            <div>
              <p className="eyebrow">NODES</p>
              <h2 id="node-list-title" className="font-title">节点列表</h2>
            </div>
            <span>{visibleNodes.length}</span>
          </div>
          <div className="graph-node-list" style={{ display: 'grid', gap: 8, marginTop: 16 }}>
            {visibleNodes.map(node => (
              <button
                key={node.id}
                type="button"
                className={`beryl-card ${nodeClass(node)}`}
                disabled={node.placeholder}
                onClick={() => openNode(node)}
                title={node.summary || node.label}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto minmax(0, 1fr) auto',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '11px 12px',
                  color: 'var(--c-text)',
                  border: '1px solid var(--c-border)',
                  textAlign: 'left',
                  cursor: node.placeholder ? 'default' : 'pointer',
                  opacity: node.placeholder ? .66 : 1,
                }}
              >
                <span style={{ color: 'var(--scene)', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {graphTypeLabel(node.type)}
                </span>
                <span style={{ minWidth: 0, display: 'grid', gap: 3 }}>
                  <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.label}</b>
                  <small style={{ color: 'var(--c-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {node.summary || '暂无摘要'}
                  </small>
                </span>
                <span style={{ color: 'var(--c-text-3)', fontSize: 14 }}>{node.placeholder ? '未解析' : '→'}</span>
              </button>
            ))}
            {!visibleNodes.length && <p className="empty-state">没有匹配的节点。换一个筛选词试试。</p>}
          </div>
        </section>

        <aside className="beryl-card admin-block" aria-labelledby="relation-list-title" style={{ marginTop: 0 }}>
          <div className="panel-head">
            <div>
              <p className="eyebrow">EDGES</p>
              <h2 id="relation-list-title" className="font-title">关系清单</h2>
            </div>
            <span>{visibleEdges.length}</span>
          </div>
          <div className="edge-list" style={{ borderTop: '1px solid var(--c-border-soft)', marginTop: 16 }}>
            {visibleEdges.map(edge => {
              const from = snapshot.availableNodes.find(node => node.id === edge.from)
              const to = snapshot.availableNodes.find(node => node.id === edge.to)
              return (
                <div
                  key={edge.id}
                  className="evidence-row"
                  style={{ gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center' }}
                >
                  <button
                    type="button"
                    onClick={() => from && openNode(from)}
                    style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: 0, background: 'transparent', color: 'var(--c-text)', padding: 0, textAlign: 'left', cursor: from?.placeholder ? 'default' : 'pointer' }}
                  >
                    <b>{nodeLabel(snapshot.availableNodes, edge.from)}</b>
                  </button>
                  <span style={{ color: edge.source === 'relation' ? 'var(--scene)' : 'var(--c-text-3)', whiteSpace: 'nowrap', fontSize: 10 }}>
                    {edge.directed ? '→' : '↔'} {edge.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => to && openNode(to)}
                    style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: 0, background: 'transparent', color: 'var(--c-text)', padding: 0, textAlign: 'right', cursor: to?.placeholder ? 'default' : 'pointer' }}
                  >
                    <b>{nodeLabel(snapshot.availableNodes, edge.to)}</b>
                  </button>
                </div>
              )
            })}
            {!visibleEdges.length && <p className="empty-state">当前筛选范围内还没有关系。</p>}
          </div>
        </aside>
      </section>
    </div>
  )
}

