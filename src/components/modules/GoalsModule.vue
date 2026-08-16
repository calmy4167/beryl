<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { store, nextId } from '@/core/storage'
import EmptyState from '@/components/EmptyState.vue'

interface Goal { id: string; title: string; done: boolean }
const input = ref('')
const items = ref<Goal[]>(store.get('goals', []))

function refresh() { items.value = store.get<Goal[]>('goals', []) }
function add() {
  const v = input.value.trim()
  if (!v) return
  let list: any[] = store.get<any>('goals', [])
  if (!Array.isArray(list)) list = [] // 坏值防御（历史 "null" 等）
  list.unshift({ id: nextId(), title: v, done: false })
  store.set('goals', list)
  input.value = ''
  refresh()
  ElMessage.success('目标已添加 🥅')
}
function toggle(id: string) {
  const list = store.get<Goal[]>('goals', [])
  const g = list.find(x => x.id === id)
  if (g) { g.done = !g.done; store.set('goals', list); refresh() }
}
/* 按索引删除：任何条目（含缺 id 的历史数据）都能删，绝不误删其他条目 */
function del(index: number) {
  const list = store.get<Goal[]>('goals', [])
  if (index >= 0 && index < list.length) {
    list.splice(index, 1)
    store.set('goals', list)
  }
  refresh()
}
</script>

<template>
  <form class="beryl-card hoverable form" @submit.prevent="add">
    <el-input v-model="input" placeholder="添加目标…" @keydown.enter.prevent="add" />
    <el-button type="primary" native-type="submit">添加</el-button>
  </form>
  <div class="list">
    <EmptyState v-if="!items.length" icon="◎" title="还没有目标" description="把一个想完成的结果写下来。" />
    <div v-for="(g, i) in items" :key="i" class="beryl-card hoverable item" :class="{ done: g.done }">
      <button class="chk" :class="{ on: g.done }" :aria-label="g.done ? '标记目标为未完成' : '标记目标为已完成'" @click="toggle(g.id)">{{ g.done ? '✓' : '' }}</button>
      <p class="t">{{ g.title }}</p>
      <el-button circle text size="small" aria-label="删除目标" @click="del(i)">✕</el-button>
    </div>
  </div>
</template>

<style scoped>
.form { display: flex; gap: 8px; padding: 12px; flex-wrap: wrap; }
.form :deep(.el-input) { flex: 1; min-width: 200px; }
.list { margin-top: 20px; display: flex; flex-direction: column; gap: 8px; }
.item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; }
.done .t { text-decoration: line-through; color: var(--c-text-3); }
.t { flex: 1; font-size: 14px; word-break: break-all; }
.chk { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--c-border); background: transparent; color: #fff; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.chk.on { background: var(--c-success); border-color: var(--c-success); }
.empty { text-align: center; color: var(--c-text-3); font-size: 14px; padding: 40px 0; }
</style>
