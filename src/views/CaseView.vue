<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import ContentEditor from '@/components/content/ContentEditor.vue'
import { caseRelationRepository, caseRepository } from '@/domain/case/repository'
import { CASE_PHASES, PHASE_META, STATUS_LABEL, type CasePhase, type CaseStatus, type CaseRelation } from '@/domain/case/model'
import { createCollectionRepository, createEntityId } from '@/core/repository'
import { fmtDate } from '@/core/storage'

type Task = { id: string; title: string; priority: string; date: string; done: boolean }
type Person = { id: string; name: string; title: string }
type Diary = { date: string; content: string }
type Finance = { id: string; category: string; note: string; amount: number; type: string }
type Post = { id: string; title: string; content: string }
const route = useRoute(); const router = useRouter(); const tick = ref(0)
const item = computed(() => { void tick.value; return caseRepository.find(String(route.params.id)) })
const activePhase = ref<CasePhase>(item.value?.currentPhase || 'wood')
const tasks = createCollectionRepository<Task>('tasks')
const people = createCollectionRepository<Person>('chars')
const diaries = createCollectionRepository<Diary>('diary', row => row.date)
const finance = createCollectionRepository<Finance>('finance')
const posts = createCollectionRepository<Post>('posts')
const taskTitle = ref(''); const selectedTask = ref('')
const relationType = ref<CaseRelation['targetType']>('person'); const relationId = ref('')
const decision = ref({ title: '', options: '', conclusion: '' }); const review = ref(''); const nextTitle = ref('')
const deadlineValue = computed({
  get: () => item.value?.deadline ? new Date(item.value.deadline).toISOString().slice(0, 10) : '',
  set: value => { if (item.value) { caseRepository.update(item.value.id, { deadline: value ? new Date(`${value}T23:59:59`).getTime() : undefined }); refresh() } }
})
const phaseNote = computed({ get: () => item.value?.phaseNotes?.[activePhase.value] || '', set: value => { if (item.value) { caseRepository.setPhaseNote(item.value.id, activePhase.value, value); refresh() } } })
watch(() => item.value?.currentPhase, phase => { if (phase) activePhase.value = phase }, { immediate: true })
watch(() => route.params.id, () => refresh())
function refresh() { tick.value++ }
function onDataSynced() { refresh() }
onMounted(() => window.addEventListener('beryl-data-synced', onDataSynced))
onUnmounted(() => window.removeEventListener('beryl-data-synced', onDataSynced))
function selectPhase(phase: CasePhase) { activePhase.value = phase; if (item.value) { caseRepository.update(item.value.id, { currentPhase: phase }); refresh() } }
function saveBasics() { if (!item.value) return; caseRepository.update(item.value.id, item.value); refresh() }
function setStatus(status: CaseStatus) { if (!item.value) return; caseRepository.setStatus(item.value.id, status); refresh() }
async function deleteCase() {
  if (!item.value) return
  try {
    await ElMessageBox.confirm('删除后课题及其关联会一并移除，无法撤销。', '删除课题', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
    caseRepository.remove(item.value.id)
    ElMessage.success('课题已删除')
    router.push('/app/cases')
  } catch { /* cancelled */ }
}
function updateWood(key: 'constraints' | 'paths', value: string) { if (!item.value) return; caseRepository.updateWood(item.value.id, { [key]: value }); refresh() }
const relations = computed(() => item.value ? caseRelationRepository.listFor(item.value.id) : [])
const linkedTasks = computed(() => relations.value.filter(link => link.targetType === 'task').map(link => ({ link, task: tasks.find(link.targetId) })).filter(row => !!row.task) as { link: CaseRelation; task: Task }[])
const availableTargets = computed(() => {
  switch (relationType.value) {
    case 'person': return people.list().map(row => ({ id: row.id, label: `${row.name}${row.title ? ' · ' + row.title : ''}` }))
    case 'diary': return diaries.list().map(row => ({ id: row.date, label: `日记 · ${row.date}` }))
    case 'transaction': return finance.list().map(row => ({ id: row.id, label: `${row.type === 'income' ? '+' : '-'}¥${row.amount} · ${row.category} ${row.note}` }))
    case 'post': return posts.list().map(row => ({ id: row.id, label: `文章 · ${row.title}` }))
    default: return tasks.list().map(row => ({ id: row.id, label: `任务 · ${row.title}` }))
  }
})
const linkedResources = computed(() => relations.value.filter(link => link.targetType !== 'task').map(link => {
  const source = link.targetType === 'person' ? people.find(link.targetId) : link.targetType === 'diary' ? diaries.find(link.targetId) : link.targetType === 'transaction' ? finance.find(link.targetId) : posts.find(link.targetId)
  const label = !source ? '已删除的关联项' : link.targetType === 'person' ? (source as Person).name : link.targetType === 'diary' ? `日记 · ${(source as Diary).date}` : link.targetType === 'transaction' ? `${(source as Finance).category} · ¥${(source as Finance).amount}` : (source as Post).title
  return { link, label }
}))
function addTask() {
  if (!item.value || !taskTitle.value.trim()) return
  const task = { id:createEntityId(), title:taskTitle.value.trim(), priority:'中', date:fmtDate(Date.now()), done:false }
  try {
    tasks.create(task)
    caseRelationRepository.link(item.value.id, 'task', task.id, 'fire')
    taskTitle.value=''; refresh(); ElMessage.success('已加入火阶段行动')
  } catch {
    tasks.remove(task.id)
    ElMessage.error('行动保存失败，未创建半成品关联')
  }
}
function linkExistingTask() { if (!item.value || !selectedTask.value) return; caseRelationRepository.link(item.value.id, 'task', selectedTask.value, 'fire'); selectedTask.value=''; refresh() }
function addRelation() { if (!item.value || !relationId.value) return; caseRelationRepository.link(item.value.id, relationType.value, relationId.value, 'earth'); relationId.value=''; refresh(); ElMessage.success('已关联到土阶段') }
function unlink(id: string) { caseRelationRepository.unlink(id); refresh() }
function addDecision() { if (!item.value || !decision.value.title.trim() || !decision.value.conclusion.trim()) { ElMessage.warning('请至少写下判断主题与结论'); return }; caseRepository.addDecision(item.value.id, { ...decision.value, title:decision.value.title.trim(), conclusion:decision.value.conclusion.trim() }); decision.value={ title:'', options:'', conclusion:'' }; refresh() }
function addReview() { if (!item.value || !review.value.trim()) return; caseRepository.addReview(item.value.id, review.value.trim()); review.value=''; refresh() }
function createFromReview() { const title = nextTitle.value.trim(); if (!item.value || !title) { ElMessage.warning('先写下下一轮课题标题'); return }; const next = caseRepository.create({ title, status: 'inbox' }); nextTitle.value=''; router.push('/app/cases/' + next.id) }
</script>

<template>
  <div v-if="!item" class="empty"><p>未找到这个课题。</p><el-button @click="router.push('/app/cases')">返回课题列表</el-button></div>
  <div v-else>
    <div class="top"><button class="back" @click="router.push('/app/cases')">←</button><div class="title-wrap"><small>现实课题</small><el-input v-model="item.title" class="title" @change="saveBasics" /></div><el-select :model-value="item.status" size="small" @update:model-value="setStatus"><el-option v-for="(_, key) in STATUS_LABEL" :key="key" :label="STATUS_LABEL[key as CaseStatus]" :value="key" /></el-select><el-button text type="danger" @click="deleteCase">删除</el-button></div>
    <div class="meta-row"><label>优先级 <select v-model.number="item.priority" @change="saveBasics"><option :value="1">高</option><option :value="2">中</option><option :value="3">低</option></select></label><label>截止日期 <input v-model="deadlineValue" type="date" /></label><span v-if="item.deadline && item.deadline < Date.now() && item.status !== 'resolved'" class="overdue">已逾期</span></div>
    <div class="phase-intro"><div><p>当前流程 · {{ CASE_PHASES.indexOf(activePhase) + 1 }}/{{ CASE_PHASES.length }}</p><b>{{ PHASE_META[activePhase].icon }} {{ PHASE_META[activePhase].label }}</b><small>{{ PHASE_META[activePhase].summary }}</small></div><span>每次只专注当前阶段</span></div><div class="phases"><button v-for="phase in CASE_PHASES" :key="phase" :class="{ on: activePhase === phase, complete: CASE_PHASES.indexOf(phase) < CASE_PHASES.indexOf(activePhase) }" @click="selectPhase(phase)"><span>{{ CASE_PHASES.indexOf(phase) < CASE_PHASES.indexOf(activePhase) ? '✓' : PHASE_META[phase].icon }}</span>{{ PHASE_META[phase].label.replace(/^. · /,'') }}</button></div>
    <section v-if="activePhase === 'wood'" class="beryl-card workspace"><h2>🌱 木 · 定义与生发</h2><p class="hint">先定义现实问题、结果、限制和可能路径。</p><label>我要解决什么？</label><el-input v-model="item.problem" type="textarea" :rows="3" @change="saveBasics" /><label>什么状态算解决？</label><el-input v-model="item.desiredOutcome" type="textarea" :rows="3" @change="saveBasics" /><label>限制条件</label><ContentEditor :model-value="item.wood?.constraints || ''" :rows="4" placeholder="时间、预算、能力、现实边界…" @update:model-value="updateWood('constraints', $event)" /><label>可能路径</label><ContentEditor :model-value="item.wood?.paths || ''" :rows="4" placeholder="初步想法、路线、相关人物或资料…" @update:model-value="updateWood('paths', $event)" /></section>
    <section v-else-if="activePhase === 'fire'" class="beryl-card workspace"><h2>🔥 火 · 行动与验证</h2><p class="hint">火只回答：现在做什么。</p><div class="add"><el-input v-model="taskTitle" placeholder="添加当前行动" @keyup.enter="addTask" /><el-button type="primary" @click="addTask">新建行动</el-button></div><div class="add"><el-select v-model="selectedTask" placeholder="关联已有任务" filterable><el-option v-for="task in tasks.list()" :key="task.id" :label="task.title" :value="task.id" /></el-select><el-button @click="linkExistingTask">关联</el-button></div><p v-if="!linkedTasks.length" class="hint">还没有关联行动。</p><div v-for="row in linkedTasks" :key="row.link.id" class="line"><span>{{ row.task.done ? '✓' : '□' }} {{ row.task.title }}</span><el-button text size="small" @click="unlink(row.link.id)">移除关联</el-button></div></section>
    <section v-else-if="activePhase === 'earth'" class="beryl-card workspace"><h2>⛰️ 土 · 资源、事实与沉淀</h2><p class="hint">引用已有的人物、日记、财务记录和文章；不复制原始数据。</p><div class="add"><el-select v-model="relationType"><el-option label="人物" value="person" /><el-option label="日记" value="diary" /><el-option label="财务" value="transaction" /><el-option label="文章" value="post" /></el-select><el-select v-model="relationId" filterable placeholder="选择要关联的资料"><el-option v-for="target in availableTargets" :key="target.id" :label="target.label" :value="target.id" /></el-select><el-button @click="addRelation">关联</el-button></div><p v-if="!linkedResources.length" class="hint">还没有关联资源。</p><div v-for="row in linkedResources" :key="row.link.id" class="line"><span>{{ row.label }}</span><el-button text size="small" @click="unlink(row.link.id)">移除关联</el-button></div><ContentEditor v-model="phaseNote" :rows="6" placeholder="补充事实、资料摘要、获得的成果…" /></section>
    <section v-else-if="activePhase === 'metal'" class="beryl-card workspace"><h2>⚖️ 金 · 判断与决策</h2><p class="hint">记录比较、取舍和明确结论；重点是减少，而不是继续收集。</p><el-input v-model="decision.title" placeholder="判断主题，例如：测试自动化 vs Java 开发" /><ContentEditor v-model="decision.options" :rows="4" placeholder="选项、评分、利弊比较…" /><ContentEditor v-model="decision.conclusion" :rows="3" placeholder="最终结论（必填）" /><div class="right"><el-button type="primary" @click="addDecision">记录决策</el-button></div><div v-for="entry in item.decisions || []" :key="entry.id" class="record"><b>{{ entry.title }}</b><p v-if="entry.options">{{ entry.options }}</p><p class="conclusion">结论：{{ entry.conclusion }}</p></div></section>
    <section v-else class="beryl-card workspace"><h2>💧 水 · 复盘与重新流动</h2><p class="hint">记录有效与无效的经验；新的问题可以直接生成下一轮课题。</p><ContentEditor v-model="review" :rows="6" placeholder="结果怎么样？哪里判断错了？下一轮怎么变化？" /><div class="next-case"><el-input v-model="nextTitle" placeholder="下一轮课题标题（单独填写）" /><el-button @click="createFromReview">作为新课题</el-button><el-button type="primary" @click="addReview">保存复盘</el-button></div><div v-for="entry in item.reviews || []" :key="entry.id" class="record"><p>{{ entry.content }}</p><small>{{ new Date(entry.createdAt).toLocaleString() }}</small></div></section>
  </div>
</template>

<style scoped>
.top{display:flex;align-items:center;gap:10px;margin:4px 0 12px}.back{width:33px;height:33px;border:1px solid var(--c-border);background:var(--c-card);border-radius:9px;color:var(--c-text-2);cursor:pointer}.title-wrap{flex:1}.title-wrap small{font-size:10px;color:var(--scene);letter-spacing:.1em;font-weight:700}.title :deep(input){font-family:var(--font-title,inherit);font-size:29px;font-weight:600;letter-spacing:-.025em;padding:0;height:34px}.meta-row{display:flex;align-items:center;gap:14px;margin:0 0 12px 43px;color:var(--c-text-2);font-size:11px}.meta-row label{display:flex;align-items:center;gap:5px}.meta-row select,.meta-row input{border:1px solid var(--c-border-soft);background:var(--c-card);color:var(--c-text-2);border-radius:6px;padding:4px 6px;font-size:11px}.overdue{color:var(--c-danger);font-weight:700}.phase-intro{display:flex;justify-content:space-between;align-items:end;border-top:1px solid var(--c-border-soft);padding:16px 0 10px}.phase-intro p{font-size:10px;color:var(--c-text-3);margin:0 0 3px;letter-spacing:.1em}.phase-intro b{font-size:13px;margin-right:8px}.phase-intro small,.phase-intro>span{font-size:11px;color:var(--c-text-3)}.phases{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin:0 0 18px}.phases button{white-space:nowrap;border:1px solid var(--c-border-soft);background:var(--c-card);color:var(--c-text-2);padding:9px 6px;border-radius:9px;cursor:pointer;font-size:11px}.phases button span{margin-right:3px}.phases button.on{color:var(--scene);background:var(--scene-soft);border-color:var(--scene-border-strong);font-weight:700}.phases button.complete{color:var(--c-success)}.workspace{padding:22px;display:flex;flex-direction:column;gap:10px}.workspace h2{margin:0;font:600 23px var(--font-title,inherit);letter-spacing:-.02em}.workspace label{font-size:11px;color:var(--c-text-2);margin-top:8px}.hint{color:var(--c-text-2);font-size:12px;line-height:1.6;margin:0}.add,.next-case{display:flex;gap:8px}.add :deep(.el-select),.add :deep(.el-input),.next-case :deep(.el-input){flex:1}.line{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--c-border-soft);font-size:13px}.right{text-align:right}.record{padding:14px 0;border-top:1px solid var(--c-border-soft);white-space:pre-wrap;font-size:13px;line-height:1.65}.record p{margin:5px 0}.record small{color:var(--c-text-3);font-size:10px}.conclusion{color:var(--scene)}.empty{padding:50px 0;text-align:center;color:var(--c-text-2)}@media(max-width:600px){.title :deep(input){font-size:23px}.phase-intro>span{display:none}.phases{display:flex;overflow:auto}.phases button{padding:8px 10px}.workspace{padding:15px}.add,.next-case{flex-wrap:wrap}.add :deep(.el-select),.add :deep(.el-input),.next-case :deep(.el-input){min-width:130px}.meta-row{margin-left:0;flex-wrap:wrap}}
</style>
