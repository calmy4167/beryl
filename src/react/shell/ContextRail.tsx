import { Button } from '../ui'

function ContextActionIcon({ path }: { path: string }) {
  if (path.includes('/capture')) return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l3 3V20H7z" /><path d="M14 3.5V7h3M10 11h4M10 15h4" /></svg>
  if (path.includes('/matters')) return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></svg>
  if (path.includes('/review')) return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v4h4M5.8 9a7 7 0 1 1-.4 5" /><path d="M12 8v4l2.5 1.5" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 10 8-6 8 6v9H5v-9" /><path d="M9 19v-6h6v6" /></svg>
}

export interface ContextQuickAction {
  icon: string
  label: string
  hint: string
  path: string
}

export function ContextRail({ collapsed, expanded, actions, onNavigate, onToggle }: {
  collapsed: boolean
  expanded: boolean
  actions: readonly ContextQuickAction[]
  onNavigate: (path: string) => void
  onToggle: () => void
}) {
  return <aside id="app-right-sidebar" className="right-rail" aria-label={collapsed ? '已收起的右侧快捷栏' : '右侧快捷栏'}>
    <nav className="context-dock" data-context-dock aria-label="情境工具栏">
      <Button className="right-sidebar-toggle" aria-controls="context-drawer" aria-expanded={expanded} aria-label={collapsed ? '展开右侧栏' : '收起右侧栏'} onClick={onToggle}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M9 4v16" /></svg>
      </Button>
      {actions.map(item => <Button key={item.path} className="context-dock-action" aria-label={`${item.label}：${item.hint}`} title={item.hint} onClick={() => onNavigate(item.path)}>
        <ContextActionIcon path={item.path} />
      </Button>)}
      <Button className="context-dock-settings" aria-label="打开设置" title="设置" onClick={() => onNavigate('/app/admin')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></svg>
      </Button>
    </nav>
    <div id="context-drawer" className="right-rail-content" aria-hidden={collapsed}>
      <section className="edge-actions" aria-labelledby="context-actions-title">
        <h2 id="context-actions-title">快捷操作</h2>
        {actions.length === 0 && <p className="context-empty">暂无快捷操作</p>}
        {actions.map(item => <Button key={item.path} tabIndex={collapsed ? -1 : undefined} onClick={() => onNavigate(item.path)}>
          <ContextActionIcon path={item.path} /><span><b>{item.label}</b><small>{item.hint}</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </Button>)}
      </section>
    </div>
  </aside>
}
