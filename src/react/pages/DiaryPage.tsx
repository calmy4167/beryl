import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { withSaveState } from '@/core/save-state'
import { createAsyncCollectionRepository } from '@/core/repository'
import { dateKey, todayKey } from '@/core/storage'
import { listRealityDocumentsAsync } from '@/domain/reality'

interface DiaryEntry {
  date: string
  content: string
}

const diaryRepository = createAsyncCollectionRepository<DiaryEntry>('diary', item => item.date)

const toast = (message: string, kind: 'success' | 'warning' | 'error' = 'success') => {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

function isDiaryEntry(value: unknown): value is DiaryEntry {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<DiaryEntry>
  return typeof item.date === 'string' && typeof item.content === 'string'
}

async function readEntries(): Promise<DiaryEntry[]> {
  const documents = await listRealityDocumentsAsync({ types: ['diary'] })
  const stored = (await diaryRepository.list()).filter(isDiaryEntry)
  const storedByDate = new Map(stored.map(item => [item.date, item.content]))

  return documents
    .map(document => {
      const date = document.date || document.id
      const content = storedByDate.get(date) || document.body || document.summary
      return { date, content: content.trim() }
    })
    .filter(item => item.date && item.content)
    .sort((left, right) => right.date.localeCompare(left.date))
}

async function readContent(date: string): Promise<string> {
  const stored = (await diaryRepository.list()).filter(isDiaryEntry)
  const exact = stored.find(item => item.date === date)
  if (exact) return exact.content

  const document = (await listRealityDocumentsAsync({ types: ['diary'] })).find(item => (item.date || item.id) === date)
  return document?.body || document?.summary || ''
}

function shiftDate(value: string, amount: number): string {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  date.setDate(date.getDate() + amount)
  return dateKey(date)
}

function shortContent(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim()
  return compact.length > 96 ? `${compact.slice(0, 96)}…` : compact
}

export function DiaryPage() {
  const [selectedDate, setSelectedDate] = useState(todayKey())
  const [content, setContent] = useState('')
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [contentLoading, setContentLoading] = useState(true)
  const [error, setError] = useState('')

  async function refresh(): Promise<void> {
    setLoading(true)
    try {
      setEntries(await readEntries())
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '日记读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    setContentLoading(true)
    void readContent(selectedDate)
      .then(nextContent => { if (active) setContent(nextContent) })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '日记读取失败') })
      .finally(() => { if (active) setContentLoading(false) })
    return () => { active = false }
  }, [selectedDate])

  useEffect(() => {
    void refresh()
    const onDataSynced = () => { void refresh() }
    window.addEventListener('beryl-data-synced', onDataSynced)
    return () => window.removeEventListener('beryl-data-synced', onDataSynced)
  }, [])

  const visibleEntries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return entries
    return entries.filter(entry => `${entry.date} ${entry.content}`.toLocaleLowerCase().includes(normalized))
  }, [entries, query])

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const value = content.trim()
    if (!value) {
      toast('写点什么再保存吧', 'warning')
      return
    }

    setSaving(true)
    try {
      await withSaveState(async () => {
        const current = (await diaryRepository.list()).filter(isDiaryEntry)
        const existing = current.find(item => item.date === selectedDate)
        if (existing) {
          if (!await diaryRepository.update(selectedDate, () => ({ ...existing, content: value }))) throw new Error('日记保存失败，请检查本地存储状态')
        } else await diaryRepository.create({ date: selectedDate, content: value })
      })
      setContent(value)
      await refresh()
      toast(`日记已保存 · ${selectedDate} 📓`)
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '日记保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  function selectDate(date: string): void {
    if (!date) return
    setSelectedDate(date)
  }

  return (
    <div className="diary-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">DIARY · DAILY REFLECTION</p>
          <h1 className="font-title">日记</h1>
          <p>按日期留下今天的心情、观察与收获，历史记录保存在本机 diary 数据集中。</p>
        </div>
        <span className="load-pill">{entries.length} 篇记录</span>
      </header>

      {error && (
        <section className="beryl-card empty-state" role="alert" style={{ marginBottom: 16 }}>
          <b>日记数据暂时无法读取</b>
          <p>{error}</p>
          <button className="react-btn" type="button" onClick={() => void refresh()}>重试</button>
        </section>
      )}

      <section className="beryl-card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="panel-head" style={{ alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p className="eyebrow">DAILY NOTE</p>
            <h2 className="font-title">{selectedDate === todayKey() ? '今日日记' : '编辑日记'}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button className="react-btn" type="button" onClick={() => selectDate(shiftDate(selectedDate, -1))} disabled={saving} aria-label="前一天">←</button>
            <input aria-label="选择日记日期" type="date" value={selectedDate} onChange={event => selectDate(event.target.value)} disabled={saving} />
            <button className="react-btn" type="button" onClick={() => selectDate(shiftDate(selectedDate, 1))} disabled={saving} aria-label="后一天">→</button>
            <button className="react-btn" type="button" onClick={() => selectDate(todayKey())} disabled={saving}>今天</button>
          </div>
        </div>

        <form onSubmit={event => void save(event)} style={{ marginTop: 16 }}>
          <textarea
            aria-label={`${selectedDate} 日记内容`}
            value={contentLoading ? '' : content}
            onChange={event => setContent(event.target.value)}
            placeholder="写下今天的心情、想法与收获…"
            rows={10}
            disabled={saving || contentLoading}
            style={{ width: '100%', resize: 'vertical', minHeight: 180, boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
            <span className="muted">{contentLoading ? '正在读取当前日期…' : `${content.length} 字 · 选择任意日期即可补写历史记录`}</span>
            <button className="react-btn primary" type="submit" disabled={saving || contentLoading}>{saving ? '保存中…' : '保存日记'}</button>
          </div>
        </form>
      </section>

      <section className="beryl-card" style={{ padding: 16 }}>
        <div className="panel-head" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p className="eyebrow">DIARY INDEX</p>
            <h2 className="font-title">历史记录</h2>
          </div>
          <input aria-label="搜索日记" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索日期或内容" style={{ flex: '1 1 220px', minWidth: 0 }} />
        </div>

        {loading ? <div className="empty-state">正在读取日记…</div> : visibleEntries.length ? (
          <div className="list" aria-live="polite" style={{ marginTop: 16, display: 'grid', gap: 8 }}>
            {visibleEntries.map(entry => (
              <button
                key={entry.date}
                type="button"
                className="beryl-card hoverable"
                onClick={() => selectDate(entry.date)}
                aria-pressed={entry.date === selectedDate}
                style={{ padding: 12, textAlign: 'left', cursor: 'pointer', borderColor: entry.date === selectedDate ? 'var(--scene-border-strong)' : undefined }}
              >
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong>{entry.date}{entry.date === todayKey() ? ' · 今天' : ''}</strong>
                  <span className="muted">打开编辑</span>
                </span>
                <span style={{ display: 'block', marginTop: 6, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{shortContent(entry.content)}</span>
              </button>
            ))}
          </div>
        ) : <div className="empty-state">{query ? '没有匹配的日记。' : '还没有日记，写下第一篇吧。'}</div>}
      </section>
    </div>
  )
}
