<script setup lang="ts">
/**
 * 复盘（v11「留白」）—— section.slide[data-title="复盘"] 的等价实现。
 *
 * 参考稿的「专注分布」柱状图没有独立实体：数值来自 attention.days[date].budget（手填）。
 * Calmy 有更真实的来源——completeFocus() 写下的 `[番茄钟] 完成专注 N 分钟` 记录，
 * 因此这里按日聚合这些记录得到柱高，过程指标与注意力流向同样从记录聚合，不新增数据模型。
 * 参考稿的「主观专注感 1–5」「认知 / 知识卡」「小实验建议」在 Calmy 没有对应对象（TodayPlan.review
 * 是自由文本，不是量表），一律不显示、不编造。
 */
import { computed, ref, watch } from 'vue'
import { completeReview } from '@/application'
import { withSaveState } from '@/core/save-state'
import { useReferenceWorkspace } from '@/vue/composables/useReferenceWorkspace'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbPanel from '@/vue/liubai/LbPanel.vue'
import LbCollapsible from '@/vue/liubai/LbCollapsible.vue'
import LbStatGrid from '@/vue/liubai/LbStatGrid.vue'
import type { LbStat } from '@/vue/liubai/types'
import LbDateNav from '@/vue/liubai/LbDateNav.vue'
import { useModuleDate } from '@/vue/liubai/date-state'
import { focusEntries, hoursLabel, weekOf } from '@/vue/liubai/focus'

useOwnSlideHead()

const { actions, plans, records, loading, error, refresh } = useReferenceWorkspace()

const { value: date, isAll } = useModuleDate('review')

/* 今日复盘（四段反思 + 「主动放下」清单）。
 * 迁移时这一页只搬了"专注分布/过程指标"这些只读聚合，把 **唯一的复盘写入路径 completeReview 漏掉了**
 * （第 30 轮核对：全仓库只有旧 ReviewPage 调用它）——于是 TodayPlan.review 变成"读得到、写不进"。
 * 这里按旧页面的语义补回：completeReview 内部就是 todayAsyncRepository.update({review, letGo}, revision)，
 * 不新增存储、不改领域模型。 */
const form = ref({ observation: '', analysis: '', adjustment: '', seed: '' })
const letGoText = ref('')
const dirty = ref(false)
const savingReview = ref(false)
const plan = computed(() => plans.value.find(item => item.date === date.value))

watch(plan, value => {
  if (dirty.value) return
  const review = value?.review
  form.value = {
    observation: review?.observation || '',
    analysis: review?.analysis || '',
    adjustment: review?.adjustment || '',
    seed: review?.seed || ''
  }
  letGoText.value = (value?.letGo || []).join('\n')
}, { immediate: true })

function notify(message: string, kind: 'success' | 'error' = 'success') {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}
async function saveReview() {
  const current = plan.value
  if (!current || savingReview.value) return
  savingReview.value = true
  try {
    await withSaveState(() => completeReview({
      date: date.value,
      review: { ...form.value },
      letGo: letGoText.value.split('\n'),
      expectedRevision: current.revision
    }))
    dirty.value = false
    notify('今日复盘已保存')
    await refresh()
  } catch (cause) {
    notify(cause instanceof Error ? cause.message : '复盘保存失败，请重试', 'error')
    await refresh()
  } finally {
    savingReview.value = false
  }
}
const WEEK_CHARS = ['一', '二', '三', '四', '五', '六', '日']
const week = computed(() => weekOf(date.value))

const entries = computed(() => focusEntries(records.value))
const weekMinutes = computed(() => week.value.map(day => entries.value.filter(entry => entry.date === day).reduce((sum, entry) => sum + entry.minutes, 0)))
const weekTotal = computed(() => weekMinutes.value.reduce((sum, value) => sum + value, 0))
const maxMinutes = computed(() => Math.max(...weekMinutes.value, 1))
/** 全部模式：按周聚合所有专注记录（参考稿的全部分支也是列出每周合计） */
const allWeeks = computed(() => {
  const totals = new Map<string, number>()
  for (const entry of entries.value) {
    const key = weekOf(entry.date)[0]
    totals.set(key, (totals.get(key) || 0) + entry.minutes)
  }
  return [...totals.entries()]
    .map(([start, minutes]) => ({ start, minutes, week: weekOf(start) }))
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, 12)
})
const grandTotal = computed(() => entries.value.reduce((sum, entry) => sum + entry.minutes, 0))

const weekActions = computed(() => isAll.value ? actions.value : actions.value.filter(item => week.value.includes(item.date)))
const doneActions = computed(() => weekActions.value.filter(item => item.status === 'done'))
const weekRecords = computed(() => isAll.value
  ? records.value
  : records.value.filter(record => week.value.includes(focusDay(record.occurredAt))))
const activeDays = computed(() => weekMinutes.value.filter(value => value > 0).length)
const elapsedDays = computed(() => week.value.filter(day => day <= date.value).length)

function focusDay(at: number) {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const heading = computed(() => {
  return '回顾'
})
const chartNote = computed(() => {
  const total = isAll.value ? grandTotal.value : weekTotal.value
  return total ? `共 ${hoursLabel(total)} h` : ''
})

/** 注意力流向：本周专注分钟按行动聚合 */
const focusByAction = computed(() => {
  const totals = new Map<string, number>()
  for (const entry of entries.value) {
    if (!isAll.value && !week.value.includes(entry.date)) continue
    const key = entry.actionId || '未关联'
    totals.set(key, (totals.get(key) || 0) + entry.minutes)
  }
  return [...totals.entries()]
    .map(([id, minutes]) => ({ id, minutes, title: actions.value.find(item => item.calmyId === id)?.title || '未关联行动' }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 6)
})

const stats = computed<LbStat[]>(() => [
  { label: isAll.value ? '累计专注' : '本周专注', value: hoursLabel(isAll.value ? grandTotal.value : weekTotal.value), unit: ' h', accent: (isAll.value ? grandTotal.value : weekTotal.value) > 0 },
  { label: '完成行动', value: `${doneActions.value.length}/${weekActions.value.length}` },
  { label: '留下的记录', value: weekRecords.value.length, unit: ' 条' },
  isAll.value
    ? { label: '有记录的天数', value: new Set(entries.value.map(entry => entry.date)).size, unit: ' 天' }
    : { label: '活跃天数', value: `${activeDays.value}/${elapsedDays.value}`, unit: ' 天', bar: { pct: elapsedDays.value ? Math.round(activeDays.value / elapsedDays.value * 100) : 0 } }
])
</script>

<template>
  <header class="slide-head">
    <div class="head-main">
      <p class="hint">复盘</p>
      <div class="head-title-row">
        <h2>{{ heading }}</h2>
        <span class="info" tabindex="0" data-tip="柱高来自每天的真实专注记录（结束专注时写入），不是手填的时长。过程指标与注意力流向同样从记录与行动聚合。" aria-label="复盘说明">i</span>
      </div>
    </div>
    <LbDateNav module="review" kind="week" />
  </header>

  <p v-if="error" class="panel" role="alert" style="color:var(--danger)">
    {{ error }}
    <button class="act" type="button" @click="refresh">重试</button>
  </p>

  <LbPanel grow :title="isAll ? '逐周合计' : '专注分布'" :note="chartNote">
    <ul v-if="isAll" class="suggest">
      <li v-if="loading" class="dim">正在读取…</li>
      <li v-else-if="!allWeeks.length" class="dim">暂无专注记录。</li>
      <li v-for="item in allWeeks" :key="item.start">
        <b>{{ item.week[0].slice(5).replace('-', '/') }} – {{ item.week[6].slice(5).replace('-', '/') }}</b> —— 专注 {{ hoursLabel(item.minutes) }} 小时
      </li>
    </ul>
    <div v-else-if="weekTotal > 0" class="bars">
      <div
        v-for="(minutes, index) in weekMinutes"
        :key="week[index]"
        class="bar"
        :class="{ today: week[index] === date, future: week[index] > date }"
        :role="week[index] > date ? undefined : 'button'"
        :tabindex="week[index] > date ? -1 : 0"
        :aria-label="`${week[index]} 专注 ${hoursLabel(minutes)} 小时`"
      >
        <span class="val">{{ hoursLabel(minutes) }}h</span>
        <div class="fill" :style="{ height: `${Math.max(3, minutes / maxMinutes * 100)}%` }" />
        <span class="d">{{ WEEK_CHARS[index] }}</span>
      </div>
    </div>
    <p v-else-if="loading" class="review-empty">正在读取…</p>
    <p v-else class="review-empty">这一周还没有专注记录。去「注意力」开一段专注。</p>
    <p v-if="isAll ? allWeeks.length > 0 : weekTotal > 0" class="dim review-chart-note">
      {{ isAll ? `最近 ${allWeeks.length} 周` : '最长的一条在' + WEEK_CHARS[weekMinutes.indexOf(Math.max(...weekMinutes))] + '。' }}
    </p>
  </LbPanel>

  <LbPanel v-if="!isAll" title="今日复盘" :note="dirty ? '尚未保存' : (plan ? '已保存' : '尚未建立当天计划')">
    <div class="review-form">
      <label>观 · 今天实际发生了什么<textarea v-model="form.observation" aria-label="今日复盘：观，今天实际发生了什么" @input="dirty = true" /></label>
      <label>调 · 明天如何调整<textarea v-model="form.adjustment" aria-label="今日复盘：调，明天如何调整" @input="dirty = true" /></label>
      <details class="review-extra">
        <summary>补充思考 <span>可选</span></summary>
        <div class="review-extra-fields">
          <label>察 · 哪些条件影响了今天<textarea v-model="form.analysis" aria-label="今日复盘：察，哪些条件影响了今天" @input="dirty = true" /></label>
          <label>下一轮线索<textarea v-model="form.seed" aria-label="今日复盘：下一轮线索" @input="dirty = true" /></label>
          <label>无需继续 / 主动放下（一行一条）<textarea v-model="letGoText" aria-label="复盘中无需继续或主动放下的事项" @input="dirty = true" /></label>
        </div>
      </details>
      <div class="detail-chips">
        <button class="chip on" type="button" :disabled="savingReview || !plan" @click="saveReview">保存复盘</button>
        <small v-if="!plan" class="review-save-hint" role="status">当前日期还没有计划，创建当天行动后即可保存复盘。</small>
        <small v-else-if="savingReview" class="review-save-hint" role="status">正在保存…</small>
        <small v-else-if="!dirty" class="review-save-hint" role="status">填写上方内容后保存。</small>
      </div>
    </div>
  </LbPanel>

  <LbCollapsible v-if="weekActions.length || weekRecords.length || focusByAction.length" block="reviewMetrics" :rank="3">
    <div class="grid-2">
      <LbPanel title="过程指标">
        <LbStatGrid :stats="stats" />
      </LbPanel>
      <LbPanel title="注意力流向" :note="focusByAction.length ? `${focusByAction.length} 项` : '—'">
        <ul class="ov-list">
          <li v-if="!focusByAction.length" class="dim">这周还没有安排专注。</li>
          <li v-for="item in focusByAction" :key="item.id">
            <b>{{ item.title }}</b>
            <span class="right">{{ item.minutes }} 分</span>
          </li>
        </ul>
      </LbPanel>
    </div>
  </LbCollapsible>
</template>

<style scoped>
/* 复盘表单：五段文本框纵向排列，标题沿用参考稿的表单语言（小号 muted 标签 + 下划线输入）。 */
.review-form {
  display: grid;
  gap: 10px;
}
.review-empty { padding-block: 20px; color: var(--muted); font-size: .86rem; }
.review-chart-note { margin-top: 1em; font-size: .8rem; color: var(--muted); }
.review-form label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 0.72rem;
}
.review-extra {
  border-top: 1px solid var(--line);
  padding-top: 10px;
}
.review-extra summary {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--fg);
  font-size: .78rem;
  font-weight: 550;
  cursor: pointer;
}
.review-extra summary span { color: var(--muted); font-size: .7rem; font-weight: 400; }
.review-extra-fields { display: grid; gap: 10px; margin-top: 12px; }
.review-save-hint { align-self: center; color: var(--muted); font-size: .72rem; }
.review-form textarea {
  min-height: 62px;
  padding: 8px 10px;
  font: inherit;
  font-size: 0.82rem;
  line-height: 1.7;
  resize: vertical;
}
</style>
