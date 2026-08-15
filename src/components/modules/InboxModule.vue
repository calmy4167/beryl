<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { store, nextId, fmtDate } from '@/core/storage'

interface InboxItem { id: string; text: string; date: string }
const input = ref('')
const items = ref<InboxItem[]>(store.get('inbox', []))

function refresh() { items.value = store.get<InboxItem[]>('inbox', []) }
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
/* 按索引删除：任何条目（含缺 id 的历史数据）都能删，绝不误删其他条目 */
function del(index: number) {
  const list = store.get<InboxItem[]>('inbox', [])
  if (index >= 0 && index < list.length) {
    list.splice(index, 1)
    store.set('inbox', list)
  }
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
    <div v-for="(it, i) in items" :key="i" class="beryl-card hoverable item">
      <span class="dot" />
      <p class="text">{{ it.text }}</p>
      <span class="date">{{ it.date }}</span>
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
