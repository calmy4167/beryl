import type { RefObject } from 'react'
import { Button } from '../ui'
import { primaryNavigation } from '../navigation'

export function DesktopPrimaryNav({
  collapsed,
  active,
  directoryOpen,
  directoryTriggerRef,
  onNavigate,
  onSearch,
  onToggle,
  onOpenDirectory,
}: {
  collapsed: boolean
  active: string
  directoryOpen: boolean
  directoryTriggerRef: RefObject<HTMLButtonElement | null>
  onNavigate: (path: string) => void
  onSearch: () => void
  onToggle: () => void
  onOpenDirectory: () => void
}) {
  return <aside id="app-sidebar" className="sidebar" aria-label={collapsed ? '已收起的主导航' : '主导航侧边栏'}>
    <Button className="brand" aria-label="返回今天" onClick={() => onNavigate('/app/today')}>
      <span className="brand-mark">C</span>
      <span className="sidebar-label"><b className="font-title">Calmy</b><small>现实行动系统</small></span>
    </Button>
    <Button className="sidebar-toggle" aria-expanded={!collapsed} aria-controls="app-sidebar" aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'} onClick={onToggle}>
      <span>{collapsed ? '→' : '←'}</span><span className="sidebar-label">{collapsed ? '展开侧边栏' : '收起侧边栏'}</span>
    </Button>
    <p className="sidebar-label" style={{ margin: '0 9px 4px', color: 'var(--c-text-3)', fontSize: 10, letterSpacing: '.08em' }}>日常主线</p>
    <nav id="primary-navigation" className="primary-nav" aria-label="日常主线导航">
      {primaryNavigation.map(item => <Button key={item.key} title={item.label} aria-label={item.label} className={active === item.key ? 'on' : ''} aria-current={active === item.key ? 'page' : undefined} onClick={() => onNavigate(item.path)}>
        <i>{item.icon}</i><span className="nav-label">{item.label}</span>
      </Button>)}
    </nav>
    <div className="sidebar-foot">
      <Button aria-label="搜索内容" onClick={onSearch}>⌕<span className="sidebar-label">搜索 <kbd>Ctrl K</kbd></span></Button>
      <Button ref={directoryTriggerRef} aria-label="打开功能目录" aria-haspopup="dialog" aria-controls="more-drawer" aria-expanded={directoryOpen} onClick={onOpenDirectory}>⋯<span className="sidebar-label">功能</span></Button>
    </div>
  </aside>
}
