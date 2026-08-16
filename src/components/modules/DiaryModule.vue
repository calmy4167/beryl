<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { store, todayKey } from '@/core/storage'
import CaseLinkSelect from '@/components/CaseLinkSelect.vue'

interface DiaryEntry { date: string; content: string }
const tk = todayKey()
const input = ref('')
const history = ref<DiaryEntry[]>(loadHistory())

function loadHistory(): DiaryEntry[] {
  return store.get<DiaryEntry[]>('diary', []).slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5)
}
function refresh() { history.value = loadHistory() }

const cur = store.get<DiaryEntry[]>('diary', []).find(d => d.date === tk)
if (cur) input.value = cur.content

function save() {
  const v = input.value.trim()
  if (!v) { ElMessage.warning('写点什么再保存吧'); return }
  const items = store.get<DiaryEntry[]>('diary', [])
  const i = items.findIndex(d => d.date === tk)
  if (i >= 0) items[i].content = v; else items.push({ date: tk, content: v })
  store.set('diary', items)
  refresh()
  ElMessage.success('日记已保存 📓')
}
</script>

<template>
  <div class="beryl-card hoverable editor">
    <p class="date-label">今日日记 · {{ tk }}</p>
    <el-input v-model="input" type="textarea" :rows="7" placeholder="写下今天的心情、想法与收获…" />
    <div class="right"><el-button type="primary" @click="save">保存</el-button></div>
  </div>

  <div class="sec">
    <h3 class="font-title sec-title">最近记录</h3>
    <div class="list">
      <div v-if="!history.length" class="empty">空空如也，写一篇吧 ✨</div>
      <div v-for="d in history" :key="d.date" class="beryl-card hoverable item">
        <div class="item-head"><p class="date">{{ d.date }} <span v-if="d.date === tk" class="today">· 今天</span></p><CaseLinkSelect target-type="diary" :target-id="d.date" compact /></div>
        <p class="content">{{ d.content.slice(0, 60) }}{{ d.content.length > 60 ? '…' : '' }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor { padding: 16px; }
.date-label { font-size: 10px; color: var(--c-text-2); letter-spacing: 0.2em; margin-bottom: 8px; }
.right { text-align: right; margin-top: 12px; }
.sec { margin-top: 24px; }
.sec-title { font-size: 14px; color: var(--c-text-2); letter-spacing: 0.15em; margin-bottom: 12px; }
.list { display: flex; flex-direction: column; gap: 8px; }
.item { padding: 12px 16px; }
.item-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.date { font-size: 10px; color: var(--c-text-2); margin-bottom: 4px; }
.today { color: var(--amber); }
.content { font-size: 13px; color: var(--c-text); word-break: break-all; }
.empty { text-align: center; color: var(--c-text-3); font-size: 14px; padding: 32px 0; }
</style>
