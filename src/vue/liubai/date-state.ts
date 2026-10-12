import { computed } from 'vue'
import { ref } from 'vue'
import { todayKey } from '@/core/storage'
import { dayKeyOf, pad } from './focus'

/**
 * 每个模块各自一格日期。
 *
 * 参考稿把 6 个模块的日期放在同一个 state.dates[6] 里（可单个偏离，也可「同步到所有模块」），
 * 这里沿用同一模型，但持久化到独立的 liubai-dates 键——不碰任何业务 Repository。
 * 值为 'YYYY-MM-DD'（日模块）/ 该日期所在周（周模块）/ 'all'（全部）。
 */
export type ModuleKey = 'today' | 'tasks' | 'habits' | 'pomo' | 'diary' | 'review'
export const ALL = 'all'

const STORAGE_KEY = 'liubai-dates'
const MODULES: ModuleKey[] = ['today', 'tasks', 'habits', 'pomo', 'diary', 'review']

function fallbackDates(): Record<ModuleKey, string> {
  const today = todayKey()
  return { today, tasks: today, habits: today, pomo: today, diary: today, review: today }
}

function loadDates(): Record<ModuleKey, string> {
  const base = fallbackDates()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<Record<ModuleKey, string>>
    for (const key of MODULES) {
      const value = parsed?.[key]
      if (typeof value === 'string' && (value === ALL || /^\d{4}-\d{2}-\d{2}$/.test(value))) base[key] = value
    }
  } catch { /* 隐私模式：用默认值 */ }
  return base
}

const dates = ref<Record<ModuleKey, string>>(loadDates())

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(dates.value)) } catch { /* 忽略 */ }
}

/** 该模块的日期是否与其它模块不同（决定是否显示「同步到所有模块」与偏离小圆点） */
export function isDetached(key: ModuleKey) {
  const mine = dates.value[key]
  return MODULES.some(other => other !== key && dates.value[other] !== mine)
}

export function syncAllDates(key: ModuleKey) {
  const value = dates.value[key]
  dates.value = MODULES.reduce((next, module) => ({ ...next, [module]: value }), {} as Record<ModuleKey, string>)
  persist()
}

export function resetAllToToday() {
  dates.value = fallbackDates()
  persist()
}

export function dayKeyOffset(offset: number) {
  const base = new Date(`${todayKey()}T00:00:00`)
  base.setDate(base.getDate() + offset)
  return dayKeyOf(base.getTime())
}

/** 相对今天的人类可读标签（今天 / 昨天 / 前天 / 明天 / 后天 / M月D日） */
export function humanDay(value: string) {
  if (value === ALL) return '全部'
  const today = todayKey()
  if (value === today) return '今天'
  if (value === dayKeyOffset(-1)) return '昨天'
  if (value === dayKeyOffset(-2)) return '前天'
  if (value === dayKeyOffset(1)) return '明天'
  if (value === dayKeyOffset(2)) return '后天'
  return `${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日`
}

export function weekRangeLabel(week: string[]) {
  const label = (value: string) => `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`
  return `${label(week[0])} – ${label(week[6])}`
}

/** 供页面使用的模块日期钩子 */
export function useModuleDate(key: ModuleKey) {
  const value = computed(() => dates.value[key])
  const isAll = computed(() => value.value === ALL)
  function set(next: string) {
    dates.value = { ...dates.value, [key]: next }
    persist()
  }
  function backToToday() { set(todayKey()) }
  return { value, isAll, set, backToToday }
}

/** 日期输入框（原生 date picker），参考稿用隐藏 input + showPicker 的做法 */
export function pickDate(current: string, onPick: (value: string) => void) {
  const input = document.createElement('input')
  input.type = 'date'
  input.value = current === ALL ? todayKey() : current
  input.style.position = 'fixed'
  input.style.left = '-9999px'
  document.body.appendChild(input)
  const cleanup = () => window.setTimeout(() => input.remove(), 120)
  input.addEventListener('change', () => {
    const value = input.value
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) onPick(value)
    cleanup()
  })
  input.addEventListener('blur', cleanup)
  const picker = input as HTMLInputElement & { showPicker?: () => void }
  if (typeof picker.showPicker === 'function') picker.showPicker()
  else input.click()
}

export { MODULES, pad }
