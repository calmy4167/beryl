<script setup lang="ts">
/**
 * 总览（v11「留白」）—— 迁移模板页。
 *
 * 结构取自参考稿 section.slide[data-title="总览"]：
 *   header.slide-head（hint + h1 带 <em> 计数）
 *   .panel.grow + .ov-list（当日重点）
 *   .collapsible[data-block=stats] + .stat-grid（当日数据）
 *   .collapsible[data-block=records] + .ov-list（今天的记录）
 *
 * 数据全部来自既有 Repository（useReferenceWorkspace），不新增存储、不复制领域对象。
 * 参考稿有、Calmy 没有真实来源的部分（注意力预算 / 保护级别 / 专注块时刻）不在这里编造。
 */
import { computed, ref } from 'vue'
import { useReferenceWorkspace } from '@/vue/composables/useReferenceWorkspace'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbPanel from '@/vue/liubai/LbPanel.vue'
import LbCollapsible from '@/vue/liubai/LbCollapsible.vue'
import LbStatGrid from '@/vue/liubai/LbStatGrid.vue'
import LbDateNav from '@/vue/liubai/LbDateNav.vue'
import type { LbStat } from '@/vue/liubai/types'
import { useModuleDate } from '@/vue/liubai/date-state'
import { todayKey } from '@/core/storage'

useOwnSlideHead()

const { actions, plans, habits, records, inbox, matters, loading, saving, error, addTask, toggleTask, focusTask, refresh } = useReferenceWorkspace()

const { value: date, isAll } = useModuleDate('today')

/* 快速新增行动：参考稿在面板底部放 `.add-row > .add-input`（+ 一个短标签位）。
 * Calmy 没有"标签"对象，第二个位置放"关联处境"（matters 的真实对象），不编造标签字段。
 * 新增走 useReferenceWorkspace.addTask（= 写 ActionItem + 进 TodayPlan），不新增存储。 */
const draft = ref('')
const matterId = ref('')
const targetDate = computed(() => (isAll.value ? todayKey() : date.value))
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

function pad(value: number) { return String(value).padStart(2, '0') }
function dayKey(at: number) {
  const d = new Date(at)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function timeOf(at: number) {
  const d = new Date(at)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const todayActions = computed(() => isAll.value ? actions.value : actions.value.filter(item => item.date === date.value))
const openActions = computed(() => todayActions.value.filter(item => item.status !== 'done' && item.status !== 'cancelled' && item.status !== 'skipped'))
const doneActions = computed(() => todayActions.value.filter(item => item.status === 'done'))
/** 当日计划里的重点行动；参考稿的「当前专注」在 Calmy 里就是 TodayPlan.focusActionIds */
const focusIds = computed(() => isAll.value ? new Set<string>() : new Set(plans.value.find(item => item.date === date.value)?.focusActionIds || []))
const habitsDone = computed(() => habits.value.filter(habit => isAll.value ? habit.dates.length > 0 : habit.dates.includes(date.value)).length)
const pendingHabits = computed(() => isAll.value ? [] : habits.value.filter(habit => !habit.dates.includes(date.value)))
const todayRecords = computed(() => isAll.value ? records.value : records.value.filter(record => dayKey(record.occurredAt) === date.value))
const matterTitle = (matterId?: string) => matters.value.find(item => item.calmyId === matterId)?.title || ''

const left = computed(() => openActions.value.length)
const total = computed(() => todayActions.value.length)
const focusRows = computed(() => openActions.value.slice(0, 5))

const heading = computed(() => {
  if (isAll.value) return '全部'
  const [, month, day] = date.value.split('-')
  const weekday = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][new Date(`${date.value}T00:00:00`).getDay()]
  return `${Number(month)}月${Number(day)}日 · ${weekday}`
})

const stats = computed<LbStat[]>(() => [
  {
    label: '当日任务',
    value: `${doneActions.value.length}/${total.value}`,
    sub: total.value === 0 ? '这一天没有待办' : left.value === 0 ? '全部完成' : `还剩 ${left.value} 件`,
    accent: left.value === 0 && total.value > 0
  },
  {
    label: '习惯打卡',
    value: `${habitsDone.value}/${habits.value.length}`,
    sub: habits.value.length ? (pendingHabits.value.length ? `${pendingHabits.value.length} 个未打卡` : '今天全部打卡') : '还没有习惯'
  },
  { label: '今天留下', value: todayRecords.value.length, unit: ' 条' },
  { label: '收集箱', value: inbox.value.length, unit: ' 条', sub: inbox.value.length ? '待处理原文' : '空的' }
])

const listNote = computed(() => {
  if (saving.value) return '保存中…'
  if (!total.value) return ''
  if (!left.value) return '清空'
  return `还剩 ${left.value} 件`
})
</script>

<template>
  <div class="today-home">
  <header class="slide-head">
    <div class="head-main">
      <p class="hint">{{ heading }}</p>
      <div class="head-title-row">
        <h1>{{ isAll ? '全部行动' : date === todayKey() ? '今天' : '当天行动' }}</h1>
        <span class="info" tabindex="0" data-tip="当日重点按未完成事项排列。点标题设为重点，点右侧「完成」结束它。统计卡可用 H 键收起。" aria-label="总览说明">i</span>
      </div>
    </div>
    <LbDateNav module="today" />
  </header>

  <p v-if="error" class="panel" role="alert" style="color:var(--danger)">
    {{ error }}
    <button class="act" type="button" @click="refresh">重试</button>
  </p>

  <LbPanel grow title="当日重点" :note="listNote">
    <p v-if="loading" class="dim" style="padding:1em 0;color:var(--muted);font-size:.85rem">正在读取…</p>
    <ul v-else class="ov-list">
      <li v-if="!focusRows.length && !pendingHabits.length" class="dim">这一天没有待办。</li>
      <li
        v-for="item in focusRows"
        :key="item.calmyId"
        :class="{ cog: focusIds.has(item.calmyId) }"
      >
        <button class="focus-task-title" type="button" :aria-pressed="focusIds.has(item.calmyId)" :aria-label="`${focusIds.has(item.calmyId) ? '当前重点' : '设为重点'}：${item.title}`" :title="focusIds.has(item.calmyId) ? '当前重点' : '设为重点'" :disabled="saving" @click="focusTask(item)">{{ item.title }}</button>
        <span v-if="matterTitle(item.matterId)" class="right">{{ matterTitle(item.matterId) }}</span>
        <button
          class="right action-complete"
          type="button"
          title="标记完成"
          :disabled="saving"
          @click.stop="toggleTask(item)"
        >完成</button>
      </li>
      <li v-for="habit in pendingHabits" :key="habit.id" class="dim">
        <b>习惯 · {{ habit.name }} 未打卡</b>
      </li>
    </ul>
    <div class="add-row">
      <input
        class="add-input"
        :value="draft"
        :disabled="saving"
        maxlength="80"
        placeholder="添加任务，回车确认…"
        aria-label="新增现实行动"
        @input="draft = ($event.target as HTMLInputElement).value"
        @keydown.enter="onTaskComposerKeydown"
      >
      <select
        class="add-matter"
        aria-label="行动关联事项"
        :disabled="saving"
        :value="matterId"
        @change="matterId = ($event.target as HTMLSelectElement).value"
      >
        <option value="">不关联事项</option>
        <option v-for="matter in matters" :key="matter.calmyId" :value="matter.calmyId">{{ matter.title }}</option>
      </select>
      <button class="chip on today-add-button" type="button" :disabled="saving || !draft.trim()" @click="submitTask">添加</button>
    </div>
  </LbPanel>

  <LbCollapsible v-if="total || habits.length || todayRecords.length || inbox.length" block="stats" :rank="2">
    <LbPanel title="当日数据">
      <LbStatGrid :stats="stats" />
    </LbPanel>
  </LbCollapsible>

  <LbCollapsible v-if="todayRecords.length" block="records" :rank="3">
    <LbPanel title="今天的记录" :note="todayRecords.length ? `${todayRecords.length} 条` : '—'">
      <ul class="ov-list">
        <li v-if="!todayRecords.length" class="dim">还没有留下记录。</li>
        <li v-for="record in todayRecords.slice(0, 6)" :key="record.calmyId">
          <b>{{ record.body }}</b>
          <span class="right">{{ timeOf(record.occurredAt) }}</span>
        </li>
      </ul>
    </LbPanel>
  </LbCollapsible>
  </div>
</template>

<style scoped>
/* 参考稿的 `.add-row > .add-input`（+ 短输入位）样式在 liubai-v11.css 里；这里只补
 * 第二个位置：Calmy 用「关联处境」下拉代替参考稿的标签输入，需要给个能放下中文标题的宽度。 */
.add-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.add-matter {
  flex: 0 1 12em;
  min-width: 8em;
  padding: 6px 8px;
  font-size: 0.75rem;
}
.focus-task-title {
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.focus-task-title:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.action-complete {
  border: 0;
  background: transparent;
  color: var(--accent);
  font: inherit;
  cursor: pointer;
}
</style>
