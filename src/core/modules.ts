/* ---------- 十神分类 与 模块注册表（平移 v1） ---------- */
import { store } from './storage.ts'
import { SCENES, currentSceneId } from './scenes.ts'

export interface ModDef {
  id: string
  name: string
  icon: string
  color: string
}

export const MODS: Record<string, ModDef> = {
  inbox: { id: 'inbox', name: '收件箱', icon: '📥', color: '#6366F1' },
  diary: { id: 'diary', name: '日记', icon: '📓', color: '#6366F1' },
  posts: { id: 'posts', name: '博客', icon: '✍️', color: '#F59E0B' },
  habits: { id: 'habits', name: '习惯', icon: '🎯', color: '#10B981' },
  chars: { id: 'chars', name: '人物', icon: '👥', color: '#10B981' },
  tasks: { id: 'tasks', name: '任务', icon: '📌', color: '#EF4444' },
  goals: { id: 'goals', name: '目标', icon: '🥅', color: '#EF4444' },
  finance: { id: 'finance', name: '财务', icon: '💰', color: '#8B5CF6' },
  pomo: { id: 'pomo', name: '番茄钟', icon: '🍅', color: '#8B5CF6' },
  moments: { id: 'moments', name: '动态', icon: '💬', color: '#EC4899' }
}

export interface CatDef {
  id: string
  name: string
  icon: string
  color: string
  mods: string[]
}

export const CATS: CatDef[] = [
  { id: 'all', name: '全部', icon: '⬡', color: '#F59E0B', mods: ['inbox', 'diary', 'posts', 'habits', 'chars', 'tasks', 'goals', 'finance', 'pomo'] },
  { id: 'yin', name: '印枭·输入', icon: '📖', color: '#6366F1', mods: ['inbox', 'diary'] },
  { id: 'shi', name: '食伤·输出', icon: '✍️', color: '#F59E0B', mods: ['posts'] },
  { id: 'bi', name: '比劫·身心', icon: '🤝', color: '#10B981', mods: ['habits', 'chars'] },
  { id: 'guan', name: '官杀·目标', icon: '🎯', color: '#EF4444', mods: ['tasks', 'goals'] },
  { id: 'cai', name: '财才·资源', icon: '💰', color: '#8B5CF6', mods: ['finance', 'pomo'] },
  { id: 'social', name: '动态·互动', icon: '💬', color: '#EC4899', mods: ['moments'] }
]

export const MOD_CAT: Record<string, string> = {}
CATS.forEach(c => c.mods.forEach(m => { MOD_CAT[m] = c.id }))

/** 当前场景可见模块 id 列表 */
export function modsFor(sceneId: string): string[] {
  return SCENES[sceneId]?.mods || []
}
/** 当前场景可见的分类（含至少一个可见模块） */
export function catsFor(sceneId: string): CatDef[] {
  const mods = new Set(modsFor(sceneId))
  return CATS.filter(c => c.mods.some(m => mods.has(m)))
}
export function visibleMods(): string[] {
  return modsFor(currentSceneId())
}

/* ---------- 统计卡片计算（平移 v1 statValue） ---------- */
export function maxStreak(dates: string[] | undefined): number {
  if (!dates || !dates.length) return 0
  const sorted = [...new Set(dates)].sort()
  let best = 1, cur = 1
  for (let i = 1; i < sorted.length; i++) {
    const diff = (Date.parse(sorted[i]) - Date.parse(sorted[i - 1])) / 86400000
    cur = diff === 1 ? cur + 1 : 1
    best = Math.max(best, cur)
  }
  return best
}

export function statValue(type: string): string {
  const tasks = store.get<any[]>('tasks', [])
  const goals = store.get<any[]>('goals', [])
  const habits = store.get<any[]>('habits', [])
  switch (type) {
    case 'count': return String(tasks.length)
    case 'done': return String(tasks.filter(t => t.done).length)
    case 'streak': {
      const s = habits.length ? Math.max(...habits.map(h => maxStreak(h.dates))) : 0
      return s + '<span class="unit">天</span>'
    }
    case 'pct': {
      const p = goals.length ? Math.round(goals.filter(g => g.done).length / goals.length * 100) : 0
      return p + '<span class="unit">%</span>'
    }
    case 'balance': {
      const fin = store.get<any[]>('finance', [])
      return fin.reduce((a, r) => a + (r.type === 'income' ? r.amount : -r.amount), 0).toFixed(2)
    }
    case 'pomo': return (Number(store.get('pomoTotal', 0)) || 0) + '<span class="unit">分</span>'
    case 'posts': return String(store.get<any[]>('posts', []).length)
    default: return '0'
  }
}

export const STAT_LABEL: Record<string, string> = { count: '待办', done: '完成', streak: '习惯', pct: '目标', balance: '结余', pomo: '番茄', posts: '文章' }
export const STAT_COLOR: Record<string, string> = { count: 'var(--scene)', done: '#34D399', streak: '#F59E0B', pct: '#8B5CF6', balance: '#34D399', pomo: '#EF4444', posts: '#F59E0B' }
export const STAT_MOD: Record<string, string> = { count: 'tasks', done: 'tasks', streak: 'habits', pct: 'goals', balance: 'finance', pomo: 'pomo', posts: 'posts' }
