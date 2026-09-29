<script setup lang="ts">
import { computed, createTextVNode, defineComponent, h, onMounted, onUnmounted, ref } from 'vue'
import { createAsyncCollectionRepository } from '@/core/repository'
import { dateKey, lsGet, nextId, todayKey } from '@/core/storage'
import { maxStreak } from '@/core/modules'
import { withSaveState } from '@/core/save-state'

interface RawHabit { id: string; name: string; color: string; days: number; dates: string[] }
interface Habit extends RawHabit { longest: number }
const repository = createAsyncCollectionRepository<RawHabit>('habits', item => item.id)
const presets = [{ name: '晨间准备', color: '#6366F1' }, { name: '活动身体', color: '#EF4444' }, { name: '记录状态', color: '#F59E0B' }, { name: '喝水', color: '#10B981' }, { name: '留出安静时间', color: '#8B5CF6' }]
const defaultColor = '#6366F1'
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const HabitWeekLabel = defineComponent({
  props: { weekday: { type: String, required: true } },
  setup(props) {
    return () => h('span', [createTextVNode('周'), createTextVNode(props.weekday)])
  },
})
const habits = ref<Habit[]>([]); const loading = ref(true); const saving = ref(false); const error = ref(''); const name = ref(''); const color = ref(defaultColor); const editingId = ref('')
const week = computed(() => { const now = new Date(); const offset = (now.getDay() + 6) % 7; const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset); return weekdays.map((weekday, index) => { const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index); const key = dateKey(date); return { key, day: date.getDate(), weekday, today: key === todayKey() } }) })
const completedToday = computed(() => habits.value.filter(item => item.dates.includes(todayKey())).length)
const habitSummarySegments = (habit: Habit) => [' 天 · 连续最长 ', String(habit.longest), ' 天（回看）']
function toast(message: string, kind: 'success' | 'warning' | 'error' = 'success') { window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } })) }
async function seedIfNeeded() { if (lsGet('b_habits') !== null) return; await repository.replace(presets.map(item => ({ ...item, id: nextId(), days: 0, dates: [] }))) }
function normalize(item: RawHabit): Habit { const dates = Array.from(new Set(Array.isArray(item.dates) ? item.dates : [])).sort(); return { id: item.id, name: item.name, color: item.color || defaultColor, days: dates.length, dates, longest: maxStreak(dates) } }
async function load() { await seedIfNeeded(); return (await repository.list()).map(normalize) }
async function refresh() { loading.value = true; try { habits.value = await load(); error.value = '' } catch (cause) { error.value = cause instanceof Error ? cause.message : '习惯读取失败' } finally { loading.value = false } }
async function write(mutator: (items: RawHabit[]) => RawHabit[]) { await withSaveState(async () => { const current = await repository.list(); const ok = await repository.replace(mutator(current.map(item => ({ ...item, dates: Array.isArray(item.dates) ? [...item.dates] : [] })))); if (!ok) throw new Error('习惯保存失败，请检查本地存储状态') }) }
function startEditing(item: Habit) { editingId.value = item.id; name.value = item.name; color.value = item.color }
function cancelEditing() { editingId.value = ''; name.value = ''; color.value = defaultColor }
async function saveHabit() { const trimmed = name.value.trim(); if (!trimmed) { toast('请填写习惯名称', 'warning'); return }; saving.value = true; try { if (editingId.value) { await write(items => { let found = false; const next = items.map(item => { if (item.id !== editingId.value) return item; found = true; return { ...item, name: trimmed, color: color.value } }); if (!found) throw new Error('习惯已被其他操作修改，请刷新后重试'); return next }); toast('习惯已更新') } else { await write(items => [...items, { id: nextId(), name: trimmed, color: color.value, days: 0, dates: [] }]); toast('习惯已创建') }; cancelEditing(); await refresh() } catch (cause) { toast(cause instanceof Error ? cause.message : '习惯保存失败', 'error') } finally { saving.value = false } }
async function toggleDate(item: Habit, key: string) { saving.value = true; try { await write(items => { let found = false; const next = items.map(current => { if (current.id !== item.id) return current; found = true; const dates = new Set(Array.isArray(current.dates) ? current.dates : []); if (dates.has(key)) dates.delete(key); else dates.add(key); const nextDates = [...dates].sort(); return { ...current, dates: nextDates, days: nextDates.length } }); if (!found) throw new Error('习惯已被其他操作修改，请刷新后重试'); return next }); await refresh() } catch (cause) { toast(cause instanceof Error ? cause.message : '小行动记录失败', 'error') } finally { saving.value = false } }
function weekLabel() { const first = week.value[0]?.key || ''; const last = week.value.at(-1)?.key || ''; return first && last ? `${first} — ${last}` : '本周' }
const onSync = () => void refresh()
onMounted(() => { void refresh(); window.addEventListener('beryl-data-synced', onSync) })
onUnmounted(() => window.removeEventListener('beryl-data-synced', onSync))
</script>
<template>
  <div class="habits-page"><header class="page-head"><div><p class="eyebrow">习惯 · 日常节奏</p><h1 class="font-title">习惯</h1><p>用一周视图记录可持续的小行动；连续天数只作回看线索，不是需要追赶的目标。</p></div><span class="load-pill">今日已记录 {{completedToday}} 个小行动 · 仅作回看</span></header>
    <section class="beryl-card" style="padding:16px;margin-bottom:16px"><div class="panel-head"><div><p class="eyebrow">{{editingId ? 'EDIT HABIT' : 'NEW HABIT'}}</p><h2 class="font-title">{{editingId ? '编辑小行动' : '添加一个小行动'}}</h2></div><span class="muted">{{weekLabel()}}</span></div><form class="create-row" @submit.prevent="saveHabit"><input aria-label="小行动名称" v-model="name" placeholder="例如：午后走到户外 10 分钟" :disabled="saving"><label class="color-field"><span>颜色</span><input aria-label="习惯颜色" type="color" v-model="color" :disabled="saving"></label><button class="app-button primary" type="submit" :disabled="saving">{{saving ? '保存中…' : editingId ? '保存修改' : '创建习惯'}}</button><button v-if="editingId" class="app-button" type="button" @click="cancelEditing" :disabled="saving">取消</button></form></section>
    <section v-if="error" class="beryl-card empty-state" role="alert"><b>习惯数据暂时无法读取</b><p>{{error}}</p><button class="app-button" type="button" @click="refresh">重试</button></section><div v-if="loading" class="empty-state" role="status">正在读取习惯…</div>
    <div v-else-if="habits.length" class="list" aria-live="polite">
      <article v-for="habit in habits" :key="habit.id" class="beryl-card habit-card">
        <div class="habit-heading">
          <span aria-hidden="true" class="habit-dot" :style="{background:habit.color}"></span>
          <strong>{{habit.name}}</strong>
          <span class="muted habit-meta" style="margin-left:auto;text-align:right">历史记录 <b :style="{color:habit.color}">{{habit.days}}</b><template v-for="(segment,index) in habitSummarySegments(habit)" :key="index">{{segment}}</template></span>
          <button class="app-button" type="button" @click="startEditing(habit)" :disabled="saving">编辑</button>
        </div>
        <div class="habit-week"><button v-for="day in week" :key="day.key" type="button" :aria-label="`${habit.name} ${day.key} ${habit.dates.includes(day.key) ? '已记录' : '未记录'}`" :aria-pressed="habit.dates.includes(day.key)" :disabled="saving" :class="{checked:habit.dates.includes(day.key),today:day.today}" :style="{ '--habit-color': habit.color, color: habit.dates.includes(day.key) ? '#fff' : 'var(--c-text-2)', border: `1px solid ${habit.dates.includes(day.key) ? habit.color : day.today ? 'var(--scene-border-strong)' : 'var(--c-border-soft)'}` }" @click="toggleDate(habit,day.key)"><HabitWeekLabel :weekday="day.weekday" /><span>{{day.day}}</span></button></div>
      </article>
    </div><div v-else class="empty-state">还没有小行动，先创建一个现实中做得到的动作吧。</div>
  </div>
</template>
<style scoped>
.habit-card { padding: 16px; }
.habit-heading { min-width: 0; display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.habit-heading strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.habit-meta { margin-left: auto; text-align: right; }
.habit-dot { width: 10px; height: 10px; flex: 0 0 auto; border-radius: 50%; }
.habit-week { display: flex; justify-content: space-between; gap: 6px; }
.habit-week button { min-width: 0; flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 0; border: 1px solid var(--c-border-soft); border-radius: 10px; background: var(--c-bg-soft); color: var(--c-text-2); cursor: pointer; }
.habit-week button.today { border-color: var(--scene-border-strong); }
.habit-week button.checked { border-color: var(--habit-color); background: var(--habit-color); color: #fff; }
.habit-week button:disabled { cursor: wait; }
.habit-week button span { font-size: 10px; opacity: .7; }
.habit-week button span:last-child { font-size: 12px; font-weight: 700; opacity: 1; }
@media (max-width: 620px) { .habit-card .panel-head { flex-wrap: wrap; } }
</style>
