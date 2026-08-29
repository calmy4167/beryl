import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { withSaveState } from '@/core/save-state'
import { createAsyncCollectionRepository } from '@/core/repository'
import { nextId } from '@/core/storage'
import { listRealityDocumentsAsync } from '@/domain/reality'

type GoalStatus = 'open' | 'done'
type GoalFilter = 'all' | GoalStatus

/**
 * 旧版 goals 数据只有 id/title/done。
 * status/progress 是向后兼容的可选字段，不影响旧数据读取与同步。
 */
interface StoredGoal {
  id?: string
  title?: string
  done?: boolean
  status?: GoalStatus
  progress?: number
}

interface GoalItem {
  id: string
  title: string
  status: GoalStatus
  progress: number
}

const goalsRepository = createAsyncCollectionRepository<StoredGoal>('goals', item => item.id)

const filterOptions: Array<[GoalFilter, string]> = [
  ['all', '全部'],
  ['open', '进行中'],
  ['done', '已完成']
]

const toast = (message: string, kind: 'success' | 'warning' | 'error' = 'success') => {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

async function readStoredGoals(): Promise<StoredGoal[]> {
  return (await goalsRepository.list()).filter(item => !!item && typeof item === 'object')
}

async function loadGoals(): Promise<GoalItem[]> {
  const storedById = new Map((await readStoredGoals()).filter(item => typeof item.id === 'string').map(item => [item.id!, item]))

  return (await listRealityDocumentsAsync({ types: ['goal'] })).map(document => {
    const stored = storedById.get(document.id)
    const done = stored?.done ?? document.done ?? document.status === 'done'
    const progress = clampProgress(typeof stored?.progress === 'number' ? stored.progress : done ? 100 : 0)
    return {
      id: document.id,
      title: stored?.title?.trim() || document.title,
      status: done || progress === 100 ? 'done' : 'open',
      progress
    }
  })
}

async function updateStoredGoal(id: string, updater: (goal: StoredGoal) => StoredGoal): Promise<void> {
  const current = await goalsRepository.find(id)
  if (!current) throw new Error('目标不存在，可能已被其他设备删除')
  if (!await goalsRepository.update(id, updater)) throw new Error('目标保存失败')
}

function statusLabel(status: GoalStatus): string {
  return status === 'done' ? '已完成' : '进行中'
}

export function GoalsPage() {
  const [goals, setGoals] = useState<GoalItem[]>([])
  const [filter, setFilter] = useState<GoalFilter>('all')
  const [query, setQuery] = useState('')
  const [title, setTitle] = useState('')
  const [progressDrafts, setProgressDrafts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function refresh(): Promise<void> {
    try {
      const nextGoals = await loadGoals()
      setGoals(nextGoals)
      setProgressDrafts(Object.fromEntries(nextGoals.map(goal => [goal.id, goal.progress])))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '目标读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const visibleGoals = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return goals.filter(goal => {
      const matchesFilter = filter === 'all' || goal.status === filter
      const matchesQuery = !normalizedQuery || goal.title.toLocaleLowerCase().includes(normalizedQuery)
      return matchesFilter && matchesQuery
    })
  }, [filter, goals, query])

  const completedCount = goals.filter(goal => goal.status === 'done').length

  async function addGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = title.trim()
    if (!value) {
      toast('请先写下目标名称', 'warning')
      return
    }

    setSaving(true)
    try {
      await goalsRepository.create({ id: nextId(), title: value, done: false, status: 'open', progress: 0 })
      setTitle('')
      await refresh()
      toast('目标已添加 🥅')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '目标添加失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(goal: GoalItem, status: GoalStatus) {
    setSaving(true)
    try {
      await withSaveState(async () => {
        await updateStoredGoal(goal.id, current => ({
          ...current,
          done: status === 'done',
          status,
          progress: status === 'done' ? 100 : Math.min(goal.progress, 99)
        }))
      })
      await refresh()
      toast(status === 'done' ? '目标已完成' : '目标已重新打开')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '目标状态更新失败', 'error')
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  async function saveProgress(goal: GoalItem) {
    const progress = clampProgress(progressDrafts[goal.id] ?? goal.progress)
    setProgressDrafts(current => ({ ...current, [goal.id]: progress }))
    if (progress === goal.progress) return

    setSaving(true)
    try {
      await withSaveState(async () => {
        await updateStoredGoal(goal.id, current => ({
          ...current,
          progress,
          done: progress === 100,
          status: progress === 100 ? 'done' : 'open'
        }))
      })
      await refresh()
      toast(`目标进度已更新为 ${progress}%`)
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '目标进度更新失败', 'error')
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  async function removeGoal(goal: GoalItem) {
    if (!window.confirm(`确认删除目标“${goal.title}”吗？删除后无法从目标列表恢复。`)) return
    setSaving(true)
    try {
      if (!await goalsRepository.remove(goal.id)) throw new Error('目标删除失败')
      await refresh()
      toast('目标已删除')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '目标删除失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="goals-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">GOALS · DIRECTION</p>
          <h1 className="font-title">目标</h1>
          <p>把想要完成的结果写清楚，再用状态和进度持续推进。</p>
        </div>
        <span className="load-pill">{completedCount} / {goals.length} 已完成</span>
      </header>

      <section className="beryl-card matter-create">
        <form className="create-row" onSubmit={event => void addGoal(event)}>
          <input
            aria-label="目标名称"
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="添加一个想完成的结果…"
            disabled={saving}
          />
          <button className="primary" type="submit" disabled={saving}>{saving ? '保存中…' : '添加目标'}</button>
        </form>
      </section>

      <section className="beryl-card admin-block">
        <div className="panel-head">
          <div>
            <p className="eyebrow">GOAL INDEX</p>
            <h2 className="font-title">目标列表</h2>
          </div>
          <span>{loading ? '正在读取…' : `${visibleGoals.length} 个目标`}</span>
        </div>

        <div className="goals-toolbar" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '16px 0' }}>
          <input aria-label="搜索目标" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索目标" />
          <div className="range-tabs" role="tablist" aria-label="目标状态筛选">
            {filterOptions.map(([value, label]) => (
              <button key={value} type="button" className={filter === value ? 'on' : ''} role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && <section className="beryl-card empty-state" role="alert"><b>目标数据暂时无法读取</b><p>{error}</p><button className="react-btn" type="button" onClick={() => void refresh()}>重试</button></section>}
        {loading ? <div className="empty-state" role="status">正在读取目标…</div> : visibleGoals.length ? (
          <div className="goals-list" aria-live="polite">
            {visibleGoals.map(goal => {
              const draft = clampProgress(progressDrafts[goal.id] ?? goal.progress)
              return (
                <article className={`beryl-card goal-item ${goal.status === 'done' ? 'done' : ''}`} key={goal.id}>
                  <button className={`chk ${goal.status === 'done' ? 'on' : ''}`} type="button" aria-label={goal.status === 'done' ? '标记目标为进行中' : '标记目标为已完成'} onClick={() => void setStatus(goal, goal.status === 'done' ? 'open' : 'done')} disabled={saving}>
                    {goal.status === 'done' ? '✓' : ''}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="panel-head" style={{ marginBottom: 6 }}>
                      <h3 className={goal.status === 'done' ? 'done' : ''}>{goal.title}</h3>
                      <span className="load-pill">{statusLabel(goal.status)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <input
                        aria-label={`${goal.title} 进度`}
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={draft}
                        onChange={event => setProgressDrafts(current => ({ ...current, [goal.id]: Number(event.target.value) }))}
                        onBlur={() => void saveProgress(goal)}
                        disabled={saving}
                      />
                      <input
                        aria-label={`${goal.title} 进度百分比`}
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={draft}
                        onChange={event => setProgressDrafts(current => ({ ...current, [goal.id]: Number(event.target.value) }))}
                        onBlur={() => void saveProgress(goal)}
                        disabled={saving}
                        style={{ width: 76 }}
                      />
                      <span className="muted">进度</span>
                    </div>
                  </div>
                  <button type="button" className="danger" aria-label={`删除目标 ${goal.title}`} onClick={() => void removeGoal(goal)} disabled={saving}>删除</button>
                </article>
              )
            })}
          </div>
        ) : <div className="empty-state">{query ? '没有匹配的目标。' : '还没有目标，把一个想完成的结果写下来。'}</div>}
      </section>
    </div>
  )
}
