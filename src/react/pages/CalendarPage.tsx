import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { dateKey, todayKey } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import type { ActionItem } from '@/domain/action/model'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
import { recordAsyncRepository } from '@/domain/record/repository'
import type { RealityRecord } from '@/domain/record/model'
import { unifiedAsyncRepository, type DailyState } from '@/domain/unified'

interface CalendarCell {
  date: string
  day: number
  inMonth: boolean
}

interface DayEvidence {
  actions: ActionItem[]
  records: RealityRecord[]
  state?: DailyState
}

interface CalendarData {
  actions: ActionItem[]
  records: RealityRecord[]
  matters: Matter[]
  states: DailyState[]
}

const emptyData: CalendarData = { actions: [], records: [], matters: [], states: [] }
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const statusLabels: Record<string, string> = {
  planned: '待办',
  in_progress: '进行中',
  done: '已完成',
  skipped: '已跳过',
  cancelled: '已取消',
  fact: '事实',
  observation: '观察',
  insight: '洞见',
  seed: '种子',
  review: '复盘',
  negative: '负向记录',
  good: '很好',
  normal: '普通',
  tired: '疲惫',
  bad: '很差',
  clear: '清晰',
  heavy: '沉重',
  overloaded: '过载',
}

const calendarCss = `
.calendar-page{max-width:1180px;margin:0 auto}
.calendar-page .calendar-head{align-items:end}
.calendar-page .calendar-controls{display:flex;align-items:center;gap:6px}
.calendar-page .calendar-controls button,.calendar-page .quiet{border:1px solid var(--c-border);background:transparent;color:var(--c-text-2);border-radius:8px;padding:8px 11px;cursor:pointer}
.calendar-page .calendar-controls button:hover,.calendar-page .quiet:hover{border-color:var(--scene);background:var(--scene-soft);color:var(--scene)}
.calendar-page .calendar-controls .month-label{min-width:132px}
.calendar-page .calendar-layout{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:16px}
.calendar-page .month-panel,.calendar-page .selected-day,.calendar-page .evidence-panel{padding:18px}
.calendar-page .week-row,.calendar-page .month-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}
.calendar-page .week-row{margin-bottom:6px}
.calendar-page .week-row span{text-align:center;font-size:10px;color:var(--c-text-3);padding:4px}
.calendar-page .calendar-cell{min-height:78px;border:1px solid var(--c-border-soft);background:transparent;border-radius:8px;color:var(--c-text);text-align:left;padding:8px;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between}
.calendar-page .calendar-cell:hover{border-color:var(--scene);background:var(--scene-soft)}
.calendar-page .calendar-cell.outside{opacity:.42}
.calendar-page .calendar-cell.selected{border-color:var(--scene);box-shadow:inset 0 0 0 1px var(--scene);background:var(--scene-soft)}
.calendar-page .calendar-cell.today>span{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--scene);color:#fff}
.calendar-page .cell-dots{display:flex;justify-content:flex-end;gap:4px}
.calendar-page .cell-dots i{width:6px;height:6px;border-radius:50%}
.calendar-page .action-dot{background:var(--scene)}
.calendar-page .record-dot{background:#7c75b7}
.calendar-page .state-dot{background:#c8874d}
.calendar-page .day-panel{display:grid;align-content:start}
.calendar-page .selected-day .panel-head{margin-bottom:14px}
.calendar-page .selected-day h2{font-size:23px;margin:0}
.calendar-page .day-metrics{display:flex;flex-wrap:wrap;gap:6px}
.calendar-page .day-metrics span{font-size:10px;background:var(--c-hover);border-radius:6px;padding:6px 7px;color:var(--c-text-2)}
.calendar-page .day-metrics b{color:var(--scene)}
.calendar-page .state-line{display:grid;gap:5px;border-top:1px solid var(--c-border-soft);margin-top:14px;padding-top:12px;font-size:11px;color:var(--c-text-2)}
.calendar-page .state-line strong{color:var(--scene);font-weight:600}
.calendar-page .day-list,.calendar-page .record-list{display:grid;gap:8px;border-top:1px solid var(--c-border-soft);margin-top:14px;padding-top:12px}
.calendar-page .day-list>div{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:7px;align-items:center}
.calendar-page .day-list i{width:8px;height:8px;border-radius:50%;background:var(--c-border)}
.calendar-page .day-list i.done{background:var(--scene)}
.calendar-page .day-list span,.calendar-page .evidence-copy b{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.calendar-page .day-list small,.calendar-page .evidence-copy small{font-size:10px;color:var(--c-text-3)}
.calendar-page .evidence-panel{margin-top:16px}
.calendar-page .evidence-section{margin-top:16px}
.calendar-page .evidence-section h3{font-size:15px;margin:0}
.calendar-page .evidence-row{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:9px;align-items:center;border-top:1px solid var(--c-border-soft);padding:10px 0}
.calendar-page .evidence-row>i{width:8px;height:8px;border-radius:50%;background:var(--scene)}
.calendar-page .evidence-row>i.record{background:#7c75b7}
.calendar-page .evidence-copy{display:grid;gap:4px;min-width:0}
.calendar-page .evidence-copy b{white-space:normal}
.calendar-page .evidence-actions{display:flex;align-items:center;gap:8px}
.calendar-page .evidence-actions small{color:var(--c-text-3);font-size:10px}
.calendar-page .evidence-actions button{border:1px solid var(--c-border);background:transparent;color:var(--scene);border-radius:7px;padding:6px 8px;font-size:10px;cursor:pointer;white-space:nowrap}
.calendar-page .evidence-actions button:hover{border-color:var(--scene);background:var(--scene-soft)}
@media(max-width:850px){.calendar-page .calendar-layout{grid-template-columns:1fr}.calendar-page .day-panel{grid-row:1}.calendar-page .evidence-row{grid-template-columns:8px minmax(0,1fr)}.calendar-page .evidence-actions{grid-column:2;justify-content:space-between}}
@media(max-width:580px){.calendar-page .calendar-head{display:block}.calendar-page .calendar-controls{margin-top:16px}.calendar-page .month-panel,.calendar-page .selected-day,.calendar-page .evidence-panel{padding:12px}.calendar-page .month-grid{gap:3px}.calendar-page .calendar-cell{min-height:58px;padding:5px}.calendar-page .week-row{gap:3px}.calendar-page .calendar-controls .month-label{flex:1}.calendar-page .calendar-cell span{font-size:12px}}
`

function isDateKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function monthStart(value: string): Date {
  const date = parseDate(value)
  return new Date(date.getFullYear(), date.getMonth(), 1, 12)
}

function normalizedDate(value: string): string {
  if (isDateKey(value)) return value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : dateKey(date)
}

function monthCells(cursor: Date): CalendarCell[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12)
  const offset = (first.getDay() + 6) % 7
  const cells: CalendarCell[] = []
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(cursor.getFullYear(), cursor.getMonth(), index - offset + 1, 12)
    cells.push({ date: dateKey(date), day: date.getDate(), inMonth: date.getMonth() === cursor.getMonth() })
  }
  return cells
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function actionDate(item: ActionItem): string {
  return normalizedDate(item.date)
}

export function CalendarPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryDate = searchParams.get('date')
  const initialDate = isDateKey(queryDate) ? queryDate : todayKey()
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [cursor, setCursor] = useState(() => monthStart(initialDate))
  const [data, setData] = useState<CalendarData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isDateKey(queryDate) || queryDate === selectedDate) return
    setSelectedDate(queryDate)
    setCursor(monthStart(queryDate))
  }, [queryDate, selectedDate])

  useEffect(() => {
    let active = true
    async function refresh(): Promise<void> {
      setLoading(true)
      setError('')
      try {
        const [actions, records, matters, states] = await Promise.all([
          actionAsyncRepository.list(),
          recordAsyncRepository.list(),
          matterAsyncRepository.list(),
          unifiedAsyncRepository.list<DailyState>('daily_state'),
        ])
        if (active) setData({ actions, records, matters, states })
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : '日历数据读取失败')
      } finally {
        if (active) setLoading(false)
      }
    }
    void refresh()
    const onDataSynced = () => { void refresh() }
    window.addEventListener('beryl-data-synced', onDataSynced)
    return () => {
      active = false
      window.removeEventListener('beryl-data-synced', onDataSynced)
    }
  }, [])

  const cells = useMemo(() => monthCells(cursor), [cursor])
  const monthLabel = useMemo(() => cursor.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' }), [cursor])
  const monthPrefix = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
  const evidenceByDate = useMemo(() => {
    const result = new Map<string, DayEvidence>()
    const ensure = (date: string): DayEvidence => {
      const current = result.get(date)
      if (current) return current
      const next: DayEvidence = { actions: [], records: [] }
      result.set(date, next)
      return next
    }
    data.actions.forEach(item => {
      const date = actionDate(item)
      if (date) ensure(date).actions.push(item)
    })
    data.records.forEach(item => {
      const date = dateKey(new Date(item.occurredAt))
      ensure(date).records.push(item)
    })
    data.states.forEach(item => { ensure(normalizedDate(item.date))!.state = item })
    return result
  }, [data])
  const selectedEvidence = evidenceByDate.get(selectedDate) || { actions: [], records: [] }
  const matterById = useMemo(() => new Map(data.matters.map(item => [item.calmyId, item])), [data.matters])

  function evidenceFor(date: string): DayEvidence {
    return evidenceByDate.get(date) || { actions: [], records: [] }
  }

  function selectDate(date: string): void {
    setSelectedDate(date)
    setCursor(monthStart(date))
    setSearchParams({ date }, { replace: true })
  }

  function shiftMonth(amount: number): void {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + amount, 1, 12)
    setCursor(next)
  }

  function goToday(): void {
    selectDate(todayKey())
  }

  function openToday(): void {
    navigate(`/app/today?date=${encodeURIComponent(selectedDate)}`)
  }

  function openMatter(matterId: string): void {
    navigate(`/app/matters/${encodeURIComponent(matterId)}`)
  }

  const state = selectedEvidence.state
  const completedCount = selectedEvidence.actions.filter(item => item.status === 'done').length

  return <div className="calendar-page">
    <style>{calendarCss}</style>
    <header className="page-head calendar-head">
      <div>
        <p className="eyebrow">CALENDAR · TIME + REALITY EVIDENCE</p>
        <h1 className="font-title">日历与现实证据</h1>
        <p>按日期回看行动、记录和当天状态，必要时回到 Today 或对应课题继续处理。</p>
      </div>
      <div className="calendar-controls" aria-label="月份切换">
        <button type="button" aria-label="上一个月" onClick={() => shiftMonth(-1)}>←</button>
        <button type="button" className="month-label" aria-label="回到今天" onClick={goToday}>{monthLabel}</button>
        <button type="button" aria-label="下一个月" onClick={() => shiftMonth(1)}>→</button>
      </div>
    </header>

    {error && <section className="beryl-card" role="alert" style={{ padding: 14, color: 'var(--c-danger)', marginBottom: 16 }}>{error}</section>}

    <div className="calendar-layout">
      <section className="month-panel beryl-card" aria-label={`${monthLabel}日历`}>
        <div className="week-row" aria-hidden="true">{weekdays.map(day => <span key={day}>{day}</span>)}</div>
        <div className="month-grid">
          {cells.map(cell => {
            const evidence = evidenceFor(cell.date)
            const hasEvidence = evidence.actions.length > 0 || evidence.records.length > 0 || Boolean(evidence.state)
            const today = cell.date === todayKey()
            return <button
              type="button"
              key={cell.date}
              className={`calendar-cell${cell.inMonth ? '' : ' outside'}${cell.date === selectedDate ? ' selected' : ''}${today ? ' today' : ''}`}
              aria-label={`${cell.date}${today ? '，今天' : ''}${cell.date === selectedDate ? '，已选中' : ''}`}
              aria-pressed={cell.date === selectedDate}
              onClick={() => selectDate(cell.date)}
            >
              <span aria-hidden="true">{cell.day}</span>
              {hasEvidence && <span className="cell-dots" aria-hidden="true">
                {evidence.actions.length > 0 && <i className="action-dot" />}
                {evidence.records.length > 0 && <i className="record-dot" />}
                {evidence.state && <i className="state-dot" />}
              </span>}
            </button>
          })}
        </div>
        <div className="calendar-legend" style={{ display: 'flex', gap: 12, marginTop: 12, color: 'var(--c-text-3)', fontSize: 10 }}>
          <span><i className="action-dot" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', marginRight: 5 }} />行动</span>
          <span><i className="record-dot" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', marginRight: 5, background: '#7c75b7' }} />记录</span>
          <span><i className="state-dot" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', marginRight: 5, background: '#c8874d' }} />状态</span>
        </div>
      </section>

      <aside className="day-panel">
        <section className="selected-day beryl-card">
          <div className="panel-head">
            <div><p className="eyebrow">SELECTED DAY</p><h2 className="font-title">{selectedDate}</h2></div>
            <button type="button" className="quiet" onClick={openToday}>打开 Today →</button>
          </div>
          <div className="day-metrics">
            <span>行动 <b>{completedCount}/{selectedEvidence.actions.length}</b></span>
            <span>记录 <b>{selectedEvidence.records.length}</b></span>
            {state && <span>负荷 <b>{state.load}%</b></span>}
          </div>
          {state ? <div className="state-line"><b>身体：{statusLabels[state.bodyState] || state.bodyState}</b><span>心理：{statusLabels[state.mentalState] || state.mentalState}</span><strong>趋势：{state.trajectory}</strong></div> : <p className="muted">这一天没有 DailyState，不对容量做空白推断。</p>}
          <div className="day-list">
            {selectedEvidence.actions.map(item => <div key={item.calmyId}><i className={item.status === 'done' ? 'done' : ''} /><span>{item.title}</span><small>{statusLabels[item.status] || item.status}</small></div>)}
            {!selectedEvidence.actions.length && <p className="muted">没有行动证据。</p>}
          </div>
        </section>
      </aside>
    </div>

    <section className="evidence-panel beryl-card" aria-labelledby="calendar-evidence-title">
      <div className="panel-head"><div><p className="eyebrow">REALITY EVIDENCE · {selectedDate}</p><h2 id="calendar-evidence-title" className="font-title">当天行动与记录</h2></div><span>{loading ? '正在读取…' : `${selectedEvidence.actions.length + selectedEvidence.records.length} 条证据`}</span></div>
      <div className="evidence-section">
        <h3>行动</h3>
        <div className="record-list">
          {selectedEvidence.actions.map(item => {
            const matter = item.matterId ? matterById.get(item.matterId) : undefined
            return <div className="evidence-row" key={`action-${item.calmyId}`}>
              <i />
              <div className="evidence-copy"><b>{item.title}</b><small>{statusLabels[item.status] || item.status}{matter ? ` · ${matter.title}` : ''}</small></div>
              <div className="evidence-actions"><small>行动</small>{matter && <button type="button" onClick={() => openMatter(matter.calmyId)}>查看课题</button>}</div>
            </div>
          })}
          {!selectedEvidence.actions.length && <p className="muted">当天没有行动证据。</p>}
        </div>
      </div>
      <div className="evidence-section">
        <h3>现实记录</h3>
        <div className="record-list">
          {selectedEvidence.records.map(item => {
            const matter = item.matterId ? matterById.get(item.matterId) : undefined
            return <div className="evidence-row" key={`record-${item.calmyId}`}>
              <i className="record" />
              <div className="evidence-copy"><b>{item.body}</b><small>{formatTime(item.occurredAt)} · {statusLabels[item.type] || item.type}{matter ? ` · ${matter.title}` : ''}</small></div>
              <div className="evidence-actions"><small>记录</small>{matter && <button type="button" onClick={() => openMatter(matter.calmyId)}>查看课题</button>}</div>
            </div>
          })}
          {!selectedEvidence.records.length && <p className="muted">当天没有现实记录。</p>}
        </div>
      </div>
    </section>

    <section className="evidence-panel beryl-card" style={{ marginTop: 16 }}>
      <div className="panel-head"><div><p className="eyebrow">MONTH CONTEXT · {monthPrefix}</p><h2 className="font-title">本月有证据的课题</h2></div><span>行动与记录</span></div>
      <div className="record-list">
        {data.matters.filter(item => item.status !== 'archived').map(matter => {
          const count = data.actions.filter(item => actionDate(item).startsWith(monthPrefix) && item.matterId === matter.calmyId).length + data.records.filter(item => dateKey(new Date(item.occurredAt)).startsWith(monthPrefix) && item.matterId === matter.calmyId).length
          if (!count) return null
          return <div className="evidence-row" key={matter.calmyId}><i /><div className="evidence-copy"><b>{matter.title}</b><small>{count} 条本月证据 · {matter.currentStage}</small></div><div className="evidence-actions"><button type="button" onClick={() => openMatter(matter.calmyId)}>打开课题 →</button></div></div>
        })}
        {!data.matters.some(matter => matter.status !== 'archived' && (data.actions.some(item => actionDate(item).startsWith(monthPrefix) && item.matterId === matter.calmyId) || data.records.some(item => dateKey(new Date(item.occurredAt)).startsWith(monthPrefix) && item.matterId === matter.calmyId))) && <p className="muted">本月还没有关联课题的证据。</p>}
      </div>
    </section>
  </div>
}

