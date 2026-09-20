import type { RefObject } from 'react'
import { Button } from '../ui'

export function MobileHeader({ directoryOpen, directoryTriggerRef, onNavigate, onSearch, onOpenDirectory }: {
  directoryOpen: boolean
  directoryTriggerRef: RefObject<HTMLButtonElement | null>
  onNavigate: (path: string) => void
  onSearch: () => void
  onOpenDirectory: () => void
}) {
  return <header className="mobile-header">
    <Button className="brand compact" aria-label="返回今天" onClick={() => onNavigate('/app/today')}>
      <span className="brand-mark">C</span><b className="font-title">Calmy</b>
    </Button>
    <div>
      <Button className="search-btn" aria-label="搜索内容" onClick={onSearch}>⌕</Button>
      <Button ref={directoryTriggerRef} className="menu" aria-label="打开功能目录" aria-haspopup="dialog" aria-controls="more-drawer" aria-expanded={directoryOpen} onClick={onOpenDirectory}>☰</Button>
    </div>
  </header>
}
