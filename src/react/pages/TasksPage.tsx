import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { withSaveState } from '@/core/save-state'
import { todayKey } from '@/core/storage'
import { addActionToToday, openToday } from '@/application'
import { actionAsyncRepository } from '@/domain/action/repository'
import type { ActionItem, ActionStatus } from '@/domain/action/model'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
import type { TodayPlan } from '@/domain/today/model'

type TaskFilter = 'all' | 'planned' | 'in_progress' | 'done' | 'skipped' | 'cancelled'

const filterOptions: Array<[TaskFilter, string]> = [
  ['all', '全部'],
  ['planned', '待开始'],
  ['in_progress', '进行中'],
  ['done', '已完成'],
  ['skipped', '已跳过'],
  ['cancelled', '已取消']
]

const statusLabels: Record<ActionStatus, string> = {
  planned: '待开始',
  in_progress: '进行中',
  done: '已完成',
  skipped: '已跳过',
  cancelled: '已取消'
}

const statusClassNames: Record<ActionStatus, string> = {
  planned: 'planned',
  in_progress: 'in-progress',
  done: 'done',
  skipped: 'skipped',
  cancelled: 'cancelled'
}

const toast = (message: string, kind: 'success' | 'warning' | 'error' = 'success') => {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

function dateLabel(date: string): string {
  if (!date) return '未设置日期'
  const parsed = new Date(`${date}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function actionDate(item: ActionItem): number {
  const timestamp = Date.parse(`${item.date}T00:00:00`)
  return Number.isNaN(timestamp) ? item.updatedAt : timestamp
}

export function TasksPage() {
  const navigate = useNavigate()
  const [actions, setActions] = useState<ActionItem[]>([])
  const [matters, setMatters] = useState<Matter[]>([])
  const [todayPlan, setTodayPlan] = useState<TodayPlan>()
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayKey())
  const [matterId, setMatterId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function refresh(planDate = date) {
    setLoading(true)
    try {
      const [nextActions, opened, nextMatters] = await Promise.all([
        actionAsyncRepository.list(),
        openToday(planDate),
        matterAsyncRepository.list()
      ])
      setActions(nextActions)
      setMatters(nextMatters)
      setTodayPlan(opened.plan)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '任务读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const matterById = useMemo(() => new Map(matters.map(item => [item.calmyId, item])), [matters])
  const focusIds = useMemo(() => new Set(todayPlan?.focusActionIds || []), [todayPlan])
  const visibleActions = useMemo(() => actions
    .filter(item => filter === 'all' || item.status === filter)
    .slice()
    .sort((a, b) => {
      if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1
      const byDate = actionDate(a) - actionDate(b)
      return byDate || b.updatedAt - a.updatedAt
    }), [actions, filter])

  const openCount = actions.filter(item => item.status === 'planned' || item.status === 'in_progress').length
  const doneCount = actions.filter(item => item.status === 'done').length

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const taskTitle = title.trim()
    if (!taskTitle) {
      toast('请先写下任务名称', 'warning')
      return
    }

    setSaving(true)
    try {
      const plan = todayPlan || (await openToday(date)).plan
      await withSaveState(() => addActionToToday({
        title: taskTitle,
        date,
        matterId: matterId || undefined,
        plan
      }))
      setTitle('')
      await refresh(date)
      toast('任务已创建，并加入当天行动')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '任务创建失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function changeDate(nextDate: string) {
    setDate(nextDate)
    await refresh(nextDate)
  }

  async function toggleTask(item: ActionItem) {
    setSaving(true)
    try {
      await withSaveState(() => item.status === 'done'
        ? actionAsyncRepository.reopen(item.calmyId, item.revision)
        : actionAsyncRepository.complete(item.calmyId, undefined, item.revision))
      await refresh(date)
      toast(item.status === 'done' ? '任务已重新打开' : '任务已完成')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '任务状态更新失败', 'error')
      await refresh(date)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="tasks-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">TASKS · ACTIONS</p>
          <h1 className="font-title">任务清单</h1>
          <p>把任务落到具体行动；完成、重开和课题关联都会保留在统一领域数据里。</p>
        </div>
        <div className="task-board-head-actions">
          <button className="react-btn" type="button" onClick={() => navigate('/app/task-board')}>打开事项看板</button>
          <span className="load-pill">{openCount} 个待处理 · {doneCount} 个已完成</span>
        </div>
      </header>

      <section className="beryl-card matter-create">
        <div className="panel-head">
          <div>
            <p className="eyebrow">QUICK ACTION</p>
            <h2 className="font-title">添加一个下一步</h2>
          </div>
          <span>会同步加入所选日期的 Today 计划</span>
        </div>
        <form className="create-row" onSubmit={event => void createTask(event)}>
          <input
            aria-label="任务名称"
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="下一步最具体的行动是什么？"
            disabled={saving}
          />
          <input
            aria-label="任务日期"
            type="date"
            value={date}
            onChange={event => void changeDate(event.target.value)}
            disabled={saving}
          />
          <select aria-label="关联课题" value={matterId} onChange={event => setMatterId(event.target.value)} disabled={saving}>
            <option value="">不关联课题</option>
            {matters.filter(item => item.status !== 'archived').map(item => <option key={item.calmyId} value={item.calmyId}>{item.title}</option>)}
          </select>
          <button className="primary" type="submit" disabled={saving}>{saving ? '保存中…' : '添加任务'}</button>
        </form>
      </section>

      <section className="today-section">
        <div className="section-title">
          <h2 className="font-title">任务列表</h2>
          <span>{loading ? '正在读取…' : `${visibleActions.length} 条`}</span>
        </div>
        <div className="range-tabs" role="tablist" aria-label="任务状态筛选">
          {filterOptions.map(([value, label]) => <button key={value} type="button" className={filter === value ? 'on' : ''} role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        {loading ? <div className="empty-state">正在读取任务…</div> : visibleActions.length ? (
          <div className="action-list" aria-live="polite">
            {visibleActions.map(item => {
              const matter = item.matterId ? matterById.get(item.matterId) : undefined
              const isFocus = focusIds.has(item.calmyId)
              return (
                <article className={`action-card beryl-card ${isFocus ? 'focus' : ''}`} key={item.calmyId}>
                  <button className={`chk ${item.status === 'done' ? 'on' : ''}`} type="button" aria-label={item.status === 'done' ? '重开任务' : '完成任务'} onClick={() => void toggleTask(item)} disabled={saving}>
                    {item.status === 'done' ? '✓' : ''}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 className={item.status === 'done' ? 'done' : ''}>{item.title}</h3>
                    <small>{dateLabel(item.date)} · {matter ? `课题：${matter.title}` : '未关联课题'}{isFocus ? ' · 今日焦点' : ''}</small>
                    {item.resultNote && <small>结果：{item.resultNote}</small>}
                  </div>
                  <span className={`action-status ${statusClassNames[item.status]}`}>{statusLabels[item.status]}</span>
                  {matter && <button type="button" onClick={() => navigate(`/app/matters/${matter.calmyId}`)} aria-label={`打开课题 ${matter.title}`}>查看课题</button>}
                  <button type="button" onClick={() => void toggleTask(item)} disabled={saving}>{item.status === 'done' ? '重开' : '完成'}</button>
                </article>
              )
            })}
          </div>
        ) : <div className="empty-state">当前筛选下没有任务，把一个现实事项拆成下一步吧。</div>}
      </section>
    </div>
  )
}
