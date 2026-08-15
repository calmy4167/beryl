<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { store, nextId, fmtDate } from '@/core/storage'

interface TaskItem { id: string; title: string; priority: string; date: string; done: boolean }
const title = ref('')
const priority = ref('中')
const items = ref<TaskItem[]>(load())

function load(): TaskItem[] {
  // 自动清洗脏数据：无 id 或空标题的条目移除并写回
  const raw = store.get<TaskItem[]>('tasks', [])
  const clean = raw.filter(x => x && typeof x.id === 'string' && x.id !== '' && String(x.title || '').trim() !== '')
  if (clean.length !== raw.length) store.set('tasks', clean)
  const order: Record<string, number> = { '高': 0, '中': 1, '低': 2 }
  return clean.slice().sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    const d = (order[a.priority] ?? 1) - (order[b.priority] ?? 1)
    return d !== 0 ? d : (b.id < a.id ? -1 : 1)
  })
}
function refresh() { items.value = load() }
function add() {
  const v = title.value.trim()
  if (!v) return
  const list = store.get<TaskItem[]>('tasks', [])
  list.unshift({ id: nextId(), title: v, priority: priority.value, date: fmtDate(Date.now()), done: false })
  store.set('tasks', list)
  title.value = ''
  refresh()
  ElMessage.success('任务已添加')
}
function toggle(id: string) {
  const list = store.get<TaskItem[]>('tasks', [])
  const t = list.find(x => x.id === id)
  if (t) { t.done = !t.done; store.set('tasks', list); refresh() }
}
function del(id: string) {
  store.set('tasks', store.get<TaskItem[]>('tasks', []).filter(x => x.id !== id))
  refresh()
}
const PRI_COLOR: Record<string, string> = { '高': '#EF4444', '中': '#F59E0B', '低': '#6366F1' }
</script>

<template>
  <form class="beryl-card hoverable form" @submit.prevent="add">
    <el-input v-model="title" placeholder="添加任务…" @keydown.enter.prevent="add" />
    <el-select v-model="priority" style="width: 90px">
      <el-option label="高" value="高" />
      <el-option label="中" value="中" />
      <el-option label="低" value="低" />
    </el-select>
    <el-button type="primary" native-type="submit">添加</el-button>
  </form>
  <div class="list">
    <div v-if="!items.length" class="empty">空空如也，添加一条吧 ✨</div>
    <div v-for="t in items" :key="t.id" class="beryl-card hoverable item" :class="{ done: t.done }">
      <button class="chk" :class="{ on: t.done }" @click="toggle(t.id)">{{ t.done ? '✓' : '' }}</button>
      <p class="t">{{ t.title }}</p>
      <span class="tag" :style="{ color: PRI_COLOR[t.priority], background: (PRI_COLOR[t.priority] || '#888') + '1f' }">{{ t.priority }}</span>
      <span class="date">{{ t.date }}</span>
      <el-button circle text size="small" @click="del(t.id)">✕</el-button>
    </div>
  </div>
</template>

<style scoped>
.form { display: flex; gap: 8px; padding: 12px; align-items: center; flex-wrap: wrap; }
.form :deep(.el-input) { flex: 1; min-width: 180px; }
.list { margin-top: 20px; display: flex; flex-direction: column; gap: 8px; }
.item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; }
.done .t { text-decoration: line-through; color: var(--c-text-3); }
.t { flex: 1; font-size: 14px; word-break: break-all; }
.tag { font-size: 10px; padding: 2px 8px; border-radius: 999px; }
.date { font-size: 10px; color: var(--c-text-2); flex-shrink: 0; }
.chk { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--c-border); background: transparent; color: #fff; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.chk.on { background: var(--c-success); border-color: var(--c-success); }
.empty { text-align: center; color: var(--c-text-3); font-size: 14px; padding: 40px 0; }
</style>
