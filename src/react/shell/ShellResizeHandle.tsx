import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

export type ShellResizeSide = 'left' | 'right'

export function clampShellPanelWidth(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function ShellResizeHandle({ side, label, value, min, max, disabled = false, onChange }: {
  side: ShellResizeSide
  label: string
  value: number
  min: number
  max: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  const setValue = (next: number) => onChange(clampShellPanelWidth(next, min, max))

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    const direction = side === 'left' ? 1 : -1
    const step = event.shiftKey ? 24 : 8
    if (event.key === 'Home') setValue(min)
    else if (event.key === 'End') setValue(max)
    else if (event.key === 'ArrowLeft') setValue(value - step * direction)
    else if (event.key === 'ArrowRight') setValue(value + step * direction)
    else return
    event.preventDefault()
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0) return
    const startX = event.clientX
    const startValue = value
    const direction = side === 'left' ? 1 : -1
    const target = event.currentTarget
    target.setPointerCapture?.(event.pointerId)
    document.documentElement.classList.add('shell-is-resizing')

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setValue(startValue + (moveEvent.clientX - startX) * direction)
    }
    const finish = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      document.documentElement.classList.remove('shell-is-resizing')
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', finish, { once: true })
    window.addEventListener('pointercancel', finish, { once: true })
    event.preventDefault()
  }

  return <div
    className={`shell-resize-handle shell-resize-${side}`}
    role="separator"
    aria-label={label}
    aria-orientation="vertical"
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-disabled={disabled || undefined}
    tabIndex={disabled ? -1 : 0}
    onKeyDown={handleKeyDown}
    onPointerDown={handlePointerDown}
  ><span aria-hidden="true" /></div>
}
