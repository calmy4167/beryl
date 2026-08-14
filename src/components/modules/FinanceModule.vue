<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { store, nextId, fmtDate } from '@/core/storage'

interface FinItem { id: string; type: string; amount: number; category: string; note: string; date: string }
const type = ref('expense')
const cat = ref('')
const amount = ref<number | null>(null)
const note = ref('')
const items = ref<FinItem[]>(store.get('finance', []))
const CATS = ['餐饮', '交通', '购物', '娱乐', '住房', '工资', '理财', '医疗', '学习', '其他']

const stats = computed(() => {
  let inc = 0, exp = 0
  items.value.forEach(r => { if (r.type === 'income') inc += r.amount; else exp += r.amount })
  return { inc: inc.toFixed(2), exp: exp.toFixed(2), bal: (inc - exp).toFixed(2) }
})
function refresh() { items.value = store.get<FinItem[]>('finance', []) }
function add() {
  const a = Number(amount.value)
  if (!(a > 0)) { ElMessage.warning('请输入有效金额'); return }
  const list = store.get<FinItem[]>('finance', [])
  list.unshift({ id: nextId(), type: type.value, amount: a, category: cat.value.trim() || '其他', note: note.value.trim(), date: fmtDate(Date.now()) })
  store.set('finance', list)
  amount.value = null; note.value = ''
  refresh()
  ElMessage.success(type.value === 'income' ? '已记录收入' : '已记录支出')
}
function del(id: string) {
  store.set('finance', store.get<FinItem[]>('finance', []).filter(x => x.id !== id))
  refresh()
}
</script>

<template>
  <div class="stats3">
    <div class="beryl-card hoverable c"><p class="l">收入</p><p class="v inc">{{ stats.inc }}</p></div>
    <div class="beryl-card hoverable c"><p class="l">支出</p><p class="v exp">{{ stats.exp }}</p></div>
    <div class="beryl-card hoverable c"><p class="l">结余</p><p class="v bal">{{ stats.bal }}</p></div>
  </div>

  <form class="beryl-card hoverable form" @submit.prevent="add">
    <el-radio-group v-model="type" class="type-btns">
      <el-radio-button value="expense">支出</el-radio-button>
      <el-radio-button value="income">收入</el-radio-button>
    </el-radio-group>
    <div class="row">
      <el-select v-model="cat" filterable allow-create default-first-option placeholder="分类">
        <el-option v-for="c in CATS" :key="c" :label="c" :value="c" />
      </el-select>
      <el-input v-model.number="amount" type="number" placeholder="金额" min="0" step="0.01" />
    </div>
    <div class="row">
      <el-input v-model="note" placeholder="备注（可选）" />
      <el-button type="primary" native-type="submit">添加</el-button>
    </div>
  </form>

  <div class="list">
    <div v-if="!items.length" class="empty">空空如也，记一笔吧 ✨</div>
    <div v-for="r in items" :key="r.id" class="beryl-card hoverable item">
      <span class="date">{{ r.date }}</span>
      <span class="tag">{{ r.category }}</span>
      <p class="note">{{ r.note }}</p>
      <span class="amt" :class="r.type === 'income' ? 'inc' : 'exp'">{{ r.type === 'income' ? '+' : '-' }}{{ Number(r.amount).toFixed(2) }}</span>
      <el-button circle text size="small" @click="del(r.id)">✕</el-button>
    </div>
  </div>
</template>

<style scoped>
.stats3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.c { padding: 14px; }
.l { font-size: 10px; color: #71717a; letter-spacing: 0.2em; }
.v { font-weight: 700; font-size: 1.1rem; margin-top: 4px; }
.inc { color: #34D399; }
.exp { color: #f87171; }
.bal { color: var(--amber); }
.form { padding: 16px; margin-top: 16px; display: flex; flex-direction: column; gap: 10px; }
.type-btns { width: 100%; }
.type-btns :deep(.el-radio-button__inner) { width: 100%; }
.row { display: flex; gap: 8px; }
.row > * { flex: 1; }
.list { margin-top: 20px; display: flex; flex-direction: column; gap: 8px; }
.item { display: flex; align-items: center; gap: 10px; padding: 12px 14px; }
.date { font-size: 10px; color: #71717a; width: 96px; flex-shrink: 0; }
.tag { font-size: 10px; padding: 2px 8px; border-radius: 999px; background: rgba(255,255,255,0.06); color: #a1a1aa; flex-shrink: 0; }
.note { flex: 1; font-size: 13px; color: #a1a1aa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.amt { font-weight: 700; font-size: 13px; flex-shrink: 0; }
.empty { text-align: center; color: #52525b; font-size: 14px; padding: 40px 0; }
</style>
