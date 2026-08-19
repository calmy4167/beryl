<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { buildGraphSnapshot, graphTypeLabel, type GraphNode, type GraphNodeType } from '@/domain/graph'
import { unifiedFactories, unifiedRepository, type RelationType } from '@/domain/unified'

const router = useRouter()
const query = ref('')
const tick = ref(0)
const fromId = ref('')
const toId = ref('')
const relationType = ref<RelationType>('related_to')
const relationTypes: RelationType[] = ['supports', 'blocks', 'contradicts', 'derived_from', 'related_to', 'belongs_to', 'depends_on', 'practices', 'evidences', 'part_of']
const snapshot = computed(() => { void tick.value; return buildGraphSnapshot(query.value) })
const selectableNodes = computed(() => snapshot.value.availableNodes.filter(node => !node.placeholder))
const positions = computed(() => {
  const map = new Map<string, { x: number; y: number }>()
  const count = snapshot.value.nodes.length
  snapshot.value.nodes.forEach((node, index) => {
    const angle = count <= 1 ? 0 : (Math.PI * 2 * index) / count - Math.PI / 2
    const radius = count <= 4 ? 25 : Math.min(39, 19 + count * 0.18)
    map.set(node.id, { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius })
  })
  return map
})

function nodePosition(id: string): { x: number; y: number } { return positions.value.get(id) || { x: 50, y: 50 } }
function nodeClass(node: GraphNode): string { return `node-${node.type.replace('_', '-')}` }
function openNode(node: GraphNode): void { if (!node.placeholder) router.push(node.route) }
function refresh(): void { tick.value++ }
function onDataSynced(): void { refresh() }

function createRelation(): void {
  if (!fromId.value || !toId.value || fromId.value === toId.value) { ElMessage.warning('请选择两个不同的节点'); return }
  const from = selectableNodes.value.find(node => node.id === fromId.value)
  const to = selectableNodes.value.find(node => node.id === toId.value)
  if (!from || !to) { ElMessage.warning('节点已经不存在，请刷新后重试'); return }
  unifiedRepository.create(unifiedFactories.relation({
    from: { entityType: from.type as GraphNodeType, calmyId: from.id },
    to: { entityType: to.type as GraphNodeType, calmyId: to.id },
    relationType: relationType.value,
    directed: true,
    sourceIds: []
  }))
  fromId.value = ''; toId.value = ''; refresh(); ElMessage.success('Relation 已加入图谱')
}

onMounted(() => window.addEventListener('beryl-data-synced', onDataSynced))
onUnmounted(() => window.removeEventListener('beryl-data-synced', onDataSynced))
</script>

<template>
  <div class="graph-page">
    <header class="page-head">
      <div><p class="eyebrow">GRAPH · RELATION</p><h1 class="font-title">看见现实之间的连接</h1><p>显式 Relation 与实体已有引用会一起出现；点击节点可回到事实页面。</p></div>
      <div class="graph-count"><b>{{ snapshot.totalNodes }}</b><span>节点 · {{ snapshot.totalEdges }} 条边</span></div>
    </header>

    <section class="create-panel beryl-card">
      <div class="panel-head"><div><p class="eyebrow">ADD RELATION</p><h2 class="font-title">写下一条可追踪的关系</h2></div><span>关系只新增事实，不改变两端实体。</span></div>
      <div class="relation-form"><select v-model="fromId"><option value="">起点节点</option><option v-for="node in selectableNodes" :key="'from-' + node.id" :value="node.id">{{ graphTypeLabel(node.type) }} · {{ node.label }}</option></select><select v-model="relationType"><option v-for="type in relationTypes" :key="type" :value="type">{{ type }}</option></select><select v-model="toId"><option value="">终点节点</option><option v-for="node in selectableNodes" :key="'to-' + node.id" :value="node.id">{{ graphTypeLabel(node.type) }} · {{ node.label }}</option></select><button @click="createRelation">建立连接</button></div>
    </section>

    <section class="graph-toolbar beryl-card"><div><p class="eyebrow">EXPLORE</p><h2 class="font-title">关系图谱</h2></div><el-input v-model="query" class="graph-search" clearable placeholder="筛选节点或类型" /><span class="graph-hint">{{ snapshot.nodes.length }} 个可见节点 · {{ snapshot.edges.length }} 条可见边</span></section>

    <section class="graph-layout">
      <div class="graph-canvas beryl-card">
        <svg class="graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line v-for="edge in snapshot.edges" :key="edge.id" :x1="nodePosition(edge.from).x" :y1="nodePosition(edge.from).y" :x2="nodePosition(edge.to).x" :y2="nodePosition(edge.to).y" :class="edge.source === 'relation' ? 'explicit-edge' : 'reference-edge'" /></svg>
        <button v-for="node in snapshot.nodes" :key="node.id" class="graph-node" :class="nodeClass(node)" :style="{ left: nodePosition(node.id).x + '%', top: nodePosition(node.id).y + '%' }" :title="node.summary" @click="openNode(node)"><span>{{ graphTypeLabel(node.type) }}</span><b>{{ node.label }}</b><small v-if="node.placeholder">未解析</small></button>
        <div v-if="!snapshot.nodes.length" class="graph-empty"><span>◎</span><b>没有匹配的连接</b><small>换一个筛选词，或先创建两个实体。</small></div>
      </div>
      <aside class="edge-panel beryl-card"><div class="panel-head"><div><p class="eyebrow">EDGES</p><h2 class="font-title">关系清单</h2></div><span>{{ snapshot.edges.length }}</span></div><div class="edge-list"><button v-for="edge in snapshot.edges" :key="edge.id" @click="openNode(snapshot.availableNodes.find(node => node.id === edge.from) || { id: edge.from, type: 'relation', label: edge.from, summary: '', route: '/app/graph', updatedAt: 0 })"><b>{{ snapshot.availableNodes.find(node => node.id === edge.from)?.label || edge.from }}</b><span>{{ edge.directed ? '→' : '↔' }} {{ edge.label }}</span><b>{{ snapshot.availableNodes.find(node => node.id === edge.to)?.label || edge.to }}</b></button><p v-if="!snapshot.edges.length" class="empty-copy">创建 Relation，或先在 Matter、People、Library 中建立实体引用。</p></div></aside>
    </section>
  </div>
</template>

<style scoped>
.graph-page{max-width:1120px;margin:0 auto}.page-head{display:flex;align-items:end;justify-content:space-between;gap:18px;margin:6px 0 28px}.eyebrow{font-size:10px;letter-spacing:.13em;color:var(--scene);font-weight:700;margin:0 0 8px}.page-head h1{font-size:clamp(34px,4vw,48px);line-height:1;margin:0;letter-spacing:-.035em}.page-head p:last-child{margin:11px 0 0;font-size:13px;color:var(--c-text-2)}.graph-count{border-left:1px solid var(--c-border);padding:4px 0 4px 20px;display:grid}.graph-count b{font:600 32px/1 var(--font-title);color:var(--scene)}.graph-count span{font-size:10px;color:var(--c-text-3);margin-top:5px}.create-panel,.graph-toolbar{padding:18px;margin-bottom:16px}.panel-head{display:flex;align-items:start;justify-content:space-between;gap:12px}.panel-head h2{font-size:22px;margin:0}.panel-head>span{font-size:10px;color:var(--c-text-3)}.relation-form{display:grid;grid-template-columns:1fr 160px 1fr auto;gap:8px;margin-top:16px}.relation-form select{min-width:0;border:1px solid var(--c-border);border-radius:8px;background:var(--c-bg);color:var(--c-text);padding:8px;font-size:12px}.relation-form button{border:1px solid var(--scene);border-radius:8px;background:var(--scene);color:white;padding:8px 14px;cursor:pointer;font-size:12px}.graph-toolbar{display:flex;align-items:end;gap:14px}.graph-toolbar h2{font-size:22px;margin:0}.graph-search{width:260px;margin-left:auto}.graph-hint{font-size:10px;color:var(--c-text-3);white-space:nowrap}.graph-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,.8fr);gap:16px}.graph-canvas{position:relative;min-height:600px;overflow:hidden;background:radial-gradient(circle at center,var(--scene-soft),transparent 58%),var(--c-card)}.graph-lines{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.graph-lines line{stroke-width:.35}.explicit-edge{stroke:var(--scene)}.reference-edge{stroke:var(--c-border);stroke-dasharray:1.2 1}.graph-node{position:absolute;transform:translate(-50%,-50%);z-index:2;display:grid;gap:3px;min-width:88px;max-width:150px;padding:9px 10px;border:1px solid var(--c-border);border-radius:12px;background:color-mix(in srgb,var(--c-card) 88%,transparent);color:var(--c-text);box-shadow:0 5px 18px rgba(30,40,60,.08);cursor:pointer;text-align:left}.graph-node:hover{border-color:var(--scene);transform:translate(-50%,-50%) scale(1.04)}.graph-node span{font-size:9px;color:var(--scene);font-weight:700}.graph-node b{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.graph-node small{font-size:9px;color:var(--c-warn)}.node-matter{border-color:var(--scene)}.node-person{border-radius:20px}.node-relation{border-style:dashed}.edge-panel{padding:18px;min-width:0}.edge-panel .panel-head h2{font-size:22px}.edge-panel .panel-head>span{font-size:11px;color:var(--scene)}.edge-list{border-top:1px solid var(--c-border-soft);margin-top:16px}.edge-list button{display:grid;grid-template-columns:1fr auto 1fr;gap:7px;align-items:center;width:100%;border:0;border-bottom:1px solid var(--c-border-soft);background:transparent;color:var(--c-text);padding:11px 0;text-align:left;cursor:pointer}.edge-list button:hover{color:var(--scene)}.edge-list button b{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.edge-list button b:last-child{text-align:right}.edge-list button span{font-size:10px;color:var(--scene);white-space:nowrap}.empty-copy{font-size:12px;color:var(--c-text-3);padding:22px 4px}.graph-empty{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:8px;color:var(--c-text-3)}.graph-empty span{font-size:34px;color:var(--scene)}.graph-empty b{font-size:14px;color:var(--c-text-2)}.graph-empty small{font-size:11px}@media(max-width:760px){.page-head{display:block}.graph-count{display:inline-grid;margin-top:18px}.relation-form,.graph-layout{grid-template-columns:1fr}.graph-toolbar{display:grid;align-items:start}.graph-search{width:100%;margin:0}.graph-hint{white-space:normal}.graph-canvas{min-height:480px}.edge-panel{min-height:200px}}
</style>
