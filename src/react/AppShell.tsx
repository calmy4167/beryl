import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { FOCUSABLE_SELECTOR, trapFocus } from './ui'
import { getPageForPath } from './route-manifest'
import { setThemeMode } from './theme-preferences'
import { DesktopPrimaryNav } from './shell/DesktopPrimaryNav'
import { PageTopBar } from './shell/PageTopBar'
import { ContextRail } from './shell/ContextRail'
import { MobileHeader } from './shell/MobileHeader'
import { MobilePrimaryNav } from './shell/MobilePrimaryNav'
import { FeatureDirectoryDialog } from './shell/FeatureDirectoryDialog'
import { GlobalSearchDialog } from './shell/GlobalSearchDialog'

export function AppShell() {
  const navigate = useNavigate(); const location = useLocation(); const [mobile, setMobile] = useState(() => window.innerWidth <= 900); const [wide, setWide] = useState(() => window.innerWidth > 1180); const [collapsed, setCollapsed] = useState(() => localStorage.getItem('calmy_sidebar_collapsed') === '1'); const [rightCollapsed, setRightCollapsed] = useState(() => localStorage.getItem('calmy_right_sidebar_collapsed') !== '0'); const [drawer, setDrawer] = useState(false); const [search, setSearch] = useState(false); const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark')); const [saveLabel, setSaveLabel] = useState('本地优先 · 离线可用'); const [saveState, setSaveState] = useState('idle'); const [toastText, setToastText] = useState(''); const searchReturnRef = useRef<HTMLElement | null>(null); const drawerReturnRef = useRef<HTMLElement | null>(null); const desktopMoreTriggerRef = useRef<HTMLButtonElement | null>(null); const mobileHeaderMoreTriggerRef = useRef<HTMLButtonElement | null>(null); const moreTriggerRef = useRef<HTMLButtonElement | null>(null); const drawerOpenRef = useRef(false); const drawerRef = useRef<HTMLDivElement>(null)
  const compact = mobile || window.innerWidth <= 900
  const desktopWide = wide && window.innerWidth > 1180
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
  useEffect(() => { const onResize = () => { setMobile(window.innerWidth <= 900); setWide(window.innerWidth > 1180) }; const onSave = (event: Event) => { const state = (event as CustomEvent<{ state: string }>).detail?.state; if (state) { setSaveState(state); setSaveLabel(({ saving: '正在保存…', saved: '已保存到本地', pending: '已保存，等待持久化', conflict: '保存冲突，需要确认', failed: '保存失败' } as Record<string, string>)[state] || '本地优先 · 离线可用') } }; const onToast = (event: Event) => { setToastText((event as CustomEvent<{ message: string }>).detail?.message || ''); window.setTimeout(() => setToastText(''), 2600) }; const onThemeModeChange = (event: Event) => { const mode = (event as CustomEvent<{ mode?: string }>).detail?.mode; if (mode === 'light' || mode === 'dark') setDark(mode === 'dark') }; const onKey = (event: KeyboardEvent) => { const target = event.target instanceof HTMLElement ? event.target : null; const typing = !!target?.closest('input,textarea,select,[contenteditable="true"]'); if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !typing) { event.preventDefault(); openSearch(); return }; if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b' && !typing && !compact) { event.preventDefault(); if (event.shiftKey && desktopWide) toggleRightSidebar(); else toggleSidebar() } }; window.addEventListener('resize', onResize); window.addEventListener('keydown', onKey); window.addEventListener('beryl-save-state', onSave); window.addEventListener('beryl-toast', onToast); window.addEventListener('calmy-theme-mode-change', onThemeModeChange); return () => { window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey); window.removeEventListener('beryl-save-state', onSave); window.removeEventListener('beryl-toast', onToast); window.removeEventListener('calmy-theme-mode-change', onThemeModeChange) } }, [compact, desktopWide, collapsed, rightCollapsed])
  useEffect(() => {
    if (!desktopWide || window.innerWidth <= 1180) return
    const timer = window.setTimeout(() => {
      if (window.innerWidth > 1180) {
        drawerOpenRef.current = false
        setDrawer(false)
      }
    }, 200)
    return () => window.clearTimeout(timer)
  }, [desktopWide])
  useEffect(() => { if (!drawer) return; const root = drawerRef.current; const first = root?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR); const timer = window.requestAnimationFrame(() => first?.focus()); const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); closeDrawer() } else trapFocus(event, root) }; window.addEventListener('keydown', onKey); return () => { window.cancelAnimationFrame(timer); window.removeEventListener('keydown', onKey) } }, [drawer])
  function go(path: string) { drawerOpenRef.current = false; setDrawer(false); navigate(path) }
  function openDrawer() {
    if (drawerOpenRef.current) return
    drawerOpenRef.current = true
    drawerReturnRef.current = desktopMoreTriggerRef.current ?? mobileHeaderMoreTriggerRef.current ?? moreTriggerRef.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    setDrawer(true)
  }
  function closeDrawer() {
    const returnTarget = drawerReturnRef.current ?? desktopMoreTriggerRef.current ?? mobileHeaderMoreTriggerRef.current ?? moreTriggerRef.current
    drawerOpenRef.current = false
    const restoreFocus = () => {
      const target = returnTarget && document.contains(returnTarget)
        ? returnTarget
        : desktopMoreTriggerRef.current ?? mobileHeaderMoreTriggerRef.current ?? moreTriggerRef.current ?? document.querySelector<HTMLElement>('.bottom-nav button[aria-label="打开功能目录"]')
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
  function openSearch() { searchReturnRef.current = drawer ? drawerReturnRef.current : document.activeElement instanceof HTMLElement ? document.activeElement : null; drawerOpenRef.current = false; setDrawer(false); setSearch(true) }
  function closeSearch() { setSearch(false); window.requestAnimationFrame(() => searchReturnRef.current?.focus()) }
  function toggleSidebar() { if (compact) return; const next = !collapsed; setCollapsed(next); localStorage.setItem('calmy_sidebar_collapsed', next ? '1' : '0') }
  function toggleRightSidebar() { if (!desktopWide) { openDrawer(); return }; const next = !rightCollapsed; setRightCollapsed(next); localStorage.setItem('calmy_right_sidebar_collapsed', next ? '1' : '0') }
  function toggleTheme() { const next = !dark; setDark(next); setThemeMode(next ? 'dark' : 'light') }
  return <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''} ${rightCollapsed ? 'right-sidebar-collapsed' : 'right-sidebar-expanded'}`}>
    {!compact && <DesktopPrimaryNav collapsed={collapsed} active={active} directoryOpen={drawer} directoryTriggerRef={desktopMoreTriggerRef} onNavigate={go} onSearch={openSearch} onToggle={toggleSidebar} onOpenDirectory={openDrawer} />}
    <div className="workspace-shell">
      {!compact
        ? <PageTopBar title={pageTitle} description={pageDescription} saveLabel={saveLabel} saveState={saveState} onSearch={openSearch} />
        : <MobileHeader directoryOpen={drawer} directoryTriggerRef={mobileHeaderMoreTriggerRef} onNavigate={go} onSearch={openSearch} onOpenDirectory={openDrawer} />}
      <main className="page-container" data-page-id={currentPage?.id} data-page-archetype={currentPage?.archetype}><Outlet /></main>
      {!compact && <ContextRail collapsed={rightCollapsed} expanded={!rightCollapsed} pageTitle={pageTitle} pageDescription={pageDescription} actions={quickActions} onNavigate={go} onToggle={toggleRightSidebar} />}
    </div>
    <MobilePrimaryNav active={active} directoryOpen={drawer} directoryTriggerRef={moreTriggerRef} onNavigate={go} onOpenDirectory={openDrawer} />
    <FeatureDirectoryDialog open={drawer} activePath={location.pathname} dark={dark} drawerRef={drawerRef} onNavigate={go} onSearch={openSearch} onClose={closeDrawer} onToggleTheme={toggleTheme} />
    {search && <GlobalSearchDialog onClose={closeSearch} onNavigate={go} />}
    {toastText && <div className="toast" role="status">{toastText}</div>}
  </div>
}
