<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { store, nextId, fmtDate } from '@/core/storage'
import { caseRepository } from '@/domain/case/repository'
import { registerUndo } from '@/core/undo'
import EmptyState from '@/components/EmptyState.vue'
import { listRealityDocuments } from '@/domain/reality'

interface InboxItem { id?: string; text: string; date: string }
interface InboxViewItem extends InboxItem { sourceIndex: number }
const input = ref('')
const items = ref<InboxViewItem[]>([])

function refresh() {
  items.value = listRealityDocuments({ types: ['inbox'] }).map(item => ({
    id: item.id, text: item.body || item.title, date: item.date || '', sourceIndex: item.sourceIndex ?? -1
  }))
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
/* 使用源数组索引删除，避免显示层过滤后错位；无 id 历史数据也可安全删除 */
function removeSourceItem(item: InboxViewItem): boolean {
  let list: any[] = store.get<any>('inbox', [])
  if (!Array.isArray(list)) list = []
  if (item.sourceIndex < 0 || item.sourceIndex >= list.length) return false
  const [removed] = list.splice(item.sourceIndex, 1)
  registerUndo('inbox', removed, item.sourceIndex, removed?.id)
  return store.set('inbox', list)
}
function del(item: InboxViewItem) {
  try {
    removeSourceItem(item)
    refresh()
  } catch { /* ignore */ }
}
function toCase(it: InboxViewItem) {
  const item = caseRepository.create({ title: it.text, status: 'inbox' })
  removeSourceItem(it)
  refresh()
  ElMessage.success(`已转为现实课题「${item.title}」`)
}
function toTask(it: InboxViewItem) {
  const rawTasks = store.get<any>('tasks', [])
  const tasks = Array.isArray(rawTasks) ? rawTasks : []
  tasks.unshift({ id: nextId(), title: it.text, priority: '中', date: fmtDate(Date.now()), done: false })
  if (!store.set('tasks', tasks)) {
    ElMessage.error('转换失败：任务未保存')
    return
  }
  removeSourceItem(it)
  refresh()
  ElMessage.success('已转为行动任务')
}

onMounted(refresh)
</script>

<template>
  <div class="intro"><p class="eyebrow">CAPTURE FIRST</p><h3 class="font-title">先收集，不急着判断。</h3><p>之后再把它变成行动，或展开为一个现实课题。</p></div>
  <form class="beryl-card form" @submit.prevent="add">
    <el-input v-model="input" placeholder="脑中闪过什么？先放在这里…" @keydown.enter.prevent="add" />
    <el-button type="primary" native-type="submit">收下</el-button>
  </form>
  <div class="list">
    <EmptyState v-if="!items.length" icon="↓" title="收集箱已经清空" description="继续保持，把注意力留给正在做的事。" />
    <div v-for="it in items" :key="`${it.id || 'legacy'}-${it.sourceIndex}`" class="item">
      <span class="dot" />
      <p class="text">{{ it.text }}</p>
      <span class="date">{{ it.date }}</span>
      <el-button text size="small" @click="toTask(it)">→ 行动</el-button>
      <el-button text size="small" @click="toCase(it)">→ 课题</el-button>
      <el-button circle text size="small" @click="del(it)">✕</el-button>
    </div>
  </div>
</template>

<style scoped>
.intro{margin:2px 0 22px}.eyebrow{font-size:10px;letter-spacing:.13em;color:var(--scene);font-weight:700;margin:0 0 7px}.intro h3{font-size:27px;margin:0;letter-spacing:-.02em}.intro p:last-child{font-size:12px;color:var(--c-text-2);margin:8px 0 0}.form{display:flex;gap:8px;padding:14px;flex-wrap:wrap}.form :deep(.el-input){flex:1;min-width:200px}.list{margin-top:26px;display:flex;flex-direction:column}.item{display:flex;align-items:center;gap:12px;padding:14px 8px;border-top:1px solid var(--c-border-soft);transition:.15s}.item:hover{background:var(--c-hover)}
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--amber); flex-shrink: 0; }
.text{flex:1;font-size:14px;word-break:break-all;margin:0}.date{font-size:10px;color:var(--c-text-3);flex-shrink:0}.empty{text-align:center;color:var(--c-text-3);font-size:12px;padding:50px 0;border-top:1px solid var(--c-border-soft)}@media(max-width:600px){.date{display:none}.item{gap:7px}.form :deep(.el-input){min-width:0}}
</style>
