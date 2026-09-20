import type { CaptureDecision } from '@/application'
import type { AiSuggestion, CaptureItem } from '@/domain/capture'
import { CapturePendingCard, displayTime } from './CapturePendingCard'

export function CaptureComposer({ value, onChange, onSave }: { value: string; onChange: (value: string) => void; onSave: () => void | Promise<void> }) {
  return <section className="capture-box capture-gate-input beryl-card"><textarea aria-label="记录原文" value={value} onChange={event => onChange(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void onSave() } }} placeholder="脑中闪过什么？先放在这里…" /><div className="capture-footer"><span>Ctrl / ⌘ + Enter 保存原文</span><button className="react-btn primary" type="button" onClick={() => void onSave()}>保存原文</button></div></section>
}

interface CaptureQueueProps {
  items: CaptureItem[]
  suggestions: Map<string, AiSuggestion>
  loading: boolean
  busyId?: string
  drafts: Record<string, string>
  onDecision: (item: CaptureItem, decision: CaptureDecision) => void
  onDraftChange: (suggestionId: string, value: string) => void
  onAcceptSuggestion: (suggestion: AiSuggestion) => void
  onRejectSuggestion: (suggestion: AiSuggestion) => void
}

export function CaptureQueue({ items, suggestions, loading, busyId, drafts, onDecision, onDraftChange, onAcceptSuggestion, onRejectSuggestion }: CaptureQueueProps) {
  return <section className="capture-gate-list" aria-label="待处理记录">
    {items.map(item => {
      const suggestion = suggestions.get(item.calmyId)
      const busy = busyId === item.calmyId || busyId === suggestion?.calmyId
      return <CapturePendingCard key={item.calmyId} item={item} suggestion={suggestion} busy={busy}
        draft={suggestion ? drafts[suggestion.calmyId] : undefined}
        onDecision={decision => onDecision(item, decision)}
        onDraftChange={value => { if (suggestion) onDraftChange(suggestion.calmyId, value) }}
        onAcceptSuggestion={() => { if (suggestion) onAcceptSuggestion(suggestion) }}
        onRejectSuggestion={() => { if (suggestion) onRejectSuggestion(suggestion) }}
      />
    })}
    {!loading && !items.length && <div className="capture-empty beryl-card"><span className="gate-mark">✓</span><h2 className="font-title">这里现在是空的</h2><p>新的念头先放进上面的原文框；没有需要处理的内容时，也可以直接离开。</p></div>}
  </section>
}

export function CaptureHistory({ items }: { items: CaptureItem[] }) {
  return <section className="capture-history"><div className="section-title"><h2 className="font-title">已经处理的原文</h2><span>{items.length ? '最近 8 条' : '还没有'}</span></div>{items.map(item => <article className="capture-history-row beryl-card" key={item.calmyId}><div><b>{item.body.split(/\r?\n/, 1)[0].slice(0, 100)}</b><small>{item.status === 'accepted' ? '已进入系统' : '已放下'} · {displayTime(item.updatedAt)}</small></div><span>{item.status === 'accepted' ? '✓' : '—'}</span></article>)}</section>
}
