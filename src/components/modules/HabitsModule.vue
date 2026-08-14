<script setup lang="ts">
import { ref } from 'vue'
import { store, nextId, todayKey, dateKey } from '@/core/storage'
import { maxStreak } from '@/core/modules'

interface Habit { id: string; name: string; color: string; days: number; dates: string[] }
const PRESETS = [
  { name: '晨间阅读', color: '#6366F1' },
  { name: '运动', color: '#EF4444' },
  { name: '日记', color: '#F59E0B' },
  { name: '喝水', color: '#10B981' },
  { name: '冥想', color: '#8B5CF6' }
]

function seed(): Habit[] {
  const existing = localStorage.getItem('b_habits')
  if (existing != null) return store.get<Habit[]>('habits', [])
  const list = PRESETS.map(h => ({ id: nextId(), name: h.name, color: h.color, days: 0, dates: [] as string[] }))
  store.set('habits', list)
  return list
}
const habits = ref<Habit[]>(seed())
const tk = todayKey()

function weekDates(): { key: string; day: number; wd: string; today: boolean }[] {
  const d = new Date()
  const offset = (d.getDay() + 6) % 7
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset)
  const wd = ['一', '二', '三', '四', '五', '六', '日']
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
    const key = dateKey(x)
    return { key, day: x.getDate(), wd: wd[i], today: key === tk }
  })
}
function week() { return weekDates() }
function hasDate(h: Habit, key: string): boolean { return h.dates.includes(key) }
function toggle(h: Habit, key: string) {
  const i = h.dates.indexOf(key)
  if (i >= 0) h.dates.splice(i, 1); else h.dates.push(key)
  h.days = h.dates.length
  store.set('habits', habits.value)
}
function longest(h: Habit): number { return maxStreak(h.dates) }
</script>

<template>
  <div class="list">
    <div v-for="h in habits" :key="h.id" class="beryl-card hoverable habit">
      <div class="head">
        <span class="dot" :style="{ background: h.color }" />
        <span class="name">{{ h.name }}</span>
        <span class="days">累计 <b :style="{ color: h.color }">{{ h.days }}</b> 天 · 最长 {{ longest(h) }} 天</span>
      </div>
      <div class="week">
        <button
          v-for="w in week()"
          :key="w.key"
          class="day"
          :class="{ today: w.today, on: hasDate(h, w.key) }"
          :style="hasDate(h, w.key) ? { background: h.color, borderColor: h.color } : {}"
          @click="toggle(h, w.key)"
        >
          <span class="wd">周{{ w.wd }}</span>
          <span class="d">{{ w.day }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.list { display: flex; flex-direction: column; gap: 12px; }
.habit { padding: 16px; }
.head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.dot { width: 10px; height: 10px; border-radius: 50%; }
.name { font-size: 14px; font-weight: 500; }
.days { margin-left: auto; font-size: 10px; color: #71717a; }
.week { display: flex; justify-content: space-between; gap: 6px; }
.day { flex: 1; max-width: 58px; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 0; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: #a1a1aa; cursor: pointer; }
.day.today { border-color: rgba(245, 158, 11, 0.6); }
.day.on { color: #0A0A0F; font-weight: 700; }
.wd { font-size: 10px; opacity: 0.7; }
.d { font-size: 12px; font-weight: 700; }
</style>
