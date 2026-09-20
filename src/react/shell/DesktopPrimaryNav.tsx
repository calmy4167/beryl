import type { RefObject } from 'react'
import { BrandMark, Button } from '../ui'
import { featureNavigationGroups, primaryNavigation } from '../navigation'

export function DesktopPrimaryNav({
  collapsed,
  active,
  activePath,
  directoryOpen,
  directoryTriggerRef,
  onNavigate,
  onSearch,
  onToggle,
  onOpenDirectory,
}: {
  collapsed: boolean
  active: string
  activePath: string
  directoryOpen: boolean
  directoryTriggerRef: RefObject<HTMLButtonElement | null>
  onNavigate: (path: string) => void
  onSearch: () => void
  onToggle: () => void
  onOpenDirectory: () => void
}) {
  return <aside id="app-sidebar" className="sidebar" aria-label={collapsed ? '已收起的主导航' : '主导航侧边栏'}>
    <div className="sidebar-header">
      <Button className="brand" aria-label="返回今天" onClick={() => onNavigate('/app/today')}>
        <BrandMark />
        <span className="sidebar-label"><b>Calmy</b></span>
      </Button>
      <Button className="sidebar-toggle" aria-expanded={!collapsed} aria-controls="app-sidebar" aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'} onClick={onToggle}>
        <span>{collapsed ? '→' : '←'}</span>
      </Button>
    </div>
    <p className="sidebar-label" style={{ margin: '0 9px 4px', color: 'var(--c-text-3)', fontSize: 10, letterSpacing: '.08em' }}>日常主线</p>
    <nav id="primary-navigation" className="primary-nav" aria-label="日常主线导航">
      {primaryNavigation.map(item => <Button key={item.key} title={item.label} aria-label={item.label} className={active === item.key ? 'on' : ''} aria-current={active === item.key ? 'page' : undefined} onClick={() => onNavigate(item.path)}>
        <i>{item.icon}</i><span className="nav-label">{item.label}</span>
      </Button>)}
    </nav>
    <section className="sidebar-feature-section" aria-label="功能分组">
      <div className="sidebar-section-heading">
        <span className="sidebar-label">功能</span>
        <div>
          <Button aria-label="搜索内容" title="搜索内容" onClick={onSearch}>⌕</Button>
          <Button ref={directoryTriggerRef} aria-label="打开全部功能" title="打开全部功能" aria-haspopup="dialog" aria-controls="more-drawer" aria-expanded={directoryOpen} onClick={onOpenDirectory}>⋯</Button>
        </div>
      </div>
      <nav className="feature-nav" aria-label="功能目录">
        {featureNavigationGroups.map(group => {
          const isActive = group.items.some(item => activePath === item.path || activePath.startsWith(`${item.path}/`))
          return <Button key={group.id} title={group.label} aria-label={`打开${group.label}`} className={`feature-group-button ${isActive ? 'on' : ''}`} onClick={() => group.items[0] ? onNavigate(group.items[0].path) : onOpenDirectory()}>
            <i aria-hidden="true">{group.items[0]?.icon || '◦'}</i><span className="sidebar-label">{group.label}</span>
          </Button>
        })}
      </nav>
    </section>
    <div className="sidebar-foot">
      <Button aria-label="设置" title="设置" onClick={() => onNavigate('/app/admin')}>⚙<span className="sidebar-label">设置</span></Button>
    </div>
  </aside>
}
