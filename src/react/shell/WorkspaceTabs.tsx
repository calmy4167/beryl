import { useEffect, useRef, useState } from 'react'
import type { DragEvent, KeyboardEvent } from 'react'
import type { WorkspaceTab } from './workspace-tabs'

const VISIBLE_SAVE_STATES = new Set(['saving', 'pending', 'conflict', 'failed'])

export function WorkspaceTabs({ tabs, activePath, saveState, onActivate, onClose, onReorder }: {
  tabs: readonly WorkspaceTab[]
  activePath: string
  saveState: string
  onActivate: (path: string) => void
  onClose: (path: string) => void
  onReorder?: (path: string, targetPath: string) => void
}) {
  const activeRef = useRef<HTMLButtonElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const draggingPathRef = useRef<string | null>(null)
  const [draggingPath, setDraggingPath] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false })

  function updateScrollEdges() {
    const scroller = scrollerRef.current
    if (!scroller) return
    const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
    const next = { left: scroller.scrollLeft > 1, right: scroller.scrollLeft < max - 1 }
    setScrollEdges(previous => previous.left === next.left && previous.right === next.right ? previous : next)
  }

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [activePath, tabs])

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    updateScrollEdges()
    scroller.addEventListener('scroll', updateScrollEdges, { passive: true })
    window.addEventListener('resize', updateScrollEdges)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateScrollEdges)
    observer?.observe(scroller)
    return () => {
      scroller.removeEventListener('scroll', updateScrollEdges)
      window.removeEventListener('resize', updateScrollEdges)
      observer?.disconnect()
    }
  }, [tabs, activePath])

  function scrollTabs(direction: -1 | 1) {
    const scroller = scrollerRef.current
    if (!scroller) return
    scroller.scrollLeft += direction * Math.max(160, Math.round(scroller.clientWidth * .7))
    updateScrollEdges()
  }

  function clearDrag() {
    draggingPathRef.current = null
    setDraggingPath(null)
    setDropTarget(null)
  }

  function startDrag(event: DragEvent<HTMLDivElement>, tab: WorkspaceTab) {
    if (tab.pinned || (event.target as HTMLElement).closest('.workspace-tab-close')) {
      event.preventDefault()
      return
    }
    draggingPathRef.current = tab.path
    setDraggingPath(tab.path)
    event.dataTransfer?.setData('text/plain', tab.path)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  function dragOver(event: DragEvent<HTMLDivElement>, tab: WorkspaceTab) {
    if (!draggingPathRef.current || draggingPathRef.current === tab.path || tab.pinned) {
      setDropTarget(null)
      return
    }
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    setDropTarget(tab.path)
  }

  function drop(event: DragEvent<HTMLDivElement>, tab: WorkspaceTab) {
    const path = draggingPathRef.current
    if (path && path !== tab.path && !tab.pinned) {
      event.preventDefault()
      onReorder?.(path, tab.path)
    }
    clearDrag()
  }

  function reorderWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, tab: WorkspaceTab, index: number) {
    if (event.ctrlKey && event.shiftKey && !tab.pinned && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      const target = tabs[index + (event.key === 'ArrowLeft' ? -1 : 1)]
      if (!target || target.pinned) return
      event.preventDefault()
      onReorder?.(tab.path, target.path)
      return
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const nextIndex = event.key === 'ArrowLeft' ? Math.max(0, index - 1)
      : event.key === 'ArrowRight' ? Math.min(tabs.length - 1, index + 1)
        : event.key === 'Home' ? 0
          : event.key === 'End' ? tabs.length - 1 : -1
    if (nextIndex < 0 || nextIndex === index) return
    event.preventDefault()
    scrollerRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus()
    onActivate(tabs[nextIndex].path)
  }

  function scrollDuringDrag(event: DragEvent<HTMLDivElement>) {
    if (!draggingPathRef.current) return
    const scroller = event.currentTarget
    if (scroller.scrollWidth <= scroller.clientWidth) return
    const bounds = scroller.getBoundingClientRect()
    if (event.clientX < bounds.left + 36) scroller.scrollLeft -= 28
    else if (event.clientX > bounds.right - 36) scroller.scrollLeft += 28
  }

  return <nav className="workspace-tabs" aria-label="工作区标签">
    <div className="workspace-tabs-scroll" role="tablist" aria-label="已打开的工作区" ref={scrollerRef} onDragOver={scrollDuringDrag}>
      {tabs.map((tab, index) => {
        const selected = tab.path === activePath
        const showSaveState = selected && VISIBLE_SAVE_STATES.has(saveState)
        return <div
          className={`workspace-tab ${selected ? 'is-active' : ''} ${tab.pinned ? 'is-pinned' : ''} ${draggingPath === tab.path ? 'is-dragging' : ''} ${dropTarget === tab.path ? 'is-drop-target' : ''}`}
          key={tab.path}
          draggable={!tab.pinned}
          onDragStart={event => startDrag(event, tab)}
          onDragOver={event => dragOver(event, tab)}
          onDrop={event => drop(event, tab)}
          onDragEnd={clearDrag}
        >
          <button
            ref={selected ? activeRef : undefined}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            data-path={tab.path}
            title={tab.pinned ? tab.title : `${tab.title} · 拖动排序，或按 Ctrl + Shift + 左右方向键`}
            aria-keyshortcuts={tab.pinned ? undefined : 'Control+Shift+ArrowLeft Control+Shift+ArrowRight'}
            onClick={() => onActivate(tab.path)}
            onKeyDown={event => reorderWithKeyboard(event, tab, index)}
          >
            {tab.pinned && <svg className="workspace-tab-pin" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 7 6v10H5V9z" /><path d="M9 19v-6h6v6" /></svg>}
            {!tab.pinned && <svg className="workspace-tab-drag-hint" viewBox="0 0 12 16" aria-hidden="true"><circle cx="3" cy="3" r="1" /><circle cx="9" cy="3" r="1" /><circle cx="3" cy="8" r="1" /><circle cx="9" cy="8" r="1" /><circle cx="3" cy="13" r="1" /><circle cx="9" cy="13" r="1" /></svg>}
            {showSaveState && <span className="workspace-tab-save-state" data-tab-save-state={saveState} aria-label={saveState === 'failed' ? '保存失败' : saveState === 'conflict' ? '保存冲突' : '正在保存'} />}
            <span className="workspace-tab-title">{tab.title}</span>
          </button>
          {!tab.pinned && <button type="button" className="workspace-tab-close" aria-label={`关闭${tab.title}`} onClick={() => onClose(tab.path)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8 8 8M16 8l-8 8" /></svg>
          </button>}
        </div>
      })}
    </div>
    {scrollEdges.left && <button className="workspace-tab-scroll workspace-tab-scroll-left" type="button" aria-label="向左滚动标签页" onClick={() => scrollTabs(-1)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
    </button>}
    {scrollEdges.right && <button className="workspace-tab-scroll workspace-tab-scroll-right" type="button" aria-label="向右滚动标签页" onClick={() => scrollTabs(1)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg>
    </button>}
  </nav>
}
