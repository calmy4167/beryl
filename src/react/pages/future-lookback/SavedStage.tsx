import type { FormEvent, Ref } from 'react'
import { Link } from 'react-router-dom'

interface SavedFeedbackState {
  value: string
  saved: boolean
  showForm: boolean
  saving: boolean
  error: string
  needsReflectionResave: boolean
  reflectionResaving: boolean
  recoveryMessage: string
}

interface SavedStageProps {
  headingRef: Ref<HTMLHeadingElement>
  externalUrl: string
  feedback: SavedFeedbackState
  onFeedbackChange: (value: string) => void
  onFeedbackSubmit: (event: FormEvent<HTMLFormElement>) => void
  onShowFeedbackForm: () => void
  onResaveReflection: () => void
  onDeferFeedback: () => void
  onStartOver: () => void
}

export function SavedStage({
  headingRef,
  externalUrl,
  feedback,
  onFeedbackChange,
  onFeedbackSubmit,
  onShowFeedbackForm,
  onResaveReflection,
  onDeferFeedback,
  onStartOver,
}: SavedStageProps) {
  return <section className="future-saved beryl-card">
    <span className="future-saved-mark">✓</span><h2 ref={headingRef} tabIndex={-1} className="font-title">选择和反思已保存</h2><p>你可以稍后查看原文；推演内容没有保存。</p>
    {externalUrl.trim() && <p><a className="future-secondary" href={externalUrl} target="_blank" rel="noopener noreferrer">打开我选的链接</a></p>}
    <p>回来后可以在这里记下现实反馈；Calmy 不会自动读取外部工具。</p>
    {feedback.saved
      ? <p className="future-feedback-saved" role="status">现实反馈已另存，可在已保存的内容中查看。</p>
      : <div className="future-feedback-entry">
          {!feedback.showForm && <button className="future-secondary" type="button" onClick={onShowFeedbackForm}>记录后来发生的事</button>}
          {feedback.showForm && <form onSubmit={onFeedbackSubmit}>
            <label>后来现实中发生了什么？<textarea value={feedback.value} onChange={event => onFeedbackChange(event.target.value)} rows={3} maxLength={2000} placeholder="例如：我查看了岗位要求，发现……" required disabled={feedback.saving} /></label>
            <small className="future-save-note">这条反馈会另存为一条内容，并附上这次选择记录的编号，方便之后对照。</small>
            {feedback.error && <p className="future-error" role="alert">{feedback.error}</p>}
            {feedback.needsReflectionResave && <button className="future-secondary" type="button" disabled={feedback.reflectionResaving} onClick={onResaveReflection}>{feedback.reflectionResaving ? '正在重新保存…' : '用当前内容重新保存选择和反思'}</button>}
            {feedback.recoveryMessage && <p className="future-feedback-saved" role="status">{feedback.recoveryMessage}</p>}
            <div className="future-actions"><button className="future-secondary" type="button" disabled={feedback.saving} onClick={onDeferFeedback}>稍后再记</button><button className="future-primary" type="submit" disabled={feedback.saving || !feedback.value.trim()}>{feedback.saving ? '正在保存…' : '保存现实反馈'}</button></div>
          </form>}
        </div>}
    <div className="future-actions"><Link className="future-secondary" to="/app/capture">查看已保存的内容</Link><Link className="future-primary" to="/app/today">回到今天</Link><button className="future-text-link" type="button" onClick={onStartOver}>再体验一次</button></div>
  </section>
}
