<script setup lang="ts">
/**
 * 任务（v11「留白」）—— section.slide[data-title="任务"] 的等价实现。
 * 结构：slide-head（hint + h2 + info） → .panel.grow/.tasks + .add-row → .collapsible[data-block=taskStats]/.stat-grid
 *
 * 数据映射（无新增字段）：
 *   ActionItem.title → .text        ActionItem.status → .done / 勾选框
 *   TodayPlan.focusActionIds → .is-focus / ◎    matterId → .tag（无标签字段则显示「其他」）
 * 参考稿的 tag / attn（高·中·低认知）在 ActionItem 上没有对应字段，故不显示、不编造。
 */
import { computed, onMounted, ref } from 'vue'
import { useReferenceWorkspace } from '@/vue/composables/useReferenceWorkspace'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbPanel from '@/vue/liubai/LbPanel.vue'
import LbCollapsible from '@/vue/liubai/LbCollapsible.vue'
import LbStatGrid from '@/vue/liubai/LbStatGrid.vue'
import LbDateNav from '@/vue/liubai/LbDateNav.vue'
import type { LbStat } from '@/vue/liubai/types'
import { useModuleDate } from '@/vue/liubai/date-state'
import { todayKey } from '@/core/storage'
import { readServerSession } from '@/core/auth'
import { withSaveState } from '@/core/save-state'
import { actionAsyncRepository } from '@/domain/action/repository'
import type { ActionItem } from '@/domain/action/model'
import { unifiedAsyncRepository, type Person } from '@/domain/unified'
import DomainPicker from '@/vue/components/DomainPicker.vue'
import ContextRelationPicker from '@/vue/components/ContextRelationPicker.vue'
import OwnershipEditor from '@/vue/components/OwnershipEditor.vue'

useOwnSlideHead()

const { actions, plans, matters, loading, saving, error, addTask, toggleTask, focusTask, cancelTask, refresh } = useReferenceWorkspace()

const { value: date, isAll } = useModuleDate('tasks')
const draft = ref('')
const draftDate = ref('')
const matterId = ref('')
/** 归档处境不出现在「关联处境」里（与旧页面一致） */
const activeMatters = computed(() => matters.value.filter(item => item.status !== 'archived'))
const targetDate = computed(() => draftDate.value || (isAll.value ? todayKey() : date.value))

/* 行动卡片上的三块编辑能力（旧页面有、v11 迁移时漏掉的）：
 * 所属领域 / 上下文关联 / 归属与可见范围 —— 直接复用既有组件，数据路径与旧页面完全一致。 */
const people = ref<Person[]>([])
const currentUserId = readServerSession()?.user.id
onMounted(async () => { people.value = await unifiedAsyncRepository.list<Person>('person') })
async function saveOwnership(item: ActionItem, ownership: ActionItem['ownership']): Promise<void> {
  await withSaveState(() => actionAsyncRepository.update(item.calmyId, { ownership }, { expectedRevision: item.revision }))
}

const dayActions = computed(() => isAll.value ? actions.value : actions.value.filter(item => item.date === date.value))
const doneActions = computed(() => dayActions.value.filter(item => item.status === 'done'))
const cancelled = computed(() => dayActions.value.filter(item => item.status === 'cancelled' || item.status === 'skipped'))
const focusIds = computed(() => isAll.value ? new Set<string>() : new Set(plans.value.find(item => item.date === date.value)?.focusActionIds || []))
const left = computed(() => dayActions.value.length - doneActions.value.length - cancelled.value.length)
const matterTitle = (matterId?: string) => matters.value.find(item => item.calmyId === matterId)?.title || ''

const heading = computed(() => {
  const total = dayActions.value.length
  const scope = isAll.value ? '全部' : '今天'
  if (!total) return isAll.value ? '还没有任务。' : '今天没有待办。'
  if (left.value <= 0) return `${scope}的待办做完了。`
  return `${scope} ${total} 件待办，还剩 ${left.value} 件。`
})

const rate = computed(() => dayActions.value.length ? Math.round(doneActions.value.length / dayActions.value.length * 100) : 0)
const stats = computed<LbStat[]>(() => [
  { label: '完成率', value: rate.value, unit: '%', accent: rate.value === 100 && dayActions.value.length > 0, bar: { pct: rate.value } },
  { label: '待办', value: left.value, unit: ' 件' },
  { label: '已完成', value: doneActions.value.length, unit: ' 件' },
  { label: '已取消 / 跳过', value: cancelled.value.length, unit: ' 件' }
])

async function submit() {
  const title = draft.value.trim()
  if (!title) return
  draft.value = ''
  await addTask(title, targetDate.value, matterId.value || undefined)
}
function onTaskComposerKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  void submit()
}
</script>

<template>
  <header class="slide-head">
    <div class="head-main">
      <p class="hint">任务</p>
      <div class="head-title-row">
        <h2>{{ heading }}</h2>
        <span class="info" tabindex="0" data-tip="勾选框标记完成，◎ 设为当前重点，✕ 取消。点任务文字设为重点。新增直接回车确认。" aria-label="任务说明">i</span>
      </div>
    </div>
    <LbDateNav module="tasks" />
  </header>

  <p v-if="error" class="panel" role="alert" style="color:var(--danger)">
    {{ error }}
    <button class="act" type="button" @click="refresh">重试</button>
  </p>

  <LbPanel grow title="任务清单" :note="saving ? '保存中…' : `${dayActions.length} 条`">
    <ul class="tasks">
      <li v-if="loading" class="empty">正在读取…</li>
      <li v-else-if="!dayActions.length" class="empty">从下方写下下一件想做的事。</li>
      <li
        v-for="item in dayActions"
        :key="item.calmyId"
        class="task"
        :class="{ done: item.status === 'done', 'is-focus': focusIds.has(item.calmyId) }"
      >
        <button
          class="box"
          type="button"
          :aria-pressed="item.status === 'done'"
          :aria-label="item.status === 'done' ? '标记未完成' : '标记完成'"
          :disabled="saving"
          @click="toggleTask(item)"
        ></button>
        <span class="focus-flag" aria-hidden="true"></span>
        <button class="text task-title-button" type="button" :aria-pressed="focusIds.has(item.calmyId)" :title="focusIds.has(item.calmyId) ? '当前重点' : '设为重点'" @click="focusTask(item)">{{ item.title }}</button>
        <span class="tag">{{ matterTitle(item.matterId) || '其他' }}</span>
        <div class="acts">
          <button
            class="act focus-btn"
            :class="{ on: focusIds.has(item.calmyId) }"
            :aria-label="focusIds.has(item.calmyId) ? '当前重点' : `设为当前重点：${item.title}`"
            :aria-pressed="focusIds.has(item.calmyId)"
            :disabled="saving || focusIds.has(item.calmyId)"
            :title="focusIds.has(item.calmyId) ? '当前重点' : '设为当前重点'"
            @click="focusTask(item)"
          >◎</button>
          <button class="act del" type="button" title="取消这项" :aria-label="`取消任务：${item.title}`" :disabled="saving" @click="cancelTask(item)">✕</button>
        </div>
        <details class="task-detail">
          <summary>领域 · 关联 · 归属</summary>
          <DomainPicker :entity-ref="{ entityType: 'action', calmyId: item.calmyId }" />
          <ContextRelationPicker :entity-ref="{ entityType: 'action', calmyId: item.calmyId }" :target-types="['person', 'space']" />
          <OwnershipEditor
            :ownership="item.ownership"
            :people="people"
            :current-user-id="currentUserId"
            :disabled="loading"
            @save="saveOwnership(item, $event)"
          />
        </details>
      </li>
    </ul>
    <div class="add-row">
      <input v-model="draft" class="add-input" maxlength="80" aria-label="任务名称" placeholder="添加任务，回车确认…" @keydown.enter="onTaskComposerKeydown">
      <input v-model="draftDate" class="add-date" type="date" aria-label="任务日期" :disabled="saving">
      <select v-model="matterId" class="add-matter" aria-label="关联处境" :disabled="saving">
        <option value="">不关联处境</option>
        <option v-for="matter in activeMatters" :key="matter.calmyId" :value="matter.calmyId">{{ matter.title }}</option>
      </select>
      <button class="chip on task-add-button" type="button" :disabled="saving || !draft.trim()" @click="submit">添加</button>
    </div>
  </LbPanel>

  <LbCollapsible v-if="dayActions.length" block="taskStats" :rank="3">
    <LbPanel title="任务统计">
      <LbStatGrid :stats="stats" />
    </LbPanel>
  </LbCollapsible>
</template>

<style scoped>
/* 参考稿的 `.add-row > .add-input` 样式在设计层；这里补「日期 + 关联处境」两个额外控件，
 * 以及每张卡片折叠起来的「领域 · 关联 · 归属」编辑区（旧页面有、迁移时漏掉的编辑能力）。 */
.add-date,
.add-matter {
  flex: 0 1 auto;
  padding: 6px 8px;
  font-size: 0.75rem;
}
.add-matter { min-width: 8em; }
.task-title-button {
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 550;
  text-align: left;
  cursor: pointer;
}
.task-title-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 680px) {
  .add-row { flex-wrap: wrap; align-items: stretch; }
  .add-row .add-input { width: 100%; flex: 1 1 100%; box-sizing: border-box; }
  .add-row .add-date, .add-row .add-matter { min-width: 0; flex: 1 1 calc(50% - 5px); box-sizing: border-box; }
  .add-row .task-add-button { min-height: 40px; flex: 1 1 100%; }
}
.task-detail {
  flex: 1 0 100%;
  margin-top: 6px;
}
.task-detail > summary {
  cursor: pointer;
  color: var(--muted);
  font-size: 0.7rem;
}
.task-detail > *:not(summary) {
  margin-top: 8px;
}
</style>
