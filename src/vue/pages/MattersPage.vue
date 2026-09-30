<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { withSaveState } from '@/core/save-state'
import { boundField, fieldValue, relationIds, valueText } from '@/core/feishu/model'
import type { FeishuRecord, FeishuTableKey } from '@/core/api/feishu'
import { watchFeishuWorkspace, type WorkspaceSnapshot } from '@/core/feishu/workspace'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
import { feishuWorkspace } from '@/domain/feishu/workspace-instance'
import { useMatterStatusDictionary } from '@/vue/composables/useMatterStatusDictionary'
import CalmySelect from '@/vue/components/CalmySelect.vue'

const trajectoryLabels: Record<Matter['trajectory'], string> = { advancing: '推进', stable: '稳定', stalled: '停滞', retreating: '回退', diverging: '绕路', lost: '失去连接', recovering: '恢复', restarting: '重启', unknown: '未知' }
const { statuses: orderedMatterStatuses, labelFor: matterStatusLabel } = useMatterStatusDictionary()
const sourceKey = 'calmy:workspace:source'
const sourceEvent = 'calmy-workspace-source'
const readSource = (): 'local' | 'feishu' => {
  try { return localStorage.getItem(sourceKey) === 'feishu' ? 'feishu' : 'local' } catch { return 'local' }
}
const source = ref<'local' | 'feishu'>(readSource())
const sourceError = ref('')
const listError = ref('')
const list = ref<Matter[]>([])
const title = ref('')
const why = ref('')
const problemFields = ref({ problem: '', desiredChange: '', progressEvidence: '', currentGap: '', nextTest: '', stopCondition: '' })
const showProblemFields = ref(false)
const filter = ref('all')
const loading = ref(true)
const snapshot = ref<WorkspaceSnapshot>(feishuWorkspace.getSnapshot())
const projectQuery = ref('')
const expandedProject = ref('')
const taskStatusErrors = ref<Record<string, string>>({})
let stopFeishuWatch: (() => void) | undefined
let unsubscribeFeishu: (() => void) | undefined

const visibleMatters = computed(() => list.value.filter(item => filter.value === 'all' || item.status === filter.value))
const filterOptions = computed(() => [
  { value: 'all', label: '全部' },
  ...orderedMatterStatuses.value.map(status => ({ value: status, label: matterStatusLabel(status) })),
])
const trajectoryOptions = Object.entries(trajectoryLabels).map(([value, label]) => ({ value, label }))
const projectRecords = computed(() => {
  const query = projectQuery.value.trim().toLowerCase()
  return snapshot.value.tables.projects.filter(record => !query || projectTitle(record).toLowerCase().includes(query))
})
function taskStatusChoices(record: FeishuRecord): string[] {
  const status = feishuLabel('tasks', record, 'status') || '未设置'
  const statusField = boundField(snapshot.value.fields.tasks || [], snapshot.value.bindings.tasks || {}, 'status')
  const options = statusField?.type === 3 ? statusField.property?.options?.map(item => item.name) || [] : []
  return [...new Set([status, ...options])]
}
function taskStatusOptions(record: FeishuRecord) {
  const statusField = boundField(snapshot.value.fields.tasks || [], snapshot.value.bindings.tasks || {}, 'status')
  const available = statusField?.type === 3 ? statusField.property?.options?.map(item => item.name) || [] : []
  return taskStatusChoices(record).map(value => ({ value, label: value, disabled: !available.includes(value) }))
}
function taskStatusDisabled(): boolean {
  const statusField = boundField(snapshot.value.fields.tasks || [], snapshot.value.bindings.tasks || {}, 'status')
  const options = statusField?.type === 3 ? statusField.property?.options?.map(item => item.name) || [] : []
  return !snapshot.value.ready || snapshot.value.saving || !options.length
}

type ProblemDrivenField = keyof typeof problemFields.value
function notify(message: string, kind: 'success' | 'warning' | 'error' = 'success'): void {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}
function emitSourceChange(): void {
  window.dispatchEvent(new Event(sourceEvent))
}
function chooseSource(value: 'local' | 'feishu'): void {
  try {
    localStorage.setItem(sourceKey, value)
    source.value = value
    emitSourceChange()
    sourceError.value = ''
  } catch {
    sourceError.value = '浏览器无法保存来源选择，请允许网站存储。'
  }
}
function syncSource(): void {
  source.value = readSource()
}
function syncFeishuSnapshot(): void {
  snapshot.value = feishuWorkspace.getSnapshot()
}
function startFeishuWatch(active: boolean): void {
  stopFeishuWatch?.()
  stopFeishuWatch = undefined
  if (active) stopFeishuWatch = watchFeishuWorkspace(feishuWorkspace)
}

async function refresh(): Promise<void> {
  loading.value = true
  try {
    list.value = await matterAsyncRepository.list()
    listError.value = ''
  } catch (cause) {
    listError.value = cause instanceof Error ? cause.message : '处境列表读取失败'
  } finally {
    loading.value = false
  }
}

async function create(): Promise<void> {
  if (!title.value.trim()) {
    notify('先写下处境名称', 'warning')
    return
  }
  try {
    await withSaveState(() => matterAsyncRepository.create({ title: title.value, why: why.value, ...problemFields.value }))
    title.value = ''
    why.value = ''
    problemFields.value = { problem: '', desiredChange: '', progressEvidence: '', currentGap: '', nextTest: '', stopCondition: '' }
    showProblemFields.value = false
    await refresh()
    notify('处境已创建')
  } catch (cause) {
    notify(cause instanceof Error ? cause.message : '创建处境失败', 'error')
  }
}

async function toggle(item: Matter): Promise<void> {
  const next = item.status === 'active' ? 'paused' : item.status === 'paused' ? 'active' : item.status === 'archived' ? 'paused' : 'active'
  try {
    await withSaveState(() => matterAsyncRepository.transition(item.calmyId, next, { expectedRevision: item.revision }))
    await refresh()
    notify(next === 'active' ? '处境已恢复' : '处境已暂停')
  } catch (cause) {
    notify(cause instanceof Error ? cause.message : '状态更新失败', 'error')
    await refresh()
  }
}

async function archive(item: Matter): Promise<void> {
  try {
    await withSaveState(() => matterAsyncRepository.archive(item.calmyId, { expectedRevision: item.revision }))
    await refresh()
    notify('处境已结束并归档，不代表失败')
  } catch (cause) {
    notify(cause instanceof Error ? cause.message : '结束处境失败', 'error')
    await refresh()
  }
}

async function changeTrajectory(item: Matter, trajectory: Matter['trajectory']): Promise<void> {
  if (trajectory === item.trajectory) return
  try {
    await withSaveState(() => matterAsyncRepository.update(item.calmyId, { trajectory }, { expectedRevision: item.revision }))
    await refresh()
    notify('趋势判断已更新')
  } catch (cause) {
    notify(cause instanceof Error ? cause.message : '趋势更新失败', 'error')
    await refresh()
  }
}

function matterField(key: ProblemDrivenField, value: string): void {
  problemFields.value = { ...problemFields.value, [key]: value }
}

function feishuValue(table: FeishuTableKey, record: FeishuRecord, role: 'title' | 'status' | 'project' | 'due' | 'owner' | 'body' | 'progress' | 'count'): unknown {
  return fieldValue(record, snapshot.value.fields[table] || [], snapshot.value.bindings[table] || {}, role)
}
function feishuLabel(table: FeishuTableKey, record: FeishuRecord, role: 'title' | 'status' | 'project' | 'due' | 'owner' | 'body' | 'progress' | 'count'): string {
  const raw = feishuValue(table, record, role)
  const target = role === 'project' ? 'projects' : table === 'tasks' && role === 'owner' ? 'members' : null
  if (target) {
    const names = relationIds(raw).map(id => {
      const item = snapshot.value.tables[target].find(candidate => candidate.record_id === id)
      return item ? valueText(feishuValue(target, item, 'title')) || id : id
    })
    if (names.length) return names.join('、')
  }
  return valueText(raw)
}
function projectTitle(record: FeishuRecord): string {
  return feishuLabel('projects', record, 'title') || '标题字段未识别'
}
function dateLabel(raw: unknown): string {
  if (raw == null || raw === '') return '无截止日期'
  const text = valueText(raw)
  const date = new Date(/^\d+$/.test(text) ? Number(text) : text)
  return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString('zh-CN')
}
function relatedTasks(record: FeishuRecord): FeishuRecord[] {
  return snapshot.value.tables.tasks.filter(task => relationIds(feishuValue('tasks', task, 'project')).includes(record.record_id))
}
function feishuReadStatus(): string {
  const current = snapshot.value
  const cacheTime = current.cacheUpdatedAt ? new Date(current.cacheUpdatedAt).toLocaleString('zh-CN') : ''
  return current.saving ? '正在写入飞书…'
    : current.loading ? cacheTime ? `正在检查更新 · 当前显示 ${cacheTime} 的本机缓存` : '正在连接飞书并读取数据…'
      : current.error ? cacheTime ? `飞书暂不可用 · 当前显示 ${cacheTime} 的本机缓存（只读）` : '飞书未连接，尚无本机缓存'
        : current.usingCache && cacheTime ? `部分数据来自本机缓存 · ${cacheTime}`
          : current.lastRead ? `上次读取 ${new Date(current.lastRead).toLocaleTimeString('zh-CN')}` : '尚未读取飞书数据'
}
async function changeFeishuTaskStatus(record: FeishuRecord, value: string): Promise<void> {
  taskStatusErrors.value = { ...taskStatusErrors.value, [record.record_id]: '' }
  try {
    await feishuWorkspace.changeStatus(record.record_id, value)
  } catch (cause) {
    taskStatusErrors.value = { ...taskStatusErrors.value, [record.record_id]: cause instanceof Error ? cause.message : '保存失败' }
  }
}

watch(source, (value, previous) => {
  startFeishuWatch(value === 'feishu')
  if (value === 'local') void refresh()
  else if (previous === 'local') {
    list.value = []
    title.value = ''
    why.value = ''
    problemFields.value = { problem: '', desiredChange: '', progressEvidence: '', currentGap: '', nextTest: '', stopCondition: '' }
    showProblemFields.value = false
    filter.value = 'all'
    listError.value = ''
  }
  if (value === 'local') {
    projectQuery.value = ''
    expandedProject.value = ''
  }
})
onMounted(() => {
  if (source.value === 'local') void refresh()
  unsubscribeFeishu = feishuWorkspace.subscribe(syncFeishuSnapshot)
  syncFeishuSnapshot()
  window.addEventListener(sourceEvent, syncSource)
  window.addEventListener('storage', syncSource)
  startFeishuWatch(source.value === 'feishu')
})
onUnmounted(() => {
  stopFeishuWatch?.()
  unsubscribeFeishu?.()
  window.removeEventListener(sourceEvent, syncSource)
  window.removeEventListener('storage', syncSource)
})
</script>

<template>
  <div>
    <section class="beryl-card workspace-source" aria-label="数据来源">
      <div><b>数据来源</b><div class="range-tabs" role="group" aria-label="选择数据来源">
        <button type="button" :aria-pressed="source === 'local'" :class="{ on: source === 'local' }" :disabled="snapshot.saving" @click="chooseSource('local')">本地</button>
        <button type="button" :aria-pressed="source === 'feishu'" :class="{ on: source === 'feishu' }" :disabled="snapshot.saving" @click="chooseSource('feishu')">飞书</button>
      </div></div>
      <small>{{ source === 'feishu' ? '任务直接保存在飞书；前台每 15 秒检查更新。' : '保留原有本机数据；切换来源不会迁移或删除数据。' }}</small>
      <RouterLink to="/app/admin">连接设置 →</RouterLink><RouterLink to="/app/feishu">飞书 →</RouterLink>
      <p v-if="sourceError" role="alert">{{ sourceError }}</p>
    </section>

    <div v-if="source === 'local'" class="matters-page">
      <header class="page-head">
        <div><p class="eyebrow">处境 · 正在面对</p><h1 class="font-title">处境</h1><p>记录持续影响你的现实问题，并写下想看到的变化。</p></div>
        <select v-model="filter" aria-label="处境筛选"><option v-for="option in filterOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select>
      </header>

      <section v-if="listError" class="beryl-card empty-state" role="alert"><b>处境列表暂时无法读取</b><p>{{ listError }}</p><button class="app-button" type="button" @click="refresh">重试</button></section>

      <section class="matter-create beryl-card">
        <input v-model="title" aria-label="新处境名称" placeholder="例如：建立稳定的工作节奏" />
        <textarea v-model="why" aria-label="处境为什么重要" placeholder="它为什么值得被持续面对？" />
        <details :open="showProblemFields" @toggle="showProblemFields = ($event.currentTarget as HTMLDetailsElement).open">
          <summary>如果这是一个学习问题，补充解决闭环（可选）</summary>
          <p class="field-hint">先写问题，再决定最小必要的学习；没有现实问题时，不需要为了“自律”制造学习。</p>
          <div class="problem-driven-fields">
            <textarea :value="problemFields.problem" aria-label="现实问题" placeholder="我正在解决什么现实问题？" @input="matterField('problem', ($event.target as HTMLTextAreaElement).value)" />
            <textarea :value="problemFields.desiredChange" aria-label="期望变化" placeholder="我希望现实发生什么变化？" @input="matterField('desiredChange', ($event.target as HTMLTextAreaElement).value)" />
            <textarea :value="problemFields.progressEvidence" aria-label="进展证据" placeholder="什么证据说明正在变好？" @input="matterField('progressEvidence', ($event.target as HTMLTextAreaElement).value)" />
            <textarea :value="problemFields.currentGap" aria-label="当前缺口" placeholder="现在卡在哪里？" @input="matterField('currentGap', ($event.target as HTMLTextAreaElement).value)" />
            <textarea :value="problemFields.nextTest" aria-label="下一次验证" placeholder="学完或想明白后，下一次要马上试什么？" @input="matterField('nextTest', ($event.target as HTMLTextAreaElement).value)" />
            <textarea :value="problemFields.stopCondition" aria-label="停止条件" placeholder="什么情况下可以停止、换方法或停止学习？" @input="matterField('stopCondition', ($event.target as HTMLTextAreaElement).value)" />
          </div>
        </details>
        <button class="app-button primary" type="button" :disabled="loading" @click="create">创建处境</button>
      </section>

      <div class="matter-grid">
        <div v-if="loading" class="empty-state" role="status">正在读取处境…</div>
        <article v-for="item in visibleMatters" :key="item.calmyId" class="matter-card beryl-card">
          <div class="matter-card-head"><span :class="['matter-status', item.status]">{{ matterStatusLabel(item.status) }}</span><div class="matter-card-actions"><button class="app-button" type="button" :aria-label="`${item.title}状态切换`" @click="toggle(item)">{{ item.status === 'active' ? '暂停' : '恢复' }}</button><button v-if="item.status !== 'archived'" class="app-button" type="button" @click="archive(item)">结束</button></div></div>
          <h2 class="font-title">{{ item.title }}</h2><p>{{ item.why || '还没有写下为什么重要。' }}</p>
          <section v-if="item.problem" class="problem-driven-summary"><b>当前要解决的问题</b><p>{{ item.problem }}</p><template v-if="item.desiredChange"><b>期望变化</b><p>{{ item.desiredChange }}</p></template><template v-if="item.currentGap"><b>当前缺口</b><p>{{ item.currentGap }}</p></template><template v-if="item.nextTest"><b>下一次验证</b><p>{{ item.nextTest }}</p></template><template v-if="item.stopCondition"><b>停止条件</b><p>{{ item.stopCondition }}</p></template></section>
          <div class="matter-card-trend"><span>阶段：{{ item.currentStage }}</span><label><span class="matter-trajectory-label">趋势</span><select :aria-label="`${item.title}趋势`" :value="item.trajectory" class="matter-trajectory-select" @change="changeTrajectory(item, ($event.target as HTMLSelectElement).value as Matter['trajectory'])"><option v-for="option in trajectoryOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label></div>
        </article>
        <div v-if="!loading && !visibleMatters.length" class="empty-state">还没有匹配的处境。</div>
      </div>
    </div>

    <div v-else class="feishu-page">
      <header class="page-head"><div><p class="eyebrow">飞书 · 工作区</p><h1 class="font-title">项目</h1><p>与记录、今天共用飞书数据。项目、周报和成员只读；任务可新增、修改状态。</p></div></header>
      <section class="feishu-read-state" aria-label="飞书连接状态"><span role="status">{{ feishuReadStatus() }}</span><button class="app-button" type="button" :disabled="snapshot.loading || snapshot.saving" @click="feishuWorkspace.refresh()">刷新</button></section>
      <section v-if="snapshot.error" class="beryl-card empty-state" role="alert"><b>飞书连接暂不可用</b><p>{{ snapshot.error }}</p><small>{{ snapshot.cacheUpdatedAt ? `下方内容来自本机缓存，更新时间：${new Date(snapshot.cacheUpdatedAt).toLocaleString('zh-CN')}。当前只能查看，不能修改飞书数据。` : '没有可显示的本机缓存；连接恢复后可重新读取飞书数据。' }}</small><p><RouterLink to="/app/admin">检查 Worker 地址与同步密码</RouterLink></p></section>
      <p v-if="snapshot.writeError" class="beryl-card feishu-message" role="alert">{{ snapshot.writeError }}</p>
      <section class="beryl-card feishu-overview"><div class="range-tabs" role="tablist" aria-label="飞书数据表"><button type="button" role="tab" aria-selected="true" class="on">项目 {{ snapshot.tables.projects.length }}</button></div></section>
      <input v-model="projectQuery" class="feishu-search" aria-label="搜索飞书数据" placeholder="搜索…" />
      <p v-if="snapshot.tableErrors.projects" role="alert">项目：{{ snapshot.tableErrors.projects }}。已读数据仅供参考。</p>
      <section class="feishu-record-grid" aria-label="飞书项目列表">
        <article v-for="record in projectRecords" :key="record.record_id" class="beryl-card feishu-record-card">
          <small>{{ feishuLabel('projects', record, 'status') || '未设置状态' }}</small><h2>{{ projectTitle(record) }}</h2><p>{{ feishuLabel('projects', record, 'body') || '未填写目标' }}</p>
          <small>截止：{{ dateLabel(feishuValue('projects', record, 'due')) }}</small>
          <p>飞书完成度：{{ feishuLabel('projects', record, 'progress') || '—' }} · 已读取 {{ relatedTasks(record).length }} 项关联任务</p>
          <button class="app-button" type="button" :aria-expanded="expandedProject === record.record_id" @click="expandedProject = expandedProject === record.record_id ? '' : record.record_id">查看关联任务</button>
          <div v-if="expandedProject === record.record_id" class="feishu-project-tasks">
            <article v-for="task in relatedTasks(record)" :key="task.record_id" class="task-board-card beryl-card">
              <div class="task-board-card-top"><span :class="['action-status', feishuLabel('tasks', task, 'status') === '已完成' ? 'done' : feishuLabel('tasks', task, 'status') === '进行中' ? 'in_progress' : 'planned']">{{ feishuLabel('tasks', task, 'status') || '未设置' }}</span><span>飞书</span></div>
              <h3>{{ feishuLabel('tasks', task, 'title') || '标题字段未识别' }}</h3>
              <small>{{ feishuLabel('tasks', task, 'project') || '未关联项目' }} · {{ dateLabel(feishuValue('tasks', task, 'due')) }}</small>
              <small v-if="feishuLabel('tasks', task, 'owner')">执行人：{{ feishuLabel('tasks', task, 'owner') }}</small>
              <details v-if="feishuLabel('tasks', task, 'body')"><summary>已有解决方案</summary><p>{{ feishuLabel('tasks', task, 'body') }}</p></details>
              <label>状态<CalmySelect :id="`matter-feishu-status-${task.record_id}`" :ariaLabel="`${feishuLabel('tasks', task, 'title') || '未命名'}状态`" :model-value="feishuLabel('tasks', task, 'status') || '未设置'" :options="taskStatusOptions(task)" :disabled="taskStatusDisabled()" @change="changeFeishuTaskStatus(task, $event)" /></label>
              <small v-if="taskStatusErrors[task.record_id]" role="alert">{{ taskStatusErrors[task.record_id] }}</small>
            </article>
            <p v-if="!relatedTasks(record).length">当前视图没有关联任务。</p>
          </div>
        </article>
        <p v-if="!projectRecords.length">尚无匹配项目。</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.matter-card-trend label {
  width: auto;
  min-width: max-content;
}

@media (max-width: 520px) {
  .matter-card-trend label .matter-trajectory-label {
    display: inline;
    flex: 0 0 auto;
    width: auto;
    white-space: nowrap;
    line-height: normal;
  }
}
</style>
