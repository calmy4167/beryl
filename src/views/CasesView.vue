<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { caseRepository } from '@/domain/case/repository'
import { PHASE_META, STATUS_LABEL, type CaseItem } from '@/domain/case/model'

const router = useRouter()
const title = ref('')
const tick = ref(0)
const cases = computed<CaseItem[]>(() => { void tick.value; return caseRepository.list().slice().sort((a, b) => b.updatedAt - a.updatedAt) })
function refresh() { tick.value++ }
function createCase() {
  const value = title.value.trim()
  if (!value) { ElMessage.warning('先写下你想解决的现实课题'); return }
  const item = caseRepository.create({ title: value })
  title.value = ''
  refresh()
  router.push('/app/cases/' + item.id)
}
function open(item: CaseItem) { router.push('/app/cases/' + item.id) }
</script>

<template>
  <div class="head"><span class="icon">◈</span><div><h1 class="font-title">现实课题</h1><p>围绕一个问题组织行动、资料、判断与经验。</p></div></div>
  <form class="beryl-card create" @submit.prevent="createCase">
    <el-input v-model="title" size="large" placeholder="例如：完成 Beryl v3 重构 / 改善作息" />
    <el-button type="primary" native-type="submit">新建课题</el-button>
  </form>
  <div class="grid">
    <button v-for="item in cases" :key="item.id" class="beryl-card case" @click="open(item)">
      <div class="row"><span class="phase">{{ PHASE_META[item.currentPhase].icon }} {{ PHASE_META[item.currentPhase].label }}</span><span class="status">{{ STATUS_LABEL[item.status] }}</span></div>
      <h2 class="font-title">{{ item.title }}</h2>
      <p>{{ item.desiredOutcome || item.problem || '尚未定义问题与期望结果' }}</p>
      <small>更新于 {{ new Date(item.updatedAt).toLocaleDateString() }}</small>
    </button>
    <p v-if="!cases.length" class="empty">先创建一个你正在解决的现实课题。</p>
  </div>
</template>

<style scoped>
.head { display:flex; gap:12px; align-items:center; margin-bottom:20px; }.head h1 { margin:0; font-size:1.35rem; }.head p { margin:4px 0 0; font-size:12px; color:var(--c-text-2); }.icon { font-size:24px; color:var(--scene); }.create { display:flex; gap:8px; padding:14px; }.create :deep(.el-input) { flex:1; }.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:12px; margin-top:16px; }.case { text-align:left; padding:16px; border:1px solid var(--c-border-soft); background:var(--c-card); color:var(--c-text); cursor:pointer; }.case:hover { border-color:var(--scene-border-strong); }.row { display:flex; justify-content:space-between; gap:8px; font-size:10px; }.phase { color:var(--scene); }.status { color:var(--c-text-3); }.case h2 { margin:14px 0 7px; font-size:16px; }.case p { margin:0; font-size:12px; color:var(--c-text-2); line-height:1.6; min-height:38px; }.case small { display:block; margin-top:14px; color:var(--c-text-3); font-size:10px; }.empty { grid-column:1/-1; text-align:center; padding:48px 0; color:var(--c-text-3); }
</style>
