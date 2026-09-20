import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { searchAllAsync, type SearchResult } from '@/domain/search'
import { Button, FOCUSABLE_SELECTOR, trapFocus } from './ui'
import { featureNavigationGroups, primaryNavigation } from './navigation'

const meta: Record<string, [string, string]> = {
  today: ['今天', '现在关注的事与行动'],
  cycle: ['周期', '查看当前阶段'],
  flow: ['探索', '重新看看已有资料'],
  capture: ['记录', '先留下原话，不必立即整理'],
  board: ['看板', '按状态查看行动'],
  feishu: ['飞书', '查看和更新飞书项目与任务'],
  matters: ['处境', '持续影响你的现实处境'],
  diary: ['日记', '按日期查看生活记录'],
  review: ['回顾', '看看发生了什么，以及它意味着什么'],
  future: ['未来', '看看一个选择的不同可能'],
  habits: ['习惯', '身体、状态与日常小行动'],
  goals: ['目标', '现实结果、证据与下一步'],
  library: ['资料', '保存可复用的内容'],
  calendar: ['日历', '按时间查看发生的事'],
  people: ['人物', '关系与上下文'],
  stats: ['图谱', '查看记录中的趋势和连接'],
  memory: ['记忆', '查看并管理系统对你的理解'],
  profile: ['我的', '个人会话、场景和数据概览'],
  settings: ['设置', '管理本地数据、同步与外观'],
}

export function AppShell() {
  const navigate = useNavigate(); const location = useLocation(); const [mobile, setMobile] = useState(() => window.innerWidth <= 900); const [wide, setWide] = useState(() => window.innerWidth > 1180); const [collapsed, setCollapsed] = useState(() => localStorage.getItem('calmy_sidebar_collapsed') === '1'); const [rightCollapsed, setRightCollapsed] = useState(() => localStorage.getItem('calmy_right_sidebar_collapsed') !== '0'); const [drawer, setDrawer] = useState(false); const [search, setSearch] = useState(false); const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark')); const [saveLabel, setSaveLabel] = useState('本地优先 · 离线可用'); const [saveState, setSaveState] = useState('idle'); const [toastText, setToastText] = useState(''); const searchReturnRef = useRef<HTMLElement | null>(null); const drawerReturnRef = useRef<HTMLElement | null>(null); const desktopMoreTriggerRef = useRef<HTMLButtonElement | null>(null); const mobileHeaderMoreTriggerRef = useRef<HTMLButtonElement | null>(null); const moreTriggerRef = useRef<HTMLButtonElement | null>(null); const drawerOpenRef = useRef(false); const drawerRef = useRef<HTMLDivElement>(null)
  const compact = mobile || window.innerWidth <= 900
  const desktopWide = wide && window.innerWidth > 1180
  const active = location.pathname.includes('/cycle') ? 'cycle' : location.pathname.includes('/flow') ? 'flow' : location.pathname.includes('/capture') ? 'capture' : location.pathname.includes('/task-board') ? 'board' : location.pathname.includes('/feishu') ? 'feishu' : location.pathname.includes('/matters') ? 'matters' : location.pathname.includes('/review') ? 'review' : location.pathname.includes('/future') ? 'future' : location.pathname.includes('/module/diary') ? 'diary' : location.pathname.includes('/module/habits') ? 'habits' : location.pathname.includes('/module/goals') ? 'goals' : location.pathname.includes('/library') ? 'library' : location.pathname.includes('/calendar') ? 'calendar' : location.pathname.includes('/people') ? 'people' : location.pathname.includes('/graph') ? 'stats' : location.pathname.includes('/memory') ? 'memory' : location.pathname.includes('/profile') ? 'profile' : location.pathname.includes('/admin') ? 'settings' : 'today'
  const quickActions = ({
    today: [{ icon: '↓', label: '记录', hint: '先留下原话', path: '/app/capture' }],
    capture: [{ icon: '☷', label: '处境', hint: '找到相关内容', path: '/app/matters' }],
    matters: [{ icon: '↺', label: '回顾', hint: '记录现实反馈', path: '/app/review' }],
    review: [{ icon: '⌂', label: '今天', hint: '查看当前行动', path: '/app/today' }],
  } as Record<string, { icon: string; label: string; hint: string; path: string }[]>)[active] ?? []
  useEffect(() => { const onResize = () => { setMobile(window.innerWidth <= 900); setWide(window.innerWidth > 1180) }; const onSave = (event: Event) => { const state = (event as CustomEvent<{ state: string }>).detail?.state; if (state) { setSaveState(state); setSaveLabel(({ saving: '正在保存…', saved: '已保存到本地', pending: '已保存，等待持久化', conflict: '保存冲突，需要确认', failed: '保存失败' } as Record<string, string>)[state] || '本地优先 · 离线可用') } }; const onToast = (event: Event) => { setToastText((event as CustomEvent<{ message: string }>).detail?.message || ''); window.setTimeout(() => setToastText(''), 2600) }; const onKey = (event: KeyboardEvent) => { const target = event.target instanceof HTMLElement ? event.target : null; const typing = !!target?.closest('input,textarea,select,[contenteditable="true"]'); if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !typing) { event.preventDefault(); openSearch(); return }; if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b' && !typing && !compact) { event.preventDefault(); if (event.shiftKey && desktopWide) toggleRightSidebar(); else toggleSidebar() } }; window.addEventListener('resize', onResize); window.addEventListener('keydown', onKey); window.addEventListener('beryl-save-state', onSave); window.addEventListener('beryl-toast', onToast); return () => { window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey); window.removeEventListener('beryl-save-state', onSave); window.removeEventListener('beryl-toast', onToast) } }, [compact, desktopWide, collapsed, rightCollapsed])
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
  function toggleTheme() { const next = !dark; setDark(next); document.documentElement.classList.toggle('dark', next); localStorage.setItem('b_theme', next ? 'dark' : 'light') }
  return <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''} ${rightCollapsed ? 'right-sidebar-collapsed' : 'right-sidebar-expanded'}`}>
    {!compact && <aside id="app-sidebar" className="sidebar" aria-label={collapsed ? '已收起的主导航' : '主导航侧边栏'}>
      <Button className="brand" aria-label="返回今天" onClick={() => go('/app/today')}><span className="brand-mark">C</span><span className="sidebar-label"><b className="font-title">Calmy</b><small>现实行动系统</small></span></Button>
      <Button className="sidebar-toggle" aria-expanded={!collapsed} aria-controls="app-sidebar" aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'} onClick={toggleSidebar}><span>{collapsed ? '→' : '←'}</span><span className="sidebar-label">{collapsed ? '展开侧边栏' : '收起侧边栏'}</span></Button>
      <p className="sidebar-label" style={{ margin: '0 9px 4px', color: 'var(--c-text-3)', fontSize: 10, letterSpacing: '.08em' }}>日常主线</p>
      <nav id="primary-navigation" className="primary-nav" aria-label="日常主线导航">
        {primaryNavigation.map(item => <Button key={item.key} title={item.label} aria-label={item.label} className={active === item.key ? 'on' : ''} aria-current={active === item.key ? 'page' : undefined} onClick={() => go(item.path)}><i>{item.icon}</i><span className="nav-label">{item.label}</span></Button>)}
      </nav>
      <div className="sidebar-foot">
        <Button aria-label="搜索内容" onClick={openSearch}>⌕<span className="sidebar-label">搜索 <kbd>Ctrl K</kbd></span></Button>
        <Button ref={desktopMoreTriggerRef} aria-label="打开功能目录" aria-haspopup="dialog" aria-controls="more-drawer" aria-expanded={drawer} onClick={openDrawer}>⋯<span className="sidebar-label">功能</span></Button>
      </div>
    </aside>}
    <div className="workspace-shell">
      {!compact ? <header className="desktop-topbar"><div className="breadcrumb"><span className="topbar-kicker">CALMY</span><b>{meta[active][0]}</b><span>/</span><span>{meta[active][1]}</span></div><div className="topbar-actions"><span className={`save-state save-${saveState}`} role="status" aria-live="polite"><i />{saveLabel}</span><Button className="topbar-search" aria-label="搜索内容" onClick={openSearch}>⌕ 搜索 <kbd>Ctrl K</kbd></Button></div></header> : <header className="mobile-header"><Button className="brand compact" aria-label="返回今天" onClick={() => go('/app/today')}><span className="brand-mark">C</span><b className="font-title">Calmy</b></Button><div><Button className="search-btn" aria-label="搜索内容" onClick={openSearch}>⌕</Button><Button ref={mobileHeaderMoreTriggerRef} className="menu" aria-label="打开功能目录" aria-haspopup="dialog" aria-controls="more-drawer" aria-expanded={drawer} onClick={openDrawer}>☰</Button></div></header>}
      <main className="page-container"><Outlet /></main>
      {!compact && <aside id="app-right-sidebar" className="right-rail" aria-label={rightCollapsed ? '已收起的右侧快捷栏' : '右侧快捷栏'}>
        <Button className="right-sidebar-toggle" aria-controls="app-right-sidebar" aria-expanded={!rightCollapsed} aria-label={rightCollapsed ? '展开右侧栏' : '收起右侧栏'} onClick={toggleRightSidebar}><span>{rightCollapsed ? '←' : '→'}</span><span className="right-sidebar-label">{rightCollapsed ? '展开右侧栏' : '收起右侧栏'}</span></Button>
        <div className="right-rail-content">
          <section className="edge-context"><p className="edge-kicker">当前页面</p><h2 className="font-title">{meta[active][0]}</h2><p>{meta[active][1]}</p></section>
          {quickActions.length > 0 && <section className="edge-actions"><p className="edge-kicker">下一步</p>{quickActions.map(item => <Button key={item.path} onClick={() => go(item.path)}>{item.icon} <span><b>{item.label}</b><small>{item.hint}</small></span>→</Button>)}</section>}
          <section className="edge-note"><span>●</span><div><b>本地优先</b><p>离线也能记录，联网后再同步。</p></div></section>
        </div>
      </aside>}
    </div>
    <nav className="bottom-nav mobile-only" aria-label="移动端主导航">{primaryNavigation.map(item => <Button key={item.key} title={item.label} className={active === item.key ? 'on' : ''} aria-current={active === item.key ? 'page' : undefined} onClick={() => go(item.path)}><span>{item.icon}</span>{item.label}</Button>)}<Button ref={moreTriggerRef} aria-label="打开功能目录" aria-haspopup="dialog" aria-controls="more-drawer" aria-expanded={drawer} onClick={openDrawer}><span>⋯</span>功能</Button></nav>
    <div className={`el-drawer-overlay ${drawer ? 'is-open' : 'is-closed'}`} aria-hidden={!drawer} onClick={closeDrawer}>
      <div ref={drawerRef} id="more-drawer" className={`el-drawer ${drawer ? 'is-open' : 'is-closed'}`} role="dialog" aria-modal="true" aria-label="功能目录" onClick={event => event.stopPropagation()}>
        <div className="drawer">
          <Button className="drawer-close" aria-label="关闭功能目录" onClick={closeDrawer}>×</Button>
          <Button className="brand" aria-label="返回今天" onClick={() => go('/app/today')}><span className="brand-mark">C</span><span><b className="font-title">Calmy</b><small>现实行动系统</small></span></Button>
          <nav className="drawer-links" aria-label="按用途浏览功能">
            <Button className="drawer-search-link" onClick={openSearch}>⌕ 搜索处境、行动、记录或人物</Button>
            {featureNavigationGroups.map(group => <section key={group.id} aria-labelledby={`feature-group-${group.id}`}><p id={`feature-group-${group.id}`}>{group.label}</p>{group.items.map(item => <Button key={item.path} title={item.label} onClick={() => go(item.path)}>{item.icon} {item.label}</Button>)}</section>)}
            <Button onClick={toggleTheme}>{dark ? '☀' : '◐'} 切换外观</Button>
          </nav>
        </div>
      </div>
    </div>
    {search && <SearchDialog onClose={closeSearch} onGo={go} />}{toastText && <div className="toast" role="status">{toastText}</div>}
  </div>
}

function SearchDialog({ onClose, onGo }: { onClose: () => void; onGo: (path: string) => void }) { const [query, setQuery] = useState(''); const [results, setResults] = useState<SearchResult[]>([]); const panelRef = useRef<HTMLDivElement>(null); useEffect(() => { let active = true; void searchAllAsync(query, 8).then(next => { if (active) setResults(next) }); return () => { active = false } }, [query]); useEffect(() => { const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR); const timer = window.requestAnimationFrame(() => first?.focus()); const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose() } else trapFocus(event, panelRef.current) }; window.addEventListener('keydown', onKey); return () => { window.cancelAnimationFrame(timer); window.removeEventListener('keydown', onKey) } }, [onClose]); return <div className="search-overlay" role="dialog" aria-modal="true" aria-label="搜索内容" onClick={onClose}><div ref={panelRef} className="search-panel beryl-card" onClick={event => event.stopPropagation()}><div className="search-head">⌕<input autoFocus className="global-search" aria-label="搜索内容" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索处境、行动、记录或人物…" /><Button aria-label="关闭搜索" onClick={onClose}>Esc</Button></div><div className="search-results">{results.map(item => <Button key={`${item.type}-${item.id}`} onClick={() => onGo(item.route)}>◎ <span><b>{item.title}</b><small>{item.typeLabel} · {item.summary || '现实记录'}</small></span>→</Button>)}{!results.length && <p className="no-results">没有匹配的内容</p>}</div></div></div> }
