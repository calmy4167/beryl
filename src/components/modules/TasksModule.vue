<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { store, nextId, fmtDate } from '@/core/storage'
import CaseLinkSelect from '@/components/CaseLinkSelect.vue'
import { registerUndo } from '@/core/undo'
import EmptyState from '@/components/EmptyState.vue'
import { listRealityDocuments } from '@/domain/reality'

interface TaskItem { id: string; title: string; priority: string; date: string; dueAt?: string; done: boolean }
const title = ref('')
const priority = ref('中')
const dueAt = ref('')
const filter = ref<'all' | 'open' | 'done'>('open')
const items = ref<TaskItem[]>(load())

function load(): TaskItem[] {
  const order: Record<string, number> = { '高': 0, '中': 1, '低': 2 }
  return listRealityDocuments({ types: ['task'] }).map(item => ({
    id: item.id, title: item.title, priority: item.priority || '中', date: item.date || '', dueAt: item.dueAt, done: item.done ?? item.status === 'done'
  })).sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    const due = (a.dueAt ? Date.parse(a.dueAt) : Number.MAX_SAFE_INTEGER) - (b.dueAt ? Date.parse(b.dueAt) : Number.MAX_SAFE_INTEGER)
    if (due !== 0) return due
    const d = (order[a.priority] ?? 1) - (order[b.priority] ?? 1)
    return d !== 0 ? d : (b.id < a.id ? -1 : 1)
  })
}
function refresh() { items.value = load() }
function add() {
  const v = title.value.trim()
  if (!v) return
  let list: any[] = store.get<any>('tasks', [])
  if (!Array.isArray(list)) list = [] // 坏值防御（历史 "null" 等）
  list.unshift({ id: nextId(), title: v, priority: priority.value, dueAt: dueAt.value || undefined, date: fmtDate(Date.now()), done: false })
  store.set('tasks', list)
  title.value = ''; dueAt.value = ''
  refresh()
  ElMessage.success('任务已添加')
}
function toggle(id: string) {
  const list = store.get<TaskItem[]>('tasks', [])
  const t = list.find(x => x.id === id)
  if (t) { t.done = !t.done; store.set('tasks', list); refresh() }
}
function del(id: string) {
  const list = store.get<TaskItem[]>('tasks', [])
  const index = list.findIndex(item => item.id === id)
  if (index >= 0) {
    const [removed] = list.splice(index, 1)
    registerUndo('tasks', removed, index, id)
    store.set('tasks', list)
  }
  refresh()
}
const PRI_COLOR: Record<string, string> = { '高': '#EF4444', '中': '#F59E0B', '低': '#6366F1' }
const visibleItems = computed(() => filter.value === 'all' ? items.value : items.value.filter(item => filter.value === 'done' ? item.done : !item.done))
</script>

<template>
  <form class="beryl-card form" @submit.prevent="add">
    <div class="form-lead"><span>＋</span><b>添加行动</b></div>
    <el-input v-model="title" placeholder="下一步最具体的行动是什么？" @keydown.enter.prevent="add" />
    <el-select v-model="priority" style="width: 90px">
      <el-option label="高" value="高" />
      <el-option label="中" value="中" />
      <el-option label="低" value="低" />
    </el-select>
    <input v-model="dueAt" class="due-input" type="date" aria-label="截止日期" />
    <el-button type="primary" native-type="submit">添加</el-button>
  </form>
  <div class="list">
    <div class="list-head"><span>{{ items.filter(x => !x.done).length }} 个待完成</span><label>显示 <select v-model="filter"><option value="open">未完成</option><option value="all">全部</option><option value="done">已完成</option></select></label></div>
    <EmptyState v-if="!visibleItems.length" icon="✓" title="今天没有待办" description="把一个课题拆成足够小的下一步。" />
    <div v-for="t in visibleItems" :key="t.id" class="item" :class="{ done: t.done }">
      <button class="chk" :class="{ on: t.done }" :aria-label="t.done ? '标记为未完成' : '标记为已完成'" @click="toggle(t.id)">{{ t.done ? '✓' : '' }}</button>
      <p class="t">{{ t.title }}</p>
      <span class="tag" :style="{ color: PRI_COLOR[t.priority], background: (PRI_COLOR[t.priority] || '#888') + '1f' }">{{ t.priority }}</span>
      <span v-if="t.dueAt" class="due" :class="{ overdue: !t.done && Date.parse(t.dueAt) < Date.now() }">截止 {{ t.dueAt }}</span>
      <span class="date">{{ t.date }}</span>
      <CaseLinkSelect target-type="task" :target-id="t.id" compact />
       <el-button circle text size="small" aria-label="删除任务" @click="del(t.id)">✕</el-button>
    </div>
  </div>
</template>

<style scoped>
.form { display:flex;gap:10px;padding:14px;align-items:center;flex-wrap:wrap; }.form-lead{display:flex;align-items:center;gap:7px;font-size:12px;white-space:nowrap}.form-lead span{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--scene-soft);color:var(--scene);font-size:18px}.form :deep(.el-input){flex:1;min-width:180px}.due-input{border:1px solid var(--c-border);background:var(--c-card);color:var(--c-text-2);border-radius:6px;padding:7px 8px;font-size:11px}.list{margin-top:28px;display:flex;flex-direction:column}.list-head{display:flex;justify-content:space-between;color:var(--c-text-3);font-size:10px;padding:0 4px 9px}.list-head select{border:0;background:transparent;color:var(--c-text-2);font-size:10px}.item{display:flex;align-items:center;gap:12px;padding:14px 8px;border-top:1px solid var(--c-border-soft);transition:background .15s}.item:hover{background:var(--c-hover)}
.done .t { text-decoration: line-through; color: var(--c-text-3); }
.t{flex:1;font-size:14px;word-break:break-all;margin:0}.tag{font-size:10px;padding:3px 8px;border-radius:999px}.due{font-size:10px;color:var(--c-text-3);white-space:nowrap}.due.overdue{color:var(--c-danger);font-weight:700}.date{font-size:10px;color:var(--c-text-3);flex-shrink:0}
.chk { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--c-border); background: transparent; color: #fff; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.chk.on { background: var(--c-success); border-color: var(--c-success); }
.empty{text-align:center;color:var(--c-text-3);font-size:12px;padding:50px 0;border-top:1px solid var(--c-border-soft)}@media(max-width:600px){.form-lead{width:100%}.date{display:none}.form :deep(.el-input){min-width:0}.tag{margin-left:auto}}
</style>
