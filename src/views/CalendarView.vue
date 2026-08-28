<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { dateKey, todayKey } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import type { ActionItem } from '@/domain/action/model'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
import { recordAsyncRepository } from '@/domain/record/repository'
import type { RealityRecord } from '@/domain/record/model'
import { unifiedAsyncRepository, type Cycle, type DailyState } from '@/domain/unified'

interface CalendarCell {
  date: string
  inMonth: boolean
  day: number
}
interface DayEvidence {
  state?: DailyState
  actions: ActionItem[]
  records: RealityRecord[]
}

const route = useRoute(); const router = useRouter()
const cursor = ref(new Date()); const selectedDate = ref(typeof route.query.date === 'string' ? route.query.date : todayKey()); const tick = ref(0)
const loading = ref(true); const actionItems = ref<ActionItem[]>([]); const recordItems = ref<RealityRecord[]>([]); const dailyStates = ref<DailyState[]>([]); const matterItems = ref<Matter[]>([]); const cycleItems = ref<Cycle[]>([])
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const trajectoryNames = { advancing: '推进', stable: '稳定', stalled: '停滞', retreating: '回退', diverging: '绕路', lost: '失去连接', recovering: '恢复', restarting: '重启', unknown: '未知' } as const

function dateFromParts(year: number, month: number, day: number): Date { return new Date(year, month, day, 12) }
function monthCells(date: Date): CalendarCell[] {
  const year = date.getFullYear(); const month = date.getMonth(); const first = dateFromParts(year, month, 1); const offset = (first.getDay() + 6) % 7; const total = new Date(year, month + 1, 0).getDate(); const cells: CalendarCell[] = []
  for (let index = 0; index < offset; index++) { const day = dateFromParts(year, month, index - offset + 1); cells.push({ date: dateKey(day), inMonth: false, day: day.getDate() }) }
  for (let day = 1; day <= total; day++) cells.push({ date: dateKey(dateFromParts(year, month, day)), inMonth: true, day })
  while (cells.length % 7) { const day = dateFromParts(year, month, total + cells.length - offset - total + 1); cells.push({ date: dateKey(day), inMonth: false, day: day.getDate() }) }
  return cells
}
function dayStart(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).getTime()
}
function evidenceForDate(date: string): DayEvidence {
  const start = dayStart(date); const end = start + 24 * 60 * 60 * 1000
  return {
    state: dailyStates.value.find(item => item.date === date),
    actions: actionItems.value.filter(item => dayStart(item.date.slice(0, 10)) >= start && dayStart(item.date.slice(0, 10)) < end),
    records: recordItems.value.filter(item => item.occurredAt >= start && item.occurredAt < end)
  }
}
function monthEvidence(date: Date): Array<{ matterId?: string }> {
  const from = new Date(date.getFullYear(), date.getMonth(), 1).getTime()
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime() - 1
  return [
    ...actionItems.value.filter(item => { const at = dayStart(item.date.slice(0, 10)); return at >= from && at <= to }),
    ...recordItems.value.filter(item => item.occurredAt >= from && item.occurredAt <= to)
  ]
}
const monthCellsValue = computed(() => { void tick.value; return monthCells(cursor.value) })
const monthLabel = computed(() => cursor.value.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' }))
const selectedEvidence = computed(() => evidenceForDate(selectedDate.value))
const monthPrefix = computed(() => `${cursor.value.getFullYear()}-${String(cursor.value.getMonth() + 1).padStart(2, '0')}`)
const monthEvidenceValue = computed(() => { void tick.value; return monthEvidence(cursor.value) })
const matters = computed(() => { void tick.value; return matterItems.value.filter(item => item.status !== 'archived') })
const cycles = computed(() => { void tick.value; return cycleItems.value.filter(item => matters.value.some(matter => matter.calmyId === item.matterId)) })
const growthRows = computed(() => matters.value.map(matter => {
  const matterCycles = cycles.value.filter(cycle => cycle.matterId === matter.calmyId)
  const evidence = monthEvidenceValue.value.filter(item => item.matterId === matter.calmyId)
  return { matter, cycles: matterCycles, evidence: evidence.length }
}))
function selectDate(date: string): void { selectedDate.value = date; router.replace({ query: { date } }) }
function shiftMonth(amount: number): void { cursor.value = dateFromParts(cursor.value.getFullYear(), cursor.value.getMonth() + amount, 1); tick.value++ }
function goToday(): void { cursor.value = new Date(); selectDate(todayKey()) }
function hasEvidence(date: string): DayEvidence { return evidenceForDate(date) }
async function refresh(): Promise<void> {
  loading.value = true
  try {
    const [actions, records, states, mattersValue, cyclesValue] = await Promise.all([
      actionAsyncRepository.list(), recordAsyncRepository.list(), unifiedAsyncRepository.list<DailyState>('daily_state'),
      matterAsyncRepository.list(), unifiedAsyncRepository.list<Cycle>('cycle')
    ])
    actionItems.value = actions; recordItems.value = records; dailyStates.value = states; matterItems.value = mattersValue; cycleItems.value = cyclesValue; tick.value++
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '日历数据读取失败') }
  finally { loading.value = false }
}
function onDataSynced(): void { void refresh() }
onMounted(() => { void refresh(); window.addEventListener('beryl-data-synced', onDataSynced) })
onUnmounted(() => window.removeEventListener('beryl-data-synced', onDataSynced))
</script>

<template>
  <div class="calendar-page">
    <header class="page-head"><div><p class="eyebrow">CALENDAR · TIME + GROWTH AXIS</p><h1 class="font-title">日历与成长</h1><p>日期承载现实证据，成长轴显示 Matter 与 Cycle 的方向。</p></div><div class="calendar-controls"><button aria-label="上一个月" @click="shiftMonth(-1)">←</button><button class="month-label" aria-label="回到今天" @click="goToday">{{ monthLabel }}</button><button aria-label="下一个月" @click="shiftMonth(1)">→</button></div></header>

    <div class="calendar-layout"><section class="month-panel beryl-card"><div class="week-row"><span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span></div><div class="month-grid"><button v-for="cell in monthCellsValue" :key="cell.date" class="calendar-cell" :class="{ outside: !cell.inMonth, selected: selectedDate === cell.date, today: cell.date === todayKey() }" :aria-label="`${cell.date}${cell.date === todayKey() ? '，今天' : ''}${selectedDate === cell.date ? '，已选中' : ''}`" :aria-pressed="selectedDate === cell.date" @click="selectDate(cell.date)"><span aria-hidden="true">{{ cell.day }}</span><div v-if="hasEvidence(cell.date).actions.length || hasEvidence(cell.date).records.length || hasEvidence(cell.date).state" class="cell-dots" aria-hidden="true"><i v-if="hasEvidence(cell.date).actions.length" class="action-dot"></i><i v-if="hasEvidence(cell.date).records.length" class="record-dot"></i><i v-if="hasEvidence(cell.date).state" class="state-dot"></i></div></button></div></section>

      <aside class="day-panel"><section class="selected-day beryl-card"><div class="panel-head"><div><p class="eyebrow">SELECTED DAY</p><h2 class="font-title">{{ selectedDate }}</h2></div><button class="quiet" @click="router.push('/app/today')">打开 Today →</button></div><div class="day-metrics"><span>Action <b>{{ selectedEvidence.actions.filter(item => item.status === 'done').length }}/{{ selectedEvidence.actions.length }}</b></span><span>Record <b>{{ selectedEvidence.records.length }}</b></span><span v-if="selectedEvidence.state">负荷 <b>{{ selectedEvidence.state.load }}%</b></span></div><div v-if="selectedEvidence.state" class="state-line"><b>身体 {{ selectedEvidence.state.bodyState }}</b><span>心理 {{ selectedEvidence.state.mentalState }}</span><strong>{{ trajectoryNames[selectedEvidence.state.trajectory] }}</strong></div><p v-else class="muted">这一天没有 DailyState，不对容量做空白推断。</p><div v-if="selectedEvidence.actions.length" class="day-list"><div v-for="action in selectedEvidence.actions" :key="action.calmyId"><i :class="{ done: action.status === 'done' }"></i><span>{{ action.title }}</span><small>{{ action.status }}</small></div></div><p v-else class="muted">没有行动证据。</p></section></aside>
    </div>

    <section class="growth-panel beryl-card"><div class="panel-head"><div><p class="eyebrow">GROWTH AXIS · {{ monthPrefix }}</p><h2 class="font-title">Matter / Cycle 证据</h2></div><span>只显示本月已有的行动与记录</span></div><div class="growth-list"><article v-for="row in growthRows" :key="row.matter.calmyId" @click="router.push('/app/matters/' + row.matter.calmyId)"><div class="growth-copy"><b>{{ row.matter.title }}</b><small>{{ row.evidence }} 条本月证据 · {{ row.matter.currentStage }}</small></div><strong :class="row.matter.trajectory">{{ trajectoryNames[row.matter.trajectory] }}</strong><div class="cycle-strip"><span v-for="cycle in row.cycles" :key="cycle.calmyId" :class="cycle.status">{{ cycle.title }} · {{ cycle.currentStage }}</span><em v-if="!row.cycles.length">尚未创建 Cycle</em></div><i>→</i></article><p v-if="!growthRows.length" class="muted">暂无 Matter。</p></div></section>
  </div>
</template>

<style scoped>
.calendar-page{max-width:1180px;margin:0 auto}.page-head{display:flex;align-items:end;justify-content:space-between;gap:20px;margin:6px 0 28px}.eyebrow{font-size:10px;letter-spacing:.13em;color:var(--scene);font-weight:700;margin:0 0 8px}.page-head h1{font-size:clamp(34px,4vw,48px);line-height:1;margin:0;letter-spacing:-.04em}.page-head p:last-child{margin:11px 0 0;font-size:13px;color:var(--c-text-2)}.calendar-controls{display:flex;gap:5px}.calendar-controls button,.quiet{border:1px solid var(--c-border);background:transparent;color:var(--c-text-2);border-radius:8px;padding:8px 11px;cursor:pointer}.calendar-controls button:hover,.quiet:hover{border-color:var(--scene);background:var(--scene-soft);color:var(--scene)}.calendar-controls .month-label{min-width:130px;font-size:12px}.calendar-layout{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:16px}.month-panel,.selected-day,.growth-panel{padding:18px}.week-row,.month-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}.week-row{margin-bottom:6px}.week-row span{text-align:center;font-size:10px;color:var(--c-text-3);padding:4px}.calendar-cell{min-height:76px;border:1px solid var(--c-border-soft);background:transparent;border-radius:8px;color:var(--c-text);text-align:left;padding:8px;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between}.calendar-cell:hover{border-color:var(--scene);background:var(--scene-soft)}.calendar-cell.outside{opacity:.38}.calendar-cell.selected{border-color:var(--scene);box-shadow:inset 0 0 0 1px var(--scene);background:var(--scene-soft)}.calendar-cell.today>span{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--scene);color:white}.cell-dots{display:flex;gap:4px;justify-content:flex-end}.cell-dots i{width:6px;height:6px;border-radius:50%}.action-dot{background:var(--scene)}.record-dot{background:#7c75b7}.state-dot{background:#c8874d}.day-panel{display:grid;align-content:start}.selected-day .panel-head{margin-bottom:14px}.panel-head{display:flex;align-items:start;justify-content:space-between;gap:12px}.panel-head h2{font-size:23px;margin:0}.panel-head>span{font-size:10px;color:var(--c-text-3)}.day-metrics{display:flex;flex-wrap:wrap;gap:6px}.day-metrics span{font-size:10px;background:var(--c-hover);border-radius:6px;padding:6px 7px;color:var(--c-text-2)}.day-metrics b{color:var(--scene)}.state-line{display:grid;gap:5px;border-top:1px solid var(--c-border-soft);margin-top:14px;padding-top:12px;font-size:11px;color:var(--c-text-2)}.state-line strong{color:var(--scene);font-weight:600}.muted{font-size:12px;line-height:1.7;color:var(--c-text-3)}.day-list{display:grid;gap:7px;border-top:1px solid var(--c-border-soft);margin-top:14px;padding-top:10px}.day-list>div{display:grid;grid-template-columns:8px 1fr auto;gap:7px;align-items:center}.day-list i{width:8px;height:8px;border-radius:50%;background:var(--c-border)}.day-list i.done{background:var(--scene)}.day-list span{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.day-list small{font-size:10px;color:var(--c-text-3)}.growth-panel{margin-top:16px}.growth-list{display:grid;gap:7px;margin-top:14px}.growth-list article{display:grid;grid-template-columns:minmax(160px,1.2fr) auto minmax(240px,2fr) auto;gap:12px;align-items:center;border:1px solid var(--c-border-soft);border-radius:8px;padding:10px;cursor:pointer}.growth-list article:hover{border-color:var(--scene);background:var(--scene-soft)}.growth-copy{display:grid;gap:4px;min-width:0}.growth-copy b{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.growth-copy small{font-size:10px;color:var(--c-text-3)}.growth-list strong{font-size:10px;font-weight:600}.growth-list strong.advancing{color:#4c956c}.growth-list strong.recovering{color:#7c75b7}.growth-list strong.retreating,.growth-list strong.diverging{color:#bb665d}.cycle-strip{display:flex;gap:5px;flex-wrap:wrap}.cycle-strip span,.cycle-strip em{font-size:10px;font-style:normal;color:var(--c-text-2);border-radius:5px;padding:5px 6px;background:var(--c-hover)}.cycle-strip span.active{background:var(--scene-soft);color:var(--scene)}.growth-list article>i{font-style:normal;color:var(--scene)}@media(max-width:850px){.calendar-layout{grid-template-columns:1fr}.day-panel{grid-row:1}.growth-list article{grid-template-columns:1fr auto}.cycle-strip{grid-column:1/-1}.growth-list article>i{grid-column:2;grid-row:1}}@media(max-width:580px){.page-head{display:block}.calendar-controls{margin-top:16px}.month-panel,.selected-day,.growth-panel{padding:12px}.month-grid{gap:3px}.calendar-cell{min-height:58px;padding:5px}.week-row{gap:3px}.growth-list article{grid-template-columns:1fr}.growth-list article>i{grid-column:auto;grid-row:auto;display:none}}
</style>
