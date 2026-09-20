import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ElementType, ReactNode } from 'react'

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function Button({ children, className = '', ...props }, ref) {
  return <button ref={ref} className={`react-btn ${className}`} {...props}>{children}</button>
})

export const FOCUSABLE_SELECTOR = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

export function trapFocus(event: KeyboardEvent, root: HTMLElement | null): void {
  if (!root || event.key !== 'Tab') return
  const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(item => item.offsetParent !== null)
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

export function PageHead({ eyebrow, title, description, children, className = '', id }: { eyebrow: string; title: string; description: string; children?: ReactNode; className?: string; id?: string }) {
  return <header id={id} className={`page-head ${className}`.trim()}><div><p className="eyebrow">{eyebrow}</p><h1 className="font-title">{title}</h1><p>{description}</p></div>{children}</header>
}

export function PageSection({ title, description, action, children, className = '' }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`page-section ${className}`.trim()}><header className="page-section-head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action && <div className="page-section-action">{action}</div>}</header>{children}</section>
}

export function Surface({ as: Component = 'section', className = '', children }: { as?: ElementType; className?: string; children: ReactNode }) {
  return <Component className={`ui-surface ${className}`.trim()}>{children}</Component>
}

export function EmptyState({ title, description, action, className = '' }: { title?: string; description: string; action?: ReactNode; className?: string }) {
  return <div className={`empty-state ${className}`.trim()}>{title && <b>{title}</b>}<p>{description}</p>{action && <div className="empty-state-action">{action}</div>}</div>
}

export function StatusMessage({ kind, children }: { kind: 'info' | 'success' | 'warning' | 'error'; children: ReactNode }) {
  return <div className={`status-message status-${kind}`} role={kind === 'error' ? 'alert' : 'status'} aria-live={kind === 'error' ? 'assertive' : 'polite'}>{children}</div>
}
