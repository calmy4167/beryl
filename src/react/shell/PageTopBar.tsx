import { Button } from '../ui'

export function PageTopBar({ title, description, saveLabel, saveState, compactSearch, onSearch }: {
  title: string
  description: string
  saveLabel: string
  saveState: string
  compactSearch: boolean
  onSearch: () => void
}) {
  return <header className={`desktop-topbar ${compactSearch ? 'is-compact-search' : ''}`}>
    <div className="breadcrumb">
      <b>{title}</b>
      {description && <><span>/</span><span>{description}</span></>}
    </div>
    <div className="topbar-actions">
      <Button className="topbar-search" aria-label="搜索内容" onClick={onSearch}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
        <span>搜索记录、处境或想法…</span><kbd>Ctrl K</kbd>
      </Button>
      <span className={`save-state save-${saveState}`} role="status" aria-live="polite"><i />{saveLabel}</span>
    </div>
  </header>
}
