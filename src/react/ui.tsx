import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ComponentPropsWithoutRef, ElementType, ReactNode } from 'react'

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function Button({ children, className = '', ...props }, ref) {
  return <button ref={ref} className={`react-btn ${className}`} {...props}>{children}</button>
})

export function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false"><path d="M15.9 25.9c-5.8-1.4-9.1-5.6-9.1-11.3 5.8.1 9.4 2.6 10.4 7.4 1.2-6.3 5.1-10.1 11.4-11.3.5 8.7-3.8 14.1-11.1 15.4v2h-1.6z" fill="currentColor"/><path d="M8.3 7.4c4.7.2 7.8 2.8 8.7 7.2-5.3-.3-8.1-2.6-8.7-7.2z" fill="currentColor" opacity=".58"/></svg></span>
}

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

type SurfaceProps<T extends ElementType> = {
  as?: T
  className?: string
  children: ReactNode
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>

export function Surface<T extends ElementType = 'section'>({ as, className = '', children, ...props }: SurfaceProps<T>) {
  const Component = as ?? 'section'
  return <Component className={`ui-surface ${className}`.trim()} {...props}>{children}</Component>
}

export function EmptyState({ title, description, action, className = '' }: { title?: string; description: string; action?: ReactNode; className?: string }) {
  return <div className={`empty-state ${className}`.trim()}>{title && <b>{title}</b>}<p>{description}</p>{action && <div className="empty-state-action">{action}</div>}</div>
}

export function StatusMessage({ kind, children }: { kind: 'info' | 'success' | 'warning' | 'error'; children: ReactNode }) {
  return <div className={`status-message status-${kind}`} role={kind === 'error' ? 'alert' : 'status'} aria-live={kind === 'error' ? 'assertive' : 'polite'}>{children}</div>
}
