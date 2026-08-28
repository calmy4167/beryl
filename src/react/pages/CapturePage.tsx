import { useEffect, useMemo, useState } from 'react'
import { decideCapture, captureText, type CaptureDecision } from '@/application'
import { withSaveState } from '@/core/save-state'
import { captureAsyncRepository } from '@/domain/capture'
import type { AiSuggestion, CaptureItem } from '@/domain/capture'

const decisionOptions: Array<{ value: CaptureDecision; label: string; hint: string }> = [
  { value: 'action', label: '现在行动', hint: '形成一条可执行的下一步' },
  { value: 'matter', label: '形成事项', hint: '进入持续面对的现实上下文' },
  { value: 'record', label: '保留记录', hint: '保存发生过的事实，不制造待办' },
  { value: 'seed', label: '稍后再看', hint: '保留为还未成熟的种子' },
  { value: 'let_go', label: '放下', hint: '现在不再让它占据注意力' },
]

const toast = (message: string, kind: 'success' | 'warning' | 'error' = 'success') => {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

function displayTime(timestamp: number): string {
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('zh-CN') : '时间未知'
}

function suggestionText(item: AiSuggestion): string {
  const candidate = item.candidates[0]
  return candidate?.fields.title || candidate?.fields.body || candidate?.label || '建议'
}

export function CapturePage() {
  const [body, setBody] = useState('')
  const [captures, setCaptures] = useState<CaptureItem[]>([])
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string>()
  const [error, setError] = useState('')

  async function refresh(): Promise<void> {
    setLoading(true)
    try {
      const [nextCaptures, nextSuggestions] = await Promise.all([captureAsyncRepository.list(), captureAsyncRepository.listSuggestions()])
      setCaptures(nextCaptures)
      setSuggestions(nextSuggestions)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Capture 读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    const onSynced = () => { void refresh() }
    window.addEventListener('beryl-data-synced', onSynced)
    return () => window.removeEventListener('beryl-data-synced', onSynced)
  }, [])

  const suggestionByCapture = useMemo(() => new Map(suggestions.map(item => [item.captureId, item])), [suggestions])
  const openCaptures = useMemo(() => captures.filter(item => item.status === 'inbox' || item.status === 'suggested'), [captures])
  const history = useMemo(() => captures.filter(item => item.status !== 'inbox' && item.status !== 'suggested').slice(0, 8), [captures])

  async function capture(): Promise<void> {
    if (!body.trim()) {
      toast('先写下一段原文', 'warning')
      return
    }
    try {
      const result = await withSaveState(() => captureText(body))
      setBody('')
      await refresh()
      toast(result.suggestionError ? '原文已保存，建议生成失败但不影响使用' : '原文已安全保存')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : 'Capture 保存失败', 'error')
    }
  }

  async function decide(item: CaptureItem, decision: CaptureDecision): Promise<void> {
    setBusyId(item.calmyId)
    try {
      await withSaveState(() => decideCapture({ captureId: item.calmyId, decision }))
      await refresh()
      toast(decision === 'let_go' ? '已放下，不再进入主列表' : `已${decisionOptions.find(option => option.value === decision)?.label}`)
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '处理 Capture 失败', 'error')
      await refresh()
    } finally {
      setBusyId(undefined)
    }
  }

  async function acceptSuggestion(item: AiSuggestion): Promise<void> {
    setBusyId(item.calmyId)
    try {
      const candidate = item.candidates[0]
      const value = drafts[item.calmyId] ?? suggestionText(item)
      await withSaveState(() => captureAsyncRepository.acceptSuggestion(item.calmyId, 0, candidate?.entityType === 'record' ? { body: value } : { title: value }))
      await refresh()
      toast('已采纳 AI 建议，原文仍可追溯')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '采纳建议失败', 'error')
    } finally {
      setBusyId(undefined)
    }
  }

  async function rejectSuggestion(item: AiSuggestion): Promise<void> {
    setBusyId(item.calmyId)
    try {
      await withSaveState(() => captureAsyncRepository.rejectSuggestion(item.calmyId))
      await refresh()
      toast('已忽略建议，原文仍保留')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '忽略建议失败', 'error')
    } finally {
      setBusyId(undefined)
    }
  }

  return <div className="capture-gate-page">
    <header className="page-head"><div><p className="eyebrow">CAPTURE · ATTENTION GATE</p><h1 className="font-title">先收下来，再决定它是什么</h1><p>原文先安全保存；整理可以延后，判断权一直在你手里。</p></div><span className="load-pill">{loading ? '正在读取…' : `${openCaptures.length} 条等待选择`}</span></header>

    <section className="capture-box capture-gate-input beryl-card"><textarea aria-label="Capture 原文" value={body} onChange={event => setBody(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void capture() } }} placeholder="脑中闪过什么？先放在这里…" /><div className="capture-footer"><span>Ctrl / ⌘ + Enter 保存原文</span><button className="react-btn primary" type="button" onClick={() => void capture()}>保存原文</button></div></section>

    {error && <p className="form-error" role="alert">{error}</p>}
    <section className="capture-gate-list" aria-label="等待选择的 Capture">
      {openCaptures.map(item => {
        const suggestion = suggestionByCapture.get(item.calmyId)
        const busy = busyId === item.calmyId || busyId === suggestion?.calmyId
        return <article className="capture-gate-card beryl-card" key={item.calmyId}>
          <div className="capture-original"><div className="panel-head"><div><p className="eyebrow">原文 · 已安全保存</p><h2 className="font-title">{item.body.split(/\r?\n/, 1)[0].slice(0, 120) || '未命名原文'}</h2></div><small>{displayTime(item.updatedAt)}</small></div><p>{item.body}</p></div>
          <div className="attention-gate"><div className="attention-gate-question"><span className="gate-mark">?</span><div><h3>它值得我现在注意吗？</h3><small>选择一个处理方式，不需要当场解释全部。</small></div></div><div className="gate-actions">{decisionOptions.map(option => <button key={option.value} type="button" className={option.value === 'let_go' ? 'let-go-choice' : ''} disabled={busy} onClick={() => void decide(item, option.value)}><b>{option.label}</b><small>{option.hint}</small></button>)}</div></div>
          {suggestion?.status === 'suggested' && <div className="capture-ai-suggestion"><div className="panel-head"><div><span className="ai-chip">AI 建议</span><h3>{suggestionText(suggestion)}</h3></div><small>仅供参考 · {Math.round(suggestion.confidence * 100)}%</small></div><p>{suggestion.rationale}</p><details><summary>查看依据</summary><p>{suggestion.candidates[0]?.evidence?.join('；') || '暂无额外依据'} · 本地规则</p></details><input aria-label="AI 建议内容" value={drafts[suggestion.calmyId] ?? suggestionText(suggestion)} onChange={event => setDrafts(current => ({ ...current, [suggestion.calmyId]: event.target.value }))} /><div className="suggestion-actions"><button className="react-btn" type="button" disabled={busy} onClick={() => void acceptSuggestion(suggestion)}>采纳建议</button><button className="react-btn" type="button" disabled={busy} onClick={() => void rejectSuggestion(suggestion)}>忽略建议</button></div></div>}
        </article>
      })}
      {!loading && !openCaptures.length && <div className="capture-empty beryl-card"><span className="gate-mark">✓</span><h2 className="font-title">这里现在是空的</h2><p>新的念头先放进上面的原文框；没有需要处理的内容时，也可以直接离开。</p></div>}
    </section>

    <section className="capture-history"><div className="section-title"><h2 className="font-title">已经处理的原文</h2><span>{history.length ? '最近 8 条' : '还没有'}</span></div>{history.map(item => <article className="capture-history-row beryl-card" key={item.calmyId}><div><b>{item.body.split(/\r?\n/, 1)[0].slice(0, 100)}</b><small>{item.status === 'accepted' ? '已进入系统' : '已放下'} · {displayTime(item.updatedAt)}</small></div><span>{item.status === 'accepted' ? '✓' : '—'}</span></article>)}</section>
  </div>
}
