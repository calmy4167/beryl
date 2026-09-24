import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from '../react/AppShell'
import { WorkspaceTabs } from '../react/shell/WorkspaceTabs'
import {
  closeWorkspaceTab,
  createWorkspaceTabs,
  moveWorkspaceTab,
  readWorkspaceTabs,
  visitWorkspaceTab,
  writeWorkspaceTabs,
  type WorkspaceTab,
} from '../react/shell/workspace-tabs'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const page = (path: string, title: string): WorkspaceTab => ({ path, title, pinned: false })

describe('workspace tab state', () => {
  it('always starts with a pinned Today tab', () => {
    expect(createWorkspaceTabs()).toEqual([
      { path: '/app/today', title: '今天', pinned: true },
    ])
  })

  it('adds a visited path once and refreshes its visible title', () => {
    const initial = visitWorkspaceTab(createWorkspaceTabs(), page('/app/people', '人物'))
    const revisited = visitWorkspaceTab(initial, page('/app/people', '人物关系'))

    expect(revisited).toEqual([
      { path: '/app/today', title: '今天', pinned: true },
      { path: '/app/people', title: '人物关系', pinned: false },
    ])
  })

  it('closes an active tab into its left neighbour without removing Today', () => {
    const tabs = [
      { path: '/app/today', title: '今天', pinned: true },
      page('/app/matters', '处境'),
      page('/app/people', '人物'),
    ]

    expect(closeWorkspaceTab(tabs, '/app/people', '/app/people')).toEqual({
      tabs: [
        { path: '/app/today', title: '今天', pinned: true },
        { path: '/app/matters', title: '处境', pinned: false },
      ],
      nextPath: '/app/matters',
    })
    expect(closeWorkspaceTab(tabs, '/app/today', '/app/today')).toEqual({ tabs, nextPath: undefined })
  })

  it('keeps at most twelve tabs by dropping the oldest non-pinned page', () => {
    const full = Array.from({ length: 11 }, (_, index) => page(`/app/page-${index + 1}`, `页面 ${index + 1}`))
      .reduce((tabs, tab) => visitWorkspaceTab(tabs, tab), createWorkspaceTabs())
    const next = visitWorkspaceTab(full, page('/app/page-12', '页面 12'))

    expect(next).toHaveLength(12)
    expect(next.map(tab => tab.path)).toEqual([
      '/app/today',
      '/app/page-2', '/app/page-3', '/app/page-4', '/app/page-5', '/app/page-6',
      '/app/page-7', '/app/page-8', '/app/page-9', '/app/page-10', '/app/page-11', '/app/page-12',
    ])
  })

  it('round-trips valid session tabs and falls back when cached JSON is damaged', () => {
    const cache = new Map<string, string>()
    const storage = {
      getItem: (key: string) => cache.get(key) ?? null,
      setItem: (key: string, value: string) => { cache.set(key, value) },
    }
    const tabs = visitWorkspaceTab(createWorkspaceTabs(), page('/app/review', '回顾'))

    writeWorkspaceTabs(storage, tabs)
    expect(readWorkspaceTabs(storage)).toEqual(tabs)

    cache.set('calmy_workspace_tabs_v1', '{broken')
    expect(readWorkspaceTabs(storage)).toEqual(createWorkspaceTabs())
  })

  it('moves ordinary tabs in either direction without moving the pinned Today tab', () => {
    const tabs = [createWorkspaceTabs()[0], page('/app/matters', '处境'), page('/app/people', '人物'), page('/app/review', '回顾')]

    expect(moveWorkspaceTab(tabs, '/app/review', '/app/matters').map(tab => tab.path)).toEqual([
      '/app/today', '/app/review', '/app/matters', '/app/people',
    ])
    expect(moveWorkspaceTab(tabs, '/app/matters', '/app/review').map(tab => tab.path)).toEqual([
      '/app/today', '/app/people', '/app/review', '/app/matters',
    ])
    expect(moveWorkspaceTab(tabs, '/app/people', '/app/today')).toEqual(tabs)
    expect(moveWorkspaceTab(tabs, '/app/today', '/app/people')).toEqual(tabs)
  })
})

describe('workspace tab bar', () => {
  const tabs = [
    { path: '/app/today', title: '今天', pinned: true },
    page('/app/matters', '处境'),
    page('/app/people', '人物'),
  ]

  it('marks the active page as a tab and keeps Today non-closable', () => {
    const template = document.createElement('template')
    template.innerHTML = renderToStaticMarkup(createElement(WorkspaceTabs, {
      tabs,
      activePath: '/app/people',
      saveState: 'pending',
      onActivate: () => undefined,
      onClose: () => undefined,
    }))

    const tablist = template.content.querySelector('[role="tablist"]')
    const active = template.content.querySelector('[role="tab"][aria-selected="true"]')
    const today = template.content.querySelector('[role="tab"][data-path="/app/today"]')

    expect(tablist?.getAttribute('aria-label')).toBe('已打开的工作区')
    expect(active?.textContent).toContain('人物')
    expect(active?.querySelector('[data-tab-save-state="pending"]')).not.toBeNull()
    expect(today?.closest('.workspace-tab')?.querySelector('[aria-label^="关闭"]')).toBeNull()
  })

  it('activates a tab and closes only through its labelled close button', () => {
    const onActivate = vi.fn()
    const onClose = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)

    act(() => root.render(createElement(WorkspaceTabs, {
      tabs,
      activePath: '/app/matters',
      saveState: 'idle',
      onActivate,
      onClose,
    })))
    act(() => host.querySelector<HTMLButtonElement>('[role="tab"][data-path="/app/people"]')?.click())
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="关闭人物"]')?.click())

    expect(onActivate).toHaveBeenCalledWith('/app/people')
    expect(onClose).toHaveBeenCalledWith('/app/people')
    act(() => root.unmount())
    host.remove()
  })

  it('supports dragging a tab and Ctrl+Shift+Arrow keyboard reordering', () => {
    const onReorder = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)

    act(() => root.render(createElement(WorkspaceTabs, {
      tabs,
      activePath: '/app/people',
      saveState: 'idle',
      onActivate: () => undefined,
      onClose: () => undefined,
      onReorder,
    })))

    const people = host.querySelector<HTMLElement>('.workspace-tab:has([data-path="/app/people"])')!
    const matters = host.querySelector<HTMLElement>('.workspace-tab:has([data-path="/app/matters"])')!
    const today = host.querySelector<HTMLElement>('.workspace-tab:has([data-path="/app/today"])')!
    expect(people.draggable).toBe(true)
    expect(today.draggable).toBe(false)

    act(() => {
      people.dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true }))
      matters.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }))
      matters.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }))
    })
    expect(onReorder).toHaveBeenCalledWith('/app/people', '/app/matters')

    act(() => host.querySelector<HTMLButtonElement>('[role="tab"][data-path="/app/people"]')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }),
    ))
    expect(onReorder).toHaveBeenCalledTimes(2)
    expect(onReorder).toHaveBeenLastCalledWith('/app/people', '/app/matters')

    act(() => root.unmount())
    host.remove()
  })

  it('uses arrow keys to activate and focus adjacent tabs', () => {
    const onActivate = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(createElement(WorkspaceTabs, {
      tabs,
      activePath: '/app/today',
      saveState: 'idle',
      onActivate,
      onClose: () => undefined,
    })))

    const today = host.querySelector<HTMLButtonElement>('[role="tab"][data-path="/app/today"]')!
    today.focus()
    act(() => today.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })))

    expect(onActivate).toHaveBeenCalledWith('/app/matters')
    expect(document.activeElement).toBe(host.querySelector('[role="tab"][data-path="/app/matters"]'))

    act(() => root.unmount())
    host.remove()
  })

  it('scrolls an overflowing tab row toward its edge during a drag', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(createElement(WorkspaceTabs, {
      tabs,
      activePath: '/app/people',
      saveState: 'idle',
      onActivate: () => undefined,
      onClose: () => undefined,
    })))

    const scroller = host.querySelector<HTMLElement>('.workspace-tabs-scroll')!
    Object.defineProperty(scroller, 'scrollWidth', { value: 400 })
    Object.defineProperty(scroller, 'clientWidth', { value: 100 })
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 100 } as DOMRect)
    const people = host.querySelector<HTMLElement>('.workspace-tab:has([data-path="/app/people"])')!
    const matters = host.querySelector<HTMLElement>('.workspace-tab:has([data-path="/app/matters"])')!
    act(() => {
      people.dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true }))
      matters.dispatchEvent(new MouseEvent('dragover', { clientX: 94, bubbles: true, cancelable: true }))
    })

    expect(scroller.scrollLeft).toBeGreaterThan(0)
    act(() => root.unmount())
    host.remove()
  })

  it('reveals scroll controls only for hidden tabs and reaches both edges', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(createElement(WorkspaceTabs, {
      tabs,
      activePath: '/app/today',
      saveState: 'idle',
      onActivate: () => undefined,
      onClose: () => undefined,
    })))

    expect(host.querySelector('[aria-label="向右滚动标签页"]')).toBeNull()
    const scroller = host.querySelector<HTMLElement>('.workspace-tabs-scroll')!
    Object.defineProperty(scroller, 'scrollWidth', { value: 400 })
    Object.defineProperty(scroller, 'clientWidth', { value: 100 })
    act(() => window.dispatchEvent(new Event('resize')))

    expect(host.querySelector('[aria-label="向左滚动标签页"]')).toBeNull()
    const right = host.querySelector<HTMLButtonElement>('[aria-label="向右滚动标签页"]')
    expect(right).not.toBeNull()
    act(() => right?.click())
    expect(scroller.scrollLeft).toBeGreaterThan(0)

    act(() => {
      scroller.scrollLeft = 300
      scroller.dispatchEvent(new Event('scroll'))
    })
    expect(host.querySelector('[aria-label="向左滚动标签页"]')).not.toBeNull()
    expect(host.querySelector('[aria-label="向右滚动标签页"]')).toBeNull()

    act(() => root.unmount())
    host.remove()
  })

  it('connects the current desktop route to the session tab bar and returns left when closed', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    localStorage.clear()
    sessionStorage.clear()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)

    act(() => root.render(createElement(
      MemoryRouter,
      { initialEntries: ['/app/people'] },
      createElement(
        Routes,
        null,
        createElement(
          Route,
          { path: '/app', element: createElement(AppShell) },
          createElement(Route, { path: '*', element: createElement('div', null, 'page') }),
        ),
      ),
    )))

    expect(host.querySelector('[role="tab"][data-path="/app/people"]')?.getAttribute('aria-selected')).toBe('true')
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="关闭人物"]')?.click())
    expect(host.querySelector('[role="tab"][data-path="/app/today"]')?.getAttribute('aria-selected')).toBe('true')

    act(() => root.unmount())
    host.remove()
    sessionStorage.clear()
  })

  it('persists the reordered tab sequence without changing the current module', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    localStorage.clear()
    sessionStorage.clear()
    writeWorkspaceTabs(sessionStorage, tabs)
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)

    act(() => root.render(createElement(
      MemoryRouter,
      { initialEntries: ['/app/people'] },
      createElement(Routes, null,
        createElement(Route, { path: '/app', element: createElement(AppShell) },
          createElement(Route, { path: '*', element: createElement('div', null, 'page') })),
      ),
    )))

    const people = host.querySelector<HTMLElement>('.workspace-tab:has([data-path="/app/people"])')!
    const matters = host.querySelector<HTMLElement>('.workspace-tab:has([data-path="/app/matters"])')!
    act(() => {
      people.dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true }))
      matters.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }))
    })

    expect(readWorkspaceTabs(sessionStorage).map(tab => tab.path)).toEqual([
      '/app/today', '/app/people', '/app/matters',
    ])
    expect(host.querySelector('[role="tab"][data-path="/app/people"]')?.getAttribute('aria-selected')).toBe('true')

    act(() => root.unmount())
    host.remove()
    sessionStorage.clear()
  })

  it('keeps the tab strip in its own scrollable row between the top bar and page', () => {
    const style = document.createElement('style')
    style.textContent = readFileSync(resolve(process.cwd(), 'src/react/tactile-ui.css'), 'utf8')
    document.head.append(style)
    document.documentElement.classList.add('tactile-ui')
    const host = document.createElement('div')
    host.innerHTML = `<div class="workspace-shell">${renderToStaticMarkup(createElement(WorkspaceTabs, {
      tabs,
      activePath: '/app/people',
      saveState: 'idle',
      onActivate: () => undefined,
      onClose: () => undefined,
    }))}<main class="page-container"></main></div>`
    document.body.append(host)

    const strip = getComputedStyle(host.querySelector('.workspace-tabs')!)
    const scroller = getComputedStyle(host.querySelector('.workspace-tabs-scroll')!)
    const pageStyle = getComputedStyle(host.querySelector('.page-container')!)

    expect(strip.height).toBe('42px')
    expect(strip.gridRow).toBe('2')
    expect(scroller.overflowX).toBe('auto')
    expect(pageStyle.gridRow).toBe('3')

    host.remove()
    style.remove()
    document.documentElement.classList.remove('tactile-ui')
  })

  it('marks a tab drop target without adding a thick side stripe', () => {
    const style = document.createElement('style')
    style.textContent = readFileSync(resolve(process.cwd(), 'src/react/tactile-ui.css'), 'utf8')
    document.head.append(style)
    document.documentElement.classList.add('tactile-ui')
    const host = document.createElement('div')
    host.innerHTML = '<div class="workspace-tab is-drop-target">目标标签页</div>'
    document.body.append(host)

    const target = getComputedStyle(host.firstElementChild!)
    expect(target.borderTopColor).toBe('rgb(51, 108, 244)')
    expect(target.boxShadow).toBe('none')

    host.remove()
    style.remove()
    document.documentElement.classList.remove('tactile-ui')
  })
})
