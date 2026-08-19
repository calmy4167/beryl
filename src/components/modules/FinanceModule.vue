<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { store, nextId, fmtDate } from '@/core/storage'
import CaseLinkSelect from '@/components/CaseLinkSelect.vue'
import { registerUndo } from '@/core/undo'
import EmptyState from '@/components/EmptyState.vue'
import { listRealityDocuments } from '@/domain/reality'

interface FinItem { id: string; type: string; amount?: number; amountCents?: number; category: string; note: string; date: string }
const type = ref('expense')
const cat = ref('')
const amount = ref<number | null>(null)
const note = ref('')
const items = ref<FinItem[]>(load())
const CATS = ['餐饮', '交通', '购物', '娱乐', '住房', '工资', '理财', '医疗', '学习', '其他']

function load(): FinItem[] {
  return listRealityDocuments({ types: ['transaction'] }).map(item => ({
    id: item.id, type: item.financeType || item.status || 'expense', amount: item.amount, amountCents: item.amountCents,
    category: item.category || item.title, note: item.body || '', date: item.date || ''
  }))
}

const stats = computed(() => {
  let inc = 0, exp = 0
  items.value.forEach(r => { const cents = amountCents(r); if (r.type === 'income') inc += cents; else exp += cents })
  return { inc: (inc / 100).toFixed(2), exp: (exp / 100).toFixed(2), bal: ((inc - exp) / 100).toFixed(2) }
})
function amountCents(item: FinItem): number {
  return Number.isInteger(item.amountCents) ? item.amountCents! : Math.round(Number(item.amount || 0) * 100)
}
function refresh() { items.value = load() }
function add() {
  const a = Number(amount.value)
  if (!(a > 0)) { ElMessage.warning('请输入有效金额'); return }
  const list = store.get<FinItem[]>('finance', [])
  const cents = Math.round(a * 100)
  list.unshift({ id: nextId(), type: type.value, amount: cents / 100, amountCents: cents, category: cat.value.trim() || '其他', note: note.value.trim(), date: fmtDate(Date.now()) })
  store.set('finance', list)
  amount.value = null; note.value = ''
  refresh()
  ElMessage.success(type.value === 'income' ? '已记录收入' : '已记录支出')
}
function del(id: string) {
  const list = store.get<FinItem[]>('finance', [])
  const index = list.findIndex(x => x.id === id)
  if (index >= 0) { const [removed] = list.splice(index, 1); registerUndo('finance', removed, index, id); store.set('finance', list) }
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
    <EmptyState v-if="!items.length" icon="¥" title="还没有财务记录" description="记录第一笔收入或支出，开始看见现金流。" />
    <div v-for="r in items" :key="r.id" class="beryl-card hoverable item">
      <span class="date">{{ r.date }}</span>
      <span class="tag">{{ r.category }}</span>
      <p class="note">{{ r.note }}</p>
      <span class="amt" :class="r.type === 'income' ? 'inc' : 'exp'">{{ r.type === 'income' ? '+' : '-' }}{{ (amountCents(r) / 100).toFixed(2) }}</span>
      <CaseLinkSelect target-type="transaction" :target-id="r.id" compact />
      <el-button circle text size="small" aria-label="删除财务记录" @click="del(r.id)">✕</el-button>
    </div>
  </div>
</template>

<style scoped>
.stats3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.c { padding: 14px; }
.l { font-size: 10px; color: var(--c-text-2); letter-spacing: 0.2em; }
.v { font-weight: 700; font-size: 1.1rem; margin-top: 4px; }
.inc { color: var(--c-success); }
.exp { color: var(--c-danger); }
.bal { color: var(--amber); }
.form { padding: 16px; margin-top: 16px; display: flex; flex-direction: column; gap: 10px; }
.type-btns { width: 100%; }
.type-btns :deep(.el-radio-button__inner) { width: 100%; }
.row { display: flex; gap: 8px; flex-wrap: wrap; }
.row > * { flex: 1; min-width: 140px; }
.list { margin-top: 20px; display: flex; flex-direction: column; gap: 8px; }
.item { display: flex; align-items: center; gap: 10px; padding: 12px 14px; }
.date { font-size: 10px; color: var(--c-text-2); width: 96px; flex-shrink: 0; }
.tag { font-size: 10px; padding: 2px 8px; border-radius: 999px; background: var(--c-bg-2); color: var(--c-text-2); flex-shrink: 0; }
.note { flex: 1; font-size: 13px; color: var(--c-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.amt { font-weight: 700; font-size: 13px; flex-shrink: 0; }
.empty { text-align: center; color: var(--c-text-3); font-size: 14px; padding: 40px 0; }
</style>
