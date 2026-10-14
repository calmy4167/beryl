<script setup lang="ts">
/**
 * 今天（页面层重做 · 参考稿布局）
 *
 * 结构：顶部块（标题 + 日期药丸 + 复盘入口 + 四项指标 + 通栏添加）
 *      + 双列（左：今日计划 / 今日时间线；右：当日数据 / 习惯打卡 / 收集箱）
 *
 * 数据全部来自既有 Repository（useReferenceWorkspace 的 actions/plans/habits/records/inbox/matters），
 * 不新增存储、不复制领域对象。参考稿里有、Calmy 没有真实来源的字段一律不做：
 *   · 「剩余约 3 小时 20 分」→ 无时长估算字段，换成「重点 N 项」（TodayPlan.focusActionIds）
 *   · 「按时间排序」「09:30 · 60 分钟」→ 行动没有计划时刻与时长，换成「重点优先 / 按状态」与关联处境
 *   · 「高优先级」→ 无优先级字段，重点用 TodayPlan.focusActionIds 表达
 *   · 「专注 2h40m / 6h 目标」→ 无每日专注目标设置，环改成计划完成率
 *   · 「休息 2 次」→ 无来源，不做
 */
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useReferenceWorkspace } from '@/vue/composables/useReferenceWorkspace'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbDateNav from '@/vue/liubai/LbDateNav.vue'
import { useModuleDate } from '@/vue/liubai/date-state'
import { focusEntries, minutesOn, weekOf } from '@/vue/liubai/focus'
import { todayKey } from '@/core/storage'
import type { ActionItem } from '@/domain/action/model'

useOwnSlideHead()

const router = useRouter()
const { actions, plans, habits, records, inbox, matters, loading, saving, error, addTask, toggleTask, focusTask, toggleHabit, refresh } = useReferenceWorkspace()
const { value: date, isAll } = useModuleDate('today')

/* ── 日期文案 ─────────────────────────────────────────────── */
function pad(value: number) { return String(value).padStart(2, '0') }
function dayKey(at: number) {
  const d = new Date(at)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function timeOf(at: number) {
  const d = new Date(at)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const dateLine = computed(() => {
  if (isAll.value) return '全部时间'
  const [, month, day] = date.value.split('-')
  const weekday = WEEKDAYS[new Date(`${date.value}T00:00:00`).getDay()]
  return `${weekday} · ${Number(month)}月${Number(day)}日`
})
const title = computed(() => (isAll.value ? '全部行动' : date.value === todayKey() ? '今天' : '当天行动'))

/* ── 快速新增（通栏）──────────────────────────────────────── */
const draft = ref('')
const matterId = ref('')
const taskComposer = ref<HTMLInputElement | null>(null)
const matterComposer = ref<HTMLSelectElement | null>(null)
const targetDate = computed(() => (isAll.value ? todayKey() : date.value))
function focusTaskComposer() { void nextTick(() => taskComposer.value?.focus()) }
function focusMatterComposer() { void nextTick(() => matterComposer.value?.focus()) }
async function submitTask() {
  const title = draft.value.trim()
  if (!title) return
  if (await addTask(title, targetDate.value, matterId.value || undefined)) {
    draft.value = ''
    matterId.value = ''
  }
}
function onTaskComposerKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  void submitTask()
}

/* ── 今日计划 ─────────────────────────────────────────────── */
const sort = ref<'focus' | 'status'>('focus')
const sortLabel = computed(() => (sort.value === 'focus' ? '重点优先' : '按状态'))
function toggleSort() { sort.value = sort.value === 'focus' ? 'status' : 'focus' }

const todayActions = computed(() => (isAll.value ? actions.value : actions.value.filter(item => item.date === date.value)))
const doneActions = computed(() => todayActions.value.filter(item => item.status === 'done'))
const focusIds = computed(() => (isAll.value ? new Set<string>() : new Set(plans.value.find(item => item.date === date.value)?.focusActionIds || [])))
const openActions = computed(() => todayActions.value.filter(item => item.status !== 'done' && item.status !== 'cancelled' && item.status !== 'skipped'))
const orderedActions = computed(() => {
  const rank = (item: ActionItem) => {
    if (sort.value === 'focus') return focusIds.value.has(item.calmyId) ? 0 : 1
    return item.status === 'in_progress' ? 0 : 1
  }
  return [...openActions.value].sort((a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt)
})
const VISIBLE_LIMIT = 6
const visibleActions = computed(() => orderedActions.value.slice(0, VISIBLE_LIMIT))
const hiddenCount = computed(() => Math.max(0, orderedActions.value.length - VISIBLE_LIMIT))
const matterTitle = (id?: string) => matters.value.find(item => item.calmyId === id)?.title || ''

/* ── 指标：计划 / 已完成 / 今日专注 / 重点 ──────────────────── */
const focusToday = computed(() => {
  const entries = focusEntries(records.value)
  return isAll.value ? entries.reduce((sum, entry) => sum + entry.minutes, 0) : minutesOn(entries, date.value)
})
const focusParts = computed(() => ({ hours: Math.floor(focusToday.value / 60), minutes: focusToday.value % 60 }))
const totalCount = computed(() => todayActions.value.length)
const doneCount = computed(() => doneActions.value.length)
const donePct = computed(() => (totalCount.value ? Math.round((doneCount.value / totalCount.value) * 100) : 0))
const RING = 314
const ringOffset = computed(() => Math.round(RING * (1 - donePct.value / 100)))

/* ── 今日时间线：记录 + 专注 + 完成，按真实时间戳排列 ─────────
 * 专注来自 completeFocus 写下的 RealityRecord（[番茄钟] 前缀）；
 * 完成时刻用 action.updatedAt（ActionItem 没有独立的 completedAt，已完成的条目其 updatedAt 即完成时刻）。*/
interface TimelineEntry { key: string; at: number; label: string; kind: '记录' | '专注' | '完成' }
const timeline = computed<TimelineEntry[]>(() => {
  const entries: TimelineEntry[] = []
  for (const record of records.value) {
    const at = record.occurredAt
    if (!isAll.value && dayKey(at) !== date.value) continue
    if (record.body.startsWith('[番茄钟]')) {
      const match = record.body.match(/(\d+)\s*分钟/)
      entries.push({ key: record.calmyId, at, label: `专注 ${match ? match[1] : '—'} 分钟`, kind: '专注' })
    } else {
      entries.push({ key: record.calmyId, at, label: record.body, kind: '记录' })
    }
  }
  for (const item of doneActions.value) {
    entries.push({ key: `done-${item.calmyId}`, at: item.updatedAt, label: item.title, kind: '完成' })
  }
  return entries.sort((a, b) => a.at - b.at).slice(-6)
})

/* ── 当日数据 / 习惯 / 收集箱 ──────────────────────────────── */
const habitsDone = computed(() => habits.value.filter(habit => habit.dates.includes(targetDate.value)).length)
const weekDays = computed(() => weekOf(targetDate.value))
const weekDots = (dates: string[]) => weekDays.value.map(day => ({ day, on: dates.includes(day) }))
async function checkHabit(habit: { id: string; dates: string[] }) {
  if (isAll.value || saving.value) return
  await toggleHabit(habit as never, targetDate.value)
}
const inboxCount = computed(() => inbox.value.length)
const inboxRecent = computed(() => inbox.value.slice(0, 2))

/* ── 复盘入口 ─────────────────────────────────────────────── */
const reviewed = computed(() => {
  const review = plans.value.find(item => item.date === date.value)?.review
  return !!review && !!(review.observation || review.analysis || review.adjustment || review.seed)
})
const reviewLabel = computed(() => (reviewed.value ? '今日已复盘' : '复盘今日'))
function openReview() { void router.push('/app/review') }
function openInbox() { void router.push('/app/capture') }
function openHabits() { void router.push('/app/module/habits') }
function openMatters() { void router.push('/app/matters') }
function openTimeline() { void router.push('/app/capture') }
function openDayData() { void router.push('/app/cycle') }
</script>

<template>
  <div class="today-home today-page">
    <header class="slide-head today-head">
      <div class="head-main">
        <h1>{{ title }}</h1>
        <p class="hint">{{ dateLine }}</p>
      </div>
      <div class="today-head-actions">
        <LbDateNav module="today" />
        <button class="today-primary" type="button" :aria-pressed="reviewed" @click="openReview">
          <span aria-hidden="true">✓</span>{{ reviewLabel }}
        </button>
      </div>
    </header>

    <p v-if="error" class="today-error" role="alert">
      {{ error }}
      <button class="today-text-button" type="button" @click="refresh">重试</button>
    </p>

    <div class="today-metrics">
      <div class="today-metric"><span>计划</span><b>{{ totalCount }}<small> 项</small></b></div>
      <div class="today-metric"><span>已完成</span><b>{{ doneCount }}<small> 项</small></b></div>
      <div class="today-metric">
        <span>今日专注</span>
        <b>
          <template v-if="focusParts.hours">{{ focusParts.hours }}<small> 小时</small></template>{{ focusParts.minutes }}<small> 分</small>
        </b>
      </div>
      <div class="today-metric"><span>重点</span><b>{{ focusIds.size }}<small> 项</small></b></div>
    </div>

    <div class="today-add">
      <input
        ref="taskComposer"
        class="today-add-input"
        :value="draft"
        :disabled="saving"
        maxlength="80"
        placeholder="添加今天要做的事…"
        aria-label="添加今天要做的事"
        @input="draft = ($event.target as HTMLInputElement).value"
        @keydown.enter="onTaskComposerKeydown"
      >
      <select
        ref="matterComposer"
        class="today-add-matter"
        aria-label="行动关联处境"
        :disabled="saving"
        :value="matterId"
        @change="matterId = ($event.target as HTMLSelectElement).value"
      >
        <option value="">不关联处境</option>
        <option v-for="matter in matters" :key="matter.calmyId" :value="matter.calmyId">{{ matter.title }}</option>
      </select>
      <button class="today-add-button" type="button" :disabled="saving || !draft.trim()" aria-label="添加" @click="submitTask">+</button>
    </div>

    <div class="today-grid">
      <div class="today-main">
        <section class="today-card">
          <header class="today-card-head">
            <h2>今日计划</h2>
            <button class="today-sort" type="button" :aria-label="`当前排序：${sortLabel}`" @click="toggleSort">≡ {{ sortLabel }} ▾</button>
          </header>

          <p v-if="loading" class="today-empty">正在读取…</p>
          <div v-else-if="!visibleActions.length" class="today-empty-state">
            <p class="today-empty">这一天还没有待办。把要推进的事写下来，今天的计划就从这里开始。</p>
            <div class="today-empty-actions">
              <button class="today-empty-action" type="button" @click="focusTaskComposer">
                <span class="today-empty-marker" aria-hidden="true">＋</span>
                <span><b>添加第一项行动</b><small>写下今天准备推进的事</small></span>
                <span class="today-empty-arrow" aria-hidden="true"></span>
              </button>
              <button class="today-empty-action" type="button" @click="matters.length ? focusMatterComposer() : openMatters()">
                <span class="today-empty-marker" aria-hidden="true">↗</span>
                <span><b>{{ matters.length ? '关联一个处境' : '先建立处境' }}</b><small>{{ matters.length ? '让行动对应到正在面对的事情' : '把今天的行动放进真实背景' }}</small></span>
                <span class="today-empty-arrow" aria-hidden="true"></span>
              </button>
            </div>
          </div>
          <ul v-else class="ov-list today-list">
            <li v-for="item in visibleActions" :key="item.calmyId" :class="{ 'is-focus': focusIds.has(item.calmyId), 'is-doing': item.status === 'in_progress' }">
              <button
                class="today-title"
                type="button"
                :aria-pressed="focusIds.has(item.calmyId)"
                :title="focusIds.has(item.calmyId) ? '当前重点' : '设为重点'"
                :disabled="saving"
                @click="focusTask(item)"
              >{{ item.title }}</button>
              <span v-if="matterTitle(item.matterId)" class="today-tag">{{ matterTitle(item.matterId) }}</span>
              <button class="today-row-action" type="button" title="标记完成" :disabled="saving" @click.stop="toggleTask(item)">完成</button>
            </li>
          </ul>
          <p v-if="hiddenCount" class="today-more">还有 {{ hiddenCount }} 件未显示</p>
          <p v-if="doneCount" class="today-done-line">已完成 {{ doneCount }} 项 · {{ doneActions.map(item => item.title).join('、') }}</p>
        </section>

        <section class="today-card">
          <header class="today-card-head">
            <h2>今日时间线</h2>
            <button class="today-chevron-button" type="button" aria-label="去记录一条内容" @click="openTimeline">›</button>
          </header>
          <p v-if="loading" class="today-empty">正在读取…</p>
          <div v-else-if="!timeline.length" class="today-empty-state">
            <p class="today-empty">今天还没有记录。留下原话或回顾进展后，内容会按发生时间出现在这里。</p>
            <div class="today-empty-actions today-empty-actions-inline">
              <button class="today-inline-action" type="button" @click="openTimeline">记下一条</button>
              <button class="today-inline-action" type="button" @click="openReview">回顾今天</button>
            </div>
          </div>
          <ul v-else class="today-timeline">
            <li v-for="entry in timeline" :key="entry.key" :class="{ 'is-focus': entry.kind === '专注' }">
              <span class="today-dot" aria-hidden="true"></span>
              <span class="today-time">{{ timeOf(entry.at) }}</span>
              <b>{{ entry.label }}</b>
              <span class="today-kind">{{ entry.kind }}</span>
            </li>
          </ul>
        </section>
      </div>

      <div class="today-side">
        <section class="today-card">
          <header class="today-card-head"><h2>当日数据</h2><button class="today-chevron-button" type="button" aria-label="查看周期数据" @click="openDayData">›</button></header>
          <div class="today-ring-row">
            <svg class="today-ring" viewBox="0 0 118 118" role="img" :aria-label="`计划完成率 ${donePct}%`">
              <circle class="track" cx="59" cy="59" r="50" />
              <circle class="value" cx="59" cy="59" r="50" :stroke-dasharray="RING" :stroke-dashoffset="ringOffset" />
            </svg>
            <div class="today-facts">
              <div class="today-fact"><span>完成率</span><b>{{ donePct }}%</b></div>
              <div class="today-fact"><span>待办</span><b>{{ openActions.length }} 件</b></div>
              <div class="today-fact"><span>习惯打卡</span><b>{{ habitsDone }}/{{ habits.length }}</b></div>
              <div class="today-fact"><span>收集箱</span><b>{{ inboxCount }} 条</b></div>
            </div>
          </div>
        </section>

        <section class="today-card">
          <header class="today-card-head"><h2>习惯打卡</h2><button class="today-chevron-button" type="button" aria-label="管理习惯" @click="openHabits">›</button></header>
          <p v-if="loading" class="today-empty">正在读取…</p>
          <div v-else-if="!habits.length" class="today-empty-compact">
            <p class="today-empty">还没有习惯。添加后，可以在这里查看本周进度并完成打卡。</p>
            <button class="today-inline-action" type="button" @click="openHabits">添加一个习惯</button>
          </div>
          <div v-else>
            <div v-for="habit in habits" :key="habit.id" class="today-habit">
              <b>{{ habit.name }}</b>
              <span class="today-week" :aria-label="`本周打卡：${habit.dates.join('、') || '无'}`">
                <i v-for="dot in weekDots(habit.dates)" :key="dot.day" :class="{ on: dot.on }" />
              </span>
              <button
                class="today-habit-action"
                type="button"
                :disabled="isAll || saving"
                :aria-pressed="habit.dates.includes(targetDate)"
                @click="checkHabit(habit)"
              >{{ habit.dates.includes(targetDate) ? '已打卡' : '打卡' }}</button>
            </div>
          </div>
        </section>

        <section class="today-card">
          <header class="today-card-head">
            <h2>收集箱</h2>
            <button class="today-text-button" type="button" @click="openInbox">全部 {{ inboxCount }} 条 →</button>
          </header>
          <p v-if="loading" class="today-empty">正在读取…</p>
          <div v-else-if="!inboxRecent.length" class="today-empty-compact">
            <p class="today-empty">收集箱还是空的。先记下想法，之后再决定怎么处理。</p>
            <button class="today-inline-action" type="button" @click="openInbox">记录一条内容</button>
          </div>
          <ul v-else class="today-inbox">
            <li v-for="item in inboxRecent" :key="item.calmyId">{{ item.body }}</li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 布局与表面：数值/间距走 4px 倍数；层次靠底色差（--panel-2 + 4% 阴影），不用重投影 */
.today-page {
  --cta: color-mix(in srgb, var(--accent) 68%, var(--muted));
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 1180px;
  margin-inline: auto;
}

.today-head { border-bottom: 0; padding-bottom: 0; }
.today-head h1 { font-size: 1.58rem; }
.today-head .head-main { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
.today-head .hint { flex: none; margin: 0; font-size: .72rem; }
.today-head-actions { display: flex; align-items: center; gap: 10px; }
.today-primary {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 10px;
  background: var(--accent);
  color: var(--accent-fg);
  font: inherit;
  font-size: .74rem;
  font-weight: 600;
  cursor: pointer;
  transition: filter .18s var(--ease);
}
.today-primary:hover { filter: brightness(1.06); }

.today-error {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  color: var(--danger, #d33);
  font-size: .86rem;
}
.today-text-button { border: 0; background: none; color: var(--cta); font: inherit; font-size: .8rem; cursor: pointer; }

/* 指标条 */
.today-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-radius: 12px;
  background: var(--panel-2);
  box-shadow: 0 1px 2px rgba(16, 24, 40, .04);
  overflow: hidden;
}
.today-metric { display: flex; flex-direction: column; gap: 2px; padding: 6px 10px; border-left: 1px solid color-mix(in srgb, var(--line) 75%, transparent); }
.today-metric:first-child { border-left: 0; }
.today-metric span { color: var(--muted); font-size: .72rem; }
.today-metric b { color: var(--fg); font-size: 1.2rem; font-weight: 650; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
.today-metric b small { font-size: .72rem; font-weight: 500; }

/* 通栏添加 */
.today-add { display: flex; gap: 10px; }
.today-add-input,
.today-add-matter {
  height: 32px;
  padding: 0 9px;
  border: 0;
  border-radius: 10px;
  background: var(--panel);
  color: var(--fg);
  font: inherit;
  font-size: .86rem;
  box-shadow: 0 1px 2px rgba(16, 24, 40, .04);
  outline: none;
}
.today-add-input { flex: 1; min-width: 0; }
.today-add-input::placeholder { color: var(--muted); }
.today-add-matter { flex: 0 1 140px; min-width: 112px; font-size: .74rem; }
.today-add-input:focus,
.today-add-matter:focus { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent); }
.today-add-button {
  flex: none;
  width: 36px;
  height: 34px;
  border: 0;
  border-radius: 10px;
  background: var(--accent);
  color: var(--accent-fg);
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
  transition: filter .18s var(--ease);
}
.today-add-button:hover { filter: brightness(1.06); }
.today-add-button:disabled { opacity: .45; cursor: default; }

/* 双列 */
.today-grid { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr); gap: 8px; align-items: start; }
.today-main,
.today-side { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.today-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--panel-2);
  box-shadow: 0 1px 2px rgba(16, 24, 40, .04);
  min-width: 0;
}
.today-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.today-card-head h2 { margin: 0; color: var(--fg); font-size: .84rem; font-weight: 650; letter-spacing: -.02em; }
.today-chev { color: var(--muted); font-size: 1.1rem; line-height: 1; }
.today-empty { margin: 0; padding: 1px 0; color: var(--muted); font-size: .72rem; line-height: 1.5; }
.today-empty-state,
.today-empty-compact { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.today-empty-actions { display: flex; flex-direction: column; }
.today-empty-action {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 32px;
  padding: 3px 4px;
  border: 0;
  border-top: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
  background: transparent;
  color: var(--fg);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color .16s ease, padding-inline .16s ease;
}
.today-empty-action:first-child { border-top: 0; }
.today-empty-action:hover { padding-inline: 8px; background: color-mix(in srgb, var(--accent) 5%, transparent); }
.today-empty-action > span:nth-child(2) { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
.today-empty-action b { font-size: .74rem; font-weight: 600; }
.today-empty-action small { color: var(--muted); font-size: .64rem; }
.today-empty-marker { display: grid; place-items: center; width: 20px; height: 20px; flex: none; border: 1px solid color-mix(in srgb, var(--line-strong) 72%, transparent); border-radius: 5px; color: var(--cta); font-size: .78rem; }
.today-empty-arrow { width: 7px; height: 7px; flex: none; border-top: 1.5px solid var(--muted); border-right: 1.5px solid var(--muted); transform: rotate(45deg); }
.today-empty-actions-inline { flex-direction: row; gap: 16px; padding-top: 7px; border-top: 1px solid color-mix(in srgb, var(--line) 80%, transparent); }
.today-inline-action { align-self: flex-start; padding: 1px 0; border: 0; background: transparent; color: var(--cta); font: inherit; font-size: .68rem; font-weight: 550; text-align: left; cursor: pointer; text-underline-offset: 3px; }
.today-inline-action:hover { color: var(--accent); text-decoration: underline; }
.today-inline-action:focus-visible,
.today-empty-action:focus-visible,
.today-chevron-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 4px; }
.today-chevron-button { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 7px; background: transparent; color: var(--muted); font: inherit; font-size: 1.05rem; cursor: pointer; }
.today-chevron-button:hover { background: var(--panel); color: var(--accent); }
.today-sort {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 23px;
  padding: 0 7px;
  border: 0;
  border-radius: 9px;
  background: var(--panel);
  color: var(--muted);
  font: inherit;
  font-size: .74rem;
  cursor: pointer;
}
.today-sort:hover { color: var(--fg); }

/* 计划行 */
.today-list > li { align-items: center; gap: 7px; }
.today-list > li.is-focus > .today-title { font-weight: 650; }
.today-list > li.is-doing > .today-title::after { content: '进行中'; margin-left: 8px; padding: 1px 7px; border-radius: 6px; background: color-mix(in srgb, #f59e0b 18%, transparent); color: color-mix(in srgb, #f59e0b 78%, var(--fg)); font-size: .72rem; font-weight: 500; }
.today-title {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--fg);
  font: inherit;
  font-size: .86rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.today-title:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
.today-tag { flex: none; padding: 2px 8px; border-radius: 6px; background: color-mix(in srgb, var(--accent) 9%, var(--panel)); color: color-mix(in srgb, var(--accent) 82%, var(--fg)); font-size: .72rem; }
.today-row-action,
.today-habit-action { flex: none; padding: 2px 7px; border: 0; border-radius: 6px; background: none; color: var(--cta); font: inherit; font-size: .7rem; cursor: pointer; }
.today-row-action:hover,
.today-habit-action:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.today-row-action:disabled,
.today-habit-action:disabled { color: var(--muted); cursor: default; background: none; }
.today-more { margin: 0; color: var(--muted); font-size: .78rem; }
.today-done-line { margin: 0; padding-top: 8px; border-top: 1px solid color-mix(in srgb, var(--line) 80%, transparent); color: var(--muted); font-size: .7rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 时间线 */
.today-timeline { list-style: none; margin: 0; padding: 0; position: relative; }
.today-timeline li { position: relative; display: flex; align-items: baseline; gap: 6px; padding: 4px 0 4px 16px; }
.today-timeline li::before { position: absolute; left: 4px; top: 0; bottom: 0; width: 1px; background: var(--line); content: ''; }
.today-timeline li:first-child::before { top: 50%; }
.today-timeline li:last-child::before { bottom: 50%; }
.today-dot { position: absolute; left: 0; top: 50%; width: 9px; height: 9px; margin-top: -4.5px; border: 2px solid var(--line-strong); border-radius: 50%; background: var(--panel-2); }
.today-timeline li.is-focus .today-dot { border-color: var(--accent); background: var(--accent); }
.today-time { flex: none; width: 3.6em; color: var(--muted); font-size: .7rem; font-variant-numeric: tabular-nums; }
.today-timeline b { flex: 1; min-width: 0; color: var(--fg); font-size: .78rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.today-kind { flex: none; padding: 1px 6px; border-radius: 5px; background: var(--panel); color: var(--muted); font-size: .62rem; }
.today-timeline li.is-focus .today-kind { background: color-mix(in srgb, var(--accent) 12%, transparent); color: color-mix(in srgb, var(--accent) 85%, var(--fg)); }

/* 当日数据：环 + 事实 */
.today-ring-row { display: flex; align-items: center; gap: 10px; }
.today-ring { flex: none; width: 74px; height: 74px; }
.today-ring circle { fill: none; stroke-width: 9; stroke-linecap: round; }
.today-ring .track { stroke: var(--line); }
.today-ring .value { stroke: var(--accent); transform: rotate(-90deg); transform-origin: 50% 50%; transition: stroke-dashoffset .4s var(--ease); }
.today-facts { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.today-fact { display: flex; align-items: baseline; gap: 5px; padding: 3px 0; border-top: 1px solid color-mix(in srgb, var(--line) 80%, transparent); }
.today-fact:first-child { border-top: 0; }
.today-fact span { color: var(--muted); font-size: .7rem; }
.today-fact b { margin-left: auto; color: var(--fg); font-size: .8rem; font-weight: 600; font-variant-numeric: tabular-nums; }

/* 习惯 */
.today-habit { display: flex; align-items: center; gap: 5px; padding: 3px 0; border-top: 1px solid color-mix(in srgb, var(--line) 80%, transparent); }
.today-habit:first-child { border-top: 0; }
.today-habit > b { flex: 1; min-width: 0; color: var(--fg); font-size: .78rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.today-week { display: inline-flex; gap: 3px; flex: none; }
.today-week i { width: 6px; height: 6px; border-radius: 50%; background: var(--line-strong); }
.today-week i.on { background: var(--accent); }
.today-habit-action[aria-pressed='true'] { color: var(--muted); }

/* 收集箱 */
.today-inbox { list-style: none; margin: 0; padding: 0; }
.today-inbox li {
  padding: 3px 0;
  border-top: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
  color: var(--fg);
  font-size: .78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.today-inbox li:first-child { border-top: 0; }

@media (max-width: 1080px) {
  .today-grid { grid-template-columns: minmax(0, 1fr); }
  .today-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .today-metric { border-top: 1px solid color-mix(in srgb, var(--line) 75%, transparent); }
  .today-metric:nth-child(-n + 2) { border-top: 0; }
  .today-metric:nth-child(odd) { border-left: 0; }
  .today-add { flex-wrap: wrap; }
  .today-add-matter { flex: 1 1 100%; order: 3; }
}
</style>
