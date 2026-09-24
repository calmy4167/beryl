import type { RefObject } from 'react'
import { BrandMark, Button } from '../ui'

export function MobileHeader({ directoryOpen, directoryTriggerRef, immersiveTriggerRef, onNavigate, onSearch, onOpenDirectory, onEnterImmersive }: {
  directoryOpen: boolean
  directoryTriggerRef: RefObject<HTMLButtonElement | null>
  immersiveTriggerRef: RefObject<HTMLButtonElement | null>
  onNavigate: (path: string) => void
  onSearch: () => void
  onOpenDirectory: (trigger: HTMLButtonElement) => void
  onEnterImmersive: () => void
}) {
  return <header className="mobile-header">
    <Button className="brand compact" aria-label="返回今天" onClick={() => onNavigate('/app/today')}>
      <BrandMark /><b>Calmy</b>
    </Button>
    <div>
      <Button ref={immersiveTriggerRef} className="immersive-toggle" aria-label="进入沉浸模式" title="进入沉浸模式" onClick={onEnterImmersive}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H5a1 1 0 0 0-1 1v3m12-4h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3m12-4v3a1 1 0 0 1-1 1h-3" /></svg>
      </Button>
      <Button className="search-btn" aria-label="搜索内容" onClick={onSearch}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg></Button>
      <Button ref={directoryTriggerRef} className="menu" aria-label="打开功能目录" aria-haspopup="dialog" aria-controls="more-drawer" aria-expanded={directoryOpen} onClick={event => onOpenDirectory(event.currentTarget)}>功能</Button>
    </div>
  </header>
}
