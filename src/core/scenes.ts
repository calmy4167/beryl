/* ---------- 场景配置（平移 v1：各场景独立 tagline/mods/stats） ---------- */
export interface SceneDef {
  id: string
  name: string
  icon: string
  color: string
  desc: string
  tagline: string
  mods: string[]
  stats: string[]
}

export const ALL_MODS = ['inbox', 'diary', 'posts', 'habits', 'chars', 'tasks', 'goals', 'finance', 'pomo', 'moments']

export const SCENES: Record<string, SceneDef> = {
  personal: { id: 'personal', name: '个人', icon: '🧑', color: '#2F9E68', desc: '专注自我提升', tagline: '写下你的想法', mods: [...ALL_MODS], stats: ['count', 'done', 'streak', 'pct'] },
  couple: { id: 'couple', name: '情侣', icon: '💑', color: '#F472B6', desc: '共同成长', tagline: '写下你们的故事', mods: [...ALL_MODS], stats: ['count', 'done', 'streak', 'pomo'] },
  married: { id: 'married', name: '夫妻', icon: '👩❤️👨', color: '#FB923C', desc: '共建家庭', tagline: '经营你们的小家', mods: ALL_MODS.filter(m => m !== 'pomo'), stats: ['count', 'done', 'balance', 'pct'] },
  family: { id: 'family', name: '家庭', icon: '👨👩👧👦', color: '#34D399', desc: '全家共享', tagline: '记录全家人的生活', mods: ALL_MODS.filter(m => m !== 'pomo' && m !== 'chars'), stats: ['count', 'streak', 'balance', 'posts'] }
}

export function currentSceneId(): string {
  const s = store_scene()
  return typeof s === 'string' && s ? s : 'personal'
}
import { store } from './storage.ts'
function store_scene(): unknown { return store.get('scene', 'personal') }

export function sceneVisible(id: string): boolean {
  return SCENES[currentSceneId()].mods.includes(id)
}

/** 把场景主题色写入 CSS 变量（平移 v1 applySceneTheme） */
export function applySceneTheme(id: string): void {
  const s = SCENES[id] || SCENES.personal
  const root = document.documentElement.style
  const rgb = (hex: string) => {
    const h = hex.replace('#', '')
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
  }
  const rgba = (hex: string, a: number) => {
    const c = rgb(hex)
    return `rgba(${c.r},${c.g},${c.b},${a})`
  }
  const lighten = (hex: string, amt: number) => {
    const c = rgb(hex)
    const mix = (v: number) => Math.round(v + (255 - v) * amt)
    return `rgb(${mix(c.r)},${mix(c.g)},${mix(c.b)})`
  }
  root.setProperty('--scene', s.color)
  root.setProperty('--scene-light', lighten(s.color, 0.35))
  root.setProperty('--el-color-primary', s.color)
  root.setProperty('--el-color-primary-light-3', lighten(s.color, 0.2))
  root.setProperty('--el-color-primary-light-5', lighten(s.color, 0.35))
  root.setProperty('--el-color-primary-light-7', lighten(s.color, 0.55))
  root.setProperty('--el-color-primary-light-8', lighten(s.color, 0.68))
  root.setProperty('--el-color-primary-light-9', lighten(s.color, 0.82))
  root.setProperty('--glow-a', rgba(s.color, 0.08))
  root.setProperty('--glow-b', rgba(s.color, 0.04))
  root.setProperty('--scene-focus', rgba(s.color, 0.5))
  root.setProperty('--scene-border', rgba(s.color, 0.35))
  root.setProperty('--scene-border-soft', rgba(s.color, 0.2))
  root.setProperty('--scene-border-strong', rgba(s.color, 0.4))
  root.setProperty('--scene-soft', rgba(s.color, 0.12))
  root.setProperty('--scene-glow-strong', rgba(s.color, 0.25))
}
