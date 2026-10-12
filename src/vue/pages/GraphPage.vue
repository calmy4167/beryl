<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import * as graph from '@/domain/graph'
import type { GraphNode, GraphNodeType } from '@/domain/graph'
import { RELATION_DEFINITIONS, unifiedAsyncRepository, unifiedFactories, type Relation, type RelationType } from '@/domain/unified'
import { withSaveState } from '@/core/save-state'
import DomainPicker from '@/vue/components/DomainPicker.vue'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbPanel from '@/vue/liubai/LbPanel.vue'
import LbCollapsible from '@/vue/liubai/LbCollapsible.vue'

// 页面自带头部（参考稿里 .slide-head 属于页面自身），外壳因此不再渲染第二行标题。
useOwnSlideHead()

const relationDefinitions = RELATION_DEFINITIONS.filter(definition => !definition.legacyCompatibility)
const relationTypes = relationDefinitions.map(definition => definition.relationType)
const relationTypeLabels: Record<RelationType, string> = { supports: '支持', blocks: '阻碍', contradicts: '冲突', derived_from: '源自', related_to: '相关', belongs_to: '属于', depends_on: '依赖', practices: '实践', evidences: '佐证', part_of: '组成', subject_of: '主体是', has_related_content: '关联内容', used_in: '使用于', belongs_to_domain: '属于领域', context_of: '情境关联' }
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
const directed = ref(false)
const tick = ref(0)
const snapshot = ref<Snapshot>({ nodes: [], edges: [], availableNodes: [], totalNodes: 0, totalEdges: 0 })
const loading = ref(true)
const saving = ref(false)
const pendingRelation = ref<Relation>()
const pendingRelationSignature = ref('')
const loaded = ref(false)
const error = ref('')
const visibleNodes = computed(() => nodeFilter.value === 'all' ? snapshot.value.nodes : snapshot.value.nodes.filter(node => node.type === nodeFilter.value))
const visibleIds = computed(() => new Set(visibleNodes.value.map(node => node.id)))
const visibleEdges = computed(() => snapshot.value.edges.filter(edge => visibleIds.value.has(edge.from) && visibleIds.value.has(edge.to)))
const selectableNodes = computed(() => snapshot.value.availableNodes.filter(node => !node.placeholder))
const activeDefinition = computed(() => relationDefinitions.find(definition => definition.relationType === relationType.value) || relationDefinitions[0])
function hasCardinalityCapacity(nodeId: string, endpoint: 'from' | 'to') {
  const definition = activeDefinition.value
  if (!definition) return false
  const edges = snapshot.value.edges.filter(edge => edge.source === 'relation' && edge.label === definition.relationType)
  if (definition.cardinality === 'one-to-one') return !edges.some(edge => endpoint === 'from' ? edge.from === nodeId || edge.to === nodeId : edge.to === nodeId || edge.from === nodeId)
  if (definition.cardinality === 'one-to-many' && endpoint === 'to') return !edges.some(edge => edge.to === nodeId)
  if (definition.cardinality === 'many-to-one' && endpoint === 'from') return !edges.some(edge => edge.from === nodeId)
  return true
}
const fromNodes = computed(() => selectableNodes.value.filter(node => activeDefinition.value?.fromTypes.includes(node.type as never) && hasCardinalityCapacity(node.id, 'from')))
const toNodes = computed(() => selectableNodes.value.filter(node => activeDefinition.value?.toTypes.includes(node.type as never) && hasCardinalityCapacity(node.id, 'to')))
const hasSourceTypes = computed(() => selectableNodes.value.some(node => activeDefinition.value?.fromTypes.includes(node.type as never)))
const hasTargetTypes = computed(() => selectableNodes.value.some(node => activeDefinition.value?.toTypes.includes(node.type as never)))
const selectedFrom = computed(() => fromNodes.value.find(node => node.id === fromId.value))
const selectedTo = computed(() => toNodes.value.find(node => node.id === toId.value))
const validPair = computed(() => !!selectedFrom.value && !!selectedTo.value && selectedFrom.value.id !== selectedTo.value.id && (activeDefinition.value?.directed === 'either' || activeDefinition.value?.directed === directed.value))
const relationFormMessage = computed(() => !hasSourceTypes.value || !hasTargetTypes.value ? '当前关系类型没有可用的对应节点。' : !fromNodes.value.length || !toNodes.value.length ? '此关系已达到一端的关联数量限制。' : !validPair.value ? '请选择关系两端的有效节点。' : '')
watch(relationType, () => { fromId.value = ''; toId.value = ''; directed.value = activeDefinition.value?.directed === true })
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
  if (loading.value || saving.value || !validPair.value || !activeDefinition.value) return
  const from = selectedFrom.value!
  const to = selectedTo.value!
  const signature = `${relationType.value}:${from.type}:${from.id}:${to.type}:${to.id}:${directed.value}`
  if (pendingRelationSignature.value !== signature || !pendingRelation.value) {
    pendingRelationSignature.value = signature
    pendingRelation.value = unifiedFactories.relation({ from: { entityType: from.type, calmyId: from.refId || from.id }, to: { entityType: to.type, calmyId: to.refId || to.id }, relationType: relationType.value, directed: activeDefinition.value?.directed === 'either' ? directed.value : activeDefinition.value?.directed === true, sourceIds: [] })
  }
  saving.value = true
  try {
    await withSaveState(() => unifiedAsyncRepository.create(pendingRelation.value!, { commandId: `graph-relation:${pendingRelation.value!.calmyId}` }))
    pendingRelation.value = undefined
    pendingRelationSignature.value = ''
    fromId.value = ''; toId.value = ''; tick.value += 1
    window.dispatchEvent(new CustomEvent('beryl-data-synced'))
    toast('关系已加入图谱')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '关系保存失败', 'error') }
  finally { saving.value = false }
}
</script>

<template>
  <header class="slide-head">
    <div class="head-main">
      <p class="hint">关系 · 图谱 · 试验</p>
      <div class="head-title-row">
        <h2 v-if="loading && !loaded">正在读取图谱…</h2>
        <h2 v-else-if="error && !loaded">图谱暂时无法加载。</h2>
        <h2 v-else-if="!snapshot.totalNodes">还没有可连接的节点。</h2>
        <h2 v-else>看见 <em>{{ snapshot.totalNodes }}</em> 个节点之间的连接。</h2>
        <span class="info" tabindex="0" data-tip="手动添加的关系和实体已有引用会一起显示；点击节点可回到对应记录。H 收起辅助信息。" aria-label="图谱说明">i</span>
      </div>
    </div>
    <div class="graph-stats" aria-label="图谱统计">
      <b>{{ snapshot.totalNodes }}</b><span>节点 · {{ snapshot.totalEdges }} 条边</span>
    </div>
  </header>

  <p v-if="loading && !loaded" class="panel dim" role="status">正在读取图谱…</p>
  <section v-else-if="error && !loaded" class="panel graph-error" role="alert"><h2>图谱暂时无法加载</h2><p class="dim">{{ error }}</p><button class="chip on" type="button" @click="tick += 1">重新读取</button></section>
  <template v-else>
    <p v-if="loading" class="dim" role="status">正在更新图谱…</p>
    <section v-if="error" class="panel graph-error" role="alert">最新图谱读取失败，当前仍展示上一次结果：{{ error }}<button class="chip" type="button" @click="tick += 1">重试</button></section>
    <LbCollapsible block="graphAdd" :rank="2">
      <LbPanel title="添加关系" note="关系只新增事实，不改变两端实体">
        <div class="relation-form">
          <select aria-label="关系类型" v-model="relationType"><option v-for="type in relationTypes" :key="type" :value="type">{{ relationTypeLabels[type] }}</option></select>
          <select aria-label="关系起点" v-model="fromId"><option value="">起点节点</option><option v-for="node in fromNodes" :key="`from-${node.id}`" :value="node.id">{{ graph.graphTypeLabel(node.type) }} · {{ node.label }}</option></select>
          <select aria-label="关系终点" v-model="toId"><option value="">终点节点</option><option v-for="node in toNodes" :key="`to-${node.id}`" :value="node.id">{{ graph.graphTypeLabel(node.type) }} · {{ node.label }}</option></select>
          <select v-if="activeDefinition?.directed === 'either'" aria-label="关系方向" v-model="directed"><option :value="false">双向</option><option :value="true">有向</option></select>
          <button class="chip on" type="button" :disabled="loading || saving || !validPair" @click="void createRelation()">{{ saving ? '保存中…' : '建立连接' }}</button>
        </div>
        <p v-if="relationFormMessage" class="dim" role="status">{{ relationFormMessage }}</p>
      </LbPanel>
    </LbCollapsible>
    <LbCollapsible block="graphExplore" :rank="2">
      <LbPanel title="关系图谱" :note="`${visibleNodes.length} 个可见节点 · ${visibleEdges.length} 条可见边`">
        <div class="graph-toolbar">
          <input v-model="query" aria-label="筛选图谱" placeholder="筛选节点、摘要或类型">
          <select aria-label="筛选节点类型" v-model="nodeFilter"><option value="all">全部类型</option><option v-for="type in filterOptions" :key="type" :value="type">{{ graph.graphTypeLabel(type) }}</option></select>
        </div>
      </LbPanel>
    </LbCollapsible>
    <section class="graph-layout">
      <section class="panel">
        <div class="panel-head"><span class="panel-title">节点列表</span><span class="panel-note">{{ visibleNodes.length }}</span></div>
        <div class="graph-node-list">
          <article v-for="node in visibleNodes" :key="node.id" class="graph-node-row" :class="nodeClass(node)">
            <button type="button" :disabled="node.placeholder" :title="node.summary || node.label" @click="openNode(node)" class="graph-node-button">
              <span class="gn-type">{{ graph.graphTypeLabel(node.type) }}</span>
              <span class="gn-main"><b>{{ node.label }}</b><small>{{ node.summary || '暂无摘要' }}</small></span>
              <span class="gn-arrow">{{ node.placeholder ? '未解析' : '→' }}</span>
            </button>
            <DomainPicker v-if="!node.placeholder" :entity-ref="{ entityType: node.type, calmyId: node.refId || node.id }" />
          </article>
          <p v-if="!visibleNodes.length" class="dim">没有匹配的节点。换一个筛选词试试。</p>
        </div>
      </section>
      <aside class="panel">
        <div class="panel-head"><span class="panel-title">关系清单</span><span class="panel-note">{{ visibleEdges.length }}</span></div>
        <div class="edge-list">
          <div v-for="edge in visibleEdges" :key="edge.id" class="evidence-row">
            <button type="button" class="edge-node" @click="openNode(snapshot.availableNodes.find(node => node.id === edge.from))" :style="{ cursor: snapshot.availableNodes.find(node => node.id === edge.from)?.placeholder ? 'default' : 'pointer' }"><b>{{ nodeLabel(edge.from) }}</b></button>
            <span class="edge-label" :class="{ manual: edge.source === 'relation' }">{{ edge.directed ? '→' : '↔' }} {{ edgeLabel(edge.label) }}</span>
            <button type="button" class="edge-node right" @click="openNode(snapshot.availableNodes.find(node => node.id === edge.to))" :style="{ cursor: snapshot.availableNodes.find(node => node.id === edge.to)?.placeholder ? 'default' : 'pointer' }"><b>{{ nodeLabel(edge.to) }}</b></button>
          </div>
          <p v-if="!visibleEdges.length" class="dim">当前筛选范围内还没有关系。</p>
        </div>
      </aside>
    </section>
  </template>
</template>

<style scoped>
/* 页面局部排版：颜色全部取「留白」令牌。原先这一页几乎每个元素都写内联 style 且用旧 --c-* 令牌，
   迁到 v11 后统一收到这里，模板只留结构。.graph-node-list / .edge-list / .evidence-row / .graph-layout
   是 parity 测试的钩子，类名保留。 */
.graph-error { border-color: color-mix(in srgb, var(--danger) 45%, transparent); }
.graph-stats { display: grid; gap: 2px; padding-left: 18px; border-left: 1px solid var(--line); }
.graph-stats b { color: var(--accent); font-size: 2rem; font-weight: 700; line-height: 1; }
.graph-stats span { color: var(--muted); font-size: .66rem; }

.relation-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); align-items: center; gap: 8px; }
.relation-form select { min-height: 34px; padding: 6px 10px; font: inherit; font-size: .8rem; }
.relation-form .chip { justify-self: start; }
.graph-toolbar { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 8px; }
.graph-toolbar input, .graph-toolbar select { min-height: 34px; padding: 6px 10px; font: inherit; font-size: .8rem; }

.graph-layout { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr)); gap: clamp(10px, 1.2vw, 14px); align-items: start; }
.graph-node-list { display: grid; gap: 8px; }
.graph-node-row { display: grid; gap: 5px; min-width: 0; }
.graph-node-button { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; width: 100%; padding: 11px 12px; color: var(--fg); border: 1px solid var(--line); border-radius: 10px; background: var(--panel-2); text-align: left; cursor: pointer; }
.graph-node-button:disabled { cursor: default; opacity: .66; }
.graph-node-button:hover:not(:disabled) { border-color: var(--line-strong); }
.gn-type { color: var(--accent); font-size: .66rem; font-weight: 700; white-space: nowrap; }
.gn-main { display: grid; gap: 3px; min-width: 0; }
.gn-main b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .86rem; }
.gn-main small { color: var(--muted); font-size: .7rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gn-arrow { color: var(--muted); font-size: .8rem; }

.edge-list { border-top: 1px solid var(--line); }
.evidence-row { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--line); }
.evidence-row:last-child { border-bottom: 0; }
.edge-node { min-width: 0; padding: 0; border: 0; background: transparent; color: var(--fg); text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.edge-node.right { text-align: right; }
.edge-label { color: var(--muted); font-size: .68rem; white-space: nowrap; }
.edge-label.manual { color: var(--accent); }
</style>
