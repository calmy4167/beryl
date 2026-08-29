import { useEffect, useMemo, useState } from 'react'
import { captureAsyncRepository, type AiSuggestion, type CaptureItem } from '@/domain/capture'
import { captureText, convertLegacyInboxToCase, convertLegacyInboxToTask, removeLegacyInbox } from '@/application'
import { listRealityDocumentsAsync, type RealityDocument } from '@/domain/reality'
import { fmtDate, nextId } from '@/core/storage'
import { registerUndo } from '@/core/undo'
import { withSaveState } from '@/core/save-state'

type Filter = 'all' | 'open' | 'suggested' | 'accepted' | 'rejected' | 'archived'

interface InboxEntry {
  id: string
  source: 'legacy' | 'capture'
  text: string
  status: string
  updatedAt: number
  date?: string
  sourceIndex?: number
  capture?: CaptureItem
  legacy?: RealityDocument
}

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'open', label: '待处理' },
  { id: 'suggested', label: '有建议' },
  { id: 'accepted', label: '已处理' },
  { id: 'rejected', label: '已拒绝' },
  { id: 'archived', label: '已归档' },
]

const STATUS_LABELS: Record<string, string> = {
  open: '待处理',
  inbox: '待处理',
  suggested: '待确认建议',
  accepted: '已处理',
  rejected: '已拒绝',
  archived: '已归档',
}

const toast = (message: string, kind: 'success' | 'warning' | 'error' = 'success') => {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] || status
}

function displayTime(timestamp: number, fallback?: string): string {
  if (Number.isFinite(timestamp) && timestamp > 0) return new Date(timestamp).toLocaleString('zh-CN')
  return fallback || '时间未知'
}

async function legacyEntries(): Promise<InboxEntry[]> {
  return (await listRealityDocumentsAsync({ types: ['inbox'] })).map(item => ({
    id: item.id,
    source: 'legacy',
    text: item.body || item.title,
    status: item.status || 'open',
    updatedAt: item.updatedAt,
    date: item.date,
    sourceIndex: item.sourceIndex,
    legacy: item,
  }))
}

function captureEntries(items: CaptureItem[]): InboxEntry[] {
  return items.map(item => ({
    id: item.calmyId,
    source: 'capture',
    text: item.body,
    status: item.status,
    updatedAt: item.updatedAt,
    date: new Date(item.createdAt).toISOString(),
    capture: item,
  }))
}

export function InboxPage() {
  const [captures, setCaptures] = useState<CaptureItem[]>([])
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([])
  const [legacy, setLegacy] = useState<InboxEntry[]>([])
  const [body, setBody] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [expandedId, setExpandedId] = useState<string>()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string>()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function refresh(): Promise<void> {
    setLoading(true)
    setError('')
    try {
      const [nextCaptures, nextSuggestions] = await Promise.all([
        captureAsyncRepository.list(),
        captureAsyncRepository.listSuggestions(),
      ])
      setCaptures(nextCaptures)
      setSuggestions(nextSuggestions)
      setLegacy(await legacyEntries())
      setMessage('')
    } catch (error) {
      const text = error instanceof Error ? error.message : '收件箱读取失败'
      setError(text)
      toast(text, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    const onDataSynced = () => { void refresh() }
    window.addEventListener('beryl-data-synced', onDataSynced)
    return () => window.removeEventListener('beryl-data-synced', onDataSynced)
  }, [])

  const suggestionByCapture = useMemo(() => new Map(suggestions.map(item => [item.captureId, item])), [suggestions])
  const entries = useMemo(() => [...legacy, ...captureEntries(captures)].sort((a, b) => b.updatedAt - a.updatedAt), [captures, legacy])
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return entries.filter(item => {
      const searchable = `${item.text} ${item.status}`.toLocaleLowerCase()
      const matchesText = !normalized || searchable.includes(normalized)
      const matchesFilter = filter === 'all' || item.status === filter || (filter === 'open' && item.status === 'inbox')
      return matchesText && matchesFilter
    })
  }, [entries, filter, query])

  async function addCapture(): Promise<void> {
    if (!body.trim()) {
      toast('先写下一段原文', 'warning')
      return
    }
    try {
      const result = await withSaveState(() => captureText(body))
      setBody('')
      await refresh()
      toast(result.suggestionError ? '原文已保存，但建议生成失败' : '已收入收件箱', result.suggestionError ? 'warning' : 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : '收件失败', 'error')
    }
  }

  async function acceptSuggestion(suggestion: AiSuggestion): Promise<void> {
    const candidate = suggestion.candidates[0]
    if (!candidate) {
      toast('这条建议没有可处理的候选项', 'warning')
      return
    }
    const value = drafts[suggestion.calmyId] ?? candidate.fields.title ?? candidate.fields.body ?? ''
    if (!value.trim()) {
      toast('请先补充处理后的内容', 'warning')
      return
    }
    setBusyId(suggestion.calmyId)
    try {
      const overrides: Record<string, string> = candidate.entityType === 'record' ? { body: value } : { title: value }
      await withSaveState(() => captureAsyncRepository.acceptSuggestion(suggestion.calmyId, 0, overrides))
      await refresh()
      toast('已按建议处理原文')
    } catch (error) {
      toast(error instanceof Error ? error.message : '处理建议失败', 'error')
    } finally {
      setBusyId(undefined)
    }
  }

  async function rejectSuggestion(suggestion: AiSuggestion): Promise<void> {
    setBusyId(suggestion.calmyId)
    try {
      await withSaveState(() => captureAsyncRepository.rejectSuggestion(suggestion.calmyId))
      await refresh()
      toast('已拒绝建议，原文仍保留')
    } catch (error) {
      toast(error instanceof Error ? error.message : '拒绝建议失败', 'error')
    } finally {
      setBusyId(undefined)
    }
  }

  async function removeCapture(item: InboxEntry): Promise<void> {
    if (item.source !== 'capture' || !item.capture) return
    if (!window.confirm('删除后原文将从 Capture 仓库移除，确定继续吗？')) return
    setBusyId(item.id)
    try {
      const removed = await withSaveState(() => captureAsyncRepository.remove(item.capture!.calmyId))
      await refresh()
      toast(removed ? '原文已删除' : '原文已经不存在', removed ? 'success' : 'warning')
    } catch (error) {
      toast(error instanceof Error ? error.message : '删除失败', 'error')
    } finally {
      setBusyId(undefined)
    }
  }

  async function removeLegacy(item: InboxEntry): Promise<void> {
    if (item.source !== 'legacy') return
    try {
      const result = await withSaveState(() => removeLegacyInbox({ id: item.legacy?.id, sourceIndex: item.sourceIndex }, `remove-inbox:${nextId()}`))
      registerUndo('inbox', result.removed, result.index, result.removed.id)
      await refresh()
      toast('旧版收件项已移除')
    } catch (error) {
      toast(error instanceof Error && error.message === 'legacy-inbox-not-found' ? '旧版收件项已变化，请刷新后重试' : '旧版收件项移除失败', 'warning')
    }
  }

  async function convertLegacyToCase(item: InboxEntry): Promise<void> {
    if (item.source !== 'legacy') return
    const title = item.text.trim()
    if (!title) return
    try {
      const result = await withSaveState(() => convertLegacyInboxToCase({ id: item.legacy?.id, sourceIndex: item.sourceIndex }, title, `convert-case:${nextId()}`))
      registerUndo('inbox', result.removed, result.index, result.removed.id)
      await refresh()
      toast(`已转为现实课题「${result.case?.title || title}」`)
    } catch (error) {
      toast(error instanceof Error && error.message === 'legacy-inbox-not-found' ? '课题可能已创建，但旧收件项已变化，请刷新后检查' : '转为课题失败，原文未确认移除', 'warning')
    }
  }

  async function convertLegacyToTask(item: InboxEntry): Promise<void> {
    if (item.source !== 'legacy') return
    try {
      const result = await withSaveState(() => convertLegacyInboxToTask({ id: item.legacy?.id, sourceIndex: item.sourceIndex }, item.text, `convert-task:${nextId()}`, { priority: '中', date: fmtDate(Date.now()) }))
      registerUndo('inbox', result.removed, result.index, result.removed.id)
      await refresh()
      toast('已转为行动任务')
    } catch (error) {
      toast(error instanceof Error && error.message === 'legacy-inbox-not-found' ? '任务可能已创建，但旧收件项已变化，请刷新后检查' : '转为行动任务失败，原文未确认移除', 'warning')
    }
  }

  function archiveUnavailable(): void {
    setMessage('当前 inbox/capture API 没有 archive 操作，未执行删除或伪造归档；原文仍保持可读。')
    toast('当前 API 未提供归档操作，原文未改变', 'warning')
  }

  const pendingCount = suggestions.filter(item => item.status === 'suggested').length
  const captureCount = captures.length + legacy.length

  return <div className="inbox-page">
    <header className="page-head">
      <div><p className="eyebrow">INBOX · CAPTURE FIRST</p><h1 className="font-title">收件箱</h1><p>先保留原文，再把它处理成行动或现实课题。</p></div>
      <span className="load-pill">{loading ? '正在读取…' : `${captureCount} 条 · ${pendingCount} 条待确认建议`}</span>
    </header>

    <section className="capture-box beryl-card">
      <textarea aria-label="新增收件内容" value={body} onChange={event => setBody(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void addCapture() } }} placeholder="脑中闪过什么？先放在这里…" />
      <div className="capture-footer"><span>Ctrl / ⌘ + Enter 保存原文</span><button className="react-btn primary" disabled={loading} onClick={() => void addCapture()}>收入收件箱</button></div>
    </section>

    <section className="beryl-card" style={{ padding: 14, marginTop: 16 }}>
      <div className="create-row" style={{ margin: 0 }}><input aria-label="搜索收件箱" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索原文或状态…" /><select aria-label="收件箱筛选" value={filter} onChange={event => setFilter(event.target.value as Filter)}>{FILTERS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><span className="muted">{visible.length} 条</span></div>
    </section>

    {error && <section className="beryl-card empty-state" role="alert"><b>收件箱数据暂时无法读取</b><p>{error}</p><button className="react-btn" type="button" onClick={() => void refresh()}>重试</button></section>}
    {message && !error && <p className="info" role="status">{message}</p>}
    <section className="history-list">
      {loading ? <div className="empty-state" role="status">正在读取收件内容…</div> : visible.map(item => {
        const suggestion = item.source === 'capture' ? suggestionByCapture.get(item.id) : undefined
        const expanded = expandedId === `${item.source}:${item.id}`
        const busy = busyId === item.id || busyId === suggestion?.calmyId
        return <article className="history-card beryl-card" key={`${item.source}:${item.id}`}>
          <div className="panel-head"><div><p className="eyebrow">{item.source === 'capture' ? 'CAPTURE' : 'LEGACY INBOX'} · {statusLabel(item.status)}</p><h2 className="font-title">{item.text.split(/\r?\n/, 1)[0].slice(0, 120) || '未命名收件项'}</h2></div><small>{displayTime(item.updatedAt, item.date)}</small></div>
          <div className="suggestion-actions"><button className="react-btn" onClick={() => setExpandedId(expanded ? undefined : `${item.source}:${item.id}`)}>{expanded ? '收起原文' : '查看原文'}</button>{item.source === 'capture' && <><button className="react-btn" onClick={archiveUnavailable}>归档</button><button className="react-btn danger" disabled={busy} onClick={() => void removeCapture(item)}>删除</button></>}{item.source === 'legacy' && <><button className="react-btn" onClick={() => { void convertLegacyToTask(item) }}>→ 行动</button><button className="react-btn" onClick={() => { void convertLegacyToCase(item) }}>→ 课题</button><button className="react-btn" onClick={() => { void removeLegacy(item) }}>移除</button></>}</div>
          {expanded && <div className="opening-details"><p className="info" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.text}</p>{item.source === 'capture' && item.capture && <small className="muted">Capture ID：{item.capture.calmyId} · revision {item.capture.revision}</small>}</div>}
          {suggestion?.status === 'suggested' && <div className="suggestion-card beryl-card"><div className="panel-head"><div><p className="eyebrow">SUGGESTION · {Math.round(suggestion.confidence * 100)}%</p><h3 className="font-title">{suggestion.candidates[0]?.label || '建议'}</h3></div><span className="muted">可拒绝</span></div><p>{suggestion.rationale}</p><input aria-label={`${item.text.slice(0, 20)}处理内容`} value={drafts[suggestion.calmyId] ?? suggestion.candidates[0]?.fields.title ?? suggestion.candidates[0]?.fields.body ?? ''} onChange={event => setDrafts(current => ({ ...current, [suggestion.calmyId]: event.target.value }))} /><div className="suggestion-actions"><button className="react-btn primary" disabled={busy} onClick={() => void acceptSuggestion(suggestion)}>采纳并处理</button><button className="react-btn" disabled={busy} onClick={() => void rejectSuggestion(suggestion)}>拒绝建议</button></div></div>}
        </article>
      })}
      {!loading && !visible.length && <div className="empty-state">没有匹配的收件内容。</div>}
    </section>
  </div>
}
