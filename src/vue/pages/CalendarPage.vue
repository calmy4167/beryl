<script setup lang="ts">
import { computed, defineComponent, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { dateKey, todayKey } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import type { ActionItem } from '@/domain/action/model'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
import { recordAsyncRepository } from '@/domain/record/repository'
import type { RealityRecord } from '@/domain/record/model'
import { unifiedAsyncRepository, type DailyState } from '@/domain/unified'
import { readServerSession } from '@/core/auth'
import type { Ownership, Person } from '@/domain/unified/model'
import { useActionStatusDictionary } from '@/vue/composables/useActionStatusDictionary'
import ContextRelationPicker from '@/vue/components/ContextRelationPicker.vue'
import DomainPicker from '@/vue/components/DomainPicker.vue'
import OwnershipEditor from '@/vue/components/OwnershipEditor.vue'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbPanel from '@/vue/liubai/LbPanel.vue'

// 页面自带头部（参考稿里 .slide-head 属于页面自身），外壳因此不再渲染第二行标题。
useOwnSlideHead()

interface Cell { date: string; day: number; inMonth: boolean }
interface Evidence { actions: ActionItem[]; records: RealityRecord[]; state?: DailyState }
interface Data { actions: ActionItem[]; records: RealityRecord[]; matters: Matter[]; states: DailyState[] }
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const statusLabels: Record<string, string> = {
  planned: '待办', in_progress: '进行中', done: '已完成', skipped: '已跳过', cancelled: '已取消',
  fact: '事实', observation: '观察', insight: '洞见', seed: '种子', review: '复盘', negative: '负向记录',
  good: '很好', normal: '普通', tired: '疲惫', bad: '很差', clear: '清晰', heavy: '沉重', overloaded: '过载',
}
const trajectoryLabels: Record<string, string> = {
  advancing: '推进', stable: '稳定', stalled: '停滞', retreating: '回退', diverging: '绕路',
  lost: '失去连接', recovering: '恢复', restarting: '重启', unknown: '未知',
}
function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}
function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}
function monthStart(value: string): Date {
  const date = parseDate(value)
  return new Date(date.getFullYear(), date.getMonth(), 1, 12)
}
function normalizedDate(value: string): string {
  if (isDateKey(value)) return value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : dateKey(date)
}
function monthCells(month: Date): Cell[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12)
  const offset = (first.getDay() + 6) % 7
  const cells: Cell[] = []
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(month.getFullYear(), month.getMonth(), index - offset + 1, 12)
    cells.push({ date: dateKey(date), day: date.getDate(), inMonth: date.getMonth() === month.getMonth() })
  }
  return cells
}
function actionDate(item: ActionItem): string { return normalizedDate(item.date) }
function formatTime(timestamp: number): string { return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }

const route = useRoute()
const router = useRouter()
const currentUserId = readServerSession()?.user.id
const { labelFor: actionStatusLabel } = useActionStatusDictionary()
const initialDate = isDateKey(route.query.date) ? route.query.date : todayKey()
const selectedDate = ref(initialDate)
const cursor = ref(monthStart(initialDate))
const data = ref<Data>({ actions: [], records: [], matters: [], states: [] })
const people = ref<Person[]>([])
const loading = ref(true)
const ownershipBusy = ref(false)
const error = ref('')
let active = true
watch(() => route.query.date, value => {
  if (!isDateKey(value) || value === selectedDate.value) return
  selectedDate.value = value
  cursor.value = monthStart(value)
})
async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [actions, records, matters, states, currentPeople] = await Promise.all([
      actionAsyncRepository.list(), recordAsyncRepository.list(), matterAsyncRepository.list(),
      unifiedAsyncRepository.list<DailyState>('daily_state'), unifiedAsyncRepository.list<Person>('person')
    ])
    if (active) { data.value = { actions, records, matters, states }; people.value = currentPeople }
  } catch (reason) {
    if (active) error.value = reason instanceof Error ? reason.message : '日历数据读取失败'
  } finally { if (active) loading.value = false }
}
function onDataSynced(): void { void refresh() }
function retry(): void { window.dispatchEvent(new CustomEvent('beryl-data-synced')) }
onMounted(() => { active = true; void refresh(); window.addEventListener('beryl-data-synced', onDataSynced) })
onUnmounted(() => { active = false; window.removeEventListener('beryl-data-synced', onDataSynced) })

const cells = computed(() => monthCells(cursor.value))
const monthLabel = computed(() => cursor.value.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' }))
const monthPrefix = computed(() => `${cursor.value.getFullYear()}-${String(cursor.value.getMonth() + 1).padStart(2, '0')}`)
const evidenceByDate = computed(() => {
  const result = new Map<string, Evidence>()
  const ensure = (date: string): Evidence => {
    const current = result.get(date)
    if (current) return current
    const next: Evidence = { actions: [], records: [] }
    result.set(date, next)
    return next
  }
  data.value.actions.forEach(item => { const date = actionDate(item); if (date) ensure(date).actions.push(item) })
  data.value.records.forEach(item => { ensure(dateKey(new Date(item.occurredAt))).records.push(item) })
  data.value.states.forEach(item => { ensure(normalizedDate(item.date)).state = item })
  return result
})
const emptyEvidence: Evidence = { actions: [], records: [] }
const selectedEvidence = computed(() => evidenceByDate.value.get(selectedDate.value) || emptyEvidence)
const matterById = computed(() => new Map(data.value.matters.map(item => [item.calmyId, item])))
const selectedState = computed(() => selectedEvidence.value.state)
const completedCount = computed(() => selectedEvidence.value.actions.filter(item => item.status === 'done').length)
const ActionCount = defineComponent({
  setup() {
    return () => h('b', [String(completedCount.value), '/', String(selectedEvidence.value.actions.length)])
  },
})
const monthlyMatters = computed(() => data.value.matters.filter(matter => matter.status !== 'archived').map(matter => ({
  matter,
  count: data.value.actions.filter(item => actionDate(item).startsWith(monthPrefix.value) && item.matterId === matter.calmyId).length
    + data.value.records.filter(item => dateKey(new Date(item.occurredAt)).startsWith(monthPrefix.value) && item.matterId === matter.calmyId).length,
})).filter(item => item.count > 0))
function evidenceFor(date: string): Evidence { return evidenceByDate.value.get(date) || emptyEvidence }
function selectDate(date: string): void {
  selectedDate.value = date
  cursor.value = monthStart(date)
  void router.replace({ path: route.path, query: { date } })
}
function shiftMonth(amount: number): void { cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + amount, 1, 12) }
function goToday(): void { selectDate(todayKey()) }
function openToday(): void { void router.push(`/app/today?date=${encodeURIComponent(selectedDate.value)}`) }
function openMatter(matterId: string): void { void router.push(`/app/matters/${encodeURIComponent(matterId)}`) }
async function saveDailyStateOwnership(ownership: Ownership | undefined): Promise<void> {
  const state = selectedState.value
  if (!state) return
  ownershipBusy.value = true
  try {
    const updated = await unifiedAsyncRepository.update<DailyState>('daily_state', state.calmyId, { ownership }, {
      expectedRevision: state.revision, actor: 'user', actorId: currentUserId || 'local-user'
    })
    data.value = { ...data.value, states: data.value.states.map(item => item.calmyId === updated.calmyId ? updated : item) }
    window.dispatchEvent(new CustomEvent('beryl-data-synced'))
    window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message: '每日状态归属已保存', kind: 'success' } }))
  } catch (cause) {
    window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message: cause instanceof Error ? cause.message : '每日状态归属保存失败', kind: 'error' } }))
  } finally { ownershipBusy.value = false }
}
</script>

<template>
  <header class="slide-head">
    <div class="head-main">
      <p class="hint">日历 · 行动与记录</p>
      <div class="head-title-row">
        <h2 v-if="loading">正在读取…</h2>
        <h2 v-else>{{ monthLabel }}，<em>{{ selectedEvidence.actions.length + selectedEvidence.records.length }}</em> 条证据。</h2>
        <span class="info" tabindex="0" data-tip="按日期回看行动、记录和当天状态；必要时回到今天或对应处境继续处理。H 收起辅助信息。" aria-label="日历说明">i</span>
      </div>
    </div>
    <div class="calendar-controls" aria-label="月份切换"><button class="chip" type="button" aria-label="上一个月" @click="shiftMonth(-1)">←</button><button class="chip month-label" type="button" aria-label="回到今天" @click="goToday">{{ monthLabel }}</button><button class="chip" type="button" aria-label="下一个月" @click="shiftMonth(1)">→</button></div>
  </header>
    <section v-if="error" class="panel calendar-error" role="alert"><b>日历数据暂时无法读取</b><p class="dim">{{ error }}</p><button class="chip" type="button" @click="retry">重试</button></section>
    <div class="calendar-layout"><section class="month-panel panel" :aria-label="`${monthLabel}日历`"><div class="week-row" aria-hidden="true"><span v-for="day in weekdays" :key="day">{{ day }}</span></div><div class="month-grid"><button v-for="cell in cells" :key="cell.date" type="button" class="calendar-cell" :class="{ outside: !cell.inMonth, selected: cell.date === selectedDate, today: cell.date === todayKey() }" :aria-label="`${cell.date}${cell.date === todayKey() ? '，今天' : ''}${cell.date === selectedDate ? '，已选中' : ''}`" :aria-pressed="cell.date === selectedDate" @click="selectDate(cell.date)"><span aria-hidden="true">{{ cell.day }}</span><span v-if="evidenceFor(cell.date).actions.length || evidenceFor(cell.date).records.length || evidenceFor(cell.date).state" class="cell-dots" aria-hidden="true"><i v-if="evidenceFor(cell.date).actions.length" class="action-dot" /><i v-if="evidenceFor(cell.date).records.length" class="record-dot" /><i v-if="evidenceFor(cell.date).state" class="state-dot" /></span></button></div><div class="calendar-legend"><span><i class="action-dot" />行动</span><span><i class="record-dot" />记录</span><span><i class="state-dot" />状态</span></div></section>
      <aside class="day-panel"><section class="selected-day panel"><div class="panel-head"><div><p class="eyebrow">选中日期</p><h2>{{ selectedDate }}</h2></div><button type="button" class="quiet" @click="openToday">打开今天 →</button></div><div class="day-metrics"><span>行动 <ActionCount /></span><span>记录 <b>{{ selectedEvidence.records.length }}</b></span><span v-if="selectedState">负荷 <b>{{ selectedState.load }}%</b></span></div><div v-if="selectedState" class="state-line"><b>身体：{{ statusLabels[selectedState.bodyState] || selectedState.bodyState }}</b><span>心理：{{ statusLabels[selectedState.mentalState] || selectedState.mentalState }}</span><strong>趋势：{{ trajectoryLabels[selectedState.trajectory] || selectedState.trajectory }}</strong></div><template v-if="selectedState"><DomainPicker :entity-ref="{ entityType: 'daily_state', calmyId: selectedState.calmyId }" /><ContextRelationPicker :entity-ref="{ entityType: 'daily_state', calmyId: selectedState.calmyId }" :target-types="['person', 'thing', 'scene', 'space']" /><OwnershipEditor :ownership="selectedState.ownership" :people="people" :current-user-id="currentUserId" :disabled="ownershipBusy || loading" label="每日状态归属与隐私" @save="saveDailyStateOwnership" /></template><p v-else class="dim">这一天没有 DailyState，不对容量做空白推断。</p><div class="day-list"><div v-for="item in selectedEvidence.actions" :key="item.calmyId"><i :class="{ done: item.status === 'done' }" /><span>{{ item.title }}</span><small>{{ actionStatusLabel(item.status) }}</small></div><p v-if="!selectedEvidence.actions.length" class="dim">没有行动证据。</p></div></section></aside></div>
    <LbPanel class="evidence-panel" title="当天行动与记录" :note="loading ? '正在读取…' : `${selectedEvidence.actions.length + selectedEvidence.records.length} 条证据`"><div class="evidence-section"><h3>行动</h3><div class="record-list"><div v-for="item in selectedEvidence.actions" :key="`action-${item.calmyId}`" class="evidence-row"><i /><div class="evidence-copy"><b>{{ item.title }}</b><small>{{ actionStatusLabel(item.status) }}{{ item.matterId && matterById.get(item.matterId) ? ` · ${matterById.get(item.matterId)?.title}` : '' }}</small></div><div class="evidence-actions"><small>行动</small><button v-if="item.matterId && matterById.get(item.matterId)" class="chip" type="button" @click="openMatter(item.matterId)">查看处境</button></div></div><p v-if="!selectedEvidence.actions.length" class="dim">当天没有行动证据。</p></div></div><div class="evidence-section"><h3>现实记录</h3><div class="record-list"><div v-for="item in selectedEvidence.records" :key="`record-${item.calmyId}`" class="evidence-row"><i class="record" /><div class="evidence-copy"><b>{{ item.body }}</b><small>{{ formatTime(item.occurredAt) }} · {{ statusLabels[item.type] || item.type }}{{ item.matterId && matterById.get(item.matterId) ? ` · ${matterById.get(item.matterId)?.title}` : '' }}</small></div><div class="evidence-actions"><small>记录</small><button v-if="item.matterId && matterById.get(item.matterId)" class="chip" type="button" @click="openMatter(item.matterId)">查看处境</button></div></div><p v-if="!selectedEvidence.records.length" class="dim">当天没有现实记录。</p></div></div></LbPanel>
    <LbPanel class="evidence-panel" title="本月有记录的处境" :note="`本月处境 · ${monthPrefix}`"><div class="record-list"><div v-for="item in monthlyMatters" :key="item.matter.calmyId" class="evidence-row"><i /><div class="evidence-copy"><b>{{ item.matter.title }}</b><small>{{ item.count }} 条本月证据 · {{ item.matter.currentStage }}</small></div><div class="evidence-actions"><button class="chip" type="button" @click="openMatter(item.matter.calmyId)">打开处境 →</button></div></div><p v-if="!monthlyMatters.length" class="dim">本月还没有关联课题的证据。</p></div></LbPanel>
</template>

<style scoped>
/* 日历页局部排版：颜色一律取「留白」令牌（原先是一整块用旧 --c-* 令牌的非 scoped 样式）。
   .calendar-cell / .month-panel / .selected-day / .evidence-panel / .day-metrics / .state-line /
   .quiet / .cell-dots 等都是 parity 测试的钩子，类名全部保留。 */
.slide-head .calendar-controls { align-self: flex-end; margin-left: auto; }
.calendar-controls { display: flex; align-items: center; gap: 6px; }
.month-label { min-width: 132px; }
.calendar-error { border-color: color-mix(in srgb, var(--danger) 45%, transparent); }
.quiet { padding: 5px 11px; border: 1px solid var(--line); border-radius: 8px; background: none; color: var(--muted); font: inherit; font-size: .78rem; cursor: pointer; }
.quiet:hover { color: var(--fg); border-color: var(--line-strong); }

.calendar-layout { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: clamp(10px, 1.2vw, 14px); align-items: start; }
.month-panel { gap: 10px; padding: 16px; }
.week-row, .month-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px; }
.week-row { margin-bottom: 6px; }
.week-row span { padding: 4px; text-align: center; color: var(--muted); font-size: .66rem; }
.calendar-cell { display: flex; flex-direction: column; justify-content: space-between; min-height: 78px; padding: 8px; border: 1px solid var(--line); border-radius: 8px; background: none; color: var(--fg); text-align: left; cursor: pointer; }
.calendar-cell:hover { border-color: var(--line-strong); background: var(--hover); }
.calendar-cell.outside { opacity: .42; }
.calendar-cell.selected { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); background: var(--hover); }
.calendar-cell.today > span { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--accent); color: var(--accent-fg); }
.calendar-legend { display: flex; gap: 12px; margin-top: 12px; color: var(--muted); font-size: .66rem; }
.calendar-legend i, .cell-dots i { display: inline-block; width: 6px; height: 6px; border-radius: 50%; }
.calendar-legend span { display: inline-flex; align-items: center; gap: 5px; }
.cell-dots { display: flex; justify-content: flex-end; gap: 4px; }
.action-dot { background: var(--accent); }
.record-dot { background: #7c75b7; }
.state-dot { background: #c8874d; }

.day-panel { display: grid; align-content: start; }
.selected-day { gap: 10px; padding: 16px; }
.selected-day h2 { margin: 0; font-size: 1.35rem; font-weight: 600; }
.day-metrics { display: flex; flex-wrap: wrap; gap: 6px; }
.day-metrics span { padding: 5px 8px; border-radius: 6px; background: var(--panel-2); color: var(--muted); font-size: .68rem; }
.day-metrics b { color: var(--accent); }
.state-line { display: grid; gap: 5px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); color: var(--muted); font-size: .72rem; }
.state-line strong { color: var(--accent); font-weight: 600; }
.day-list, .record-list { display: grid; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line); }
.day-list > div { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: center; gap: 7px; }
.day-list i { width: 8px; height: 8px; border-radius: 50%; background: var(--line); }
.day-list i.done { background: var(--accent); }
.day-list span, .evidence-copy b { font-size: .74rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.day-list small, .evidence-copy small { color: var(--muted); font-size: .68rem; }

.evidence-panel { gap: 8px; padding: 16px; }
.evidence-section { margin-top: 10px; }
.evidence-section h3 { margin: 0; font-size: .9rem; font-weight: 600; }
.evidence-row { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: center; gap: 9px; padding: 9px 0; border-top: 1px solid var(--line); }
.evidence-row > i { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
.evidence-row > i.record { background: #7c75b7; }
.evidence-copy { display: grid; gap: 4px; min-width: 0; }
.evidence-copy b { white-space: normal; }
.evidence-actions { display: flex; align-items: center; gap: 8px; }
.evidence-actions small { color: var(--muted); font-size: .68rem; }

@media (max-width: 850px) {
  .calendar-layout { grid-template-columns: 1fr; }
  .day-panel { grid-row: 1; }
  .evidence-row { grid-template-columns: 8px minmax(0, 1fr); }
  .evidence-actions { grid-column: 2; justify-content: space-between; }
}
@media (max-width: 580px) {
  .month-panel, .selected-day, .evidence-panel { padding: 12px; }
  .month-grid, .week-row { gap: 3px; }
  .calendar-cell { min-height: 58px; padding: 5px; }
  .calendar-cell span { font-size: .74rem; }
  .month-label { flex: 1; }
}
</style>
