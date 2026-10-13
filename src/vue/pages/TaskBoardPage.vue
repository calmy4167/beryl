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
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbPanel from '@/vue/liubai/LbPanel.vue'
import LbCollapsible from '@/vue/liubai/LbCollapsible.vue'
import LbStatGrid from '@/vue/liubai/LbStatGrid.vue'
import type { LbStat } from '@/vue/liubai/types'

// 页面自带头部（参考稿里 .slide-head 属于页面自身），外壳因此不再渲染第二行标题。
useOwnSlideHead()

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
/** 「留白」统计卡：看板自己的口径（HUD 第 3 档收起） */
const stats = computed<LbStat[]>(() => [
  { label: '全部任务', value: actions.value.length, unit: ' 条' },
  { label: '未结束', value: actions.value.filter(item => !terminal(item.status)).length, unit: ' 条' },
  { label: '今天', value: actions.value.filter(item => item.date === todayKey()).length, unit: ' 条' },
  { label: '已完成', value: actions.value.filter(item => item.status === 'done').length, unit: ' 条' }
])

async function move(item: ActionItem, target: ActionStatus) { if (item.status === target || busy.value) return; busy.value = item.calmyId; try { let next = item; if (terminal(next.status) && target !== 'planned') next = await withSaveState(() => actionAsyncRepository.reopen(next.calmyId, next.revision)); if (next.status !== target) next = await withSaveState(() => actionAsyncRepository.transition(next.calmyId, target, next.revision)); actions.value = actions.value.map(x => x.calmyId === next.calmyId ? next : x); toast(`已移动到「${statusLabel(target)}」`) } catch (e) { toast(e instanceof Error ? e.message : '任务状态更新失败', 'error'); await refresh() } finally { busy.value = ''; dragged.value = ''; over.value = undefined } }
function drop(event: DragEvent, status: ActionStatus) { event.preventDefault(); const id = event.dataTransfer?.getData('text/plain') || dragged.value; const item = actions.value.find(x => x.calmyId === id); if (item) void move(item, status) }
</script>
<template>
  <!-- 页面头只在「本地」分支渲染；飞书分支由 FeishuTaskBoard 自带 .slide-head（否则会出现两个标题） -->
  <header v-if="source !== 'feishu'" class="slide-head">
      <div class="head-main">
        <p class="hint">看板 · Board</p>
        <div class="head-title-row">
          <h2 v-if="loading">正在读取…</h2>
          <h2 v-else-if="!visible.length">看板是空的。</h2>
          <h2 v-else>五个状态里还有 <em>{{ visible.length }}</em> 张卡片。</h2>
          <span class="info" tabindex="0" data-tip="拖动卡片改变状态，不会删除原文或修改事项；手机端用卡片里的状态选择。H 收起筛选与统计。" aria-label="看板说明">i</span>
        </div>
      </div>
      <div class="detail-chips head-actions">
        <button class="chip" type="button" @click="router.push('/app/module/tasks')">列表视图</button>
        <button class="chip on" type="button" @click="router.push('/app/module/tasks#new')">添加任务</button>
      </div>
    </header>

    <WorkspaceSourceBar v-if="source !== 'feishu'" />

    <FeishuTaskBoard v-if="source==='feishu'">
      <template #toolbar><WorkspaceSourceBar /></template>
    </FeishuTaskBoard>

    <template v-else>
        <div class="task-board-toolbar" aria-label="看板筛选">
          <div class="seg" role="tablist" aria-label="任务范围">
            <button v-for="[v,l] in [['all','全部'],['active','未结束'],['today','今天']]" :key="v" role="tab" :aria-selected="filter===v" :class="{on:filter===v}" @click="setFilter(v as Filter)">{{ l }}</button>
          </div>
          <input aria-label="搜索任务" v-model="query" placeholder="搜索任务或事项…">
          <select id="board-matter-filter" aria-label="按事项筛选" v-model="matterFilter"><option value="">全部事项</option><option v-for="matter in matters.filter(item => item.status !== 'archived')" :key="matter.calmyId" :value="matter.calmyId">{{ matter.title }}</option></select>
          <span class="task-board-count">{{ loading ? '正在读取…' : `${visible.length} 条任务` }}</span>
        </div>
    <section v-if="error" class="panel board-error" role="alert"><b>看板数据暂时无法读取</b><p class="dim">{{error}}</p><button class="chip" type="button" @click="refresh">重试</button></section><p v-if="loading" class="panel dim" role="status">正在读取任务看板…</p>
    <section v-else class="task-board" aria-label="可拖动任务看板"><div v-for="column in columns" :key="column.status" class="task-board-column panel" :class="{'drop-active':over===column.status}" @dragover.prevent="over=column.status" @drop="drop($event,column.status)"><div class="panel-head task-board-column-head"><span class="panel-title">{{column.label}}</span><span class="panel-note">{{ visible.filter(x=>x.status===column.status).length }} · {{ column.hint }}</span></div><div class="task-board-column-body"><article v-for="item in visible.filter(x=>x.status===column.status)" :key="item.calmyId" class="task-board-card" draggable="true" @dragstart="dragged=item.calmyId; ($event.dataTransfer as DataTransfer).setData('text/plain',item.calmyId)"><div class="task-board-card-top"><span class="action-status" :class="item.status">{{statusLabel(item.status)}}</span><span class="task-drag-hint" aria-hidden="true">⋮⋮</span></div><h3>{{item.title}}</h3><small>{{dateLabel(item.date)}} · {{item.matterId && matterMap.get(item.matterId)?.title || '未关联事项'}}</small><div class="task-board-card-footer"><label>状态<select :aria-label="`${item.title}状态`" :value="item.status" :disabled="busy===item.calmyId" @change="move(item, ($event.target as HTMLSelectElement).value as ActionStatus)"><option v-for="option in columns" :key="option.status" :value="option.status">{{ option.label }}</option></select></label><button v-if="item.matterId" class="chip" type="button" @click="router.push(`/app/matters/${item.matterId}`)">查看事项</button></div></article><div v-if="!visible.filter(x=>x.status===column.status).length" class="task-board-empty">拖动任务到这里</div></div></div></section><LbCollapsible v-if="actions.length" block="boardStats" :rank="3">
      <LbPanel title="任务统计">
        <LbStatGrid :stats="stats" />
      </LbPanel>
    </LbCollapsible>

    <LbCollapsible block="boardNote" :rank="3">
      <LbPanel title="说明">
        <p class="dim">拖动只是改变任务状态，不会删除原文或修改事项；手机端可使用每张卡片的状态选择。</p>
      </LbPanel>
    </LbCollapsible>
  </template>
</template>

<style scoped>
/* 看板局部排版：颜色与面板语言取「留白」令牌。
   类名沿用 .task-board-* / .action-status，因为 parity 测试按这些选择器断言。 */
.slide-head .head-actions { align-self: flex-end; margin-left: auto; }

.task-board-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.task-board-toolbar .seg { width: min(260px, 100%); flex: none; }
.task-board-toolbar input, .task-board-toolbar select { min-height: 34px; padding: 6px 10px; font: inherit; font-size: .8rem; }
.task-board-toolbar input { flex: 1 1 200px; min-width: 0; }
.task-board-count { margin-left: auto; color: var(--muted); font-size: .72rem; white-space: nowrap; }
.board-error { border-color: color-mix(in srgb, var(--danger) 45%, transparent); }

/* 五个状态列：横排、可横向滚动，窄屏不挤成一坨 */
.task-board { display: grid; grid-template-columns: repeat(5, minmax(190px, 1fr)); gap: 10px; overflow-x: auto; align-items: start; padding-bottom: 4px; }
.task-board-column { min-height: 200px; gap: 8px; padding: 12px; }
.task-board-column.drop-active { border-color: var(--accent); background: var(--panel-2); }
/* 旧 app.css 里仍有一批 .task-board-* 规则（旧卡片语言），会和 v11 面板打架：
   .task-board-column-head > span 被当成 24px 圆形徽章、.task-board-column-body 有 350px 最小高度。
   类名必须保留（parity 测试按它们断言），所以这里显式复位，只让 v11 的 .panel-head 生效。 */
.task-board-column-head { padding: 0; border-bottom: 0; align-items: baseline; }
.task-board-column-head > span { display: inline; width: auto; min-width: 0; height: auto; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; font-size: inherit; }
.task-board-column-head .panel-title { font-size: .88rem; color: var(--fg); font-weight: 600; letter-spacing: -.01em; text-transform: none; }
.task-board-column-head .panel-note { max-width: 100%; font-size: .74rem; }
.task-board-column-body { display: grid; gap: 8px; padding-top: 0; min-height: 0; }
.task-board-empty { border: 1px dashed var(--line); border-radius: 10px; padding: 14px 10px; text-align: center; color: var(--muted); font-size: .72rem; }

.task-board-card { display: grid; gap: 6px; padding: 10px 11px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-2); cursor: grab; box-shadow: none; }
.task-board-card:active { cursor: grabbing; }
.task-board-card h3 { font-size: .9rem; font-weight: 600; color: var(--fg); overflow-wrap: anywhere; }
.task-board-card small { color: var(--muted); font-size: .7rem; }
.task-board-card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.task-drag-hint { color: var(--muted); font-size: .7rem; opacity: .5; }
.action-status { padding: 2px 8px; border: 1px solid var(--line); border-radius: 999px; font-size: .66rem; color: var(--muted); white-space: nowrap; }
.action-status.done { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
.action-status.in_progress { color: var(--fg); border-color: var(--line-strong); }
.task-board-card-footer { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.task-board-card-footer label { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: .7rem; }
.task-board-card-footer select { flex: 1; min-width: 0; min-height: 30px; padding: 4px 8px; font: inherit; font-size: .72rem; }
</style>
