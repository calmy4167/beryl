import { Button } from '../ui'

export interface ContextQuickAction {
  icon: string
  label: string
  hint: string
  path: string
}

export function ContextRail({ collapsed, expanded, pageTitle, pageDescription, actions, onNavigate, onToggle }: {
  collapsed: boolean
  expanded: boolean
  pageTitle: string
  pageDescription: string
  actions: readonly ContextQuickAction[]
  onNavigate: (path: string) => void
  onToggle: () => void
}) {
  return <aside id="app-right-sidebar" className="right-rail" aria-label={collapsed ? '已收起的右侧快捷栏' : '右侧快捷栏'}>
    <Button className="right-sidebar-toggle" aria-controls="app-right-sidebar" aria-expanded={expanded} aria-label={collapsed ? '展开右侧栏' : '收起右侧栏'} onClick={onToggle}>
      <span>{collapsed ? '←' : '→'}</span><span className="right-sidebar-label">{collapsed ? '展开右侧栏' : '收起右侧栏'}</span>
    </Button>
    <div className="right-rail-content">
      <section className="edge-context"><p className="edge-kicker">当前页面</p><h2 className="font-title">{pageTitle}</h2>{pageDescription && <p>{pageDescription}</p>}</section>
      {actions.length > 0 && <section className="edge-actions"><p className="edge-kicker">下一步</p>{actions.map(item => <Button key={item.path} onClick={() => onNavigate(item.path)}>
        {item.icon} <span><b>{item.label}</b><small>{item.hint}</small></span>→
      </Button>)}</section>}
      <section className="edge-note"><span>●</span><div><b>本地优先</b><p>离线也能记录，联网后再同步。</p></div></section>
    </div>
  </aside>
}
