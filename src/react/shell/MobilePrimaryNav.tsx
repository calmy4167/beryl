import type { RefObject } from 'react'
import { Button } from '../ui'
import { primaryNavigation } from '../navigation'

export function MobilePrimaryNav({ active, directoryOpen, directoryTriggerRef, onNavigate, onOpenDirectory }: {
  active: string
  directoryOpen: boolean
  directoryTriggerRef: RefObject<HTMLButtonElement | null>
  onNavigate: (path: string) => void
  onOpenDirectory: () => void
}) {
  return <nav className="bottom-nav mobile-only" aria-label="移动端主导航">
    {primaryNavigation.map(item => <Button key={item.key} title={item.label} className={active === item.key ? 'on' : ''} aria-current={active === item.key ? 'page' : undefined} onClick={() => onNavigate(item.path)}>
      <span>{item.icon}</span>{item.label}
    </Button>)}
    <Button ref={directoryTriggerRef} aria-label="打开功能目录" aria-haspopup="dialog" aria-controls="more-drawer" aria-expanded={directoryOpen} onClick={onOpenDirectory}>
      <span>⋯</span>功能
    </Button>
  </nav>
}
