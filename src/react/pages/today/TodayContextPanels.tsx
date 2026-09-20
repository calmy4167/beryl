import type { ActionItem } from '@/domain/action/model'

interface TodayContextPanelsProps {
  analysis: string
  narrative: string
  actions: ActionItem[]
  onOpenReview: () => void
  onOpenFlow: () => void
}

export function TodayContextPanels({ analysis, narrative, actions, onOpenReview, onOpenFlow }: TodayContextPanelsProps) {
  return <aside className="attention-side-column">
    <section className="think-panel beryl-card" aria-labelledby="think-title"><div className="panel-head"><div><p className="eyebrow">THINK · 可展开</p><h2 id="think-title" className="font-title">思考</h2></div><button className="quiet-link" type="button" onClick={onOpenReview}>打开复盘 →</button></div><p>{analysis}</p><small>AI、资料与相关记录只在你主动展开时出现。</small><button className="quiet-link flow-entry-link" type="button" onClick={onOpenFlow}>带着问题进探索 →</button></section>
    <section className="trajectory-panel beryl-card" aria-labelledby="trajectory-title"><div className="panel-head"><div><p className="eyebrow">TRAJECTORY · 叙事</p><h2 id="trajectory-title" className="font-title">轨迹</h2></div><button className="quiet-link" type="button" onClick={onOpenReview}>看证据 →</button></div><p className="trajectory-narrative">{narrative}</p><div className="trajectory-evidence">{actions.slice(0, 3).map(item => <span key={item.calmyId}><i className={`trajectory-dot ${item.status}`} />{item.title}</span>)}{!actions.length && <span>还没有现实记录</span>}</div></section>
  </aside>
}
