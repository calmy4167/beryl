import type { ActionItem } from '@/domain/action/model'
import type { Matter } from '@/domain/matter/model'
import { Surface } from '../../ui'

const actionLabels: Record<ActionItem['status'], string> = {
  planned: '待开始',
  in_progress: '进行中',
  done: '已完成',
  skipped: '已跳过',
  cancelled: '已取消',
}

interface TodayNowPanelProps {
  primaryAction?: ActionItem
  extraActions: ActionItem[]
  matters: Matter[]
  realityMessage: string
  onGoToReality: (item: ActionItem) => void | Promise<void>
  onToggleAction: (item: ActionItem) => void | Promise<void>
  onCreateAction: () => void
}

export function TodayNowPanel({ primaryAction, extraActions, matters, realityMessage, onGoToReality, onToggleAction, onCreateAction }: TodayNowPanelProps) {
  return <Surface as="section" className="now-panel beryl-card" aria-labelledby="now-title">
    <svg className="now-panel-botanical" viewBox="0 0 280 190" aria-hidden="true" focusable="false">
      <path d="M225 168C210 140 202 108 201 68c0-23 3-42 8-57M215 137c-19-12-34-29-44-50M207 106c17-11 29-25 38-44M203 83c-17-9-29-22-37-39" fill="none" stroke="#829f84" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M167 50c-20-1-32-13-33-31 19-3 34 8 36 27M201 77c2-21 15-33 35-32 0 19-13 33-32 36M183 99c-20 1-34-9-39-27 18-6 34 2 41 20M210 119c13-16 30-19 45-9-9 17-25 23-43 13M162 120c-17-8-23-23-18-39 18 3 28 16 24 34" fill="#afc9ae" opacity=".8" />
      <path d="M209 151h40l-5 31h-30z" fill="#e8ede3" stroke="#b9c9b8" strokeWidth="1.5" />
      <path d="M205 151h48v7h-48z" fill="#d8e3d5" />
    </svg>
    <div className="panel-head"><div><p className="eyebrow">NOW · 现实出口</p><h2 id="now-title" className="font-title">接下来，做一件小事</h2></div><span>只保留一件主行动</span></div>
    {primaryAction ? <div className="primary-action-card action-card">
      <div className="primary-action-copy"><span className={`action-status ${primaryAction.status}`}>{actionLabels[primaryAction.status]}</span><h3>{primaryAction.title}</h3><p>{primaryAction.matterId ? matters.find(item => item.calmyId === primaryAction.matterId)?.title : '把注意力放回现实中的下一步'}</p></div>
      <button className="react-btn primary reality-button" type="button" onClick={() => void onGoToReality(primaryAction)}>{primaryAction.status === 'in_progress' ? '继续去现实中做' : '去现实中做'} <span aria-hidden="true">→</span></button>
    </div> : <div className="attention-empty"><div><p>今天还没有需要投入的主行动。</p><small>写下一个最小动作，它会进入今天的现实计划。</small></div><button className="react-btn primary" type="button" onClick={onCreateAction}>写下第一步 <span aria-hidden="true">→</span></button></div>}
    {realityMessage && <p className="reality-message" role="status">{realityMessage}</p>}
    <div className="extra-action-section"><div className="section-title"><h3>有余力再做</h3><span>最多 2 条</span></div>{extraActions.length ? extraActions.map(item => <article className="attention-action-row" key={item.calmyId}><div><span className={`action-status ${item.status}`}>{actionLabels[item.status]}</span><b>{item.title}</b></div><button type="button" onClick={() => void onToggleAction(item)}>{item.status === 'done' ? '重新打开' : '完成'}</button></article>) : <p className="muted">暂时没有额外行动，留一点空白也是选择。</p>}</div>
  </Surface>
}
