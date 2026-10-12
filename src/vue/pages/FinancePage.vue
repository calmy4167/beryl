<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { fmtDate, nextId } from '@/core/storage'
import { registerUndo } from '@/core/undo'
import { withSaveState } from '@/core/save-state'
import { linkFinanceToCase } from '@/application'
import { caseAsyncRelationRepository, caseAsyncRepository } from '@/domain/case/repository'
import { unifiedAsyncRepository, type DictionaryOption } from '@/domain/unified'
import { financeAsyncRepository, type FinanceEntry } from '@/domain/finance/repository'
import { readServerSession } from '@/core/auth'
import type { Ownership, Person } from '@/domain/unified/model'
import DomainPicker from '@/vue/components/DomainPicker.vue'
import OwnershipEditor from '@/vue/components/OwnershipEditor.vue'
import ContextRelationPicker from '@/vue/components/ContextRelationPicker.vue'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbPanel from '@/vue/liubai/LbPanel.vue'
import LbCollapsible from '@/vue/liubai/LbCollapsible.vue'
import LbStatGrid from '@/vue/liubai/LbStatGrid.vue'
import type { LbStat } from '@/vue/liubai/types'

// 页面自带头部（参考稿里 .slide-head 属于页面自身），外壳因此不再渲染第二行标题。
useOwnSlideHead()
type FinanceItem = FinanceEntry
const repository = financeAsyncRepository
const defaultCategories = ['餐饮', '交通', '购物', '娱乐', '住房', '工资', '理财', '医疗', '学习', '其他']
const items = ref<FinanceItem[]>([]); const people = ref<Person[]>([]); const currentUserId = readServerSession()?.user.id; const categoryOptions = ref<DictionaryOption[]>([]); const categoryOptionsLoading = ref(false); const categoryOptionsError = ref(''); const type = ref<'expense' | 'income'>('expense'); const category = ref(''); const amount = ref(''); const note = ref(''); const filter = ref<'all' | 'income' | 'expense'>('all'); const busyId = ref(''); const ownershipBusyId = ref(''); const loading = ref(true); const error = ref('')
function toast(message: string, kind: 'success' | 'warning' | 'error' = 'success') { window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } })) }
function parseAmountCents(value: string): number | null { const normalized = value.trim(); if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null; const [whole, fraction = ''] = normalized.split('.'); const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0')); return Number.isSafeInteger(cents) && cents > 0 ? cents : null }
function amountCents(item: Pick<FinanceItem, 'amount' | 'amountCents'>) { const stored = Number(item.amountCents); if (Number.isSafeInteger(stored)) return stored; const legacy = item.amount == null ? null : parseAmountCents(String(item.amount)); return legacy ?? Math.round(Number(item.amount || 0) * 100) }
function formatCents(cents: number) { const sign = cents < 0 ? '-' : ''; const absolute = Math.abs(Math.trunc(cents)); return `${sign}${Math.floor(absolute / 100).toLocaleString('zh-CN')}.${String(absolute % 100).padStart(2, '0')}` }
async function refreshCategoryOptions() { categoryOptionsLoading.value = true; try { categoryOptions.value = (await unifiedAsyncRepository.list<DictionaryOption>('dictionary_option')).filter(option => option.module === 'finance' && option.field === 'category'); categoryOptionsError.value = '' } catch (cause) { categoryOptionsError.value = cause instanceof Error ? cause.message : '财务类别读取失败' } finally { categoryOptionsLoading.value = false } }
async function refresh() { loading.value = true; error.value = ''; try { const [records, currentPeople] = await Promise.all([repository.list(), unifiedAsyncRepository.list<Person>('person'), refreshCategoryOptions()]); people.value = currentPeople; items.value = records.filter(item => item?.id).map(item => ({ ...item, type: item.type || 'expense', category: item.category || '其他', note: item.note || '', date: item.date || '' })) } catch (cause) { error.value = cause instanceof Error ? cause.message : '财务数据读取失败' } finally { loading.value = false } }
const stats = computed(() => items.value.reduce((result, item) => { const cents = amountCents(item); if (item.type === 'income') result.income += cents; else result.expense += cents; return result }, { income: 0, expense: 0 }))
/** 「留白」统计卡（HUD 第 3 档收起）。金额口径与列表一致，都用 amountCents/formatCents。 */
const summary = computed<LbStat[]>(() => [
  { label: '收入', value: formatCents(stats.value.income), unit: ' 元', accent: true },
  { label: '支出', value: formatCents(stats.value.expense), unit: ' 元' },
  { label: '结余', value: formatCents(stats.value.income - stats.value.expense), unit: ' 元' },
  { label: '记录', value: items.value.length, unit: ' 条' }
])
const visibleItems = computed(() => filter.value === 'all' ? items.value : items.value.filter(item => item.type === filter.value))
const categorySuggestions = computed(() => [...new Set([...defaultCategories, ...categoryOptions.value.filter(option => option.status === 'active').map(option => option.value)])])
function displayCategory(item: FinanceItem): string { const option = categoryOptions.value.find(candidate => candidate.calmyId === item.categoryOptionId); return option ? `${option.value}${option.status === 'retired' ? '（已停用）' : ''}` : item.category }
async function add() { if (categoryOptionsLoading.value || categoryOptionsError.value) { toast('财务类别尚未加载成功，请重试后再添加记录', 'warning'); return }; const cents = parseAmountCents(amount.value); if (cents == null) { toast('请输入大于 0 且最多两位小数的金额', 'warning'); return }; const categoryValue = category.value.trim() || '其他'; const categoryOption = categoryOptions.value.find(option => option.status === 'active' && option.value.trim().toLocaleLowerCase() === categoryValue.toLocaleLowerCase()); try { await withSaveState(() => repository.create({ id: nextId(), type: type.value, amountCents: cents, amount: cents / 100, category: categoryValue, categoryOptionId: categoryOption?.calmyId, note: note.value.trim(), date: fmtDate(Date.now()) })); amount.value = ''; note.value = ''; await refresh(); window.dispatchEvent(new CustomEvent('beryl-data-synced')); toast(type.value === 'income' ? '已记录收入' : '已记录支出') } catch (cause) { toast(cause instanceof Error ? cause.message : '财务记录保存失败', 'error') } }
async function remove(item: FinanceItem) { if (!window.confirm(`确定删除「${displayCategory(item)}」${item.note ? `（${item.note}）` : ''}的 ${formatCents(amountCents(item))} 元记录吗？删除后可在短时间内撤销。`)) return; busyId.value = item.id; try { await withSaveState(async () => { const list = await repository.list(); const index = list.findIndex(candidate => String(candidate.id) === item.id); if (index < 0) throw new Error('记录已不存在，请刷新后重试'); const [removed] = list.splice(index, 1); if (!await repository.remove(item.id)) throw new Error('删除失败，原记录未改变'); registerUndo('finance', removed, index, item.id) }); await refresh(); window.dispatchEvent(new CustomEvent('beryl-data-synced')); toast('财务记录已删除，可在提示出现后撤销') } catch (cause) { toast(cause instanceof Error ? cause.message : '删除失败', 'error') } finally { busyId.value = '' } }
const relationCases = ref<Record<string, Array<{ id: string; title: string }>>>({}); const relationValues = ref<Record<string, string>>({})
async function loadRelation(item: FinanceItem) { try { const [cases, relations] = await Promise.all([caseAsyncRepository.list(), caseAsyncRelationRepository.listForTarget('transaction', item.id)]); relationCases.value[item.id] = cases.filter(candidate => candidate.status !== 'archived').map(candidate => ({ id: candidate.id, title: candidate.title })); relationValues.value[item.id] = relations[0]?.caseId || '' } catch (cause) { toast(cause instanceof Error ? cause.message : '课题关联读取失败', 'warning') } }
async function saveRelation(item: FinanceItem, value: string) { try { await withSaveState(() => linkFinanceToCase({ caseId: value, transactionId: item.id, phase: 'earth', commandId: nextId() })); relationValues.value[item.id] = value; window.dispatchEvent(new CustomEvent('beryl-data-synced')); toast(value ? '已关联课题' : '已取消课题关联') } catch (cause) { toast(cause instanceof Error ? cause.message : '课题关联保存失败', 'error') } }
async function saveOwnership(item: FinanceItem, ownership: Ownership | undefined) { ownershipBusyId.value = item.id; try { const updated = await withSaveState(() => financeAsyncRepository.setOwnership(item.id, ownership, item.revision ?? 0, currentUserId)); items.value = items.value.map(candidate => candidate.id === item.id ? { ...candidate, ...updated } : candidate); window.dispatchEvent(new CustomEvent('beryl-data-synced')); toast('财务记录归属已保存') } catch (cause) { toast(cause instanceof Error ? cause.message : '财务记录归属保存失败', 'error') } finally { ownershipBusyId.value = '' } }
watch(visibleItems, values => values.forEach(item => { void loadRelation(item) }))
const onSync = () => void refresh()
const onDictionaryChanged = () => void refreshCategoryOptions()
onMounted(() => { void refresh(); window.addEventListener('beryl-data-synced', onSync); window.addEventListener('calmy-dictionary-updated', onDictionaryChanged) })
onUnmounted(() => { window.removeEventListener('beryl-data-synced', onSync); window.removeEventListener('calmy-dictionary-updated', onDictionaryChanged) })
</script>
<template>
  <header class="slide-head">
    <div class="head-main">
      <p class="hint">财务 · Finance</p>
      <div class="head-title-row">
        <h2 v-if="loading">正在读取…</h2>
        <h2 v-else-if="!items.length">还没有记过一笔。</h2>
        <h2 v-else>结余 <em>{{ formatCents(stats.income - stats.expense) }}</em> 元。</h2>
        <span class="info" tabindex="0" data-tip="金额以分为单位保存；可用主数据里的「财务类别」匹配稳定选项。H 收起辅助信息。" aria-label="财务说明">i</span>
      </div>
    </div>
    <span class="panel-note">{{ loading ? '正在读取…' : `${items.length} 条记录` }}</span>
  </header>

    <section v-if="error" class="panel finance-error" role="alert"><b>财务数据暂时无法读取</b><p class="dim">{{error}}</p><button class="chip" type="button" @click="refresh">重试</button></section>

    <LbCollapsible block="financeStats" :rank="3">
      <LbPanel title="收支汇总">
        <LbStatGrid :stats="summary" />
      </LbPanel>
    </LbCollapsible>

    <LbPanel title="记一笔" note="金额以分为单位保存">
      <form class="finance-form" @submit.prevent="add">
        <div class="create-row"><select aria-label="收支类型" v-model="type"><option value="expense">支出</option><option value="income">收入</option></select><input list="finance-categories" aria-label="财务分类" v-model="category" placeholder="分类，例如餐饮"><input aria-label="金额" inputmode="decimal" v-model="amount" placeholder="金额，例如 12.50"></div>
        <p class="finance-dictionary-help">可用主数据中的“财务类别”匹配稳定选项；旧式自定义分类仍可直接填写。</p>
        <div v-if="categoryOptionsError" class="finance-dictionary-error" role="alert">财务类别读取失败：{{categoryOptionsError}} <button class="chip" type="button" :disabled="categoryOptionsLoading" @click="refreshCategoryOptions">{{categoryOptionsLoading ? '正在重试…' : '重试'}}</button></div>
        <div class="create-row finance-note-row"><input v-model="note" aria-label="财务备注" placeholder="备注（可选）"><button class="chip on" type="submit" :disabled="loading || categoryOptionsLoading || !!categoryOptionsError">添加记录</button></div>
        <datalist id="finance-categories"><option v-for="item in categorySuggestions" :key="item" :value="item" /></datalist>
      </form>
    </LbPanel>

    <LbPanel title="记录" :note="loading ? '正在读取…' : `${visibleItems.length} 条`">
      <div class="finance-list-head"><select aria-label="财务记录筛选" v-model="filter"><option value="all">全部</option><option value="income">收入</option><option value="expense">支出</option></select></div>
      <section class="history-list" aria-live="polite"><div v-if="loading" class="dim" role="status">正在读取财务记录…</div><template v-else><article v-for="item in visibleItems" :key="item.id" class="finance-item panel"><div class="finance-item-head"><div><p class="eyebrow">{{item.type === 'income' ? 'INCOME · 收入' : 'EXPENSE · 支出'}}</p><h3>{{displayCategory(item)}}</h3></div><time>{{item.date || '日期未知'}}</time></div><div class="finance-item-body"><p>{{item.note || '没有备注'}}</p><strong :class="item.type === 'income' ? 'finance-income' : 'finance-expense'">{{item.type === 'income' ? '+' : '-'}}{{formatCents(amountCents(item))}} 元</strong></div><div class="finance-item-actions"><select class="case-link" :aria-label="`关联${displayCategory(item)}课题`" :value="relationValues[item.id] || ''" @change="saveRelation(item, ($event.target as HTMLSelectElement).value)"><option value="">关联课题</option><option v-for="candidate in relationCases[item.id] || []" :key="candidate.id" :value="candidate.id">◈ {{candidate.title}}</option></select><button class="chip danger" :disabled="busyId === item.id || loading" @click="remove(item)" :aria-label="`删除${displayCategory(item)}财务记录`">{{busyId === item.id ? '删除中…' : '删除'}}</button></div><DomainPicker :entity-ref="{ entityType: 'finance_entry', calmyId: item.id }" /><ContextRelationPicker :entity-ref="{ entityType: 'finance_entry', calmyId: item.id }" /><OwnershipEditor :ownership="item.ownership" :people="people" :current-user-id="currentUserId" :disabled="ownershipBusyId === item.id || loading" label="财务记录归属与隐私" @save="saveOwnership(item, $event)" /></article><p v-if="!visibleItems.length" class="dim">还没有匹配的财务记录。记录第一笔收入或支出，开始看见现金流。</p></template></section>
    </LbPanel>
</template>

<style scoped>
/* 页面局部排版：颜色取「留白」令牌。.finance-item-actions .case-link 是 parity 测试的钩子。 */
.finance-error { border-color: color-mix(in srgb, var(--danger) 45%, transparent); }
.finance-form { display: grid; gap: 10px; }
.create-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.create-row select, .create-row input { min-height: 34px; padding: 6px 10px; font: inherit; font-size: .8rem; }
.create-row input:not([list]) { flex: 1 1 160px; min-width: 0; }
.finance-dictionary-help { margin: 0; color: var(--muted); font-size: .72rem; line-height: 1.6; }
.finance-dictionary-error { margin: 0; color: var(--danger); font-size: .72rem; line-height: 1.6; }
.finance-list-head { display: flex; justify-content: flex-end; }
.finance-list-head select { min-height: 32px; padding: 5px 9px; font: inherit; font-size: .78rem; }
.history-list { display: grid; gap: 10px; }
.finance-item { display: grid; gap: 8px; }
.finance-item-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.finance-item-head .eyebrow { margin: 0 0 3px; }
.finance-item-head h3 { margin: 0; font-size: .95rem; font-weight: 600; color: var(--fg); }
.finance-item-head time { color: var(--muted); font-size: .72rem; white-space: nowrap; }
.finance-item-body { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.finance-item-body p { margin: 0; color: var(--muted); font-size: .8rem; }
.finance-item-body strong { font-size: .95rem; }
.finance-income { color: var(--accent); }
.finance-expense { color: var(--danger); }
.finance-item-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.finance-item-actions .case-link { flex: 1 1 180px; min-width: 0; min-height: 32px; padding: 5px 9px; font: inherit; font-size: .78rem; }
@media (max-width: 620px) {
  .create-row input:not([list]) { flex: 1 1 100%; }
}
</style>
