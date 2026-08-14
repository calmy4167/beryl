<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { store, nextId } from '@/core/storage'

interface Goal { id: string; title: string; done: boolean }
const input = ref('')
const items = ref<Goal[]>(store.get('goals', []))

function refresh() { items.value = store.get<Goal[]>('goals', []) }
function add() {
  const v = input.value.trim()
  if (!v) return
  const list = store.get<Goal[]>('goals', [])
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
function del(id: string) {
  store.set('goals', store.get<Goal[]>('goals', []).filter(x => x.id !== id))
  refresh()
}
</script>

<template>
  <form class="beryl-card hoverable form" @submit.prevent="add">
    <el-input v-model="input" placeholder="添加目标…" @keydown.enter.prevent="add" />
    <el-button type="primary" native-type="submit">添加</el-button>
  </form>
  <div class="list">
    <div v-if="!items.length" class="empty">空空如也，添加一条吧 ✨</div>
    <div v-for="g in items" :key="g.id" class="beryl-card hoverable item" :class="{ done: g.done }">
      <button class="chk" :class="{ on: g.done }" @click="toggle(g.id)">{{ g.done ? '✓' : '' }}</button>
      <p class="t">{{ g.title }}</p>
      <el-button circle text size="small" @click="del(g.id)">✕</el-button>
    </div>
  </div>
</template>

<style scoped>
.form { display: flex; gap: 8px; padding: 12px; }
.list { margin-top: 20px; display: flex; flex-direction: column; gap: 8px; }
.item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; }
.done .t { text-decoration: line-through; color: rgba(228, 228, 231, 0.35); }
.t { flex: 1; font-size: 14px; word-break: break-all; }
.chk { width: 22px; height: 22px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.25); background: transparent; color: #0A0A0F; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.chk.on { background: #34D399; border-color: #34D399; }
.empty { text-align: center; color: #52525b; font-size: 14px; padding: 40px 0; }
</style>
