import { useEffect, useState } from 'react'
import { listActionRecordDocumentsAsync, type RealityDocument } from '@/domain/reality'
import { todayKey } from '@/core/storage'
import { useNavigate } from 'react-router-dom'

const refreshEvent = 'calmy-today-recent-refresh'

export function notifyTodayRecentRecordsChanged(): void {
  window.dispatchEvent(new Event(refreshEvent))
}

export function TodayRecentRecords() {
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<RealityDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const date = todayKey()
    const from = new Date(`${date}T00:00:00`).getTime()
    const to = new Date(`${date}T23:59:59.999`).getTime()

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const recent = await listActionRecordDocumentsAsync({ types: ['action', 'record'], from, to, limit: 8 })
        if (active) setDocuments(recent.slice(0, 3))
      } catch {
        if (active) setError('今天的记录暂时无法读取。')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    window.addEventListener(refreshEvent, load)
    return () => {
      active = false
      window.removeEventListener(refreshEvent, load)
    }
  }, [])

  return <section className="recent-records-panel beryl-card" aria-labelledby="today-recent-title">
    <div className="page-section-head">
      <div><p className="eyebrow">TODAY · 真实记录</p><h2 id="today-recent-title">今天的记录</h2></div>
      <button className="quiet-link" type="button" onClick={() => navigate('/app/review')}>查看回顾 →</button>
    </div>
    {loading ? <p className="recent-records-message" role="status">正在读取今天的记录…</p>
      : error ? <p className="recent-records-message" role="status">{error}</p>
        : documents.length ? <div className="recent-record-list">
          {documents.map(document => <article className="recent-record-row" key={`${document.entityType}-${document.id}`}>
            <i className={`dot ${document.entityType}`} aria-hidden="true" />
            <b>{document.title || document.body || '未命名记录'}</b>
            <span>{document.entityType === 'action' ? '行动' : '记录'}</span>
            <time dateTime={new Date(document.occurredAt ?? document.updatedAt).toISOString()}>{new Date(document.occurredAt ?? document.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
          </article>)}
        </div>
          : <p className="recent-records-message">还没有记录。保存第一条现实记录后，会显示在这里。</p>}
  </section>
}
