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
const initialDate = isDateKey(route.query.date) ? route.query.date : todayKey()
const selectedDate = ref(initialDate)
const cursor = ref(monthStart(initialDate))
const data = ref<Data>({ actions: [], records: [], matters: [], states: [] })
const loading = ref(true)
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
    const [actions, records, matters, states] = await Promise.all([
      actionAsyncRepository.list(), recordAsyncRepository.list(), matterAsyncRepository.list(),
      unifiedAsyncRepository.list<DailyState>('daily_state'),
    ])
    if (active) data.value = { actions, records, matters, states }
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
</script>

<template>
  <div class="calendar-page">
    <header class="page-head calendar-head"><div><p class="eyebrow">日历 · 行动与记录</p><h1 class="font-title">日历</h1><p>按日期回看行动、记录和当天状态，必要时回到今天或对应处境继续处理。</p></div><div class="calendar-controls" aria-label="月份切换"><button type="button" aria-label="上一个月" @click="shiftMonth(-1)">←</button><button type="button" class="month-label" aria-label="回到今天" @click="goToday">{{ monthLabel }}</button><button type="button" aria-label="下一个月" @click="shiftMonth(1)">→</button></div></header>
    <section v-if="error" class="beryl-card empty-state" role="alert" style="padding:14px;color:var(--c-danger);margin-bottom:16px"><b>日历数据暂时无法读取</b><p>{{ error }}</p><button type="button" class="quiet" @click="retry">重试</button></section>
    <div class="calendar-layout"><section class="month-panel beryl-card" :aria-label="`${monthLabel}日历`"><div class="week-row" aria-hidden="true"><span v-for="day in weekdays" :key="day">{{ day }}</span></div><div class="month-grid"><button v-for="cell in cells" :key="cell.date" type="button" class="calendar-cell" :class="{ outside: !cell.inMonth, selected: cell.date === selectedDate, today: cell.date === todayKey() }" :aria-label="`${cell.date}${cell.date === todayKey() ? '，今天' : ''}${cell.date === selectedDate ? '，已选中' : ''}`" :aria-pressed="cell.date === selectedDate" @click="selectDate(cell.date)"><span aria-hidden="true">{{ cell.day }}</span><span v-if="evidenceFor(cell.date).actions.length || evidenceFor(cell.date).records.length || evidenceFor(cell.date).state" class="cell-dots" aria-hidden="true"><i v-if="evidenceFor(cell.date).actions.length" class="action-dot" /><i v-if="evidenceFor(cell.date).records.length" class="record-dot" /><i v-if="evidenceFor(cell.date).state" class="state-dot" /></span></button></div><div class="calendar-legend" style="display:flex;gap:12px;margin-top:12px;color:var(--c-text-3);font-size:10px"><span><i class="action-dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:5px" />行动</span><span><i class="record-dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:5px;background:#7c75b7" />记录</span><span><i class="state-dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:5px;background:#c8874d" />状态</span></div></section>
      <aside class="day-panel"><section class="selected-day beryl-card"><div class="panel-head"><div><p class="eyebrow">选中日期</p><h2 class="font-title">{{ selectedDate }}</h2></div><button type="button" class="quiet" @click="openToday">打开今天 →</button></div><div class="day-metrics"><span>行动 <ActionCount /></span><span>记录 <b>{{ selectedEvidence.records.length }}</b></span><span v-if="selectedState">负荷 <b>{{ selectedState.load }}%</b></span></div><div v-if="selectedState" class="state-line"><b>身体：{{ statusLabels[selectedState.bodyState] || selectedState.bodyState }}</b><span>心理：{{ statusLabels[selectedState.mentalState] || selectedState.mentalState }}</span><strong>趋势：{{ trajectoryLabels[selectedState.trajectory] || selectedState.trajectory }}</strong></div><p v-else class="muted">这一天没有 DailyState，不对容量做空白推断。</p><div class="day-list"><div v-for="item in selectedEvidence.actions" :key="item.calmyId"><i :class="{ done: item.status === 'done' }" /><span>{{ item.title }}</span><small>{{ statusLabels[item.status] || item.status }}</small></div><p v-if="!selectedEvidence.actions.length" class="muted">没有行动证据。</p></div></section></aside></div>
    <section class="evidence-panel beryl-card" aria-labelledby="calendar-evidence-title"><div class="panel-head"><div><p class="eyebrow">现实记录 · {{ selectedDate }}</p><h2 id="calendar-evidence-title" class="font-title">当天行动与记录</h2></div><span>{{ loading ? '正在读取…' : `${selectedEvidence.actions.length + selectedEvidence.records.length} 条证据` }}</span></div><div class="evidence-section"><h3>行动</h3><div class="record-list"><div v-for="item in selectedEvidence.actions" :key="`action-${item.calmyId}`" class="evidence-row"><i /><div class="evidence-copy"><b>{{ item.title }}</b><small>{{ statusLabels[item.status] || item.status }}{{ item.matterId && matterById.get(item.matterId) ? ` · ${matterById.get(item.matterId)?.title}` : '' }}</small></div><div class="evidence-actions"><small>行动</small><button v-if="item.matterId && matterById.get(item.matterId)" type="button" @click="openMatter(item.matterId)">查看处境</button></div></div><p v-if="!selectedEvidence.actions.length" class="muted">当天没有行动证据。</p></div></div><div class="evidence-section"><h3>现实记录</h3><div class="record-list"><div v-for="item in selectedEvidence.records" :key="`record-${item.calmyId}`" class="evidence-row"><i class="record" /><div class="evidence-copy"><b>{{ item.body }}</b><small>{{ formatTime(item.occurredAt) }} · {{ statusLabels[item.type] || item.type }}{{ item.matterId && matterById.get(item.matterId) ? ` · ${matterById.get(item.matterId)?.title}` : '' }}</small></div><div class="evidence-actions"><small>记录</small><button v-if="item.matterId && matterById.get(item.matterId)" type="button" @click="openMatter(item.matterId)">查看处境</button></div></div><p v-if="!selectedEvidence.records.length" class="muted">当天没有现实记录。</p></div></div></section>
    <section class="evidence-panel beryl-card" style="margin-top:16px"><div class="panel-head"><div><p class="eyebrow">本月处境 · {{ monthPrefix }}</p><h2 class="font-title">本月有记录的处境</h2></div><span>行动与记录</span></div><div class="record-list"><div v-for="item in monthlyMatters" :key="item.matter.calmyId" class="evidence-row"><i /><div class="evidence-copy"><b>{{ item.matter.title }}</b><small>{{ item.count }} 条本月证据 · {{ item.matter.currentStage }}</small></div><div class="evidence-actions"><button type="button" @click="openMatter(item.matter.calmyId)">打开处境 →</button></div></div><p v-if="!monthlyMatters.length" class="muted">本月还没有关联课题的证据。</p></div></section>
  </div>
</template>

<style>
.calendar-page{max-width:1180px;margin:0 auto}
.calendar-page .calendar-head{align-items:end}
.calendar-page .calendar-controls{display:flex;align-items:center;gap:6px}
.calendar-page .calendar-controls button,.calendar-page .quiet{border:1px solid var(--c-border);background:transparent;color:var(--c-text-2);border-radius:8px;padding:8px 11px;cursor:pointer}
.calendar-page .calendar-controls button:hover,.calendar-page .quiet:hover{border-color:var(--scene);background:var(--scene-soft);color:var(--scene)}
.calendar-page .calendar-controls .month-label{min-width:132px}
.calendar-page .calendar-layout{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:16px}
.calendar-page .month-panel,.calendar-page .selected-day,.calendar-page .evidence-panel{padding:18px}
.calendar-page .week-row,.calendar-page .month-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}
.calendar-page .week-row{margin-bottom:6px}
.calendar-page .week-row span{text-align:center;font-size:10px;color:var(--c-text-3);padding:4px}
.calendar-page .calendar-cell{min-height:78px;border:1px solid var(--c-border-soft);background:transparent;border-radius:8px;color:var(--c-text);text-align:left;padding:8px;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between}
.calendar-page .calendar-cell:hover{border-color:var(--scene);background:var(--scene-soft)}
.calendar-page .calendar-cell.outside{opacity:.42}
.calendar-page .calendar-cell.selected{border-color:var(--scene);box-shadow:inset 0 0 0 1px var(--scene);background:var(--scene-soft)}
.calendar-page .calendar-cell.today>span{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--scene);color:#fff}
.calendar-page .cell-dots{display:flex;justify-content:flex-end;gap:4px}
.calendar-page .cell-dots i{width:6px;height:6px;border-radius:50%}
.calendar-page .action-dot{background:var(--scene)}
.calendar-page .record-dot{background:#7c75b7}
.calendar-page .state-dot{background:#c8874d}
.calendar-page .day-panel{display:grid;align-content:start}
.calendar-page .selected-day .panel-head{margin-bottom:14px}
.calendar-page .selected-day h2{font-size:23px;margin:0}
.calendar-page .day-metrics{display:flex;flex-wrap:wrap;gap:6px}
.calendar-page .day-metrics span{font-size:10px;background:var(--c-hover);border-radius:6px;padding:6px 7px;color:var(--c-text-2)}
.calendar-page .day-metrics b{color:var(--scene)}
.calendar-page .state-line{display:grid;gap:5px;border-top:1px solid var(--c-border-soft);margin-top:14px;padding-top:12px;font-size:11px;color:var(--c-text-2)}
.calendar-page .state-line strong{color:var(--scene);font-weight:600}
.calendar-page .day-list,.calendar-page .record-list{display:grid;gap:8px;border-top:1px solid var(--c-border-soft);margin-top:14px;padding-top:12px}
.calendar-page .day-list>div{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:7px;align-items:center}
.calendar-page .day-list i{width:8px;height:8px;border-radius:50%;background:var(--c-border)}
.calendar-page .day-list i.done{background:var(--scene)}
.calendar-page .day-list span,.calendar-page .evidence-copy b{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.calendar-page .day-list small,.calendar-page .evidence-copy small{font-size:10px;color:var(--c-text-3)}
.calendar-page .evidence-panel{margin-top:16px}
.calendar-page .evidence-section{margin-top:16px}
.calendar-page .evidence-section h3{font-size:15px;margin:0}
.calendar-page .evidence-row{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:9px;align-items:center;border-top:1px solid var(--c-border-soft);padding:10px 0}
.calendar-page .evidence-row>i{width:8px;height:8px;border-radius:50%;background:var(--scene)}
.calendar-page .evidence-row>i.record{background:#7c75b7}
.calendar-page .evidence-copy{display:grid;gap:4px;min-width:0}
.calendar-page .evidence-copy b{white-space:normal}
.calendar-page .evidence-actions{display:flex;align-items:center;gap:8px}
.calendar-page .evidence-actions small{color:var(--c-text-3);font-size:10px}
.calendar-page .evidence-actions button{border:1px solid var(--c-border);background:transparent;color:var(--scene);border-radius:7px;padding:6px 8px;font-size:10px;cursor:pointer;white-space:nowrap}
.calendar-page .evidence-actions button:hover{border-color:var(--scene);background:var(--scene-soft)}
@media(max-width:850px){.calendar-page .calendar-layout{grid-template-columns:1fr}.calendar-page .day-panel{grid-row:1}.calendar-page .evidence-row{grid-template-columns:8px minmax(0,1fr)}.calendar-page .evidence-actions{grid-column:2;justify-content:space-between}}
@media(max-width:580px){.calendar-page .calendar-head{display:block}.calendar-page .calendar-controls{margin-top:16px}.calendar-page .month-panel,.calendar-page .selected-day,.calendar-page .evidence-panel{padding:12px}.calendar-page .month-grid{gap:3px}.calendar-page .calendar-cell{min-height:58px;padding:5px}.calendar-page .week-row{gap:3px}.calendar-page .calendar-controls .month-label{flex:1}.calendar-page .calendar-cell span{font-size:12px}}
</style>
