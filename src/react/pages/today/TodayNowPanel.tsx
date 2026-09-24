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
  return <Surface as="section" className="now-panel focus-surface beryl-card" aria-labelledby="now-title">
    <div className="focus-panel-copy">
      <div className="focus-panel-label"><span aria-hidden="true" /><p>此刻最重要的事</p></div>
    {primaryAction ? <div className="primary-action-card action-card">
      <div className="primary-action-copy"><span className={`action-status ${primaryAction.status}`}>{actionLabels[primaryAction.status]}</span><h2 id="now-title">{primaryAction.title}</h2><p>{primaryAction.matterId ? matters.find(item => item.calmyId === primaryAction.matterId)?.title : '把注意力放回现实中的下一步'}</p></div>
      <button className="react-btn primary reality-button" data-primary-action type="button" onClick={() => void onGoToReality(primaryAction)}>{primaryAction.status === 'in_progress' ? '继续去现实中做' : '去现实中做'}</button>
    </div> : <div className="attention-empty"><div><h2 id="now-title">接下来，做一件小事</h2><p>今天还没有需要投入的主行动。先写下一个可以开始的动作。</p></div><button className="react-btn primary" data-primary-action type="button" onClick={onCreateAction}>写下第一步</button></div>}
    {realityMessage && <p className="reality-message" role="status">{realityMessage}</p>}
    </div>
    <div className="extra-action-section"><div className="section-title"><h3>有余力再做</h3><span>最多 2 条</span></div>{extraActions.length ? extraActions.map(item => <article className="attention-action-row" key={item.calmyId}><div><span className={`action-status ${item.status}`}>{actionLabels[item.status]}</span><b>{item.title}</b></div><button type="button" onClick={() => void onToggleAction(item)}>{item.status === 'done' ? '重新打开' : '完成'}</button></article>) : <p className="muted">暂时没有额外行动，留一点空白也是选择。</p>}</div>
  </Surface>
}
