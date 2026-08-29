import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { searchAllAsync, type SearchResult } from '@/domain/search'
import { Button, FOCUSABLE_SELECTOR, trapFocus } from './ui'

const meta: Record<string, [string, string]> = { today: ['今日', '今天的行动与状态'], cycle: ['Cycle', '五行流转与当前阶段'], capture: ['Capture', '先记录，再决定如何整理'], board: ['事项看板', '拖动任务，回到现实行动'], matters: ['事项', '正在面对的现实事项'], diary: ['日记', '把生活写下来'], review: ['复盘', '观察发生了什么，再调整下一步'], habits: ['习惯', '持续的小步练习'], goals: ['目标', '把方向变成可持续的目标'], library: ['资料', '知识与素材中心'], calendar: ['日历', '按时间查看发生了什么'], people: ['人脉', '关系与上下文'], stats: ['统计', '从事实中看趋势'], memory: ['AI 对我的理解', '记忆分层与判断权'], profile: ['我的', '个人概览与模块入口'], settings: ['设置', '本地数据、同步与外观'] }

export function AppShell() {
  const navigate = useNavigate(); const location = useLocation(); const [mobile, setMobile] = useState(() => window.innerWidth <= 900); const [wide, setWide] = useState(() => window.innerWidth > 1180); const [collapsed, setCollapsed] = useState(() => localStorage.getItem('calmy_sidebar_collapsed') === '1'); const [rightCollapsed, setRightCollapsed] = useState(() => localStorage.getItem('calmy_right_sidebar_collapsed') !== '0'); const [drawer, setDrawer] = useState(false); const [search, setSearch] = useState(false); const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark')); const [saveLabel, setSaveLabel] = useState('本地优先 · 离线可用'); const [saveState, setSaveState] = useState('idle'); const [toastText, setToastText] = useState(''); const searchReturnRef = useRef<HTMLElement | null>(null); const drawerReturnRef = useRef<HTMLElement | null>(null); const desktopMoreTriggerRef = useRef<HTMLButtonElement | null>(null); const mobileHeaderMoreTriggerRef = useRef<HTMLButtonElement | null>(null); const moreTriggerRef = useRef<HTMLButtonElement | null>(null); const drawerOpenRef = useRef(false); const drawerRef = useRef<HTMLDivElement>(null)
  const compact = mobile || window.innerWidth <= 900
  const desktopWide = wide && window.innerWidth > 1180
  const active = location.pathname.includes('/cycle') ? 'cycle' : location.pathname.includes('/capture') ? 'capture' : location.pathname.includes('/task-board') ? 'board' : location.pathname.includes('/matters') ? 'matters' : location.pathname.includes('/review') ? 'review' : location.pathname.includes('/module/diary') ? 'diary' : location.pathname.includes('/module/habits') ? 'habits' : location.pathname.includes('/module/goals') ? 'goals' : location.pathname.includes('/library') ? 'library' : location.pathname.includes('/calendar') ? 'calendar' : location.pathname.includes('/people') ? 'people' : location.pathname.includes('/graph') ? 'stats' : location.pathname.includes('/memory') ? 'memory' : location.pathname.includes('/profile') ? 'profile' : location.pathname.includes('/admin') ? 'settings' : 'today'
  const quickActions = [
    { key: 'capture', icon: '↓', label: '记下一件事', hint: '原文先保存', path: '/app/capture' },
    { key: 'matters', icon: '◎', label: '查看事项', hint: '回到现实主体', path: '/app/matters' },
    { key: 'review', icon: '↺', label: '开始复盘', hint: '观察并调整下一步', path: '/app/review' },
  ].filter(item => item.key !== active)
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
        : desktopMoreTriggerRef.current ?? mobileHeaderMoreTriggerRef.current ?? moreTriggerRef.current ?? document.querySelector<HTMLElement>('.bottom-nav button[aria-label="更多导航"]')
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
      <Button className="brand" aria-label="返回 Today" onClick={() => go('/app/today')}><span className="brand-mark">C</span><span className="sidebar-label"><b className="font-title">Calmy</b><small>现实行动系统</small></span></Button>
      <Button className="sidebar-toggle" aria-expanded={!collapsed} aria-controls="app-sidebar" aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'} onClick={toggleSidebar}><span>{collapsed ? '→' : '←'}</span><span className="sidebar-label">{collapsed ? '展开侧边栏' : '收起侧边栏'}</span></Button>
      <p className="sidebar-label" style={{ margin: '0 9px 4px', color: 'var(--c-text-3)', fontSize: 10, letterSpacing: '.08em' }}>主流程</p>
      <nav id="primary-navigation" className="primary-nav" aria-label="主流程导航">
        {[
          ['today', '⌂', 'Today', '/app/today'],
          ['capture', '↓', 'Capture', '/app/capture'],
          ['matters', '☷', '事项', '/app/matters'],
          ['review', '◴', '复盘', '/app/review']
        ].map(([key, icon, label, path]) => <Button key={key} aria-label={label} className={active === key ? 'on' : ''} aria-current={active === key ? 'page' : undefined} onClick={() => go(path)}><i>{icon}</i><span className="nav-label">{key === 'matters' ? '事项' : label}</span></Button>)}
      </nav>
      <div className="sidebar-foot">
        <Button aria-label="搜索课题" onClick={openSearch}>⌕<span className="sidebar-label">搜索 <kbd>Ctrl K</kbd></span></Button>
        <Button ref={desktopMoreTriggerRef} aria-label="打开更多入口" aria-haspopup="dialog" aria-controls="more-drawer" aria-expanded={drawer} onClick={openDrawer}>⋯<span className="sidebar-label">更多</span></Button>
      </div>
    </aside>}
    <div className="workspace-shell">
      {!compact ? <header className="desktop-topbar"><div className="breadcrumb"><span className="topbar-kicker">CALMY</span><b>{meta[active][0]}</b><span>/</span><span>{meta[active][1]}</span></div><div className="topbar-actions"><span className={`save-state save-${saveState}`} role="status" aria-live="polite"><i />{saveLabel}</span><Button className="topbar-search" aria-label="搜索课题" onClick={openSearch}>⌕ 搜索 <kbd>Ctrl K</kbd></Button></div></header> : <header className="mobile-header"><Button className="brand compact" aria-label="返回 Today" onClick={() => go('/app/today')}><span className="brand-mark">C</span><b className="font-title">Calmy</b></Button><div><Button className="search-btn" aria-label="搜索课题" onClick={openSearch}>⌕</Button><Button ref={mobileHeaderMoreTriggerRef} className="menu" aria-label="打开更多入口" aria-haspopup="dialog" aria-controls="more-drawer" aria-expanded={drawer} onClick={openDrawer}>☰</Button></div></header>}
      <main className="page-container"><Outlet /></main>
      {!compact && <aside id="app-right-sidebar" className="right-rail" aria-label={rightCollapsed ? '已收起的右侧快捷栏' : '右侧快捷栏'}>
        <Button className="right-sidebar-toggle" aria-controls="app-right-sidebar" aria-expanded={!rightCollapsed} aria-label={rightCollapsed ? '展开右侧栏' : '收起右侧栏'} onClick={toggleRightSidebar}><span>{rightCollapsed ? '←' : '→'}</span><span className="right-sidebar-label">{rightCollapsed ? '展开右侧栏' : '收起右侧栏'}</span></Button>
        <nav className="right-rail-mini" aria-label="右侧快捷入口">
          <Button aria-label="Capture" title="Capture" onClick={() => go('/app/capture')}>↓</Button>
          <Button aria-label="事项看板" title="事项看板" onClick={() => go('/app/task-board')}>▦</Button>
          <Button aria-label="我的" title="我的" onClick={() => go('/app/profile')}>○</Button>
          <Button aria-label="AI 对我的理解" title="AI 对我的理解" onClick={() => go('/app/memory')}>✦</Button>
        </nav>
        <div className="right-rail-content">
          <section className="edge-context"><p className="edge-kicker">当前页面</p><h2 className="font-title">{meta[active][0]}</h2><p>{meta[active][1]}</p></section>
          <section className="edge-actions"><p className="edge-kicker">快速动作</p>{quickActions.map(item => <Button key={item.key} onClick={() => go(item.path)}>{item.icon} <span><b>{item.label}</b><small>{item.hint}</small></span>→</Button>)}</section>
          <section className="edge-actions"><p className="edge-kicker">辅助入口</p><Button onClick={() => go('/app/task-board')}>▦ <span><b>事项看板</b><small>按状态整理行动</small></span>→</Button><Button onClick={() => go('/app/profile')}>○ <span><b>我的</b><small>个人概览与全部模块</small></span>→</Button><Button onClick={() => go('/app/memory')}>✦ <span><b>AI 对我的理解</b><small>记忆分层与判断权</small></span>→</Button></section>
          <section className="edge-note"><span>●</span><div><b>本地优先</b><p>离线也能记录，联网后再同步。</p></div></section>
        </div>
      </aside>}
    </div>
    <nav className="bottom-nav mobile-only" aria-label="移动端主导航">{[['today', '◷', 'Today', '/app/today'], ['matters', '◎', '事项', '/app/matters'], ['capture', '↓', 'Capture', '/app/capture'], ['review', '↺', '复盘', '/app/review']].map(([key, icon, label, path]) => <Button key={key} className={active === key ? 'on' : ''} aria-current={active === key ? 'page' : undefined} onClick={() => go(path)}><span>{icon}</span>{label}</Button>)}<Button ref={moreTriggerRef} aria-label="更多导航" aria-haspopup="dialog" aria-controls="more-drawer" aria-expanded={drawer} onClick={openDrawer}><span>⋯</span>更多</Button></nav>
    <div className={`el-drawer-overlay ${drawer ? 'is-open' : 'is-closed'}`} aria-hidden={!drawer} onClick={closeDrawer}><div ref={drawerRef} id="more-drawer" className={`el-drawer ${drawer ? 'is-open' : 'is-closed'}`} role="dialog" aria-modal="true" aria-label="更多入口" onClick={event => event.stopPropagation()}><div className="drawer"><Button className="drawer-close" aria-label="关闭更多入口" onClick={closeDrawer}>×</Button><Button className="brand" aria-label="返回 Today" onClick={() => go('/app/today')}><span className="brand-mark">C</span><span><b className="font-title">Calmy</b><small>现实行动系统</small></span></Button><div className="drawer-intro" style={{ display: 'grid', gap: 4, margin: '20px 12px 0', padding: '11px 12px', border: '1px solid var(--scene-border)', borderRadius: 9, background: 'var(--scene-soft)' }}><b style={{ color: 'var(--scene)', fontSize: 11 }}>从这里开始</b><span style={{ color: 'var(--c-text-2)', fontSize: 10, lineHeight: 1.5 }}>Today → Capture → 事项 → 复盘</span></div><nav className="drawer-links">
  <Button onClick={openSearch}>⌕ 搜索 Matter、行动或记录</Button>
  <p>参考与上下文</p>
  <Button onClick={() => go('/app/cycle')}>◌ Cycle · 当前阶段</Button>
  <Button onClick={() => go('/app/task-board')}>▦ 事项看板 · 整理行动</Button>
  <Button onClick={() => go('/app/library')}>▤ 资料中心 · 留下可复用内容</Button>
  <Button onClick={() => go('/app/profile')}>○ 我的 · 查看全部模块</Button>
  <Button onClick={() => go('/app/memory')}>✦ AI 对我的理解 · 管理判断</Button>
  <p>查找与记录</p>
  <Button onClick={() => go('/app/people')}>◎ 人物上下文</Button>
  <Button onClick={() => go('/app/calendar')}>▦ 日历视图</Button>
  <Button onClick={() => go('/app/module/inbox')}>↓ 收件箱</Button>
  <p>辅助工具</p>
  <Button onClick={() => go('/app/module/tasks')}>✓ 任务</Button>
  <Button onClick={() => go('/app/module/habits')}>♧ 习惯</Button>
  <Button onClick={() => go('/app/module/finance')}>¥ 财务</Button>
  <Button onClick={() => go('/app/module/goals')}>◎ 目标</Button>
  <Button onClick={() => go('/app/module/pomo')}>🍅 番茄钟</Button>
  <Button onClick={() => go('/app/module/diary')}>▤ 日记</Button>
  <Button onClick={() => go('/app/module/posts')}>✎ 文章</Button>
  <p>设置与实验</p>
  <Button onClick={toggleTheme}>{dark ? '☀' : '◐'} 切换外观</Button>
  <Button onClick={() => go('/app/admin')}>⚙ 设置与同步</Button>
  <Button onClick={() => go('/app/graph')}>⌘ 图谱（实验）</Button>
  <Button onClick={() => go('/scene')}>◌ 场景（实验）</Button>
</nav></div></div></div>
    {search && <SearchDialog onClose={closeSearch} onGo={go} />}{toastText && <div className="toast" role="status">{toastText}</div>}
  </div>
}

function SearchDialog({ onClose, onGo }: { onClose: () => void; onGo: (path: string) => void }) { const [query, setQuery] = useState(''); const [results, setResults] = useState<SearchResult[]>([]); const panelRef = useRef<HTMLDivElement>(null); useEffect(() => { let active = true; void searchAllAsync(query, 8).then(next => { if (active) setResults(next) }); return () => { active = false } }, [query]); useEffect(() => { const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR); const timer = window.requestAnimationFrame(() => first?.focus()); const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose() } else trapFocus(event, panelRef.current) }; window.addEventListener('keydown', onKey); return () => { window.cancelAnimationFrame(timer); window.removeEventListener('keydown', onKey) } }, [onClose]); return <div className="search-overlay" role="dialog" aria-modal="true" aria-label="搜索课题" onClick={onClose}><div ref={panelRef} className="search-panel beryl-card" onClick={event => event.stopPropagation()}><div className="search-head">⌕<input autoFocus className="global-search" aria-label="搜索课题" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索 Matter、行动、记录或人物…" /><Button aria-label="关闭搜索" onClick={onClose}>Esc</Button></div><div className="search-results">{results.map(item => <Button key={`${item.type}-${item.id}`} onClick={() => onGo(item.route)}>◎ <span><b>{item.title}</b><small>{item.typeLabel} · {item.summary || '现实记录'}</small></span>→</Button>)}{!results.length && <p className="no-results">没有匹配的内容</p>}</div></div></div> }
