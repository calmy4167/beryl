import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Button, FOCUSABLE_SELECTOR, trapFocus } from './ui'
import { getPageForPath } from './route-manifest'
import { setThemeMode } from './theme-preferences'
import { DesktopPrimaryNav } from './shell/DesktopPrimaryNav'
import { PageTopBar } from './shell/PageTopBar'
import { ContextRail } from './shell/ContextRail'
import { MobileHeader } from './shell/MobileHeader'
import { MobilePrimaryNav } from './shell/MobilePrimaryNav'
import { FeatureDirectoryDialog } from './shell/FeatureDirectoryDialog'
import { GlobalSearchDialog } from './shell/GlobalSearchDialog'
import { clampShellPanelWidth, ShellResizeHandle } from './shell/ShellResizeHandle'
import { WorkspaceTabs } from './shell/WorkspaceTabs'
import { closeWorkspaceTab, moveWorkspaceTab, readWorkspaceTabs, visitWorkspaceTab, writeWorkspaceTabs } from './shell/workspace-tabs'

const SIDEBAR_MIN = 196
const SIDEBAR_MAX = 320
const CONTEXT_MIN = 280
const CONTEXT_MAX = 480
const CONTEXT_BREAKPOINT = 1360
const COMPACT_SEARCH_BREAKPOINT = 1100

function readPanelWidth(key: string, fallback: number, min: number, max: number): number {
  const stored = Number(localStorage.getItem(key))
  return Number.isFinite(stored) && stored > 0 ? clampShellPanelWidth(stored, min, max) : fallback
}

export function AppShell() {
  const navigate = useNavigate(); const location = useLocation(); const [mobile, setMobile] = useState(() => window.innerWidth <= 900); const [wide, setWide] = useState(() => window.innerWidth > CONTEXT_BREAKPOINT); const [compactSearch, setCompactSearch] = useState(() => window.innerWidth <= COMPACT_SEARCH_BREAKPOINT); const [collapsed, setCollapsed] = useState(() => localStorage.getItem('calmy_sidebar_collapsed') === '1'); const [rightCollapsed, setRightCollapsed] = useState(() => localStorage.getItem('calmy_right_sidebar_collapsed') !== '0'); const [sidebarWidth, setSidebarWidth] = useState(() => readPanelWidth('calmy_sidebar_width', 232, SIDEBAR_MIN, SIDEBAR_MAX)); const [contextWidth, setContextWidth] = useState(() => readPanelWidth('calmy_context_width', 356, CONTEXT_MIN, CONTEXT_MAX)); const [workspaceTabs, setWorkspaceTabs] = useState(() => readWorkspaceTabs()); const [drawer, setDrawer] = useState(false); const [search, setSearch] = useState(false); const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark')); const [saveLabel, setSaveLabel] = useState('本地优先 · 离线可用'); const [saveState, setSaveState] = useState('idle'); const [toastText, setToastText] = useState(''); const searchReturnRef = useRef<HTMLElement | null>(null); const drawerReturnRef = useRef<HTMLElement | null>(null); const desktopMoreTriggerRef = useRef<HTMLButtonElement | null>(null); const mobileHeaderMoreTriggerRef = useRef<HTMLButtonElement | null>(null); const drawerOpenRef = useRef(false); const drawerRef = useRef<HTMLDivElement>(null)
  const [directoryAnchor, setDirectoryAnchor] = useState({ left: 12, top: 12, maxHeight: 480 })
  const [immersive, setImmersive] = useState(false)
  const immersiveTriggerRef = useRef<HTMLButtonElement | null>(null)
  const compact = mobile || window.innerWidth <= 900
  const desktopWide = wide && window.innerWidth > CONTEXT_BREAKPOINT
  const currentPage = getPageForPath(location.pathname)
  const active = currentPage?.navigation?.kind === 'primary' ? currentPage.navigation.key : currentPage?.id ?? 'today'
  const pageTitle = currentPage?.title ?? '模块入口'
  const pageDescription = currentPage?.description ?? ''
  const quickActions = ({
    today: [{ icon: '↓', label: '记录', hint: '先留下原话', path: '/app/capture' }],
    capture: [{ icon: '☷', label: '处境', hint: '找到相关内容', path: '/app/matters' }],
    matters: [{ icon: '↺', label: '回顾', hint: '记录现实反馈', path: '/app/review' }],
    review: [{ icon: '⌂', label: '今天', hint: '查看当前行动', path: '/app/today' }],
  } as Record<string, { icon: string; label: string; hint: string; path: string }[]>)[active] ?? []
  useEffect(() => { const onResize = () => { setMobile(window.innerWidth <= 900); setWide(window.innerWidth > CONTEXT_BREAKPOINT); setCompactSearch(window.innerWidth <= COMPACT_SEARCH_BREAKPOINT) }; const onSave = (event: Event) => { const state = (event as CustomEvent<{ state: string }>).detail?.state; if (state) { setSaveState(state); setSaveLabel(({ saving: '正在保存…', saved: '已保存到本地', pending: '已保存，等待持久化', conflict: '保存冲突，需要确认', failed: '保存失败' } as Record<string, string>)[state] || '本地优先 · 离线可用') } }; const onToast = (event: Event) => { setToastText((event as CustomEvent<{ message: string }>).detail?.message || ''); window.setTimeout(() => setToastText(''), 2600) }; const onThemeModeChange = (event: Event) => { const mode = (event as CustomEvent<{ mode?: string }>).detail?.mode; if (mode === 'light' || mode === 'dark') setDark(mode === 'dark') }; const onKey = (event: KeyboardEvent) => { const target = event.target instanceof HTMLElement ? event.target : null; const typing = !!target?.closest('input,textarea,select,[contenteditable="true"]'); if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !typing) { event.preventDefault(); openSearch(); return }; if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b' && !typing && !compact) { event.preventDefault(); if (event.shiftKey && desktopWide) toggleRightSidebar(); else toggleSidebar() } }; window.addEventListener('resize', onResize); window.addEventListener('keydown', onKey); window.addEventListener('beryl-save-state', onSave); window.addEventListener('beryl-toast', onToast); window.addEventListener('calmy-theme-mode-change', onThemeModeChange); return () => { window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey); window.removeEventListener('beryl-save-state', onSave); window.removeEventListener('beryl-toast', onToast); window.removeEventListener('calmy-theme-mode-change', onThemeModeChange) } }, [compact, desktopWide, collapsed, rightCollapsed])
  useEffect(() => {
    if (!desktopWide || window.innerWidth <= CONTEXT_BREAKPOINT || !drawerOpenRef.current) return
    drawerOpenRef.current = false
    setDrawer(false)
  }, [desktopWide])
  useEffect(() => {
    if (!drawerOpenRef.current) return
    drawerOpenRef.current = false
    setDrawer(false)
  }, [location.pathname])
  useEffect(() => {
    if (!immersive) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') exitImmersive()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [immersive])
  useEffect(() => {
    if (compact || !currentPage || currentPage.shell !== 'app') return
    setWorkspaceTabs(previous => {
      const next = visitWorkspaceTab(previous, { path: location.pathname, title: currentPage.title, pinned: location.pathname === '/app/today' })
      writeWorkspaceTabs(sessionStorage, next)
      return next
    })
  }, [compact, currentPage, location.pathname])
  useEffect(() => { if (!drawer) return; const root = drawerRef.current; const first = root?.querySelector<HTMLElement>('[data-directory-first]') ?? root?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR); const timer = window.requestAnimationFrame(() => first?.focus()); const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); closeDrawer() } else if (compact) trapFocus(event, root) }; window.addEventListener('keydown', onKey); return () => { window.cancelAnimationFrame(timer); window.removeEventListener('keydown', onKey) } }, [drawer, compact])
  function go(path: string) { drawerOpenRef.current = false; setDrawer(false); navigate(path) }
  function openDrawer(trigger?: HTMLButtonElement, focusReturn?: HTMLElement) {
    if (drawerOpenRef.current) return
    drawerOpenRef.current = true
    drawerReturnRef.current = focusReturn ?? trigger ?? desktopMoreTriggerRef.current ?? mobileHeaderMoreTriggerRef.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    if (!compact && trigger) {
      const rect = trigger.getBoundingClientRect()
      const top = Math.min(Math.max(12, Math.round(rect.top)), Math.max(12, window.innerHeight - 252))
      setDirectoryAnchor({
        left: Math.min(Math.max(12, Math.round(rect.right + 12)), Math.max(12, window.innerWidth - 372)),
        top,
        maxHeight: Math.max(240, window.innerHeight - top - 12),
      })
    }
    setDrawer(true)
  }
  function closeDrawer() {
    const returnTarget = drawerReturnRef.current ?? desktopMoreTriggerRef.current ?? mobileHeaderMoreTriggerRef.current
    drawerOpenRef.current = false
    const restoreFocus = () => {
      const target = returnTarget && document.contains(returnTarget)
        ? returnTarget
        : desktopMoreTriggerRef.current ?? mobileHeaderMoreTriggerRef.current
      target?.focus()
    }
    restoreFocus()
    setDrawer(false)
    window.requestAnimationFrame(() => {
      restoreFocus()
      window.requestAnimationFrame(() => {
        restoreFocus()
        window.setTimeout(restoreFocus, 50)
      })
    })
  }
  function openSearch(focusReturn?: HTMLElement) { searchReturnRef.current = focusReturn ?? (drawer ? drawerReturnRef.current : document.activeElement instanceof HTMLElement ? document.activeElement : null); drawerOpenRef.current = false; setDrawer(false); setSearch(true) }
  function closeSearch() { setSearch(false); window.requestAnimationFrame(() => searchReturnRef.current?.focus()) }
  function toggleSidebar() { if (compact) return; const next = !collapsed; setCollapsed(next); localStorage.setItem('calmy_sidebar_collapsed', next ? '1' : '0') }
  function toggleRightSidebar() { if (!desktopWide) { openDrawer(); return }; const next = !rightCollapsed; setRightCollapsed(next); localStorage.setItem('calmy_right_sidebar_collapsed', next ? '1' : '0') }
  function resizeSidebar(value: number) { const next = clampShellPanelWidth(value, SIDEBAR_MIN, SIDEBAR_MAX); setSidebarWidth(next); localStorage.setItem('calmy_sidebar_width', String(next)) }
  function resizeContext(value: number) { const next = clampShellPanelWidth(value, CONTEXT_MIN, CONTEXT_MAX); setContextWidth(next); localStorage.setItem('calmy_context_width', String(next)) }
  function activateWorkspaceTab(path: string) { if (path !== location.pathname) navigate(path) }
  function closeWorkspacePage(path: string) {
    const result = closeWorkspaceTab(workspaceTabs, path, location.pathname)
    setWorkspaceTabs(result.tabs)
    writeWorkspaceTabs(sessionStorage, result.tabs)
    if (result.nextPath) navigate(result.nextPath)
  }
  function reorderWorkspacePage(path: string, targetPath: string) {
    setWorkspaceTabs(previous => {
      const next = moveWorkspaceTab(previous, path, targetPath)
      writeWorkspaceTabs(sessionStorage, next)
      return next
    })
  }
  function toggleTheme() { const next = !dark; setDark(next); setThemeMode(next ? 'dark' : 'light') }
  function enterImmersive() {
    drawerOpenRef.current = false
    setDrawer(false)
    setSearch(false)
    setImmersive(true)
  }
  function exitImmersive() {
    setImmersive(false)
    window.requestAnimationFrame(() => immersiveTriggerRef.current?.focus())
  }
  return <div
    className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''} ${rightCollapsed ? 'right-sidebar-collapsed' : 'right-sidebar-expanded'}`}
    data-sidebar-state={collapsed ? 'collapsed' : 'expanded'}
    data-context-state={rightCollapsed ? 'collapsed' : 'expanded'}
    data-directory-open={drawer ? 'true' : 'false'}
    data-compact={compact ? 'true' : 'false'}
    data-immersive={immersive ? 'true' : 'false'}
    style={{ '--t-sidebar-width': `${sidebarWidth}px`, '--t-context-width': `${contextWidth}px` } as CSSProperties}
  >
    {!compact && <DesktopPrimaryNav collapsed={collapsed} active={active} activePath={location.pathname} directoryOpen={drawer} directoryTriggerRef={desktopMoreTriggerRef} immersiveTriggerRef={immersiveTriggerRef} onNavigate={go} onSearch={openSearch} onToggleSidebar={toggleSidebar} onEnterImmersive={enterImmersive} onOpenDirectory={openDrawer} />}
    {!compact && <ShellResizeHandle side="left" label="调整主导航宽度" value={sidebarWidth} min={SIDEBAR_MIN} max={SIDEBAR_MAX} disabled={collapsed} onChange={resizeSidebar} />}
    <div className="workspace-shell">
      {!compact
        ? <PageTopBar title={pageTitle} description={pageDescription} saveLabel={saveLabel} saveState={saveState} compactSearch={compactSearch} onSearch={openSearch} />
        : <MobileHeader directoryOpen={drawer} directoryTriggerRef={mobileHeaderMoreTriggerRef} immersiveTriggerRef={immersiveTriggerRef} onNavigate={go} onSearch={openSearch} onOpenDirectory={openDrawer} onEnterImmersive={enterImmersive} />}
      {!compact && <WorkspaceTabs tabs={workspaceTabs} activePath={location.pathname} saveState={saveState} onActivate={activateWorkspaceTab} onClose={closeWorkspacePage} onReorder={reorderWorkspacePage} />}
      <main className="page-container" data-page-id={currentPage?.id} data-page-archetype={currentPage?.archetype}><Outlet /></main>
      {!compact && desktopWide && <ShellResizeHandle side="right" label="调整情境栏宽度" value={contextWidth} min={CONTEXT_MIN} max={CONTEXT_MAX} disabled={rightCollapsed} onChange={resizeContext} />}
      {!compact && desktopWide && <ContextRail collapsed={rightCollapsed} expanded={!rightCollapsed} actions={quickActions} onNavigate={go} onToggle={toggleRightSidebar} />}
    </div>
    <MobilePrimaryNav active={active} onNavigate={go} />
    <FeatureDirectoryDialog open={drawer} presentation={compact ? 'drawer' : 'popover'} anchor={directoryAnchor} activePath={location.pathname} dark={dark} drawerRef={drawerRef} onNavigate={go} onSearch={openSearch} onClose={closeDrawer} onToggleTheme={toggleTheme} />
    {immersive && <Button className="immersive-exit" aria-label="退出沉浸模式" title="退出沉浸模式（Esc）" onClick={exitImmersive}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H5a1 1 0 0 0-1 1v3m12-4h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3m12-4v3a1 1 0 0 1-1 1h-3" /></svg>
    </Button>}
    {search && <GlobalSearchDialog onClose={closeSearch} onNavigate={go} />}
    {toastText && <div className="toast" role="status">{toastText}</div>}
  </div>
}
