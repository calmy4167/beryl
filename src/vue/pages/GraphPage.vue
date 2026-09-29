<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import * as graph from '@/domain/graph'
import type { GraphNode, GraphNodeType } from '@/domain/graph'
import { unifiedAsyncRepository, unifiedFactories, type RelationType } from '@/domain/unified'
import { withSaveState } from '@/core/save-state'

const relationTypes: RelationType[] = ['supports', 'blocks', 'contradicts', 'derived_from', 'related_to', 'belongs_to', 'depends_on', 'practices', 'evidences', 'part_of', 'subject_of', 'used_in', 'belongs_to_domain', 'context_of']
const relationTypeLabels: Record<RelationType, string> = { supports: '支持', blocks: '阻碍', contradicts: '冲突', derived_from: '源自', related_to: '相关', belongs_to: '属于', depends_on: '依赖', practices: '实践', evidences: '佐证', part_of: '组成', subject_of: '主体', used_in: '使用于', belongs_to_domain: '属于领域', context_of: '情境关联' }
const referenceLabels: Record<string, string> = { connects: '连接', uses: '使用', context: '关联', points_to: '指向', result_of: '产生于', explains: '解释', hosts: '包含', includes: '包含' }
const edgeLabel = (label: string) => relationTypeLabels[label as RelationType] || referenceLabels[label] || label
type NodeFilter = 'all' | GraphNodeType
type Snapshot = ReturnType<typeof graph.buildGraphSnapshot>
const router = useRouter()
const query = ref('')
const nodeFilter = ref<NodeFilter>('all')
const fromId = ref('')
const toId = ref('')
const relationType = ref<RelationType>('related_to')
const tick = ref(0)
const snapshot = ref<Snapshot>({ nodes: [], edges: [], availableNodes: [], totalNodes: 0, totalEdges: 0 })
const loading = ref(true)
const loaded = ref(false)
const error = ref('')
const visibleNodes = computed(() => nodeFilter.value === 'all' ? snapshot.value.nodes : snapshot.value.nodes.filter(node => node.type === nodeFilter.value))
const visibleIds = computed(() => new Set(visibleNodes.value.map(node => node.id)))
const visibleEdges = computed(() => snapshot.value.edges.filter(edge => visibleIds.value.has(edge.from) && visibleIds.value.has(edge.to)))
const selectableNodes = computed(() => snapshot.value.availableNodes.filter(node => !node.placeholder))
const filterOptions = computed(() => [...new Set(snapshot.value.availableNodes.map(node => node.type))].sort((a, b) => graph.graphTypeLabel(a).localeCompare(graph.graphTypeLabel(b))))
function toast(message: string, kind: 'success' | 'warning' | 'error' = 'success') { window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } })) }
function nodeClass(node: GraphNode) { return `node-${node.type.replace('_', '-')}` }
function nodeLabel(id: string) { return snapshot.value.availableNodes.find(node => node.id === id)?.label || id }
function openNode(node: GraphNode | undefined) { if (node && !node.placeholder) void router.push(node.route) }
function readGraph() { loading.value = true; try { snapshot.value = graph.buildGraphSnapshot(query.value); error.value = ''; loaded.value = true } catch (cause) { error.value = cause instanceof Error ? cause.message : '图谱数据读取失败' } finally { loading.value = false } }
watch([query, tick], readGraph, { flush: 'post' })
const onSynced = () => { tick.value += 1 }
let initialReadTimer: ReturnType<typeof setTimeout> | undefined
onMounted(() => { window.addEventListener('beryl-data-synced', onSynced); initialReadTimer = setTimeout(readGraph, 0) })
onUnmounted(() => { window.removeEventListener('beryl-data-synced', onSynced); if (initialReadTimer) clearTimeout(initialReadTimer) })
async function createRelation() {
  if (loading.value) return
  if (!fromId.value || !toId.value || fromId.value === toId.value) { toast('请选择两个不同的节点', 'warning'); return }
  const from = selectableNodes.value.find(node => node.id === fromId.value)
  const to = selectableNodes.value.find(node => node.id === toId.value)
  if (!from || !to) { toast('节点已经不存在，请刷新后重试', 'warning'); return }
  try {
    await withSaveState(() => unifiedAsyncRepository.create(unifiedFactories.relation({ from: { entityType: from.type, calmyId: from.id }, to: { entityType: to.type, calmyId: to.id }, relationType: relationType.value, directed: true, sourceIds: [] })))
    fromId.value = ''; toId.value = ''; tick.value += 1
    window.dispatchEvent(new CustomEvent('beryl-data-synced'))
    toast('关系已加入图谱')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '关系保存失败', 'error') }
}
</script>

<template>
  <div v-if="loading && !loaded" class="graph-page"><div class="empty-state beryl-card" role="status">正在读取图谱…</div></div>
  <div v-else-if="error && !loaded" class="graph-page"><section class="empty-state beryl-card" role="alert"><h1 class="font-title">图谱暂时无法加载</h1><p>{{ error }}</p><button class="app-button primary" type="button" @click="tick += 1">重新读取</button></section></div>
  <div v-else class="graph-page">
    <header class="page-head"><div><p class="eyebrow">关系 · 图谱 · 试验</p><h1 class="font-title">看见现实之间的连接</h1><p>手动添加的关系和实体已有引用会一起显示；点击节点可回到对应记录。</p></div><div aria-label="图谱统计" style="border-left:1px solid var(--c-border);padding:4px 0 4px 20px;display:grid"><b class="font-title" style="color:var(--scene);font-size:32px;line-height:1">{{ snapshot.totalNodes }}</b><span style="color:var(--c-text-3);font-size:10px;margin-top:5px">节点 · {{ snapshot.totalEdges }} 条边</span></div></header>
    <div v-if="loading" class="empty-state beryl-card" role="status">正在更新图谱…</div>
    <section v-if="error" class="empty-state beryl-card" role="alert">最新图谱读取失败，当前仍展示上一次结果：{{ error }}<button class="app-button" type="button" @click="tick += 1">重试</button></section>
    <section class="beryl-card admin-block" aria-labelledby="add-relation-title"><div class="panel-head"><div><p class="eyebrow">添加关系</p><h2 id="add-relation-title" class="font-title">写下一条可追踪的关系</h2></div><span style="color:var(--c-text-3);font-size:10px">关系只新增事实，不改变两端实体。</span></div><div class="relation-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%, 180px),1fr));gap:8px;margin-top:16px"><select aria-label="关系起点" v-model="fromId"><option value="">起点节点</option><option v-for="node in selectableNodes" :key="`from-${node.id}`" :value="node.id">{{ graph.graphTypeLabel(node.type) }} · {{ node.label }}</option></select><select aria-label="关系类型" v-model="relationType"><option v-for="type in relationTypes" :key="type" :value="type">{{ relationTypeLabels[type] }}</option></select><select aria-label="关系终点" v-model="toId"><option value="">终点节点</option><option v-for="node in selectableNodes" :key="`to-${node.id}`" :value="node.id">{{ graph.graphTypeLabel(node.type) }} · {{ node.label }}</option></select><button class="primary" type="button" :disabled="loading" @click="void createRelation()">建立连接</button></div></section>
    <section class="beryl-card admin-block" aria-labelledby="graph-explore-title"><div class="panel-head" style="align-items:end"><div><p class="eyebrow">探索</p><h2 id="graph-explore-title" class="font-title">关系图谱</h2></div><span style="color:var(--c-text-3);font-size:10px">{{ visibleNodes.length }} 个可见节点 · {{ visibleEdges.length }} 条可见边</span></div><div class="graph-toolbar" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%, 220px),1fr));gap:8px;margin-top:14px"><input v-model="query" aria-label="筛选图谱" placeholder="筛选节点、摘要或类型"><select aria-label="筛选节点类型" v-model="nodeFilter"><option value="all">全部类型</option><option v-for="type in filterOptions" :key="type" :value="type">{{ graph.graphTypeLabel(type) }}</option></select></div></section>
    <section class="graph-layout" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%, 360px),1fr));gap:16px;margin-top:16px">
      <section class="beryl-card admin-block" aria-labelledby="node-list-title" style="margin-top:0"><div class="panel-head"><div><p class="eyebrow">节点</p><h2 id="node-list-title" class="font-title">节点列表</h2></div><span>{{ visibleNodes.length }}</span></div><div class="graph-node-list" style="display:grid;gap:8px;margin-top:16px"><button v-for="node in visibleNodes" :key="node.id" type="button" :class="['beryl-card', nodeClass(node)]" :disabled="node.placeholder" :title="node.summary || node.label" @click="openNode(node)" :style="{ display:'grid',gridTemplateColumns:'auto minmax(0, 1fr) auto',alignItems:'center',gap:'10px',width:'100%',padding:'11px 12px',color:'var(--c-text)',border:'1px solid var(--c-border)',textAlign:'left',cursor:node.placeholder?'default':'pointer',opacity:node.placeholder?.66:1 }"><span style="color:var(--scene);font-size:10px;font-weight:700;white-space:nowrap">{{ graph.graphTypeLabel(node.type) }}</span><span style="min-width:0;display:grid;gap:3px"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ node.label }}</b><small style="color:var(--c-text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ node.summary || '暂无摘要' }}</small></span><span style="color:var(--c-text-3);font-size:14px">{{ node.placeholder ? '未解析' : '→' }}</span></button><p v-if="!visibleNodes.length" class="empty-state">没有匹配的节点。换一个筛选词试试。</p></div></section>
      <aside class="beryl-card admin-block" aria-labelledby="relation-list-title" style="margin-top:0"><div class="panel-head"><div><p class="eyebrow">连线</p><h2 id="relation-list-title" class="font-title">关系清单</h2></div><span>{{ visibleEdges.length }}</span></div><div class="edge-list" style="border-top:1px solid var(--c-border-soft);margin-top:16px"><div v-for="edge in visibleEdges" :key="edge.id" class="evidence-row" style="grid-template-columns:minmax(0, 1fr) auto minmax(0, 1fr);align-items:center"><button type="button" @click="openNode(snapshot.availableNodes.find(node => node.id === edge.from))" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:0;background:transparent;color:var(--c-text);padding:0;text-align:left" :style="{ cursor: snapshot.availableNodes.find(node => node.id === edge.from)?.placeholder ? 'default' : 'pointer' }"><b>{{ nodeLabel(edge.from) }}</b></button><span :style="{ color:edge.source === 'relation' ? 'var(--scene)' : 'var(--c-text-3)',whiteSpace:'nowrap',fontSize:'10px' }">{{ edge.directed ? '→' : '↔' }} {{ edgeLabel(edge.label) }}</span><button type="button" @click="openNode(snapshot.availableNodes.find(node => node.id === edge.to))" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:0;background:transparent;color:var(--c-text);padding:0;text-align:right" :style="{ cursor: snapshot.availableNodes.find(node => node.id === edge.to)?.placeholder ? 'default' : 'pointer' }"><b>{{ nodeLabel(edge.to) }}</b></button></div><p v-if="!visibleEdges.length" class="empty-state">当前筛选范围内还没有关系。</p></div></aside>
    </section>
  </div>
</template>
