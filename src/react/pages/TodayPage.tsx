import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addActionToToday, openToday, recordActionResult } from '@/application'
import { withSaveState } from '@/core/save-state'
import { todayKey } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import type { ActionItem } from '@/domain/action/model'
import type { Matter } from '@/domain/matter/model'
import { todayAsyncRepository } from '@/domain/today/repository'
import type { TodayLoad, TodayPlan } from '@/domain/today/model'
import { recordAsyncRepository } from '@/domain/record/repository'
import type { NegativeRecordImpact } from '@/domain/record/model'

const date = todayKey()
const bodyStates: Array<{ value: TodayLoad; label: string; hint: string }> = [
  { value: 'good', label: '很好', hint: '可以多留一点余力' },
  { value: 'normal', label: '正常', hint: '保持当前承载' },
  { value: 'tired', label: '疲惫', hint: '优先保留一件事' },
  { value: 'bad', label: '明显不舒服', hint: '可以关闭所有建议' },
]

const actionLabels = { planned: '待开始', in_progress: '进行中', done: '已完成', skipped: '已跳过', cancelled: '已取消' } as const

const toast = (message: string, kind: 'success' | 'warning' | 'error' = 'success') => {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

function loadNarrative(load: TodayLoad | null, primary: ActionItem | undefined): string {
  if (load === 'bad') return '今天先照顾承载，不需要追赶。'
  if (load === 'tired') return '今天在降低承载，保留一件真正重要的事就够了。'
  if (primary?.status === 'in_progress') return '这一件事正在现实中展开，先把注意力放回手边。'
  if (primary?.status === 'done') return '这一轮已经有了真实发生，可以停下来让它结束。'
  return '这一天还在展开，先保留一个可以去现实中做的下一步。'
}

export function TodayPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [plan, setPlan] = useState<TodayPlan>()
  const [actions, setActions] = useState<ActionItem[]>([])
  const [matters, setMatters] = useState<Matter[]>([])
  const [protect, setProtect] = useState('')
  const [letGo, setLetGo] = useState('')
  const [actionTitle, setActionTitle] = useState('')
  const [matterId, setMatterId] = useState('')
  const [recordBody, setRecordBody] = useState('')
  const [recordType, setRecordType] = useState<'fact' | 'negative'>('fact')
  const [recordActionId, setRecordActionId] = useState('')
  const [recordMatterId, setRecordMatterId] = useState('')
  const [impact, setImpact] = useState<NegativeRecordImpact>('other')
  const [realityMessage, setRealityMessage] = useState('')

  async function refresh(): Promise<void> {
    setLoading(true)
    try {
      const opened = await openToday(date)
      setPlan(opened.plan)
      setActions(opened.actions)
      setMatters(opened.matters)
      setProtect(opened.plan.mustProtect.join('\n'))
      setLetGo(opened.plan.letGo.join('\n'))
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : 'Today 读取失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  async function savePlan(patch: Partial<TodayPlan>): Promise<void> {
    if (!plan) return
    setSaving(true)
    try {
      const next = await withSaveState(() => todayAsyncRepository.update(date, patch, plan.revision))
      setPlan(next)
      setProtect(next.mustProtect.join('\n'))
      setLetGo(next.letGo.join('\n'))
      toast('已保存到本地')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function addAction(): Promise<void> {
    if (!plan || !actionTitle.trim()) {
      toast('先写下一个现实行动', 'warning')
      return
    }
    try {
      await withSaveState(() => addActionToToday({ title: actionTitle, date, matterId: matterId || undefined, plan }))
      setActionTitle('')
      setMatterId('')
      await refresh()
      toast('行动已加入今天')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '添加行动失败', 'error')
    }
  }

  async function goToReality(item: ActionItem): Promise<void> {
    try {
      if (item.status === 'planned') await withSaveState(() => actionAsyncRepository.start(item.calmyId, item.revision))
      setRealityMessage('可以关闭 Calmy，去现实中做这件事。回来后再记录真实发生了什么。')
      await refresh()
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '行动状态更新失败', 'error')
    }
  }

  async function toggleAction(item: ActionItem): Promise<void> {
    try {
      if (item.status === 'done') await withSaveState(() => actionAsyncRepository.reopen(item.calmyId, item.revision))
      else await withSaveState(() => actionAsyncRepository.complete(item.calmyId, undefined, item.revision))
      await refresh()
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '行动更新失败', 'error')
    }
  }

  async function addRecord(): Promise<void> {
    if (!recordBody.trim()) {
      toast('先写下今天实际发生了什么', 'warning')
      return
    }
    try {
      if (recordActionId) {
        const action = actions.find(item => item.calmyId === recordActionId)
        if (!action) return
        await withSaveState(() => recordActionResult({ actionId: action.calmyId, recordBody, recordType, impact: recordType === 'negative' ? impact : undefined, expectedActionRevision: action.revision }))
      } else {
        await withSaveState(() => recordAsyncRepository.create({ body: recordBody, type: recordType, matterId: recordMatterId || undefined, impact: recordType === 'negative' ? impact : undefined }))
      }
      setRecordBody('')
      setRecordActionId('')
      setRecordMatterId('')
      await refresh()
      toast('已保存现实记录')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '记录失败', 'error')
    }
  }

  const availableActions = useMemo(() => actions.filter(item => item.status !== 'cancelled'), [actions])
  const primaryAction = useMemo(() => {
    const focused = plan?.focusActionIds || []
    return availableActions.find(item => focused.includes(item.calmyId) && (item.status === 'planned' || item.status === 'in_progress')) || availableActions.find(item => item.status === 'in_progress' || item.status === 'planned')
  }, [availableActions, plan])
  const extraLimit = plan?.load === 'bad' ? 0 : plan?.load === 'tired' ? 1 : 2
  const extraActions = useMemo(() => availableActions.filter(item => item.calmyId !== primaryAction?.calmyId && item.status !== 'done').slice(0, extraLimit), [availableActions, extraLimit, primaryAction])
  const narrative = loadNarrative(plan?.load || null, primaryAction)
  const selectedBody = bodyStates.find(item => item.value === plan?.load)

  return <div className="attention-today-page">
    <header className="page-head attention-page-head">
      <div><p className="eyebrow">TODAY · {date}</p><h1 className="font-title">今天，把注意力还给自己</h1><p>看清此刻，选择一件现实行动，然后离开 Calmy。</p></div>
      <span className="today-status">{loading ? '正在读取本机数据…' : saving ? '正在保存…' : '本地优先 · 离线可用'}</span>
    </header>

    <section className="body-state-panel beryl-card" aria-labelledby="body-state-title">
      <div><p className="eyebrow">BODY · 可跳过</p><h2 id="body-state-title" className="font-title">现在的身体状态</h2><small>{selectedBody?.hint || '不记录也可以继续'}</small></div>
      <div className="body-state-options" role="group" aria-label="身体状态">
        {bodyStates.map(item => <button key={item.value} type="button" className={plan?.load === item.value ? 'on' : ''} aria-pressed={plan?.load === item.value} disabled={saving} onClick={() => void savePlan({ load: item.value })}>{item.label}</button>)}
        <button type="button" className={!plan?.load ? 'on' : ''} aria-pressed={!plan?.load} disabled={saving} onClick={() => void savePlan({ load: null })}>不记录</button>
      </div>
    </section>

    <div className="attention-surface-grid">
      <section className="now-panel beryl-card" aria-labelledby="now-title">
        <div className="panel-head"><div><p className="eyebrow">NOW · 现实出口</p><h2 id="now-title" className="font-title">现在值得注意</h2></div><span>只保留一件主行动</span></div>
        {primaryAction ? <div className="primary-action-card">
          <div className="primary-action-copy"><span className={`action-status ${primaryAction.status}`}>{actionLabels[primaryAction.status]}</span><h3>{primaryAction.title}</h3><p>{primaryAction.matterId ? matters.find(item => item.calmyId === primaryAction.matterId)?.title : '把注意力放回现实中的下一步'}</p></div>
          <button className="react-btn primary reality-button" type="button" onClick={() => void goToReality(primaryAction)}>{primaryAction.status === 'in_progress' ? '继续去现实中做' : '去现实中做'} <span aria-hidden="true">→</span></button>
        </div> : <div className="attention-empty"><p>今天还没有需要投入的主行动。</p><small>写下一个最小动作，它会进入今天的现实计划。</small></div>}
        {realityMessage && <p className="reality-message" role="status">{realityMessage}</p>}
        <div className="extra-action-section"><div className="section-title"><h3>有余力再做</h3><span>最多 2 条</span></div>{extraActions.length ? extraActions.map(item => <article className="attention-action-row" key={item.calmyId}><div><span className={`action-status ${item.status}`}>{actionLabels[item.status]}</span><b>{item.title}</b></div><button type="button" onClick={() => void toggleAction(item)}>{item.status === 'done' ? '重新打开' : '完成'}</button></article>) : <p className="muted">暂时没有额外行动，留一点空白也是选择。</p>}</div>
      </section>

      <aside className="attention-side-column">
        <section className="think-panel beryl-card" aria-labelledby="think-title"><div className="panel-head"><div><p className="eyebrow">THINK · 可展开</p><h2 id="think-title" className="font-title">思考</h2></div><button className="quiet-link" type="button" onClick={() => navigate('/app/review')}>打开复盘 →</button></div><p>{plan?.review.analysis || plan?.why || '还有什么没有看清？可以把问题带到复盘里，不必现在解决。'}</p><small>AI、资料与相关记录只在你主动展开时出现。</small></section>
        <section className="trajectory-panel beryl-card" aria-labelledby="trajectory-title"><div className="panel-head"><div><p className="eyebrow">TRAJECTORY · 叙事</p><h2 id="trajectory-title" className="font-title">轨迹</h2></div><button className="quiet-link" type="button" onClick={() => navigate('/app/review')}>看证据 →</button></div><p className="trajectory-narrative">{narrative}</p><div className="trajectory-evidence">{availableActions.slice(0, 3).map(item => <span key={item.calmyId}><i className={`trajectory-dot ${item.status}`} />{item.title}</span>)}{!availableActions.length && <span>还没有现实记录</span>}</div></section>
      </aside>
    </div>

    <section className="let-go-panel beryl-card" aria-labelledby="let-go-title"><div className="panel-head"><div><p className="eyebrow">LET GO · 主动放下</p><h2 id="let-go-title" className="font-title">今天主动放下</h2></div><button className="react-btn" type="button" disabled={saving} onClick={() => void savePlan({ mustProtect: protect.split(/\r?\n/).map(item => item.trim()).filter(Boolean), letGo: letGo.split(/\r?\n/).map(item => item.trim()).filter(Boolean) })}>保存边界</button></div><div className="two-col"><label>必须守住<textarea value={protect} onChange={event => setProtect(event.target.value)} aria-label="今天必须守住的事项" placeholder="例如：先吃饭，再处理消息" /></label><label>今天可以不做<textarea value={letGo} onChange={event => setLetGo(event.target.value)} aria-label="今天可以不做的事项" placeholder="写下现在可以放下的事" /></label></div></section>

    <section className="add-action-panel beryl-card"><div className="panel-head"><div><p className="eyebrow">NEXT ACTION</p><h2 className="font-title">添加一个现实行动</h2></div><span>只写下一步，不用规划整天</span></div><div className="create-row"><input aria-label="新增现实行动" value={actionTitle} onChange={event => setActionTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void addAction() }} placeholder="下一步最具体的行动是什么？" /><select aria-label="行动关联事项" value={matterId} onChange={event => setMatterId(event.target.value)}><option value="">不关联事项</option>{matters.filter(item => item.status !== 'archived').map(item => <option key={item.calmyId} value={item.calmyId}>{item.title}</option>)}</select><button className="react-btn primary" type="button" onClick={() => void addAction()}>加入今天</button></div></section>

    <details className="record-details beryl-card"><summary>记录现实发生了什么 <small>完成后再回来，不需要持续停留</small></summary><div className="record-row-inner"><textarea aria-label="现实记录内容" value={recordBody} onChange={event => setRecordBody(event.target.value)} placeholder="完成、阻碍、身体感受、重要事实…" /><div className="record-controls"><select aria-label="记录类型" value={recordType} onChange={event => setRecordType(event.target.value as 'fact' | 'negative')}><option value="fact">事实</option><option value="negative">负向变化</option></select><select aria-label="结果关联行动" value={recordActionId} onChange={event => setRecordActionId(event.target.value)}><option value="">不关联行动</option>{actions.map(item => <option key={item.calmyId} value={item.calmyId}>{item.title}</option>)}</select><select aria-label="记录关联事项" value={recordMatterId} onChange={event => setRecordMatterId(event.target.value)}><option value="">不关联事项</option>{matters.map(item => <option key={item.calmyId} value={item.calmyId}>{item.title}</option>)}</select>{recordType === 'negative' && <select aria-label="负向影响" value={impact} onChange={event => setImpact(event.target.value as NegativeRecordImpact)}><option value="other">其他</option><option value="waste">浪费</option><option value="escape">逃避</option></select>}<button className="react-btn primary" type="button" onClick={() => void addRecord()}>保存记录</button></div></div></details>
  </div>
}
