import type { CSSProperties, KeyboardEvent, RefObject } from 'react'
import { BrandMark, Button } from '../ui'
import { featureNavigationGroups } from '../navigation'

type DirectoryPresentation = 'popover' | 'drawer'

export function FeatureDirectoryDialog({ open, presentation, anchor, activePath, dark, drawerRef, onNavigate, onSearch, onClose, onToggleTheme }: {
  open: boolean
  presentation: DirectoryPresentation
  anchor: { left: number; top: number; maxHeight: number }
  activePath: string
  dark: boolean
  drawerRef: RefObject<HTMLDivElement | null>
  onNavigate: (path: string) => void
  onSearch: () => void
  onClose: () => void
  onToggleTheme: () => void
}) {
  const popover = presentation === 'popover'
  const panelStyle = popover ? { left: `${anchor.left}px`, top: `${anchor.top}px`, maxHeight: `${anchor.maxHeight}px` } as CSSProperties : undefined

  function moveMenuFocus(event: KeyboardEvent<HTMLElement>) {
    if (!popover || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    if (!items.length) return
    event.preventDefault()
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowUp'
          ? (current <= 0 ? items.length - 1 : current - 1)
          : (current + 1) % items.length
    items[next]?.focus()
  }

  return <div className={`el-drawer-overlay ${open ? 'is-open' : 'is-closed'}`} data-presentation={presentation} aria-hidden={!open} onClick={onClose}>
    <div ref={drawerRef} id="more-drawer" className={`el-drawer ${open ? 'is-open' : 'is-closed'}`} data-presentation={presentation} role={popover ? 'menu' : 'dialog'} aria-modal={popover ? undefined : true} aria-label="功能目录" style={panelStyle} onKeyDown={moveMenuFocus} onClick={event => event.stopPropagation()}>
      <div className="drawer">
        {popover
          ? <div className="directory-popover-head"><strong>全部功能</strong></div>
          : <>
            <Button className="drawer-close" aria-label="关闭功能目录" onClick={onClose}>×</Button>
            <Button className="brand" aria-label="返回今天" onClick={() => onNavigate('/app/today')}>
              <BrandMark /><span><b>Calmy</b><small>现实行动系统</small></span>
            </Button>
          </>}
        <nav className="drawer-links" aria-label="按用途浏览功能">
          <Button data-directory-first role={popover ? 'menuitem' : undefined} className="drawer-search-link" onClick={onSearch}>⌕ 搜索处境、行动、记录或人物</Button>
          {featureNavigationGroups.map(group => <section key={group.id} aria-labelledby={`feature-group-${group.id}`}>
            <p id={`feature-group-${group.id}`}>{group.label}</p>
            {group.items.map(item => <Button key={item.path} role={popover ? 'menuitem' : undefined} title={item.label} className={activePath === item.path ? 'on' : ''} aria-current={activePath === item.path ? 'page' : undefined} onClick={() => onNavigate(item.path)}>{item.icon} {item.label}</Button>)}
          </section>)}
          <Button role={popover ? 'menuitem' : undefined} onClick={onToggleTheme}>{dark ? '☀' : '◐'} 切换外观</Button>
        </nav>
      </div>
    </div>
  </div>
}
