import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { withSaveState } from '@/core/save-state'
import { todayKey } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import type { ActionItem, ActionStatus } from '@/domain/action/model'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'

type BoardFilter = 'all' | 'active' | 'today'

const columns: Array<{ status: ActionStatus; label: string; hint: string }> = [
  { status: 'planned', label: '待开始', hint: '还没有进入现实行动' },
  { status: 'in_progress', label: '进行中', hint: '正在现实中推进' },
  { status: 'done', label: '已完成', hint: '已经发生并可以离开' },
  { status: 'skipped', label: '已跳过', hint: '暂时不投入注意力' },
  { status: 'cancelled', label: '已取消', hint: '不再继续这一步' },
]

const statusLabels: Record<ActionStatus, string> = {
  planned: '待开始',
  in_progress: '进行中',
  done: '已完成',
  skipped: '已跳过',
  cancelled: '已取消',
}

const toast = (message: string, kind: 'success' | 'warning' | 'error' = 'success') => {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

function dateLabel(date: string): string {
  if (!date) return '未设置日期'
  const parsed = new Date(`${date}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function isTerminal(status: ActionStatus): boolean {
  return status === 'done' || status === 'skipped' || status === 'cancelled'
}

export function TaskBoardPage() {
  const navigate = useNavigate()
  const [actions, setActions] = useState<ActionItem[]>([])
  const [matters, setMatters] = useState<Matter[]>([])
  const [filter, setFilter] = useState<BoardFilter>('all')
  const [matterFilter, setMatterFilter] = useState('')
  const [query, setQuery] = useState('')
  const [draggedId, setDraggedId] = useState<string>()
  const [overStatus, setOverStatus] = useState<ActionStatus>()
  const [busyId, setBusyId] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function refresh(): Promise<void> {
    setLoading(true)
    try {
      const [nextActions, nextMatters] = await Promise.all([actionAsyncRepository.list(), matterAsyncRepository.list()])
      setActions(nextActions)
      setMatters(nextMatters)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '看板读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    const onSynced = () => { void refresh() }
    window.addEventListener('beryl-data-synced', onSynced)
    return () => window.removeEventListener('beryl-data-synced', onSynced)
  }, [])

  const matterById = useMemo(() => new Map(matters.map(item => [item.calmyId, item])), [matters])
  const visibleActions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return actions.filter(item => {
      const matter = item.matterId ? matterById.get(item.matterId) : undefined
      const matchesQuery = !normalized || `${item.title} ${matter?.title || ''}`.toLocaleLowerCase().includes(normalized)
      const matchesMatter = !matterFilter || item.matterId === matterFilter
      const matchesFilter = filter === 'all' || (filter === 'active' && (item.status === 'planned' || item.status === 'in_progress')) || (filter === 'today' && item.date === todayKey())
      return matchesQuery && matchesMatter && matchesFilter
    })
  }, [actions, filter, matterById, matterFilter, query])

  const grouped = useMemo(() => new Map(columns.map(column => [column.status, visibleActions.filter(item => item.status === column.status)])), [visibleActions])

  async function moveTask(item: ActionItem, target: ActionStatus): Promise<void> {
    if (item.status === target || busyId) return
    setBusyId(item.calmyId)
    try {
      let next = item
      // 已完成/跳过/取消的任务重新进入其他列时，先回到“待开始”，保留领域状态流转约束。
      if (isTerminal(next.status) && target !== 'planned') {
        next = await withSaveState(() => actionAsyncRepository.reopen(next.calmyId, next.revision))
      }
      if (next.status !== target) {
        next = await withSaveState(() => actionAsyncRepository.transition(next.calmyId, target, next.revision))
      }
      setActions(current => current.map(currentItem => currentItem.calmyId === next.calmyId ? next : currentItem))
      toast(`已移动到「${statusLabels[target]}」`)
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '任务状态更新失败', 'error')
      await refresh()
    } finally {
      setBusyId(undefined)
      setDraggedId(undefined)
      setOverStatus(undefined)
    }
  }

  function onDragStart(event: DragEvent<HTMLElement>, item: ActionItem): void {
    setDraggedId(item.calmyId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', item.calmyId)
  }

  function onDrop(event: DragEvent<HTMLElement>, target: ActionStatus): void {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/plain') || draggedId
    const item = actions.find(action => action.calmyId === id)
    if (item) void moveTask(item, target)
  }

  return (
    <div className="task-board-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">TASK BOARD · REALITY ACTIONS</p>
          <h1 className="font-title">事项看板</h1>
          <p>拖动任务改变状态；每一次移动都会保留在统一的现实行动记录里。</p>
        </div>
        <div className="task-board-head-actions">
          <button className="react-btn" type="button" onClick={() => navigate('/app/module/tasks')}>列表视图</button>
          <button className="react-btn primary" type="button" onClick={() => navigate('/app/module/tasks#new')}>添加任务</button>
        </div>
      </header>

      <section className="task-board-toolbar beryl-card" aria-label="看板筛选">
        <div className="range-tabs" role="tablist" aria-label="任务范围">
          {([['all', '全部'], ['active', '未结束'], ['today', '今天']] as const).map(([value, label]) => <button key={value} type="button" className={filter === value ? 'on' : ''} role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
        <input aria-label="搜索任务" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索任务或事项…" />
        <select aria-label="按事项筛选" value={matterFilter} onChange={event => setMatterFilter(event.target.value)}>
          <option value="">全部事项</option>
          {matters.filter(item => item.status !== 'archived').map(item => <option key={item.calmyId} value={item.calmyId}>{item.title}</option>)}
        </select>
        <span className="task-board-count">{loading ? '正在读取…' : `${visibleActions.length} 条任务`}</span>
      </section>

      {error && <section className="beryl-card empty-state" role="alert"><b>看板数据暂时无法读取</b><p>{error}</p><button className="react-btn" type="button" onClick={() => void refresh()}>重试</button></section>}
      {loading ? <div className="empty-state" role="status">正在读取任务看板…</div> : <section className="task-board" aria-label="可拖动任务看板">
        {columns.map(column => {
          const items = grouped.get(column.status) || []
          const active = overStatus === column.status && !!draggedId
          return <div
            className={`task-board-column ${active ? 'drop-active' : ''}`}
            key={column.status}
            onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOverStatus(column.status) }}
            onDragLeave={event => { if (event.currentTarget === event.target) setOverStatus(undefined) }}
            onDrop={event => onDrop(event, column.status)}
          >
            <div className="task-board-column-head"><div><h2>{column.label}</h2><small>{column.hint}</small></div><span>{items.length}</span></div>
            <div className="task-board-column-body">
              {items.map(item => {
                const matter = item.matterId ? matterById.get(item.matterId) : undefined
                const isBusy = busyId === item.calmyId
                return <article className={`task-board-card beryl-card ${draggedId === item.calmyId ? 'is-dragging' : ''}`} draggable={!isBusy} key={item.calmyId} onDragStart={event => onDragStart(event, item)} onDragEnd={() => { setDraggedId(undefined); setOverStatus(undefined) }}>
                  <div className="task-board-card-top"><span className={`action-status ${column.status}`}>{statusLabels[item.status]}</span><span className="task-drag-hint" aria-hidden="true">⋮⋮</span></div>
                  <h3>{item.title}</h3>
                  <small>{dateLabel(item.date)} · {matter ? matter.title : '未关联事项'}</small>
                  <div className="task-board-card-footer">
                    <label>状态<select aria-label={`${item.title}状态`} value={item.status} disabled={isBusy} onChange={event => void moveTask(item, event.target.value as ActionStatus)}>{columns.map(option => <option key={option.status} value={option.status}>{option.label}</option>)}</select></label>
                    {matter && <button type="button" onClick={() => navigate(`/app/matters/${matter.calmyId}`)}>查看事项</button>}
                  </div>
                </article>
              })}
              {!items.length && <div className="task-board-empty">拖动任务到这里</div>}
            </div>
          </div>
        })}
      </section>}
      <p className="task-board-note">提示：拖动只是改变任务状态，不会删除原文或修改事项；手机端可使用每张卡片的状态选择。</p>
    </div>
  )
}
