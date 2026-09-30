<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { withSaveState } from '@/core/save-state'
import { todayKey } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import type { ActionItem, ActionStatus } from '@/domain/action/model'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
import WorkspaceSourceBar from '@/vue/shell/WorkspaceSourceBar.vue'
import FeishuTaskBoard from '@/vue/pages/FeishuTaskBoard.vue'
import { ACTION_STATUS_DEFAULTS } from '@/domain/action/status-labels'
import { useActionStatusDictionary } from '@/vue/composables/useActionStatusDictionary'

type Filter = 'all' | 'active' | 'today'
const { statuses: orderedStatuses, labelFor: statusLabel } = useActionStatusDictionary()
const columns = computed(() => orderedStatuses.value.map(status => ({ status, label: statusLabel(status), hint: ACTION_STATUS_DEFAULTS[status].hint })))
const router = useRouter(); const actions = ref<ActionItem[]>([]); const matters = ref<Matter[]>([])
const source = ref<'local'|'feishu'>(readSource())
function readSource(): 'local'|'feishu' { try { return localStorage.getItem('calmy:workspace:source')==='feishu'?'feishu':'local' } catch { return 'local' } }
function syncSource() { source.value=readSource() }
const filter = ref<Filter>('all'); const matterFilter = ref(''); const query = ref(''); const loading = ref(true); const error = ref(''); const busy = ref(''); const dragged = ref(''); const over = ref<ActionStatus>()
function toast(message: string, kind: 'success' | 'error' = 'success') { window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } })) }
function setFilter(value: Filter) { filter.value = value }
function dateLabel(value: string) { const date = new Date(`${value}T00:00:00`); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) }
function terminal(status: ActionStatus) { return status === 'done' || status === 'skipped' || status === 'cancelled' }
async function refresh() { loading.value = true; try { const [a, m] = await Promise.all([actionAsyncRepository.list(), matterAsyncRepository.list()]); actions.value = a; matters.value = m; error.value = '' } catch (e) { error.value = e instanceof Error ? e.message : '看板读取失败' } finally { loading.value = false } }
onMounted(() => { void refresh(); window.addEventListener('beryl-data-synced', refresh);window.addEventListener('calmy-workspace-source',syncSource);window.addEventListener('storage',syncSource) }); onUnmounted(() => {window.removeEventListener('beryl-data-synced', refresh);window.removeEventListener('calmy-workspace-source',syncSource);window.removeEventListener('storage',syncSource)})
const matterMap = computed(() => new Map(matters.value.map(item => [item.calmyId, item])))
const visible = computed(() => actions.value.filter(item => { const matter = item.matterId ? matterMap.value.get(item.matterId) : undefined; const text = `${item.title} ${matter?.title || ''}`.toLocaleLowerCase(); return (!query.value.trim() || text.includes(query.value.trim().toLocaleLowerCase())) && (!matterFilter.value || item.matterId === matterFilter.value) && (filter.value === 'all' || (filter.value === 'active' && ['planned', 'in_progress'].includes(item.status)) || (filter.value === 'today' && item.date === todayKey())) }))
async function move(item: ActionItem, target: ActionStatus) { if (item.status === target || busy.value) return; busy.value = item.calmyId; try { let next = item; if (terminal(next.status) && target !== 'planned') next = await withSaveState(() => actionAsyncRepository.reopen(next.calmyId, next.revision)); if (next.status !== target) next = await withSaveState(() => actionAsyncRepository.transition(next.calmyId, target, next.revision)); actions.value = actions.value.map(x => x.calmyId === next.calmyId ? next : x); toast(`已移动到「${statusLabel(target)}」`) } catch (e) { toast(e instanceof Error ? e.message : '任务状态更新失败', 'error'); await refresh() } finally { busy.value = ''; dragged.value = ''; over.value = undefined } }
function drop(event: DragEvent, status: ActionStatus) { event.preventDefault(); const id = event.dataTransfer?.getData('text/plain') || dragged.value; const item = actions.value.find(x => x.calmyId === id); if (item) void move(item, status) }
</script>
<template>
  <div class="task-board-page"><WorkspaceSourceBar /><FeishuTaskBoard v-if="source==='feishu'" /><template v-else><header class="page-head"><div><p class="eyebrow">看板 · 行动</p><h1 class="font-title">看板</h1><p>拖动任务改变状态；每一次移动都会保留在统一的现实行动记录里。</p></div><div class="task-board-head-actions"><button class="app-button" @click="router.push('/app/module/tasks')">列表视图</button><button class="app-button primary" @click="router.push('/app/module/tasks#new')">添加任务</button></div></header>
    <section class="task-board-toolbar beryl-card" aria-label="看板筛选"><div class="range-tabs" role="tablist" aria-label="任务范围"><button v-for="[v,l] in [['all','全部'],['active','未结束'],['today','今天']]" :key="v" role="tab" :aria-selected="filter===v" :class="{on:filter===v}" @click="setFilter(v as Filter)">{{ l }}</button></div><input aria-label="搜索任务" v-model="query" placeholder="搜索任务或事项…"><select id="board-matter-filter" aria-label="按事项筛选" v-model="matterFilter"><option value="">全部事项</option><option v-for="matter in matters.filter(item => item.status !== 'archived')" :key="matter.calmyId" :value="matter.calmyId">{{ matter.title }}</option></select><span class="task-board-count">{{ loading ? '正在读取…' : `${visible.length} 条任务` }}</span></section>
    <section v-if="error" class="beryl-card empty-state" role="alert"><b>看板数据暂时无法读取</b><p>{{error}}</p><button class="app-button" @click="refresh">重试</button></section><div v-if="loading" class="empty-state" role="status">正在读取任务看板…</div>
    <section v-else class="task-board" aria-label="可拖动任务看板"><div v-for="column in columns" :key="column.status" class="task-board-column" :class="{'drop-active':over===column.status}" @dragover.prevent="over=column.status" @drop="drop($event,column.status)"><div class="task-board-column-head"><div><h2>{{column.label}}</h2><small>{{column.hint}}</small></div><span>{{visible.filter(x=>x.status===column.status).length}}</span></div><div class="task-board-column-body"><article v-for="item in visible.filter(x=>x.status===column.status)" :key="item.calmyId" class="task-board-card beryl-card" draggable="true" @dragstart="dragged=item.calmyId; ($event.dataTransfer as DataTransfer).setData('text/plain',item.calmyId)"><div class="task-board-card-top"><span class="action-status" :class="item.status">{{statusLabel(item.status)}}</span><span class="task-drag-hint" aria-hidden="true">⋮⋮</span></div><h3>{{item.title}}</h3><small>{{dateLabel(item.date)}} · {{item.matterId && matterMap.get(item.matterId)?.title || '未关联事项'}}</small><div class="task-board-card-footer"><label>状态<select :aria-label="`${item.title}状态`" :value="item.status" :disabled="busy===item.calmyId" @change="move(item, ($event.target as HTMLSelectElement).value as ActionStatus)"><option v-for="option in columns" :key="option.status" :value="option.status">{{ option.label }}</option></select></label><button v-if="item.matterId" @click="router.push(`/app/matters/${item.matterId}`)">查看事项</button></div></article><div v-if="!visible.filter(x=>x.status===column.status).length" class="task-board-empty">拖动任务到这里</div></div></div></section><p class="task-board-note">提示：拖动只是改变任务状态，不会删除原文或修改事项；手机端可使用每张卡片的状态选择。</p></template>
  </div>
</template>
