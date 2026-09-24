import { Button } from '../ui'
import { primaryNavigation } from '../navigation'

function MobileNavigationIcon({ itemKey }: { itemKey: string }) {
  if (itemKey === 'capture') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l3 3V20H7z" /><path d="M14 3.5V7h3M10 11h4M10 15h4" /></svg>
  if (itemKey === 'matters') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></svg>
  if (itemKey === 'review') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v4h4M5.8 9a7 7 0 1 1-.4 5" /><path d="M12 8v4l2.5 1.5" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 10 8-6 8 6v9H5v-9" /><path d="M9 19v-6h6v6" /></svg>
}

export function MobilePrimaryNav({ active, onNavigate }: {
  active: string
  onNavigate: (path: string) => void
}) {
  return <nav className="bottom-nav mobile-only" aria-label="移动端主导航">
    {primaryNavigation.map(item => <Button key={item.key} title={item.label} className={active === item.key ? 'on' : ''} aria-current={active === item.key ? 'page' : undefined} onClick={() => onNavigate(item.path)}>
      <MobileNavigationIcon itemKey={item.key} /><span>{item.label}</span>
    </Button>)}
  </nav>
}
