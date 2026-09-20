import { Button } from '../ui'
import { primaryNavigation } from '../navigation'

export function MobilePrimaryNav({ active, onNavigate }: {
  active: string
  onNavigate: (path: string) => void
}) {
  return <nav className="bottom-nav mobile-only" aria-label="移动端主导航">
    {primaryNavigation.map(item => <Button key={item.key} title={item.label} className={active === item.key ? 'on' : ''} aria-current={active === item.key ? 'page' : undefined} onClick={() => onNavigate(item.path)}>
      <span>{item.icon}</span>{item.label}
    </Button>)}
  </nav>
}
