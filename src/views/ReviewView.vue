<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { dateKey, todayKey } from '@/core/storage'
import { matterAsyncRepository } from '@/domain/matter/repository'
import { todayAsyncRepository } from '@/domain/today/repository'
import type { TodayPlan } from '@/domain/today/model'
import { unifiedAsyncRepository, type DailyState } from '@/domain/unified'
import { listMatterTrajectoryInsights } from '@/domain/trajectory'
import { listRealityDocuments, type RealityDocument } from '@/domain/reality'
import { completeReview } from '@/application/use-cases'
import { withSaveState } from '@/core/save-state'
import { usePageRefresh } from '@/core/page-refresh'

type RangeDays = 7 | 30 | 90
interface ReviewDay {
  date: string
  plan?: TodayPlan
  state?: DailyState
  actions: RealityDocument[]
  records: RealityDocument[]
}

const router = useRouter()
const rangeDays = ref<RangeDays>(7)
const selectedDate = ref(todayKey())
const tick = ref(0)
const plans = ref<Awaited<ReturnType<typeof todayAsyncRepository.list>>>([])
const states = ref<DailyState[]>([])
const matterItems = ref<Awaited<ReturnType<typeof matterAsyncRepository.list>>>([])
const todayDate = todayKey()
const todayPlan = ref<TodayPlan>()
const reviewDraft = reactive({ observation: '', analysis: '', adjustment: '', seed: '' })
const reviewDirty = ref(false)
const reviewSaving = ref(false)

function addDays(date: Date, amount: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}
function dateRange(days: number): string[] {
  const end = new Date()
  return Array.from({ length: days }, (_, index) => dateKey(addDays(end, index - days + 1)))
}
function dayStart(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).getTime()
}
const realityByDate = computed(() => {
  void tick.value
  const dates = dateRange(rangeDays.value)
  const start = dayStart(dates[0])
  const end = dayStart(dates[dates.length - 1]) + 24 * 60 * 60 * 1000 - 1
  const grouped = new Map<string, { actions: RealityDocument[]; records: RealityDocument[] }>()
  dates.forEach(date => grouped.set(date, { actions: [], records: [] }))
  for (const item of listRealityDocuments({ types: ['action', 'record'], from: start, to: end })) {
    const date = item.date?.slice(0, 10) || (item.occurredAt || item.updatedAt ? dateKey(new Date(item.occurredAt || item.updatedAt)) : '')
    const bucket = grouped.get(date)
    if (!bucket) continue
    if (item.entityType === 'action') bucket.actions.push(item)
    else if (item.entityType === 'record') bucket.records.push(item)
  }
  return grouped
})
const days = computed<ReviewDay[]>(() => {
  void tick.value
  const planMap = new Map(plans.value.map(item => [item.date, item]))
  const stateMap = new Map(states.value.map(item => [item.date, item]))
  return dateRange(rangeDays.value).map(date => ({ date, plan: planMap.get(date), state: stateMap.get(date), actions: realityByDate.value.get(date)?.actions || [], records: realityByDate.value.get(date)?.records || [] }))
})
const selected = computed(() => days.value.find(item => item.date === selectedDate.value) || days.value[days.value.length - 1])
const activeMatters = computed(() => { void tick.value; return matterItems.value.filter(item => item.status === 'active' || item.status === 'paused') })
const trajectoryByMatter = computed(() => { void tick.value; return new Map(listMatterTrajectoryInsights(30).map(item => [item.matterId, item])) })
const stats = computed(() => {
  const actionItems = days.value.flatMap(item => item.actions)
  const recordItems = days.value.flatMap(item => item.records)
  return {
    daysWithData: days.value.filter(item => item.plan || item.state || item.actions.length || item.records.length).length,
    done: actionItems.filter(item => item.status === 'done').length,
    total: actionItems.length,
    records: recordItems.length,
    heavyDays: days.value.filter(item => item.state && (item.state.load >= 70 || item.state.mentalState === 'overloaded')).length
  }
})
const trajectoryNames = { advancing: '推进', stable: '稳定', stalled: '停滞', retreating: '退行', recovering: '恢复', diverging: '偏离' } as const
const bodyNames = { good: '好', normal: '普通', tired: '疲惫', bad: '很差' } as const
const mentalNames = { clear: '清晰', normal: '普通', heavy: '沉重', overloaded: '过载' } as const
function dayLabel(date: string): string { return new Date(`${date}T12:00:00`).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }) }
function selectDate(date: string): void { selectedDate.value = date }
function setRange(daysCount: RangeDays): void { rangeDays.value = daysCount; if (!days.value.some(item => item.date === selectedDate.value)) selectedDate.value = days.value[days.value.length - 1]?.date || todayKey() }
function syncReviewDraft(plan: TodayPlan): void {
  if (reviewDirty.value) return
  reviewDraft.observation = plan.review.observation
  reviewDraft.analysis = plan.review.analysis
  reviewDraft.adjustment = plan.review.adjustment
  reviewDraft.seed = plan.review.seed
}
async function refresh(): Promise<void> {
  const [nextPlans, nextStates, nextMatters, currentToday] = await Promise.all([todayAsyncRepository.list(), unifiedAsyncRepository.list<DailyState>('daily_state'), matterAsyncRepository.list(), todayAsyncRepository.get(todayDate)])
  plans.value = nextPlans; states.value = nextStates; matterItems.value = nextMatters; todayPlan.value = currentToday; syncReviewDraft(currentToday); tick.value++
}
async function saveTodayReview(): Promise<void> {
  const plan = todayPlan.value || await todayAsyncRepository.get(todayDate)
  reviewSaving.value = true
  try {
    const result = await withSaveState(() => completeReview({ date: todayDate, review: { ...reviewDraft }, expectedRevision: plan.revision }))
    todayPlan.value = result.plan
    reviewDirty.value = false
    tick.value++
    ElMessage.success('今日复盘已保存')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '今日复盘保存失败') }
  finally { reviewSaving.value = false }
}
usePageRefresh(refresh)
</script>

<template>
  <div class="review-page">
    <header class="page-head"><div><p class="eyebrow">CROSS-DOMAIN REVIEW</p><h1 class="font-title">复盘，不只看完成率</h1><p>把身体、心理、行动和现实记录放回同一段时间里观察。</p></div><div class="range-tabs"><button v-for="item in ([ [7, '近 7 天'], [30, '近 30 天'], [90, '近 90 天'] ] as const)" :key="item[0]" :class="{ on: rangeDays === item[0] }" :aria-pressed="rangeDays === item[0]" @click="setRange(item[0])">{{ item[1] }}</button></div></header>

    <section class="today-review beryl-card"><div class="panel-head"><div><p class="eyebrow">TODAY REVIEW · {{ todayDate }}</p><h2 class="font-title">今天的复盘</h2><p class="review-intro">把事实、条件和明天的调整写下来；历史回看留在下面。</p></div><span v-if="reviewDirty" class="review-dirty">尚未保存</span></div><div class="today-review-grid"><label>观：今天实际发生了什么？<textarea v-model="reviewDraft.observation" aria-label="今日复盘：观，今天实际发生了什么" placeholder="完成了什么？时间流向哪里？" @input="reviewDirty = true" /></label><label>察：哪些条件影响了今天？<textarea v-model="reviewDraft.analysis" aria-label="今日复盘：察，哪些条件影响了今天" placeholder="哪些条件帮助或阻碍了行动？" @input="reviewDirty = true" /></label><label>调：明天保留、降低、暂停还是改变什么？<textarea v-model="reviewDraft.adjustment" aria-label="今日复盘：调，明天如何调整" placeholder="写下一个具体调整。" @input="reviewDirty = true" /></label><label>下一轮线索（可选）<textarea v-model="reviewDraft.seed" aria-label="今日复盘：下一轮线索" placeholder="经验、问题或下一轮起点。" @input="reviewDirty = true" /></label></div><div class="today-review-footer"><small>本地优先保存 · 冲突时不会覆盖正在编辑的内容</small><button :disabled="reviewSaving" @click="saveTodayReview">{{ reviewSaving ? '保存中…' : '保存今日复盘' }}</button></div></section>
    <section class="stats-grid"><article class="stat-card beryl-card"><small>有事实的天数</small><b>{{ stats.daysWithData }}</b><span>/ {{ rangeDays }} 天</span></article><article class="stat-card beryl-card"><small>Action 现实完成</small><b>{{ stats.done }}</b><span>/ {{ stats.total }}</span></article><article class="stat-card beryl-card"><small>Reality Record</small><b>{{ stats.records }}</b><span>条</span></article><article class="stat-card beryl-card"><small>高负荷天数</small><b>{{ stats.heavyDays }}</b><span>需要解释，而非责备</span></article></section>

    <div class="review-layout"><section class="timeline-panel beryl-card"><div class="panel-head"><div><p class="eyebrow">OBSERVE</p><h2 class="font-title">时间线</h2></div><span>先看发生了什么</span></div><div class="timeline"><button v-for="day in days" :key="day.date" class="timeline-day" :class="{ selected: selected?.date === day.date, empty: !day.plan && !day.state && !day.actions.length && !day.records.length }" :aria-current="selected?.date === day.date ? 'date' : undefined" @click="selectDate(day.date)"><span class="day-date">{{ dayLabel(day.date) }}</span><span class="day-summary"><i v-if="day.state" class="dot capacity"></i><i v-if="day.actions.length" class="dot action"></i><i v-if="day.records.length" class="dot record"></i><b v-if="day.actions.length">{{ day.actions.filter(item => item.status === 'done').length }}/{{ day.actions.length }} Action</b><em v-else>没有行动证据</em></span><small v-if="day.state">身体 {{ bodyNames[day.state.bodyState] }} · 心理 {{ mentalNames[day.state.mentalState] }} · {{ day.state.load }}%</small><small v-else-if="day.plan?.load">承载：{{ day.plan.load }}</small><small v-else>尚未记录容量</small></button></div></section>

      <section v-if="selected" class="detail-panel"><article class="selected-day beryl-card"><div class="panel-head"><div><p class="eyebrow">INSPECT · {{ selected.date }}</p><h2 class="font-title">{{ dayLabel(selected.date) }}</h2></div><button class="quiet" @click="router.push('/app/calendar?date=' + selected.date)">打开日历 →</button></div><div v-if="selected.state" class="capacity-summary"><span>身体 <b>{{ bodyNames[selected.state.bodyState] }}</b></span><span>心理 <b>{{ mentalNames[selected.state.mentalState] }}</b></span><span>负荷 <b>{{ selected.state.load }}%</b></span><span>趋势 <b>{{ trajectoryNames[selected.state.trajectory] }}</b></span></div><div v-else class="muted">这一天还没有 DailyState；不能从空白推断状态。</div><div v-if="selected.plan" class="review-copy"><div><small>今天为什么值得做</small><p>{{ selected.plan.why || '未填写' }}</p></div><div><small>复盘：观</small><p>{{ selected.plan.review.observation || '未填写' }}</p></div><div><small>复盘：察</small><p>{{ selected.plan.review.analysis || '未填写' }}</p></div><div><small>复盘：调</small><p>{{ selected.plan.review.adjustment || '未填写' }}</p></div><div><small>Seed</small><p>{{ selected.plan.review.seed || '未留下 Seed' }}</p></div></div><div v-else class="muted">这一天没有 Today 计划或晚间复盘。</div></article><article class="selected-day beryl-card"><div class="panel-head"><div><p class="eyebrow">EVIDENCE</p><h2 class="font-title">行动与记录</h2></div><span>{{ selected.actions.length }} Action · {{ selected.records.length }} Record</span></div><div v-if="selected.actions.length" class="evidence-list"><div v-for="action in selected.actions" :key="action.calmyId"><i class="dot action"></i><b>{{ action.title }}</b><span>{{ action.status }}<template v-if="action.resultNote"> · {{ action.resultNote }}</template></span></div></div><p v-else class="muted">没有行动记录。</p><div v-if="selected.records.length" class="evidence-list records"><div v-for="record in selected.records" :key="record.calmyId"><i class="dot record"></i><b>{{ record.body }}</b><span>{{ record.type }}<template v-if="record.impact"> · {{ record.impact }}</template></span></div></div><p v-else class="muted">没有 Reality Record。</p></article></section></div>

    <section class="direction-panel beryl-card"><div class="panel-head"><div><p class="eyebrow">ADJUST</p><h2 class="font-title">当前 Matter 方向</h2></div><span>趋势不是完成率 · 近 30 天证据</span></div><div class="matter-review-grid"><button v-for="matter in activeMatters" :key="matter.calmyId" @click="router.push('/app/matters/' + matter.calmyId)"><span><b>{{ matter.title }}</b><small>{{ matter.currentStage }} · 手动：{{ trajectoryNames[matter.trajectory] }}</small><small v-if="trajectoryByMatter.get(matter.calmyId)">推断：{{ trajectoryNames[trajectoryByMatter.get(matter.calmyId)!.inferredTrajectory] }} · 置信 {{ Math.round(trajectoryByMatter.get(matter.calmyId)!.confidence * 100) }}%</small></span><strong :class="trajectoryByMatter.get(matter.calmyId)?.inferredTrajectory || matter.trajectory">{{ trajectoryNames[trajectoryByMatter.get(matter.calmyId)?.inferredTrajectory || matter.trajectory] }}</strong><i>→</i></button><p v-if="!activeMatters.length" class="muted">暂无进行中的 Matter。</p></div></section>
  </div>
</template>

<style scoped>
.review-page{max-width:1180px;margin:0 auto}.page-head{display:flex;align-items:end;justify-content:space-between;gap:20px;margin:6px 0 28px}.eyebrow{font-size:10px;letter-spacing:.13em;color:var(--scene);font-weight:700;margin:0 0 8px}.page-head h1{font-size:clamp(34px,4vw,48px);line-height:1;margin:0;letter-spacing:-.04em}.page-head p:last-child{margin:11px 0 0;font-size:13px;color:var(--c-text-2)}.range-tabs{display:flex;gap:5px}.range-tabs button,.quiet{border:1px solid var(--c-border);background:transparent;color:var(--c-text-2);border-radius:8px;padding:7px 10px;font-size:11px;cursor:pointer;white-space:nowrap}.range-tabs button.on,.range-tabs button:hover,.quiet:hover{border-color:var(--scene);background:var(--scene-soft);color:var(--scene)}.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}.stat-card{padding:15px;display:grid;grid-template-columns:1fr auto;gap:4px 8px;align-items:end}.stat-card small{grid-column:1/-1;font-size:10px;color:var(--c-text-3)}.stat-card b{font:600 28px/1 var(--font-title);color:var(--scene)}.stat-card span{font-size:10px;color:var(--c-text-3)}.review-layout{display:grid;grid-template-columns:330px minmax(0,1fr);gap:16px}.timeline-panel,.selected-day,.direction-panel{padding:18px}.panel-head{display:flex;align-items:start;justify-content:space-between;gap:12px}.panel-head h2{font-size:23px;margin:0}.panel-head>span{font-size:10px;color:var(--c-text-3)}.timeline{display:grid;gap:5px;margin-top:16px}.timeline-day{display:grid;grid-template-columns:75px 1fr;gap:6px 10px;text-align:left;border:1px solid transparent;border-radius:9px;background:transparent;color:var(--c-text);padding:10px;cursor:pointer}.timeline-day:hover{background:var(--c-hover)}.timeline-day.selected{background:var(--scene-soft);border-color:var(--scene-border-strong)}.timeline-day.empty{opacity:.58}.day-date{font-size:11px;font-weight:700}.day-summary{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--c-text-2)}.day-summary em{font-style:normal;color:var(--c-text-3)}.timeline-day>small{grid-column:1/-1;font-size:10px;color:var(--c-text-3);padding-left:85px}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;flex:none}.dot.capacity{background:#c8874d}.dot.action{background:var(--scene)}.dot.record{background:#7c75b7}.detail-panel{display:grid;align-content:start;gap:16px}.selected-day{min-width:0}.selected-day .panel-head{margin-bottom:15px}.capacity-summary{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:15px}.capacity-summary span{font-size:11px;padding:6px 8px;border-radius:7px;background:var(--c-hover);color:var(--c-text-2)}.capacity-summary b{color:var(--scene)}.muted{font-size:12px;line-height:1.7;color:var(--c-text-3)}.review-copy{display:grid;grid-template-columns:1fr 1fr;gap:12px;border-top:1px solid var(--c-border-soft);padding-top:13px}.review-copy small{font-size:10px;color:var(--c-text-3)}.review-copy p{font-size:12px;line-height:1.6;margin:5px 0 0;color:var(--c-text-2)}.evidence-list{display:grid;gap:8px;margin-top:15px}.evidence-list>div{display:grid;grid-template-columns:10px 1fr auto;align-items:start;gap:8px;border-top:1px solid var(--c-border-soft);padding-top:9px}.evidence-list b{font-size:12px;line-height:1.5}.evidence-list span{font-size:10px;color:var(--c-text-3);text-align:right}.evidence-list.records{margin-top:14px}.direction-panel{margin-top:16px}.matter-review-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin-top:15px}.matter-review-grid button{display:flex;align-items:center;gap:10px;text-align:left;border:1px solid var(--c-border-soft);background:transparent;color:var(--c-text);border-radius:8px;padding:10px;cursor:pointer}.matter-review-grid button:hover{border-color:var(--scene);background:var(--scene-soft)}.matter-review-grid button span{display:grid;gap:4px;flex:1;min-width:0}.matter-review-grid b{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.matter-review-grid small{font-size:10px;color:var(--c-text-3)}.matter-review-grid strong{font-size:10px;font-weight:600}.matter-review-grid strong.advancing{color:#4c956c}.matter-review-grid strong.recovering{color:#7c75b7}.matter-review-grid strong.retreating,.matter-review-grid strong.diverging{color:#bb665d}.matter-review-grid i{color:var(--scene);font-style:normal}@media(max-width:850px){.review-layout{grid-template-columns:1fr}.timeline{grid-template-columns:repeat(2,1fr)}.stats-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:580px){.page-head{display:block}.range-tabs{margin-top:16px}.timeline{grid-template-columns:1fr}.review-copy,.matter-review-grid{grid-template-columns:1fr}.timeline-day>small{padding-left:0}.evidence-list>div{grid-template-columns:10px 1fr}.evidence-list span{grid-column:2;text-align:left}}
</style>
<style scoped>
.review-start{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px;padding:10px 2px;color:var(--c-text-2);font-size:12px}.review-start button{border:0;background:transparent;color:var(--scene);font-size:12px;font-weight:600;cursor:pointer}.today-review{padding:18px;margin-bottom:16px;border-color:var(--scene-border);background:color-mix(in srgb,var(--c-card) 88%,var(--scene-soft))}.today-review .panel-head{margin-bottom:4px}.today-review .panel-head h2{font-size:25px}.review-intro{margin:8px 0 0;font-size:12px;color:var(--c-text-2)}.review-dirty{color:var(--scene)!important;font-size:11px!important}.today-review-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}.today-review-grid label{display:grid;gap:6px;margin-top:14px;font-size:12px;color:var(--c-text-2)}.today-review-grid textarea{width:100%;min-height:76px;resize:vertical;border:1px solid var(--c-border);border-radius:9px;background:var(--c-bg);color:var(--c-text);padding:10px;font:inherit;font-size:13px;line-height:1.6;box-sizing:border-box}.today-review-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border-soft)}.today-review-footer small{font-size:11px;color:var(--c-text-3)}.today-review-footer button{border:1px solid var(--scene-border-strong);background:var(--scene);color:#fff;border-radius:8px;padding:9px 13px;font-size:12px;cursor:pointer}.today-review-footer button:disabled{opacity:.55;cursor:wait}@media(max-width:580px){.review-start{align-items:start;display:grid}.today-review-grid{grid-template-columns:1fr}.today-review-footer{align-items:stretch;display:grid}.today-review-footer button{min-height:44px}}
.stats-grid{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}.stats-grid::before{content:'历史回看';flex-basis:100%;font:600 22px/1.1 var(--font-title);color:var(--c-text);margin:4px 0 2px}.stat-card{flex:1 1 160px;display:flex;align-items:baseline;gap:8px;padding:11px 13px;min-height:0}.stat-card small{font-size:11px;white-space:nowrap}.stat-card b{font-size:23px}.stat-card span{font-size:11px}
@media(max-width:1050px){.review-layout{grid-template-columns:1fr}}
</style>
