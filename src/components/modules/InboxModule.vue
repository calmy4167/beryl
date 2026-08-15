<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { store, nextId, fmtDate } from '@/core/storage'

interface InboxItem { id: string; text: string; date: string }
const input = ref('')
const items = ref<InboxItem[]>(store.get('inbox', []))

function refresh() {
  // 自动清洗脏数据：无 id 或空文本的条目（历史遗留/异常写入）直接移除并写回
  const list = store.get<InboxItem[]>('inbox', [])
  const clean = list.filter(x => x && typeof x.id === 'string' && x.id !== '' && String(x.text || '').trim() !== '')
  if (clean.length !== list.length) store.set('inbox', clean)
  items.value = clean
}
function add() {
  const v = input.value.trim()
  if (!v) return
  const list = store.get<InboxItem[]>('inbox', [])
  list.unshift({ id: nextId(), text: v, date: fmtDate(Date.now()) })
  store.set('inbox', list)
  input.value = ''
  refresh()
  ElMessage.success('已收入收件箱')
}
function del(id: string) {
  store.set('inbox', store.get<InboxItem[]>('inbox', []).filter(x => x.id !== id))
  refresh()
}
</script>

<template>
  <form class="beryl-card hoverable form" @submit.prevent="add">
    <el-input v-model="input" placeholder="记下你的想法，Enter 提交…" @keydown.enter.prevent="add" />
    <el-button type="primary" native-type="submit">添加</el-button>
  </form>
  <div class="list">
    <div v-if="!items.length" class="empty">空空如也，添加一条吧 ✨</div>
    <div v-for="it in items" :key="it.id" class="beryl-card hoverable item">
      <span class="dot" />
      <p class="text">{{ it.text }}</p>
      <span class="date">{{ it.date }}</span>
      <el-button circle text size="small" @click="del(it.id)">✕</el-button>
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
