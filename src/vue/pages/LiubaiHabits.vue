<script setup lang="ts">
/**
 * 习惯（v11「留白」）—— section.slide[data-title="习惯"] 的等价实现。
 * 结构：slide-head → .panel.grow/.habits + .add-row → .collapsible[data-block=habitSummary]/.stat-grid
 *
 * 数据映射：Calmy 的习惯存 `dates: string[]`（参考稿是 { 'YYYY-MM-DD': 1 } 稀疏对象），
 * 圆点按「包含所选的这一周」渲染，未来日期 disabled（字符串比较），与参考稿一致。
 * 重命名 / 删除在 useReferenceWorkspace 中没有暴露对应方法，故本页不提供，也不假装提供。
 */
import { computed, ref } from 'vue'
import { useReferenceWorkspace } from '@/vue/composables/useReferenceWorkspace'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbPanel from '@/vue/liubai/LbPanel.vue'
import LbCollapsible from '@/vue/liubai/LbCollapsible.vue'
import LbStatGrid from '@/vue/liubai/LbStatGrid.vue'
import type { LbStat } from '@/vue/liubai/types'
import LbDateNav from '@/vue/liubai/LbDateNav.vue'
import { useModuleDate } from '@/vue/liubai/date-state'

useOwnSlideHead()

const { habits, loading, saving, error, addHabit, toggleHabit, refresh } = useReferenceWorkspace()

const { value: date, isAll } = useModuleDate('habits')
const draft = ref('')
const WEEK_CHARS = ['一', '二', '三', '四', '五', '六', '日']

function pad(value: number) { return String(value).padStart(2, '0') }
function keyOf(value: Date) { return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` }
/** 包含该日期的那一周（周一起始），与参考稿 weekDatesOf 一致 */
function weekOf(value: string) {
  const base = new Date(`${value}T00:00:00`)
  const offset = (base.getDay() + 6) % 7
  const start = new Date(base)
  start.setDate(base.getDate() - offset)
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return keyOf(day)
  })
}

const week = computed(() => weekOf(date.value))
const elapsed = computed(() => week.value.filter(day => day <= date.value).length)

const checkedDots = computed(() => habits.value.reduce((sum, habit) => isAll.value
  ? sum + habit.dates.length
  : sum + week.value.filter(day => habit.dates.includes(day)).length, 0))
const totalDots = computed(() => isAll.value
  ? habits.value.reduce((sum, habit) => sum + habit.dates.length, 0)
  : habits.value.length * elapsed.value)
const todayDone = computed(() => habits.value.filter(habit => habit.dates.includes(date.value)).length)

/** 单个习惯的最长连续天数 */
function longestStreak(dates: string[]) {
  const sorted = [...new Set(dates)].sort()
  let best = 0
  let run = 0
  let previous: string | null = null
  for (const day of sorted) {
    if (previous) {
      const expect = new Date(`${previous}T00:00:00`)
      expect.setDate(expect.getDate() + 1)
      run = keyOf(expect) === day ? run + 1 : 1
    } else run = 1
    best = Math.max(best, run)
    previous = day
  }
  return best
}
const bestStreak = computed(() => habits.value.reduce((max, habit) => Math.max(max, longestStreak(habit.dates)), 0))
const streakHabit = computed(() => habits.value
  .map(habit => ({ name: habit.name, streak: longestStreak(habit.dates) }))
  .sort((a, b) => b.streak - a.streak)[0])

const summary = computed<LbStat[]>(() => {
  const rate = totalDots.value ? Math.round(checkedDots.value / totalDots.value * 100) : 0
  return [
    { label: isAll.value ? '累计完成率' : '本周完成率', value: rate, unit: '%', accent: rate === 100 && totalDots.value > 0, bar: { pct: rate } },
    { label: isAll.value ? '累计打卡' : '已打卡', value: isAll.value ? checkedDots.value : `${checkedDots.value}/${totalDots.value}` },
    { label: '今日完成', value: todayDone.value, unit: ` / ${habits.value.length}` },
    { label: '最长连续', value: bestStreak.value, unit: ' 天', sub: streakHabit.value?.streak ? streakHabit.value.name : '—' }
  ]
})

async function submit() {
  const name = draft.value.trim()
  if (!name) return
  draft.value = ''
  await addHabit(name)
}
</script>

<template>
  <header class="slide-head">
    <div class="head-main">
      <p class="hint">习惯</p>
      <div class="head-title-row">
        <h2>点一下圆点。</h2>
        <span class="info" tabindex="0" data-tip="显示所选日期所在的那一周。过去可补打，未来不可预填。" aria-label="习惯说明">i</span>
      </div>
    </div>
    <LbDateNav module="habits" kind="week" />
  </header>

  <p v-if="error" class="panel" role="alert" style="color:var(--danger)">
    {{ error }}
    <button class="act" type="button" @click="refresh">重试</button>
  </p>

  <LbPanel grow title="习惯清单" :note="saving ? '保存中…' : `${habits.length} 个习惯 · ${isAll ? '累计' : '本周'}`">
    <ul class="habits">
      <li v-if="loading" class="empty">正在读取…</li>
      <li v-else-if="!habits.length" class="empty">还没有习惯。</li>
      <li v-for="habit in habits" :key="habit.id" class="habit">
        <span class="name">{{ habit.name }}</span>
        <div v-if="isAll" class="tag">{{ habit.dates.length }} 次 · 最长 {{ longestStreak(habit.dates) }} 天</div>
        <div v-else class="days">
          <button
            v-for="(day, index) in week"
            :key="day"
            class="day"
            :class="{ on: habit.dates.includes(day), today: day === date }"
            :disabled="day > date"
            :aria-label="`${habit.name} ${day} ${habit.dates.includes(day) ? '已完成' : '未完成'}`"
            @click="toggleHabit(habit, day)"
          >{{ WEEK_CHARS[index] }}</button>
        </div>
      </li>
    </ul>
    <div class="add-row">
      <input v-model="draft" class="add-input" maxlength="12" aria-label="小行动名称" placeholder="添加习惯，回车确认…" @keydown.enter.prevent="submit">
    </div>
  </LbPanel>

  <LbCollapsible block="habitSummary" :rank="3">
    <LbPanel title="该周概览">
      <LbStatGrid :stats="summary" />
    </LbPanel>
  </LbCollapsible>
</template>
