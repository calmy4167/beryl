import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { BrandMark, Button } from '../ui'
import { desktopNavigationGroups, type DesktopNavigationGroupId } from '../navigation'

function GroupIcon({ groupId }: { groupId: DesktopNavigationGroupId }) {
  if (groupId === 'daily') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 10 8-6 8 6v9H5v-9" /><path d="M9 19v-6h6v6" /></svg>
  if (groupId === 'work') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="13" rx="2" /><path d="M9 6V4h6v2M4 11h16" /></svg>
  if (groupId === 'records') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v4h4M9 12h6M9 16h6" /></svg>
  if (groupId === 'understanding') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3" /><circle cx="17" cy="7" r="2" /><path d="M3.5 19c.6-3.6 2.1-5.4 4.5-5.4s3.9 1.8 4.5 5.4M14 14c2.8-.7 4.7.7 5.6 4" /></svg>
  if (groupId === 'daily-tools') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5.5 4 4M4 20l5.5-1.5L19 9l-4-4-9.5 9.5z" /><path d="m12 8 4 4" /></svg>
  if (groupId === 'experiments') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3" /><path d="M8 15h8" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M5 21c.8-4.4 3.1-6.6 7-6.6s6.2 2.2 7 6.6" /></svg>
}

function PageIcon({ path }: { path: string }) {
  const page = path.split('/').pop()
  if (page === 'today') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 10 8-6 8 6v10H4z" /><path d="M9 20v-6h6v6" /></svg>
  if (page === 'capture') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h8l4 4v12H6zM14 4v4h4M9 13h6M9 16h4" /></svg>
  if (page === 'matters') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="m15 9-2 4-4 2 2-4z" /></svg>
  if (page === 'review') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v5h5M5.5 10a7 7 0 1 1-.3 5M12 8v4l3 2" /></svg>
  if (page === 'task-board') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M9 4v16M15 4v16M5.5 9h2M11 13h2M17 8h2" /></svg>
  if (page === 'tasks') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 2 2 3-3M12 8h8M4 16l2 2 3-3M12 17h8" /></svg>
  if (page === 'goals') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".8" fill="currentColor" stroke="none" /></svg>
  if (page === 'calendar') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="15" rx="2" /><path d="M8 3v6M16 3v6M4 11h16M8 15h3" /></svg>
  if (page === 'feishu') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="10" height="10" rx="2" /><path d="M10 10h8a2 2 0 0 1 2 2v7H10v-9Z" /></svg>
  if (page === 'cycle') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8a8 8 0 0 0-13-2L4 8M4 4v4h4M5 16a8 8 0 0 0 13 2l2-2M20 20v-4h-4" /></svg>
  if (page === 'inbox') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14l2 14H3L5 4ZM3.5 14H9l2 3h2l2-3h5.5" /></svg>
  if (page === 'library') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h5v15H4zM10 4h5v16h-5zM17 7l3-1 3 13-3 1z" /></svg>
  if (page === 'flow') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="2" /><circle cx="18" cy="9" r="2" /><circle cx="9" cy="18" r="2" /><path d="m8 6 8 2M17 11l-7 5M7 8l2 8" /></svg>
  if (page === 'diary') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6c-2-1-5-1.5-9-1v14c4-.5 7 0 9 1 2-1 5-1.5 9-1V5c-4-.5-7 0-9 1ZM12 6v14M6 9h3M15 9h3" /></svg>
  if (page === 'posts') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h12v8M5 4v16h13v-4M8 8h6M8 12h4" /><path d="m14 17 5-5 2 2-5 5-3 1z" /></svg>
  if (page === 'people') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3 20c.5-4 2.5-6 6-6s5.5 2 6 6M17 5a3 3 0 0 1 0 6M17 14c2.5.5 3.8 2.5 4 6" /></svg>
  if (page === 'graph') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="5" r="2" /><circle cx="19" cy="12" r="2" /><circle cx="12" cy="19" r="2" /><path d="m6.5 10.5 4-4m3 0 4 4m0 3-4 4m-3 0-4-4" /></svg>
  if (page === 'memory') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5ZM4 12l8 5 8-5M4 16l8 5 8-5" /></svg>
  if (page === 'habits') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8a8 8 0 1 0 1 6M19 4v4h-4M9 12l2 2 4-4" /></svg>
  if (page === 'finance') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 9h18M16 15h2M6 6V4h12" /></svg>
  if (page === 'pomo') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 8v5l3 2M9 2h6M12 2v3" /></svg>
  if (page === 'future') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20c3-2 5-5 7-9M11 11c2-4 4-6 9-7M11 11c2 5 4 7 9 9M17 4h3v3M17 20h3v-3" /></svg>
  if (page === 'scene') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m5 17 5-5 3 3 3-4 3 3M8 9h.01" /></svg>
  if (page === 'profile') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 20c.7-4 3.3-6 8-6s7.3 2 8 6" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></svg>
}

function DirectoryIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="5" height="5" rx="1" /><rect x="15" y="4" width="5" height="5" rx="1" /><rect x="4" y="15" width="5" height="5" rx="1" /><rect x="15" y="15" width="5" height="5" rx="1" /></svg>
}

function groupForPath(pathname: string): DesktopNavigationGroupId {
  return desktopNavigationGroups.find(group => group.items.some(item => pathname === item.path || pathname.startsWith(`${item.path}/`)))?.id ?? 'daily'
}

export function DesktopPrimaryNav({
  collapsed,
  active,
  activePath,
  directoryOpen,
  directoryTriggerRef,
  immersiveTriggerRef,
  onNavigate,
  onSearch,
  onToggleSidebar,
  onEnterImmersive,
  onOpenDirectory,
}: {
  collapsed: boolean
  active: string
  activePath: string
  directoryOpen: boolean
  directoryTriggerRef: RefObject<HTMLButtonElement | null>
  immersiveTriggerRef: RefObject<HTMLButtonElement | null>
  onNavigate: (path: string) => void
  onSearch: (focusReturn?: HTMLElement) => void
  onToggleSidebar: () => void
  onEnterImmersive: () => void
  onOpenDirectory: (trigger: HTMLButtonElement, focusReturn?: HTMLElement) => void
}) {
  const routeGroupId = groupForPath(activePath)
  const [selectedGroupId, setSelectedGroupId] = useState<DesktopNavigationGroupId>(routeGroupId)
  const [openGroupId, setOpenGroupId] = useState<DesktopNavigationGroupId | null>(null)
  const [panelAnchor, setPanelAnchor] = useState({ left: 252, top: 14, maxHeight: 480 })
  const sidebarRef = useRef<HTMLElement | null>(null)
  const groupButtonRefs = useRef(new Map<DesktopNavigationGroupId, HTMLButtonElement>())

  useEffect(() => {
    setSelectedGroupId(routeGroupId)
    setOpenGroupId(null)
  }, [activePath, routeGroupId])

  const selectedIndex = desktopNavigationGroups.findIndex(group => group.id === selectedGroupId)
  const selectedGroup = useMemo(
    () => desktopNavigationGroups.find(group => group.id === selectedGroupId) ?? desktopNavigationGroups[0],
    [selectedGroupId],
  )

  useEffect(() => {
    if (!openGroupId) return
    const onPointerDown = (event: PointerEvent) => {
      if (directoryOpen) return
      const target = event.target
      if (!(target instanceof Element) || !target.closest('#secondary-navigation, #navigation-group-rail')) {
        setOpenGroupId(null)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpenGroupId(null)
      groupButtonRefs.current.get(openGroupId)?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [directoryOpen, openGroupId])

  function toggleGroup(groupId: DesktopNavigationGroupId, button: HTMLButtonElement) {
    if (openGroupId === groupId) {
      setOpenGroupId(null)
      return
    }
    setSelectedGroupId(groupId)
    const group = desktopNavigationGroups.find(item => item.id === groupId) ?? desktopNavigationGroups[0]
    const rect = button.getBoundingClientRect()
    const estimatedHeight = Math.min(Math.max(240, group.items.length * 44 + 118), Math.max(240, window.innerHeight - 24))
    const top = Math.min(Math.max(12, Math.round(rect.top)), Math.max(12, window.innerHeight - estimatedHeight - 12))
    setPanelAnchor({
      left: Math.round(rect.right + 10),
      top,
      maxHeight: Math.max(240, window.innerHeight - top - 12),
    })
    setOpenGroupId(groupId)
  }

  const panelOpen = openGroupId === selectedGroupId
  const panelStyle = { left: `${panelAnchor.left}px`, top: `${panelAnchor.top}px`, maxHeight: `${panelAnchor.maxHeight}px` } as CSSProperties

  return <aside ref={sidebarRef} id="app-sidebar" className="sidebar" data-active-route={active} data-selected-group={selectedGroupId} aria-label={collapsed ? '已收起的主导航' : '主导航侧边栏'}>
    <section className="primary-rail" aria-label="功能分组">
      <div className="primary-rail-header">
        <Button className="rail-brand" aria-label="返回今天" title="返回今天" onClick={() => onNavigate('/app/today')}>
          <BrandMark /><span className="rail-brand-label">CALMY</span>
        </Button>
        <Button
          className="sidebar-toggle"
          aria-label={collapsed ? '展开左侧菜单' : '收起左侧菜单'}
          title={collapsed ? '展开左侧菜单' : '收起左侧菜单'}
          aria-expanded={!collapsed}
          onClick={onToggleSidebar}
        >
          <svg className={collapsed ? 'is-collapsed' : ''} viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4-8 8 8 8" /></svg>
        </Button>
      </div>
      <nav
        id="navigation-group-rail"
        className="navigation-group-rail"
        aria-label="功能分组导航"
        data-active-index={selectedIndex}
        style={{ '--nav-active-index': Math.max(0, selectedIndex) } as CSSProperties}
      >
        <span className="nav-active-track" data-active={selectedIndex >= 0} aria-hidden="true" />
        {desktopNavigationGroups.map(group => <Button
          key={group.id}
          className={selectedGroupId === group.id ? 'on' : ''}
          data-group-id={group.id}
          ref={button => { if (button) groupButtonRefs.current.set(group.id, button); else groupButtonRefs.current.delete(group.id) }}
          title={`${openGroupId === group.id ? '收起' : '展开'}${group.label}菜单`}
          aria-label={`${group.label}菜单`}
          aria-pressed={selectedGroupId === group.id}
          aria-expanded={openGroupId === group.id}
          aria-controls="secondary-navigation"
          onClick={event => toggleGroup(group.id, event.currentTarget)}
        >
          <i><GroupIcon groupId={group.id} /></i>
          <span>{group.label}</span>
          <svg className={`group-disclosure ${openGroupId === group.id ? 'is-open' : ''}`} viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </Button>)}
      </nav>
      <div className="primary-rail-foot">
        <Button ref={immersiveTriggerRef} className="immersive-entry" aria-label="进入沉浸模式" title="进入沉浸模式" onClick={onEnterImmersive}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H5a1 1 0 0 0-1 1v3m12-4h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3m12-4v3a1 1 0 0 1-1 1h-3" /></svg>
        </Button>
        <Button aria-label="设置" title="设置" onClick={() => onNavigate('/app/admin')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></svg>
        </Button>
      </div>
    </section>

    <section id="secondary-navigation" className={`secondary-sidebar ${panelOpen ? 'is-open' : ''}`} aria-label={`${selectedGroup.label}页面`} aria-hidden={panelOpen ? undefined : true} style={panelStyle}>
      <header className="secondary-sidebar-header">
        <h2 className="secondary-sidebar-title">{selectedGroup.label}</h2>
        <Button aria-label="搜索内容" title="搜索内容" tabIndex={panelOpen ? undefined : -1} onClick={() => {
          setOpenGroupId(null)
          onSearch(groupButtonRefs.current.get(selectedGroupId) ?? undefined)
        }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
        </Button>
      </header>
      <nav className="secondary-nav" aria-label={`${selectedGroup.label}页面列表`}>
        {selectedGroup.items.map(item => {
          const current = activePath === item.path || activePath.startsWith(`${item.path}/`)
          return <Button key={item.path} className={current ? 'on' : ''} data-path={item.path} aria-current={current ? 'page' : undefined} title={item.label} tabIndex={panelOpen ? undefined : -1} onClick={() => {
            setOpenGroupId(null)
            onNavigate(item.path)
            window.requestAnimationFrame(() => groupButtonRefs.current.get(selectedGroupId)?.focus())
          }}>
            <i><PageIcon path={item.path} /></i><span>{item.label}</span>
          </Button>
        })}
      </nav>
      <div className="secondary-sidebar-foot">
        <Button ref={directoryTriggerRef} aria-label="打开全部功能" title="打开全部功能" className="feature-group-button" aria-haspopup="menu" aria-controls="more-drawer" aria-expanded={directoryOpen} tabIndex={panelOpen ? undefined : -1} onClick={event => {
          onOpenDirectory(event.currentTarget, groupButtonRefs.current.get(selectedGroupId) ?? undefined)
        }}>
          <i><DirectoryIcon /></i><span>全部功能</span>
        </Button>
      </div>
    </section>
  </aside>
}
