<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { store, nextId, fmtDate } from '@/core/storage'

interface CharItem { id: string; name: string; title: string; date: string }
const name = ref('')
const title = ref('')
const items = ref<CharItem[]>(store.get('chars', []))

const COLORS = ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#06B6D4']
function charColor(n: string): string {
  let h = 0
  for (const ch of String(n)) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return COLORS[h % COLORS.length]
}
function refresh() { items.value = store.get<CharItem[]>('chars', []) }
function add() {
  const n = name.value.trim()
  if (!n) { ElMessage.warning('请输入姓名'); return }
  const list = store.get<CharItem[]>('chars', [])
  list.unshift({ id: nextId(), name: n, title: title.value.trim(), date: fmtDate(Date.now()) })
  store.set('chars', list)
  name.value = ''; title.value = ''
  refresh()
  ElMessage.success('人物已添加 👥')
}
function del(id: string) {
  store.set('chars', store.get<CharItem[]>('chars', []).filter(x => x.id !== id))
  refresh()
}
</script>

<template>
  <form class="beryl-card hoverable form" @submit.prevent="add">
    <el-input v-model="name" placeholder="姓名" />
    <el-input v-model="title" placeholder="身份 / 称号" />
    <el-button type="primary" native-type="submit">添加</el-button>
  </form>
  <div class="grid">
    <div v-if="!items.length" class="empty">空空如也，添加一位吧 ✨</div>
    <div v-for="c in items" :key="c.id" class="beryl-card hoverable card">
      <el-button circle text size="small" class="del" @click="del(c.id)">✕</el-button>
      <div class="avatar" :style="{ background: charColor(c.name) + '22', color: charColor(c.name), borderColor: charColor(c.name) + '44' }">{{ (c.name || '?')[0] }}</div>
      <p class="name">{{ c.name }}</p>
      <p class="title">{{ c.title }}</p>
      <p class="date">{{ c.date }}</p>
    </div>
  </div>
</template>

<style scoped>
.form { display: flex; gap: 8px; padding: 12px; }
.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 20px; }
@media (min-width: 768px) { .grid { grid-template-columns: repeat(3, 1fr); } }
.card { padding: 16px; text-align: center; position: relative; }
.del { position: absolute; top: 8px; right: 8px; }
.avatar { width: 48px; height: 48px; border-radius: 50%; margin: 0 auto; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; border: 1px solid; }
.name { font-size: 14px; font-weight: 500; margin-top: 10px; word-break: break-all; }
.title { font-size: 10px; color: #71717a; margin-top: 2px; word-break: break-all; }
.date { font-size: 10px; color: #52525b; margin-top: 8px; }
.empty { grid-column: 1 / -1; text-align: center; color: #52525b; font-size: 14px; padding: 40px 0; }
</style>
