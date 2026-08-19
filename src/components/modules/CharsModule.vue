<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { store, nextId, fmtDate } from '@/core/storage'
import CaseLinkSelect from '@/components/CaseLinkSelect.vue'
import { registerUndo } from '@/core/undo'
import EmptyState from '@/components/EmptyState.vue'
import { listRealityDocuments } from '@/domain/reality'

interface CharItem { id: string; name: string; title: string; date: string }
const name = ref('')
const title = ref('')
const items = ref<CharItem[]>(load())

const COLORS = ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#06B6D4']
function charColor(n: string): string {
  let h = 0
  for (const ch of String(n)) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return COLORS[h % COLORS.length]
}
function load(): CharItem[] {
  return listRealityDocuments({ types: ['char'] }).map(item => ({ id: item.id, name: item.name || item.title, title: item.charTitle || item.summary, date: item.date || '' }))
}
function refresh() { items.value = load() }
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
  const list = store.get<CharItem[]>('chars', [])
  const index = list.findIndex(x => x.id === id)
  if (index >= 0) { const [removed] = list.splice(index, 1); registerUndo('chars', removed, index, id); store.set('chars', list) }
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
    <EmptyState v-if="!items.length" icon="♙" title="还没有人物" description="添加一位与你当前课题有关的人。" />
    <div v-for="c in items" :key="c.id" class="beryl-card hoverable card">
      <el-button circle text size="small" class="del" aria-label="删除人物" @click="del(c.id)">✕</el-button>
      <div class="avatar" :style="{ background: charColor(c.name) + '22', color: charColor(c.name), borderColor: charColor(c.name) + '44' }">{{ (c.name || '?')[0] }}</div>
      <p class="name">{{ c.name }}</p>
      <p class="title">{{ c.title }}</p>
      <p class="date">{{ c.date }}</p>
      <CaseLinkSelect target-type="person" :target-id="c.id" compact />
    </div>
  </div>
</template>

<style scoped>
.form { display: flex; gap: 8px; padding: 12px; flex-wrap: wrap; }
.form :deep(.el-input) { flex: 1; min-width: 140px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; margin-top: 20px; }
.card { padding: 16px; text-align: center; position: relative; }
.del { position: absolute; top: 8px; right: 8px; }
.avatar { width: 48px; height: 48px; border-radius: 50%; margin: 0 auto; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; border: 1px solid; }
.name { font-size: 14px; font-weight: 500; margin-top: 10px; word-break: break-all; }
.title { font-size: 10px; color: var(--c-text-2); margin-top: 2px; word-break: break-all; }
.date { font-size: 10px; color: var(--c-text-3); margin-top: 8px; }
.empty { grid-column: 1 / -1; text-align: center; color: var(--c-text-3); font-size: 14px; padding: 40px 0; }
</style>
