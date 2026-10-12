<script setup lang="ts">
/**
 * 注意力（v11「留白」）—— section.slide[data-title="注意力"] 的等价实现。
 *
 * 诚实映射：Calmy 没有「专注块」实体，一次专注 = completeFocus() 写下的一条 RealityRecord
 * （`[番茄钟] 完成专注 N 分钟`，带 actionId）+ pomoTotal/pomoCount 累计标量。
 * 因此本页只保留有真实来源的部分：专注条（开始/结束 + 目标行动 + 计时）、专注记录、统计。
 * 参考稿的 L0–L3 保护级别、预算配额（180/120/120/60）、干扰源排行、上下文快照 Calmy 都没有对象，
 * 一律不显示、不编造。
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { useReferenceWorkspace } from '@/vue/composables/useReferenceWorkspace'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbPanel from '@/vue/liubai/LbPanel.vue'
import LbCollapsible from '@/vue/liubai/LbCollapsible.vue'
import LbStatGrid from '@/vue/liubai/LbStatGrid.vue'
import type { LbStat } from '@/vue/liubai/types'
import LbDateNav from '@/vue/liubai/LbDateNav.vue'
import { useModuleDate } from '@/vue/liubai/date-state'
import { focusEntries, minutesOn, pad } from '@/vue/liubai/focus'

useOwnSlideHead()

const { actions, plans, records, loading, saving, error, completeFocus, refresh } = useReferenceWorkspace()

const { value: date, isAll } = useModuleDate('pomo')
const SESSION_SECONDS = 25 * 60
const running = ref(false)
const elapsed = ref(0)
let ticker: number | undefined

const plan = computed(() => isAll.value ? undefined : plans.value.find(item => item.date === date.value))
const focusAction = computed(() => {
  const id = plan.value?.focusActionIds[0]
  return id ? actions.value.find(item => item.calmyId === id) : undefined
})
const entries = computed(() => focusEntries(records.value))
const todayEntries = computed(() => (isAll.value ? entries.value : entries.value.filter(entry => entry.date === date.value)).sort((a, b) => b.at - a.at))
const todayMinutes = computed(() => isAll.value ? entries.value.reduce((sum, entry) => sum + entry.minutes, 0) : minutesOn(entries.value, date.value))
const totalMinutes = computed(() => entries.value.reduce((sum, entry) => sum + entry.minutes, 0))

const timerLabel = computed(() => {
  const seconds = running.value ? Math.max(0, SESSION_SECONDS - elapsed.value) : SESSION_SECONDS
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`
})
const heading = computed(() => todayMinutes.value
  ? `${isAll ? '全部' : '今天'}专注 ${todayMinutes.value} 分钟。`
  : '今天的心神放在哪？')

const stats = computed<LbStat[]>(() => [
  { label: isAll.value ? '累计专注' : '今日专注', value: todayMinutes.value, unit: ' min', accent: todayMinutes.value > 0 },
  { label: isAll.value ? '累计段数' : '今日段数', value: todayEntries.value.length, unit: ' 段' },
  { label: '全部记录', value: entries.value.length, unit: ' 段' },
  { label: '按小时', value: Math.round(totalMinutes.value / 60 * 10) / 10, unit: ' h' }
])

function start() {
  running.value = true
  elapsed.value = 0
  if (ticker) window.clearInterval(ticker)
  ticker = window.setInterval(() => { elapsed.value += 1 }, 1000)
}

async function stop() {
  if (ticker) { window.clearInterval(ticker); ticker = undefined }
  const minutes = Math.max(1, Math.round(elapsed.value / 60))
  running.value = false
  elapsed.value = 0
  await completeFocus(minutes, focusAction.value?.calmyId)
}

function timeOf(at: number) {
  const d = new Date(at)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const actionTitle = (actionId?: string) => actions.value.find(item => item.calmyId === actionId)?.title || '未关联行动'

onBeforeUnmount(() => { if (ticker) window.clearInterval(ticker) })
</script>

<template>
  <header class="slide-head">
    <div class="head-main">
      <p class="hint">注意力</p>
      <div class="head-title-row">
        <h2>{{ heading }}</h2>
        <span class="info" tabindex="0" data-tip="开始专注后按 25 分钟一段计时；结束时会写入一条记录（含分钟数与关联行动）。当前重点行动在「任务」里用 ◎ 设定。" aria-label="注意力说明">i</span>
      </div>
    </div>
    <LbDateNav module="pomo" />
  </header>

  <p v-if="error" class="panel" role="alert" style="color:var(--danger)">
    {{ error }}
    <button class="act" type="button" @click="refresh">重试</button>
  </p>

  <div class="panel focus-bar">
    <div class="fc-left">
      <button class="fc-btn" :class="{ stop: running }" type="button" @click="running ? stop() : start()">
        {{ running ? '■ 结束专注' : '▶ 开始专注' }}
      </button>
      <div class="fc-meta">
        <div class="fc-task">{{ focusAction?.title || '未选择重点' }}</div>
        <div class="fc-sub">{{ focusAction ? '25 分钟一段 · 结束写入记录' : '在「任务」里用 ◎ 设一个重点' }}</div>
      </div>
    </div>
    <div class="fc-timer">{{ timerLabel }}</div>
  </div>

  <LbPanel grow title="专注记录" :note="saving ? '保存中…' : `${todayEntries.length} 段`">
    <ul class="ov-list">
      <li v-if="loading" class="dim">正在读取…</li>
      <li v-else-if="!todayEntries.length" class="dim">今天还没有专注记录。</li>
      <li v-for="entry in todayEntries" :key="entry.at">
        <b>{{ actionTitle(entry.actionId) }}</b>
        <span class="right">{{ entry.minutes }} 分钟 · {{ timeOf(entry.at) }}</span>
      </li>
    </ul>
  </LbPanel>

  <LbCollapsible block="pomoStats" :rank="2">
    <LbPanel title="专注统计">
      <LbStatGrid :stats="stats" />
    </LbPanel>
  </LbCollapsible>
</template>

<style scoped>
/* 参考稿的 .focus-bar 是三列栅格（左 / 保护级别 / 计时）；
   Calmy 没有保护级别这一列，这里收紧成两列，避免计时器落在中间列。 */
.focus-bar {
  grid-template-columns: minmax(0, 1fr) auto;
}
</style>
