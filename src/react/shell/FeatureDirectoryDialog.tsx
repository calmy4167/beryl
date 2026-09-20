import type { RefObject } from 'react'
import { Button } from '../ui'
import { featureNavigationGroups } from '../navigation'

export function FeatureDirectoryDialog({ open, activePath, dark, drawerRef, onNavigate, onSearch, onClose, onToggleTheme }: {
  open: boolean
  activePath: string
  dark: boolean
  drawerRef: RefObject<HTMLDivElement | null>
  onNavigate: (path: string) => void
  onSearch: () => void
  onClose: () => void
  onToggleTheme: () => void
}) {
  return <div className={`el-drawer-overlay ${open ? 'is-open' : 'is-closed'}`} aria-hidden={!open} onClick={onClose}>
    <div ref={drawerRef} id="more-drawer" className={`el-drawer ${open ? 'is-open' : 'is-closed'}`} role="dialog" aria-modal="true" aria-label="功能目录" onClick={event => event.stopPropagation()}>
      <div className="drawer">
        <Button className="drawer-close" aria-label="关闭功能目录" onClick={onClose}>×</Button>
        <Button className="brand" aria-label="返回今天" onClick={() => onNavigate('/app/today')}>
          <span className="brand-mark">C</span><span><b className="font-title">Calmy</b><small>现实行动系统</small></span>
        </Button>
        <nav className="drawer-links" aria-label="按用途浏览功能">
          <Button className="drawer-search-link" onClick={onSearch}>⌕ 搜索处境、行动、记录或人物</Button>
          {featureNavigationGroups.map(group => <section key={group.id} aria-labelledby={`feature-group-${group.id}`}>
            <p id={`feature-group-${group.id}`}>{group.label}</p>
            {group.items.map(item => <Button key={item.path} title={item.label} className={activePath === item.path ? 'on' : ''} aria-current={activePath === item.path ? 'page' : undefined} onClick={() => onNavigate(item.path)}>{item.icon} {item.label}</Button>)}
          </section>)}
          <Button onClick={onToggleTheme}>{dark ? '☀' : '◐'} 切换外观</Button>
        </nav>
      </div>
    </div>
  </div>
}
