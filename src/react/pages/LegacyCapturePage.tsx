import { useEffect, useState } from 'react'
import { captureAsyncRepository, type AiSuggestion, type CaptureItem } from '@/domain/capture'
import { withSaveState } from '@/core/save-state'
import { captureText } from '@/application'
import { Button, PageHead } from '../ui'

const toast = (message: string, kind: 'success' | 'warning' | 'error' = 'success') => window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))

export function LegacyCapturePage() {
  const [body, setBody] = useState('')
  const [captures, setCaptures] = useState<CaptureItem[]>([])
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function refresh(): Promise<void> {
    setLoading(true)
    try {
      const [items, next] = await Promise.all([captureAsyncRepository.list(), captureAsyncRepository.listSuggestions()])
      setCaptures(items)
      setSuggestions(next)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Capture 读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  async function capture(): Promise<void> {
    if (!body.trim()) { toast('先写下一段原文', 'warning'); return }
    try {
      const result = await withSaveState(() => captureText(body))
      setBody('')
      await refresh()
      toast(result.suggestionError ? '原文已保存，但建议生成失败' : '已保存原文，并生成一条本地 suggestion', result.suggestionError ? 'warning' : 'success')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : 'Capture 保存失败', 'error')
    }
  }

  async function accept(item: AiSuggestion): Promise<void> {
    try {
      const value = drafts[item.calmyId] ?? item.candidates[0]?.fields.title ?? item.candidates[0]?.fields.body ?? ''
      await withSaveState(() => captureAsyncRepository.acceptSuggestion(item.calmyId, 0, item.candidates[0]?.entityType === 'record' ? { body: value } : { title: value }))
      await refresh()
      toast('建议已采纳')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '采纳失败', 'error')
    }
  }

  async function reject(item: AiSuggestion): Promise<void> {
    try {
      await withSaveState(() => captureAsyncRepository.rejectSuggestion(item.calmyId))
      await refresh()
      toast('已保留原文，拒绝这条建议')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '拒绝建议失败', 'error')
    }
  }

  const pending = suggestions.filter(item => item.status === 'suggested')

  return (
    <div className="capture-page">
      <PageHead eyebrow="CAPTURE · 原文优先" title="先收下来，再决定它是什么" description="Capture 不要求你当场整理；原文会先保存到本机。" />
      {error && <section className="beryl-card empty-state" role="alert"><b>Capture 数据暂时无法读取</b><p>{error}</p><Button onClick={() => void refresh()}>重试</Button></section>}
      <section className="capture-box beryl-card">
        <textarea value={body} onChange={event => setBody(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void capture() } }} aria-label="Capture 原文" placeholder="想到什么就写什么…" />
        <div className="capture-footer"><span>{loading ? '正在读取…' : '本地规则会给出可拒绝的建议'}</span><Button className="primary" onClick={() => void capture()}>保存原文</Button></div>
      </section>
      {pending.map(item => <article className="suggestion-card beryl-card" key={item.calmyId}><div className="panel-head"><div><p className="eyebrow">SUGGESTION · {Math.round(item.confidence * 100)}%</p><h2 className="font-title">{item.candidates[0]?.label || '建议'}</h2></div><span>可拒绝</span></div><p>{item.rationale}</p><input aria-label="建议内容" value={drafts[item.calmyId] ?? item.candidates[0]?.fields.title ?? item.candidates[0]?.fields.body ?? ''} onChange={event => setDrafts(current => ({ ...current, [item.calmyId]: event.target.value }))} /><div className="suggestion-actions"><Button className="primary" onClick={() => void accept(item)}>采纳</Button><Button className="reject" onClick={() => void reject(item)}>拒绝</Button></div></article>)}
      <section className="history-list">
        <div className="section-title"><h2 className="font-title">原文历史</h2><span>{captures.length} 条</span></div>
        {loading ? <div className="empty-state" role="status">正在读取原文…</div> : captures.map(item => <article className="history-card beryl-card" key={item.calmyId}><p>{item.body}</p><small>{new Date(item.createdAt).toLocaleString('zh-CN')} · {item.status}</small></article>)}
        {!loading && !captures.length && <div className="empty-state">还没有 Capture，写下第一段原文。</div>}
      </section>
    </div>
  )
}
