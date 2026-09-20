import type { ActionItem } from '@/domain/action/model'
import type { Matter } from '@/domain/matter/model'
import type { NegativeRecordImpact } from '@/domain/record/model'

interface TodayLetGoPanelProps {
  saving: boolean
  protect: string
  letGo: string
  onProtectChange: (value: string) => void
  onLetGoChange: (value: string) => void
  onSave: () => void
}

export function TodayLetGoPanel({ saving, protect, letGo, onProtectChange, onLetGoChange, onSave }: TodayLetGoPanelProps) {
  return <section className="let-go-panel beryl-card" aria-labelledby="let-go-title"><div className="panel-head"><div><p className="eyebrow">LET GO · 主动放下</p><h2 id="let-go-title" className="font-title">今天主动放下</h2></div><button className="react-btn" type="button" disabled={saving} onClick={onSave}>保存边界</button></div><div className="two-col"><label>必须守住<textarea value={protect} onChange={event => onProtectChange(event.target.value)} aria-label="今天必须守住的事项" placeholder="例如：先吃饭，再处理消息" /></label><label>今天可以不做<textarea value={letGo} onChange={event => onLetGoChange(event.target.value)} aria-label="今天可以不做的事项" placeholder="写下现在可以放下的事" /></label></div></section>
}

interface TodayAddActionPanelProps {
  title: string
  matterId: string
  matters: Matter[]
  onTitleChange: (value: string) => void
  onMatterChange: (value: string) => void
  onAdd: () => void | Promise<void>
}

export function TodayAddActionPanel({ title, matterId, matters, onTitleChange, onMatterChange, onAdd }: TodayAddActionPanelProps) {
  return <section className="add-action-panel beryl-card"><div className="panel-head"><div><p className="eyebrow">NEXT ACTION</p><h2 className="font-title">添加一个现实行动</h2></div><span>只写下一步，不用规划整天</span></div><div className="create-row"><input aria-label="新增现实行动" value={title} onChange={event => onTitleChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void onAdd() }} placeholder="下一步最具体的行动是什么？" /><select aria-label="行动关联事项" value={matterId} onChange={event => onMatterChange(event.target.value)}><option value="">不关联事项</option>{matters.map(item => <option key={item.calmyId} value={item.calmyId}>{item.title}</option>)}</select><button className="react-btn primary" type="button" onClick={() => void onAdd()}>加入今天</button></div></section>
}

interface TodayRealityRecordPanelProps {
  body: string
  type: 'fact' | 'negative'
  actionId: string
  matterId: string
  impact: NegativeRecordImpact
  actions: ActionItem[]
  matters: Matter[]
  onBodyChange: (value: string) => void
  onTypeChange: (value: 'fact' | 'negative') => void
  onActionChange: (value: string) => void
  onMatterChange: (value: string) => void
  onImpactChange: (value: NegativeRecordImpact) => void
  onSave: () => void | Promise<void>
}

export function TodayRealityRecordPanel({ body, type, actionId, matterId, impact, actions, matters, onBodyChange, onTypeChange, onActionChange, onMatterChange, onImpactChange, onSave }: TodayRealityRecordPanelProps) {
  return <details className="record-details record-row beryl-card"><summary>记录现实发生了什么 <small>完成后再回来，不需要持续停留</small></summary><div className="record-row-inner"><textarea aria-label="现实记录内容" value={body} onChange={event => onBodyChange(event.target.value)} placeholder="完成、阻碍、身体感受、重要事实…" /><div className="record-controls"><select aria-label="记录类型" value={type} onChange={event => onTypeChange(event.target.value as 'fact' | 'negative')}><option value="fact">事实</option><option value="negative">负向变化</option></select><select aria-label="结果关联行动" value={actionId} onChange={event => onActionChange(event.target.value)}><option value="">不关联行动</option>{actions.map(item => <option key={item.calmyId} value={item.calmyId}>{item.title}</option>)}</select><select aria-label="记录关联事项" value={matterId} onChange={event => onMatterChange(event.target.value)}><option value="">不关联事项</option>{matters.map(item => <option key={item.calmyId} value={item.calmyId}>{item.title}</option>)}</select>{type === 'negative' && <select aria-label="负向影响" value={impact} onChange={event => onImpactChange(event.target.value as NegativeRecordImpact)}><option value="other">其他</option><option value="waste">浪费</option><option value="escape">逃避</option></select>}<button className="react-btn primary" type="button" onClick={() => void onSave()}>保存记录</button></div></div></details>
}
