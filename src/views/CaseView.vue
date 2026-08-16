<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import ContentEditor from '@/components/content/ContentEditor.vue'
import ContentRenderer from '@/components/content/ContentRenderer.vue'
import { caseRelationRepository, caseRepository } from '@/domain/case/repository'
import { CASE_PHASES, PHASE_META, STATUS_LABEL, type CasePhase, type CaseStatus } from '@/domain/case/model'
import { createCollectionRepository, createEntityId } from '@/core/repository'
import { fmtDate } from '@/core/storage'

const route = useRoute(); const router = useRouter(); const tick = ref(0)
const item = computed(() => { void tick.value; return caseRepository.find(String(route.params.id)) })
const activePhase = ref<CasePhase>(item.value?.currentPhase || 'wood')
const tasks = createCollectionRepository<{ id: string; title: string; priority: string; date: string; done: boolean }>('tasks')
const taskTitle = ref('')
const phaseNote = computed({ get: () => item.value?.phaseNotes[activePhase.value] || '', set: value => { if (item.value) caseRepository.setPhaseNote(item.value.id, activePhase.value, value); tick.value++ } })
const linkedTasks = computed(() => {
  if (!item.value) return []
  const links = caseRelationRepository.listFor(item.value.id).filter(link => link.targetType === 'task')
  return links.map(link => ({ link, task: tasks.find(link.targetId) })).filter((x): x is { link: typeof links[number]; task: NonNullable<typeof x.task> } => !!x.task)
})
function refresh() { tick.value++ }
function selectPhase(phase: CasePhase) { activePhase.value = phase; if (item.value) { caseRepository.update(item.value.id, { currentPhase: phase }); refresh() } }
function saveBasics() { if (!item.value) return; caseRepository.update(item.value.id, item.value); refresh(); ElMessage.success('课题已保存') }
function addTask() { if (!item.value || !taskTitle.value.trim()) return; const task = tasks.create({ id:createEntityId(), title:taskTitle.value.trim(), priority:'中', date:fmtDate(Date.now()), done:false }); caseRelationRepository.link(item.value.id, 'task', task.id, 'fire'); taskTitle.value=''; refresh(); ElMessage.success('已加入火阶段行动') }
function setStatus(status: CaseStatus) { if (!item.value) return; caseRepository.setStatus(item.value.id, status); refresh() }
</script>

<template>
  <div v-if="!item" class="empty"><p>未找到这个课题。</p><el-button @click="router.push('/app/cases')">返回课题列表</el-button></div>
  <div v-else>
    <div class="top"><el-button circle text @click="router.push('/app/cases')">←</el-button><el-input v-model="item.title" class="title" @change="saveBasics" /><el-select :model-value="item.status" size="small" @update:model-value="setStatus"><el-option v-for="(_, key) in STATUS_LABEL" :key="key" :label="STATUS_LABEL[key as CaseStatus]" :value="key" /></el-select></div>
    <div class="beryl-card basics"><el-input v-model="item.problem" type="textarea" :rows="2" placeholder="我到底要解决什么？" @change="saveBasics" /><el-input v-model="item.desiredOutcome" type="textarea" :rows="2" placeholder="什么状态算解决？" @change="saveBasics" /></div>
    <div class="phases"><button v-for="phase in CASE_PHASES" :key="phase" :class="{ on: activePhase === phase }" @click="selectPhase(phase)">{{ PHASE_META[phase].icon }} {{ PHASE_META[phase].label }}</button></div>
    <div class="beryl-card workspace"><h2 class="font-title">{{ PHASE_META[activePhase].label }}</h2><p class="hint">{{ PHASE_META[activePhase].summary }}。阶段可自由切换、回退和重复进入。</p>
      <template v-if="activePhase === 'fire'"><div class="add-task"><el-input v-model="taskTitle" placeholder="添加当前行动" @keyup.enter="addTask" /><el-button type="primary" @click="addTask">加入任务</el-button></div><p v-if="!linkedTasks.length" class="hint">还没有关联行动。</p><div v-for="row in linkedTasks" :key="row.link.id" class="task"><span>{{ row.task.done ? '✓' : '□' }}</span>{{ row.task.title }}</div></template>
      <ContentEditor v-model="phaseNote" :rows="activePhase === 'wood' ? 9 : 7" :placeholder="PHASE_META[activePhase].summary + '（支持 Markdown）'" />
      <details v-if="phaseNote" class="preview"><summary>预览</summary><ContentRenderer :content="phaseNote" /></details>
    </div>
  </div>
</template>

<style scoped>
.top { display:flex; align-items:center; gap:10px; margin-bottom:16px; }.title :deep(input) { font-family:var(--font-title,inherit); font-size:1.35rem; font-weight:700; }.basics { display:grid; gap:10px; padding:14px; }.phases { display:flex; gap:6px; overflow:auto; margin:16px 0; }.phases button { white-space:nowrap; border:1px solid var(--c-border); background:var(--c-bg-soft); color:var(--c-text-2); padding:8px 12px; border-radius:999px; cursor:pointer; }.phases button.on { color:var(--scene); background:var(--scene-soft); border-color:var(--scene-border-strong); }.workspace { padding:16px; }.workspace h2 { margin:0; font-size:16px; }.hint { color:var(--c-text-2); font-size:12px; line-height:1.6; }.add-task { display:flex; gap:8px; margin:14px 0; }.task { font-size:13px; padding:8px 0; border-bottom:1px solid var(--c-border-soft); }.task span { color:var(--scene); margin-right:8px; }.preview { margin-top:14px; color:var(--c-text-2); font-size:12px; }.preview :deep(.markdown) { margin-top:10px; color:var(--c-text); }.empty { padding:50px 0; text-align:center; color:var(--c-text-2); }
</style>
