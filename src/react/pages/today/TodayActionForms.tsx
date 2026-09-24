import type { Matter } from '@/domain/matter/model'
import type { JournalCategory } from '@/domain/record/model'

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
  return <section id="today-add-action" className="add-action-panel beryl-card"><div className="panel-head"><div><p className="eyebrow">NEXT ACTION</p><h2 className="font-title">添加一个现实行动</h2></div><span>只写下一步，不用规划整天</span></div><div className="create-row"><input aria-label="新增现实行动" value={title} onChange={event => onTitleChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void onAdd() }} placeholder="下一步最具体的行动是什么？" /><select aria-label="行动关联事项" value={matterId} onChange={event => onMatterChange(event.target.value)}><option value="">不关联事项</option>{matters.map(item => <option key={item.calmyId} value={item.calmyId}>{item.title}</option>)}</select><button className="react-btn primary" type="button" onClick={() => void onAdd()}>加入今天</button></div></section>
}

interface TodayRealityRecordPanelProps {
  body: string
  journalCategory: JournalCategory
  onBodyChange: (value: string) => void
  onJournalCategoryChange: (value: JournalCategory) => void
  onSave: () => void | Promise<void>
}

export function TodayRealityRecordPanel({ body, journalCategory, onBodyChange, onJournalCategoryChange, onSave }: TodayRealityRecordPanelProps) {
  return <section className="record-composer" aria-label="记录今天">
    <textarea rows={6} aria-label="记录原文" value={body} onChange={event => onBodyChange(event.target.value)} placeholder="写下今天的想法或事实…" />
    <div className="record-controls">
      <div className="journal-category" role="group" aria-label="记录类别" data-selected-category={journalCategory}>
        <button type="button" aria-pressed={journalCategory === 'mind'} onClick={() => onJournalCategoryChange('mind')}>心</button>
        <button type="button" aria-pressed={journalCategory === 'fact'} onClick={() => onJournalCategoryChange('fact')}>事实</button>
      </div>
      <button className="react-btn capture-submit" type="button" onClick={() => void onSave()}>记录</button>
    </div>
  </section>
}
