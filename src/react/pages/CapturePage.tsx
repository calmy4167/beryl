import { WorkspacePage } from '../feishu-workspace'
import { FeishuCaptureView } from '../FeishuWorkspaceViews'
import { CaptureComposer, CaptureHistory, CaptureQueue } from './CaptureSections'
import { useCaptureWorkspace } from './useCaptureWorkspace'

export function CapturePage() {
  return <WorkspacePage local={<LocalCapturePage />} feishu={<FeishuCaptureView />} />
}

function LocalCapturePage() {
  const {
    body, setBody, openCaptures, suggestionByCapture, history, loading, busyId, error, drafts,
    refresh, capture, decide, acceptSuggestion, rejectSuggestion, updateDraft,
  } = useCaptureWorkspace()

  return <div className="capture-gate-page">
    <header className="page-head"><div><p className="eyebrow">记录 · 原文优先</p><h1 className="font-title">先收下来，再决定它是什么</h1><p>原文先安全保存；整理可以延后，判断权一直在你手里。</p></div><span className="load-pill">{loading ? '正在读取…' : `${openCaptures.length} 条等待选择`}</span></header>
    <CaptureComposer value={body} onChange={setBody} onSave={capture} />
    {error && <section className="beryl-card empty-state" role="alert"><b>记录数据暂时无法读取</b><p>{error}</p><button className="react-btn" type="button" onClick={() => void refresh()}>重试</button></section>}
    <CaptureQueue items={openCaptures} suggestions={suggestionByCapture} loading={loading} busyId={busyId} drafts={drafts}
      onDecision={(item, decision) => void decide(item, decision)} onDraftChange={updateDraft}
      onAcceptSuggestion={item => void acceptSuggestion(item)} onRejectSuggestion={item => void rejectSuggestion(item)} />
    <CaptureHistory items={history} />
  </div>
}
