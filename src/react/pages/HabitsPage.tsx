import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { createAsyncCollectionRepository } from '@/core/repository'
import { dateKey, lsGet, nextId, todayKey } from '@/core/storage'
import { maxStreak } from '@/core/modules'
import { withSaveState } from '@/core/save-state'

interface RawHabit {
  id: string
  name: string
  color: string
  days: number
  dates: string[]
}

interface Habit extends RawHabit {
  longest: number
}

const habitsRepository = createAsyncCollectionRepository<RawHabit>('habits', item => item.id)

const PRESETS: Array<Pick<RawHabit, 'name' | 'color'>> = [
  { name: '晨间阅读', color: '#6366F1' },
  { name: '运动', color: '#EF4444' },
  { name: '日记', color: '#F59E0B' },
  { name: '喝水', color: '#10B981' },
  { name: '冥想', color: '#8B5CF6' },
]

const DEFAULT_COLOR = '#6366F1'
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

const toast = (message: string, kind: 'success' | 'warning' | 'error' = 'success') => {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

async function seedIfNeeded(): Promise<void> {
  if (lsGet('b_habits') !== null) return
  const initial = PRESETS.map(preset => ({
    id: nextId(),
    name: preset.name,
    color: preset.color,
    days: 0,
    dates: [],
  }))
  await habitsRepository.replace(initial)
}

function normalizeHabit(item: RawHabit): Habit {
  const dates = Array.from(new Set(item.dates || [])).sort()
  return {
    id: item.id,
    name: item.name,
    color: item.color || DEFAULT_COLOR,
    days: dates.length,
    dates,
    longest: maxStreak(dates),
  }
}

async function loadHabits(): Promise<Habit[]> {
  await seedIfNeeded()
  return (await habitsRepository.list()).map(normalizeHabit)
}

function currentWeek(): Array<{ key: string; day: number; weekday: string; today: boolean }> {
  const now = new Date()
  const mondayOffset = (now.getDay() + 6) % 7
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset)
  const today = todayKey()

  return WEEKDAYS.map((weekday, index) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index)
    const key = dateKey(date)
    return { key, day: date.getDate(), weekday, today: key === today }
  })
}

function writeHabits(mutator: (habits: RawHabit[]) => RawHabit[]): Promise<void> {
  return withSaveState(async () => {
    const current = await habitsRepository.list()
    if (!await habitsRepository.replace(mutator(current.map(item => ({
      ...item,
      dates: Array.isArray(item.dates) ? [...item.dates] : [],
    }))))) {
      throw new Error('习惯保存失败，请检查本地存储状态')
    }
  })
}

function formatWeekLabel(week: ReturnType<typeof currentWeek>): string {
  const first = week[0]?.key || ''
  const last = week[week.length - 1]?.key || ''
  return first && last ? `${first} — ${last}` : '本周'
}

export function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [editingId, setEditingId] = useState<string>()
  const week = useMemo(() => currentWeek(), [])

  async function refresh(): Promise<void> {
    try {
      setHabits(await loadHabits())
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '习惯读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    const onDataSynced = () => { void refresh() }
    window.addEventListener('beryl-data-synced', onDataSynced)
    return () => window.removeEventListener('beryl-data-synced', onDataSynced)
  }, [])

  function startEditing(habit: Habit): void {
    setEditingId(habit.id)
    setName(habit.name)
    setColor(habit.color)
  }

  function cancelEditing(): void {
    setEditingId(undefined)
    setName('')
    setColor(DEFAULT_COLOR)
  }

  async function saveHabit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      toast('请填写习惯名称', 'warning')
      return
    }

    setSaving(true)
    try {
      if (editingId) {
        await writeHabits(current => {
          let found = false
          const next = current.map(item => {
            if (item.id !== editingId) return item
            found = true
            return { ...item, name: trimmed, color }
          })
          if (!found) throw new Error('习惯已被其他操作修改，请刷新后重试')
          return next
        })
        toast('习惯已更新')
      } else {
        await writeHabits(current => [...current, { id: nextId(), name: trimmed, color, days: 0, dates: [] }])
        toast('习惯已创建')
      }
      cancelEditing()
      await refresh()
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '习惯保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function toggleDate(habit: Habit, key: string): Promise<void> {
    setSaving(true)
    try {
      await writeHabits(current => {
        let found = false
        const next = current.map(item => {
          if (item.id !== habit.id) return item
          found = true
          const dates = new Set(Array.isArray(item.dates) ? item.dates : [])
          if (dates.has(key)) dates.delete(key)
          else dates.add(key)
          const nextDates = [...dates].sort()
          return { ...item, dates: nextDates, days: nextDates.length }
        })
        if (!found) throw new Error('习惯已被其他操作修改，请刷新后重试')
        return next
      })
      await refresh()
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '打卡保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const completedToday = habits.filter(habit => habit.dates.includes(todayKey())).length

  return (
    <div className="habits-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">HABITS · SMALL RHYTHMS</p>
          <h1 className="font-title">习惯</h1>
          <p>用一周视图记录可持续的小行动，打卡数据保存在本机 habits 数据集中。</p>
        </div>
        <span className="load-pill">今日 {completedToday}/{habits.length} · {habits.length} 个习惯</span>
      </header>

      <section className="beryl-card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="panel-head">
          <div>
            <p className="eyebrow">{editingId ? 'EDIT HABIT' : 'NEW HABIT'}</p>
            <h2 className="font-title">{editingId ? '编辑习惯' : '添加一个习惯'}</h2>
          </div>
          <span className="muted">{formatWeekLabel(week)}</span>
        </div>
        <form className="create-row" onSubmit={event => void saveHabit(event)}>
          <input aria-label="习惯名称" value={name} onChange={event => setName(event.target.value)} placeholder="例如：睡前阅读 10 分钟" disabled={saving} />
          <label className="color-field">
            <span>颜色</span>
            <input aria-label="习惯颜色" type="color" value={color} onChange={event => setColor(event.target.value)} disabled={saving} />
          </label>
          <button className="react-btn primary" type="submit" disabled={saving}>{saving ? '保存中…' : editingId ? '保存修改' : '创建习惯'}</button>
          {editingId && <button className="react-btn" type="button" onClick={cancelEditing} disabled={saving}>取消</button>}
        </form>
      </section>

      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? <div className="empty-state">正在读取习惯…</div> : habits.length ? (
        <div className="list" aria-live="polite">
          {habits.map(habit => (
            <article className="beryl-card" style={{ padding: 16 }} key={habit.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, minWidth: 0 }}>
                <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: habit.color, flex: '0 0 auto' }} />
                <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{habit.name}</strong>
                <span className="muted" style={{ marginLeft: 'auto', textAlign: 'right' }}>累计 <b style={{ color: habit.color }}>{habit.days}</b> 天 · 最长 {habit.longest} 天</span>
                <button className="react-btn" type="button" onClick={() => startEditing(habit)} disabled={saving}>编辑</button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                {week.map(day => {
                  const checked = habit.dates.includes(day.key)
                  return <button
                    key={day.key}
                    type="button"
                    aria-label={`${habit.name} ${day.key} ${checked ? '已打卡' : '未打卡'}`}
                    aria-pressed={checked}
                    disabled={saving}
                    onClick={() => void toggleDate(habit, day.key)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      padding: '8px 0',
                      borderRadius: 10,
                      border: `1px solid ${checked ? habit.color : day.today ? 'var(--scene-border-strong)' : 'var(--c-border-soft)'}`,
                      background: checked ? habit.color : 'var(--c-bg-soft)',
                      color: checked ? '#fff' : 'var(--c-text-2)',
                      cursor: saving ? 'wait' : 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 10, opacity: 0.7 }}>周{day.weekday}</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{day.day}</span>
                  </button>
                })}
              </div>
            </article>
          ))}
        </div>
      ) : <div className="empty-state">还没有习惯，先创建一个最小可执行的习惯吧。</div>}
    </div>
  )
}
