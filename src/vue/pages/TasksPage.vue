<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { withSaveState } from '@/core/save-state'
import { todayKey } from '@/core/storage'
import { addActionToToday, openToday } from '@/application'
import { actionAsyncRepository } from '@/domain/action/repository'
import type { ActionItem, ActionStatus } from '@/domain/action/model'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
import { unifiedAsyncRepository, type Person } from '@/domain/unified'
import type { TodayPlan } from '@/domain/today/model'
import PersonReferencePicker from '@/vue/components/PersonReferencePicker.vue'
import { useActionStatusDictionary } from '@/vue/composables/useActionStatusDictionary'
import { usePersonStatusDictionary } from '@/vue/composables/usePersonStatusDictionary'

type TaskFilter = 'all' | ActionStatus
const { statuses: orderedStatuses, labelFor: statusLabel } = useActionStatusDictionary()
const { labelFor: personStatusLabel } = usePersonStatusDictionary()
const filterOptions = computed<Array<[TaskFilter, string]>>(() => [['all', '全部'], ...orderedStatuses.value.map(status => [status, statusLabel(status)] as [TaskFilter, string])])
const statusClassNames: Record<ActionStatus, string> = {
  planned: 'planned', in_progress: 'in-progress', done: 'done', skipped: 'skipped', cancelled: 'cancelled',
}
const router = useRouter()
const actions = ref<ActionItem[]>([])
const matters = ref<Matter[]>([])
const people = ref<Person[]>([])
const todayPlan = ref<TodayPlan>()
const filter = ref<TaskFilter>('all')
const title = ref('')
const date = ref(todayKey())
const matterId = ref('')
const personId = ref('')
const editingPersonActionId = ref('')
const personAssociationDraft = ref('')
const savingPersonAssociation = ref(false)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const activeMatters = computed(() => matters.value.filter(item => item.status !== 'archived'))
const matterOptions = computed(() => [{ value: '', label: '不关联课题' }, ...activeMatters.value.map(item => ({ value: item.calmyId, label: item.title }))])
const matterById = computed(() => new Map(matters.value.map(item => [item.calmyId, item])))
const personById = computed(() => new Map(people.value.map(item => [item.calmyId, item])))
const focusIds = computed(() => new Set(todayPlan.value?.focusActionIds || []))
const visibleActions = computed(() => actions.value
  .filter(item => filter.value === 'all' || item.status === filter.value)
  .slice().sort((a, b) => {
    if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1
    const byDate = actionDate(a) - actionDate(b)
    return byDate || b.updatedAt - a.updatedAt
  }))
const openCount = computed(() => actions.value.filter(item => item.status === 'planned' || item.status === 'in_progress').length)
const doneCount = computed(() => actions.value.filter(item => item.status === 'done').length)
const loadPillSegments = computed(() => [String(openCount.value), ' 个待处理 · ', String(doneCount.value), ' 个已完成'])

function toast(message: string, kind: 'success' | 'warning' | 'error' = 'success'): void {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}
function dateLabel(value: string): string {
  if (!value) return '未设置日期'
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
function actionDate(item: ActionItem): number {
  const timestamp = Date.parse(`${item.date}T00:00:00`)
  return Number.isNaN(timestamp) ? item.updatedAt : timestamp
}
async function refresh(planDate = date.value): Promise<void> {
  loading.value = true
  try {
    const [nextActions, opened, nextMatters, nextPeople] = await Promise.all([
      actionAsyncRepository.list(), openToday(planDate), matterAsyncRepository.list(), unifiedAsyncRepository.list<Person>('person'),
    ])
    actions.value = nextActions
    matters.value = nextMatters
    people.value = nextPeople
    todayPlan.value = opened.plan
    error.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '任务读取失败'
  } finally { loading.value = false }
}
onMounted(() => { void refresh() })
async function createTask(): Promise<void> {
  const taskTitle = title.value.trim()
  if (!taskTitle) { toast('请先写下任务名称', 'warning'); return }
  saving.value = true
  try {
    const plan = todayPlan.value || (await openToday(date.value)).plan
    await withSaveState(() => addActionToToday({ title: taskTitle, date: date.value, matterId: matterId.value || undefined, personId: personId.value || undefined, plan }))
    title.value = ''
    personId.value = ''
    await refresh(date.value)
    toast('任务已创建，并加入当天行动')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '任务创建失败', 'error') }
  finally { saving.value = false }
}
function editPersonAssociation(item: ActionItem): void {
  editingPersonActionId.value = item.calmyId
  personAssociationDraft.value = item.personId || ''
}
async function savePersonAssociation(item: ActionItem): Promise<void> {
  savingPersonAssociation.value = true
  try {
    await withSaveState(() => actionAsyncRepository.update(item.calmyId, { personId: personAssociationDraft.value || undefined }, { expectedRevision: item.revision }))
    editingPersonActionId.value = ''
    await refresh(date.value)
    toast(personAssociationDraft.value ? '人物关联已更新' : '人物关联已清除')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '人物关联更新失败', 'error') }
  finally { savingPersonAssociation.value = false }
}
async function changeDate(event: Event): Promise<void> {
  const nextDate = (event.target as HTMLInputElement).value
  date.value = nextDate
  await refresh(nextDate)
}
async function toggleTask(item: ActionItem): Promise<void> {
  saving.value = true
  try {
    await withSaveState(() => item.status === 'done'
      ? actionAsyncRepository.reopen(item.calmyId, item.revision)
      : actionAsyncRepository.complete(item.calmyId, undefined, item.revision))
    await refresh(date.value)
    toast(item.status === 'done' ? '任务已重新打开' : '任务已完成')
  } catch (cause) {
    toast(cause instanceof Error ? cause.message : '任务状态更新失败', 'error')
    await refresh(date.value)
  } finally { saving.value = false }
}
</script>

<template>
  <div class="tasks-page">
    <header class="page-head">
      <div><p class="eyebrow">任务 · 行动</p><h1 class="font-title">任务</h1><p>把任务落到具体行动；完成、重开和课题关联都会保留在统一领域数据里。</p></div>
      <div class="task-board-head-actions"><button class="app-button" type="button" @click="router.push('/app/task-board')">打开看板</button><span class="load-pill"><template v-for="(segment, index) in loadPillSegments" :key="index">{{ segment }}</template></span></div>
    </header>
    <section class="beryl-card matter-create">
      <div class="panel-head"><div><p class="eyebrow">QUICK ACTION</p><h2 class="font-title">添加一个下一步</h2></div><span>会同步加入所选日期的今天计划</span></div>
      <form class="create-row task-create-row" @submit.prevent="createTask">
        <input v-model="title" aria-label="任务名称" placeholder="下一步最具体的行动是什么？" :disabled="saving">
        <input aria-label="任务日期" type="date" :value="date" :disabled="saving" @change="changeDate">
        <select v-model="matterId" aria-label="关联处境" :disabled="saving">
          <option v-for="option in matterOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
        <PersonReferencePicker v-model="personId" :people="people" :disabled="saving || loading" @created="people = [...people, $event]" />
        <button class="primary" type="submit" :disabled="saving">{{ saving ? '保存中…' : '添加任务' }}</button>
      </form>
    </section>
    <section class="today-section">
      <div class="section-title"><h2 class="font-title">任务列表</h2><span>{{ loading ? '正在读取…' : `${visibleActions.length} 条` }}</span></div>
      <div class="range-tabs" role="tablist" aria-label="任务状态筛选"><button v-for="[value, label] in filterOptions" :key="value" type="button" :class="{ on: filter === value }" role="tab" :aria-selected="filter === value" @click="filter = value">{{ label }}</button></div>
      <section v-if="error" class="beryl-card empty-state" role="alert"><b>任务数据暂时无法读取</b><p>{{ error }}</p><button class="app-button" type="button" @click="refresh()">重试</button></section>
      <div v-if="loading" class="empty-state" role="status">正在读取任务…</div>
      <div v-else-if="visibleActions.length" class="action-list" aria-live="polite">
        <article v-for="item in visibleActions" :key="item.calmyId" class="action-card beryl-card" :class="{ focus: focusIds.has(item.calmyId) }">
          <button class="chk" :class="{ on: item.status === 'done' }" type="button" :aria-label="item.status === 'done' ? '重开任务' : '完成任务'" :disabled="saving" @click="toggleTask(item)">{{ item.status === 'done' ? '✓' : '' }}</button>
          <div style="flex: 1; min-width: 0"><h3 :class="{ done: item.status === 'done' }">{{ item.title }}</h3><small>{{ dateLabel(item.date) }} · {{ item.matterId && matterById.get(item.matterId) ? `课题：${matterById.get(item.matterId)?.title}` : '未关联课题' }} · {{ item.personId ? (personById.get(item.personId)?.displayName || '关联人物暂不可用') : '未关联人物' }}{{ item.personId && personById.get(item.personId)?.status === 'archived' ? ` · ${personStatusLabel('archived')}` : '' }}{{ focusIds.has(item.calmyId) ? ' · 今日焦点' : '' }}</small><small v-if="item.resultNote">结果：{{ item.resultNote }}</small><div v-if="editingPersonActionId === item.calmyId" class="person-association-edit"><PersonReferencePicker :model-value="personAssociationDraft" :people="people" :disabled="savingPersonAssociation" @update:model-value="personAssociationDraft = $event" @created="people = [...people, $event]" /><div class="person-association-actions"><button type="button" :disabled="savingPersonAssociation" @click="savePersonAssociation(item)">{{ savingPersonAssociation ? '保存中…' : '保存关联' }}</button><button type="button" :disabled="savingPersonAssociation" @click="editingPersonActionId = ''; personAssociationDraft = ''">取消</button></div></div></div>
          <span class="action-status" :class="statusClassNames[item.status]">{{ statusLabel(item.status) }}</span>
          <button v-if="item.matterId && matterById.get(item.matterId)" type="button" :aria-label="`打开课题 ${matterById.get(item.matterId)?.title}`" @click="router.push(`/app/matters/${item.matterId}`)">查看课题</button>
          <button v-if="editingPersonActionId !== item.calmyId" type="button" :disabled="saving || savingPersonAssociation" @click="editPersonAssociation(item)">{{ item.personId ? '更改人物' : '关联人物' }}</button>
          <button type="button" :disabled="saving" @click="toggleTask(item)">{{ item.status === 'done' ? '重开' : '完成' }}</button>
        </article>
      </div>
      <div v-else class="empty-state">当前筛选下没有任务，把一个现实事项拆成下一步吧。</div>
    </section>
  </div>
</template>

<style scoped>
.task-create-row { grid-template-columns: minmax(210px, 2fr) 170px minmax(150px, 1.2fr) minmax(180px, 1.3fr) auto; align-items: end; }
.person-association-edit { display: grid; grid-template-columns: minmax(180px, 1fr) auto; align-items: end; gap: 8px; padding-top: 8px; }
.person-association-actions { display: flex; gap: 6px; }
@media (max-width: 1000px) { .task-create-row { grid-template-columns: minmax(0, 1fr) minmax(160px, 1fr); } }
@media (max-width: 620px) { .task-create-row { grid-template-columns: 1fr; } .person-association-edit { grid-template-columns: 1fr; } }
</style>
