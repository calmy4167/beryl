import { type CaptureDecision } from '@/application'
import type { AiSuggestion, CaptureItem } from '@/domain/capture'

export const captureDecisionOptions: Array<{ value: CaptureDecision; label: string; hint: string }> = [
  { value: 'action', label: '现在行动', hint: '形成一条可执行的下一步' },
  { value: 'matter', label: '形成事项', hint: '进入持续面对的现实上下文' },
  { value: 'record', label: '保留记录', hint: '保存发生过的事实，不制造待办' },
  { value: 'seed', label: '稍后再看', hint: '保留为还未成熟的种子' },
  { value: 'let_go', label: '放下', hint: '现在不再让它占据注意力' },
]

export function displayTime(timestamp: number): string {
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('zh-CN') : '时间未知'
}

export function suggestionText(item: AiSuggestion): string {
  const candidate = item.candidates[0]
  return candidate?.fields.title || candidate?.fields.body || candidate?.label || '建议'
}

interface CapturePendingCardProps {
  item: CaptureItem
  suggestion?: AiSuggestion
  busy: boolean
  draft?: string
  onDecision: (decision: CaptureDecision) => void
  onDraftChange: (value: string) => void
  onAcceptSuggestion: () => void
  onRejectSuggestion: () => void
}

export function CapturePendingCard({ item, suggestion, busy, draft, onDecision, onDraftChange, onAcceptSuggestion, onRejectSuggestion }: CapturePendingCardProps) {
  return <article className="capture-gate-card beryl-card">
    <div className="capture-original"><div className="panel-head"><div><p className="eyebrow">原文 · 已安全保存</p><h2 className="font-title">{item.body.split(/\r?\n/, 1)[0].slice(0, 120) || '未命名原文'}</h2></div><small>{displayTime(item.updatedAt)}</small></div><p>{item.body}</p></div>
    <div className="attention-gate"><div className="attention-gate-question"><span className="gate-mark">?</span><div><h3>它值得我现在注意吗？</h3><small>选择一个处理方式，不需要当场解释全部。</small></div></div><div className="gate-actions">{captureDecisionOptions.map(option => <button key={option.value} type="button" className={option.value === 'let_go' ? 'let-go-choice' : ''} disabled={busy} onClick={() => onDecision(option.value)}><b>{option.label}</b><small>{option.hint}</small></button>)}</div></div>
    {suggestion?.status === 'suggested' && <div className="capture-ai-suggestion"><div className="panel-head"><div><span className="ai-chip">AI 建议</span><h3>{suggestionText(suggestion)}</h3></div><small>仅供参考 · {Math.round(suggestion.confidence * 100)}%</small></div><p>{suggestion.rationale}</p><details><summary>查看依据</summary><p>{suggestion.candidates[0]?.evidence?.join('；') || '暂无额外依据'} · 本地规则</p></details><input aria-label="AI 建议内容" value={draft ?? suggestionText(suggestion)} onChange={event => onDraftChange(event.target.value)} /><div className="suggestion-actions"><button className="react-btn" type="button" disabled={busy} onClick={onAcceptSuggestion}>采纳建议</button><button className="react-btn" type="button" disabled={busy} onClick={onRejectSuggestion}>忽略建议</button></div></div>}
  </article>
}
