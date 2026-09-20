import { Button } from '../ui'

export function PageTopBar({ title, description, saveLabel, saveState, onSearch }: {
  title: string
  description: string
  saveLabel: string
  saveState: string
  onSearch: () => void
}) {
  return <header className="desktop-topbar">
    <div className="breadcrumb">
      <span className="topbar-kicker">CALMY</span>
      <b>{title}</b>
      {description && <><span>/</span><span>{description}</span></>}
    </div>
    <div className="topbar-actions">
      <span className={`save-state save-${saveState}`} role="status" aria-live="polite"><i />{saveLabel}</span>
      <Button className="topbar-search" aria-label="搜索内容" onClick={onSearch}>⌕ 搜索 <kbd>Ctrl K</kbd></Button>
    </div>
  </header>
}
