import type { FormEvent, Ref } from 'react'

interface ReflectionStageProps {
  headingRef: Ref<HTMLHeadingElement>
  choice: string
  reflection: string
  nextStep: string
  externalUrl: string
  saving: boolean
  error: string
  onReflectionChange: (value: string) => void
  onNextStepChange: (value: string) => void
  onExternalUrlChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onReturnToScenarios: () => void
}

export function ReflectionStage({
  headingRef,
  choice,
  reflection,
  nextStep,
  externalUrl,
  saving,
  error,
  onReflectionChange,
  onNextStepChange,
  onExternalUrlChange,
  onSubmit,
  onReturnToScenarios,
}: ReflectionStageProps) {
  return <section className="future-reflection beryl-card">
    <span className="future-example-label">回到今天</span><h2 ref={headingRef} tabIndex={-1} className="font-title">看过可能的收获和代价，你现在怎么想？</h2>
    <p>你在想的是：「{choice}」。写下哪些结果对你重要，以及你准备怎样回应。</p>
    <form onSubmit={onSubmit}>
      <label>此刻的想法<textarea value={reflection} onChange={event => onReflectionChange(event.target.value)} rows={4} placeholder="例如：我想试一小步，看看它是否真的重要……" required disabled={saving} /></label>
      <label>我准备的下一步（可选）<input value={nextStep} onChange={event => onNextStepChange(event.target.value)} placeholder="例如：这周先留出一个晚上" disabled={saving} /></label>
      <label>我准备查看的链接（可选）<input type="url" value={externalUrl} onChange={event => onExternalUrlChange(event.target.value)} maxLength={1000} placeholder="https://…" disabled={saving} /></label>
      <small className="future-save-note">保存后链接会和你的反思一起保存；Calmy 不会读取链接内容。</small>
      {error && <p className="future-error" role="alert">{error}</p>}
      <div className="future-actions"><button className="future-secondary" type="button" onClick={onReturnToScenarios}>再看一次</button><button className="future-primary" type="submit" disabled={saving || !reflection.trim()}>{saving ? '正在保存…' : '保存我的反思'}</button></div>
    </form>
    <small className="future-save-note">确认保存时会一并保存你填写的事实、理解、选择和反思；推演内容和来源不会保存。</small>
  </section>
}
