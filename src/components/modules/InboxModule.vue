<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { store, nextId, fmtDate } from '@/core/storage'
import { caseRepository } from '@/domain/case/repository'

interface InboxItem { id: string; text: string; date: string }
const input = ref('')
const items = ref<InboxItem[]>([])

function refresh() {
  try {
    const raw = store.get<any>('inbox', [])
    const list = Array.isArray(raw) ? raw : []
    if (!Array.isArray(raw)) store.set('inbox', list) // 规范化坏值（如 "null"），修复后正常
    // 显示层过滤：空文本（含无 text 字段的历史数据）不显示，但数据本身保留
    items.value = list.filter((x: any) => x && x.text != null && String(x.text).trim() !== '')
  } catch {
    items.value = []
  }
}
function add() {
  const v = input.value.trim()
  if (!v) { ElMessage.warning('写点什么再添加吧'); return }
  try {
    let list: any[] = store.get<any>('inbox', [])
    if (!Array.isArray(list)) list = [] // 坏值防御
    list.unshift({ id: nextId(), text: v, date: fmtDate(Date.now()) })
    const ok = store.set('inbox', list)
    if (!ok) { ElMessage.error('存储失败：空间不足或浏览器限制'); return }
    input.value = ''
    refresh()
    ElMessage.success('已收入收件箱')
  } catch {
    ElMessage.error('添加失败，请重试')
  }
}
/* 按索引删除：任何条目（含缺 id 的历史数据）都能删，绝不误删其他条目 */
function del(index: number) {
  try {
    let list: any[] = store.get<any>('inbox', [])
    if (!Array.isArray(list)) list = []
    if (index >= 0 && index < list.length) {
      list.splice(index, 1)
      store.set('inbox', list)
    }
    refresh()
  } catch { /* ignore */ }
}
function toCase(it: InboxItem) {
  const item = caseRepository.create({ title: it.text, status: 'inbox' })
  const list = store.get<InboxItem[]>('inbox', []).filter(row => row.id !== it.id)
  store.set('inbox', list)
  refresh()
  ElMessage.success(`已转为现实课题「${item.title}」`)
}
function toTask(it: InboxItem) {
  const tasks = store.get<any[]>('tasks', [])
  tasks.unshift({ id: nextId(), title: it.text, priority: '中', date: fmtDate(Date.now()), done: false })
  store.set('tasks', tasks)
  store.set('inbox', store.get<InboxItem[]>('inbox', []).filter(row => row.id !== it.id))
  refresh()
  ElMessage.success('已转为行动任务')
}

onMounted(refresh)
</script>

<template>
  <form class="beryl-card hoverable form" @submit.prevent="add">
    <el-input v-model="input" placeholder="记下你的想法，Enter 提交…" @keydown.enter.prevent="add" />
    <el-button type="primary" native-type="submit">添加</el-button>
  </form>
  <div class="list">
    <div v-if="!items.length" class="empty">空空如也，添加一条吧 ✨</div>
    <div v-for="(it, i) in items" :key="i" class="beryl-card hoverable item">
      <span class="dot" />
      <p class="text">{{ it.text }}</p>
      <span class="date">{{ it.date }}</span>
      <el-button text size="small" @click="toTask(it)">→ 行动</el-button>
      <el-button text size="small" @click="toCase(it)">→ 课题</el-button>
      <el-button circle text size="small" @click="del(i)">✕</el-button>
    </div>
  </div>
</template>

<style scoped>
.form { display: flex; gap: 8px; padding: 12px; flex-wrap: wrap; }
.form :deep(.el-input) { flex: 1; min-width: 200px; }
.list { margin-top: 20px; display: flex; flex-direction: column; gap: 8px; }
.item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--amber); flex-shrink: 0; }
.text { flex: 1; font-size: 14px; word-break: break-all; }
.date { font-size: 10px; color: var(--c-text-2); flex-shrink: 0; }
.empty { text-align: center; color: var(--c-text-3); font-size: 14px; padding: 40px 0; }
</style>
