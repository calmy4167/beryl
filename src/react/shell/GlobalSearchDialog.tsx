import { useEffect, useRef, useState } from 'react'
import { searchAllAsync, type SearchResult } from '@/domain/search'
import { Button, FOCUSABLE_SELECTOR, trapFocus } from '../ui'

export function GlobalSearchDialog({ onClose, onNavigate }: {
  onClose: () => void
  onNavigate: (path: string) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    void searchAllAsync(query, 8).then(next => { if (active) setResults(next) })
    return () => { active = false }
  }, [query])

  useEffect(() => {
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    const timer = window.requestAnimationFrame(() => first?.focus())
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      else trapFocus(event, panelRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => { window.cancelAnimationFrame(timer); window.removeEventListener('keydown', onKey) }
  }, [onClose])

  return <div className="search-overlay" role="dialog" aria-modal="true" aria-label="搜索内容" onClick={onClose}>
    <div ref={panelRef} className="search-panel beryl-card" onClick={event => event.stopPropagation()}>
      <div className="search-head">
        ⌕
        <input autoFocus className="global-search" aria-label="搜索内容" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索处境、行动、记录或人物…" />
        <Button aria-label="关闭搜索" onClick={onClose}>Esc</Button>
      </div>
      <div className="search-results">
        {results.map(item => <Button key={`${item.type}-${item.id}`} onClick={() => onNavigate(item.route)}>
          ◎ <span><b>{item.title}</b><small>{item.typeLabel} · {item.summary || '现实记录'}</small></span>→
        </Button>)}
        {!results.length && <p className="no-results">没有匹配的内容</p>}
      </div>
    </div>
  </div>
}
