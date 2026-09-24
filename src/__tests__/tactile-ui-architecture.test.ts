import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, createElement, createRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from '../react/AppShell'
import { ContextRail } from '../react/shell/ContextRail'
import { DesktopPrimaryNav } from '../react/shell/DesktopPrimaryNav'
import { MobilePrimaryNav } from '../react/shell/MobilePrimaryNav'
import { desktopNavigationGroups, featureNavigationGroups, primaryNavigation } from '../react/navigation'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const renderMarkup = (element: ReturnType<typeof createElement>) => {
  const template = document.createElement('template')
  template.innerHTML = renderToStaticMarkup(element)
  return template.content
}

const desktopNavProps = {
  collapsed: false,
  active: 'matters',
  activePath: '/app/matters',
  directoryOpen: false,
  directoryTriggerRef: createRef<HTMLButtonElement>(),
  immersiveTriggerRef: createRef<HTMLButtonElement>(),
  onNavigate: () => undefined,
  onSearch: () => undefined,
  onToggleSidebar: () => undefined,
  onEnterImmersive: () => undefined,
  onOpenDirectory: () => undefined,
}

describe('tactile UI architecture', () => {
  it('loads one permanent tactile design-system entry', () => {
    const main = read('src/react/main.tsx')

    expect(main).toContain("import './tactile-ui.css'")
    expect(main).toContain("document.documentElement.classList.add('tactile-ui')")
  })

  it('defines the shared material, geometry, shell, and motion tokens', () => {
    const css = read('src/react/tactile-ui.css')
    const tokens = [
      '--t-canvas',
      '--t-surface',
      '--t-border',
      '--t-text',
      '--t-radius-sm',
      '--t-radius-md',
      '--t-radius-lg',
      '--t-shadow-sm',
      '--t-shadow-md',
      '--t-shadow-lg',
      '--t-sidebar-open',
      '--t-sidebar-closed',
      '--t-context-open',
      '--t-context-closed',
      '--t-motion-standard',
      '--t-motion-emphasis',
    ]

    tokens.forEach(token => expect(css).toContain(token))
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('exposes persistent desktop sidebar and context states on the rendered shell', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    localStorage.setItem('calmy_sidebar_collapsed', '1')
    localStorage.setItem('calmy_right_sidebar_collapsed', '1')

    const fragment = renderMarkup(createElement(
      MemoryRouter,
      { initialEntries: ['/app/today'] },
      createElement(AppShell),
    ))
    const shell = fragment.querySelector('.app-shell')

    expect(shell?.getAttribute('data-sidebar-state')).toBe('collapsed')
    expect(shell?.getAttribute('data-context-state')).toBe('collapsed')
    localStorage.clear()
  })

  it('derives the desktop groups from the existing primary and feature navigation without losing routes', () => {
    expect(desktopNavigationGroups[0]).toMatchObject({ id: 'daily', label: '日常' })
    expect(desktopNavigationGroups[0].items.map(item => item.path)).toEqual(primaryNavigation.map(item => item.path))
    expect(desktopNavigationGroups.slice(1).map(group => group.id)).toEqual(featureNavigationGroups.map(group => group.id))

    const expectedPaths = [...primaryNavigation, ...featureNavigationGroups.flatMap(group => group.items)].map(item => item.path)
    const renderedPaths = desktopNavigationGroups.flatMap(group => group.items).map(item => item.path)
    expect(renderedPaths).toEqual(expectedPaths)
    expect(new Set(renderedPaths).size).toBe(renderedPaths.length)
  })

  it('renders one moving active track for the navigation group rail', () => {
    const fragment = renderMarkup(createElement(DesktopPrimaryNav, desktopNavProps))
    const navigation = fragment.querySelector('#navigation-group-rail')

    expect(navigation?.querySelectorAll('.nav-active-track')).toHaveLength(1)
    expect(navigation?.getAttribute('data-active-index')).toBe('0')
    expect(navigation?.querySelector('.nav-active-track')?.getAttribute('aria-hidden')).toBe('true')
    expect(fragment.querySelector('.secondary-sidebar-title')?.textContent).toBe('日常')
    expect(fragment.querySelector('.secondary-nav [aria-current="page"]')?.textContent).toContain('处境')
  })

  it('gives distinct pages distinct decorative icons and one clear group heading', () => {
    const daily = renderMarkup(createElement(DesktopPrimaryNav, desktopNavProps))
    const work = renderMarkup(createElement(DesktopPrimaryNav, {
      ...desktopNavProps,
      active: 'task-board',
      activePath: '/app/task-board',
    }))
    const dailyIcons = [...daily.querySelectorAll('.secondary-nav button i svg')]
    const workIcons = [...work.querySelectorAll('.secondary-nav button i svg')]

    expect(daily.querySelector('.secondary-sidebar-header h2')?.textContent).toBe('日常')
    expect(daily.querySelector('.secondary-sidebar-header span')).toBeNull()
    expect(dailyIcons).toHaveLength(4)
    expect(dailyIcons.every(icon => icon.getAttribute('aria-hidden') === 'true')).toBe(true)
    expect(new Set(dailyIcons.map(icon => icon.innerHTML)).size).toBe(4)
    expect(workIcons[0]?.innerHTML).not.toBe(workIcons[1]?.innerHTML)
  })

  it('keeps the closed secondary popup out of keyboard and screen-reader traversal', () => {
    const collapsed = renderMarkup(createElement(DesktopPrimaryNav, { ...desktopNavProps, collapsed: true }))
    const expanded = renderMarkup(createElement(DesktopPrimaryNav, desktopNavProps))

    expect(collapsed.querySelector('#secondary-navigation')?.getAttribute('aria-hidden')).toBe('true')
    expect([...collapsed.querySelectorAll('#secondary-navigation button')].every(button => button.getAttribute('tabindex') === '-1')).toBe(true)
    expect(expanded.querySelector('#secondary-navigation')?.getAttribute('aria-hidden')).toBe('true')
    expect([...expanded.querySelectorAll('#secondary-navigation button')].every(button => button.getAttribute('tabindex') === '-1')).toBe(true)
  })

  it('selects the matching feature group instead of leaving the daily rail active', () => {
    const fragment = renderMarkup(createElement(DesktopPrimaryNav, {
      ...desktopNavProps,
      active: 'task-board',
      activePath: '/app/task-board',
    }))
    const navigation = fragment.querySelector('#navigation-group-rail')

    expect(navigation?.getAttribute('data-active-index')).toBe('1')
    expect(navigation?.querySelector('.nav-active-track')?.getAttribute('data-active')).toBe('true')
    expect(navigation?.querySelector('[data-group-id="work"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(fragment.querySelector('.secondary-sidebar-title')?.textContent).toBe('工作')
    expect(fragment.querySelector('.secondary-nav [aria-current="page"]')?.textContent).toContain('看板')
  })

  it('starts with the context drawer collapsed until the user opens it', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    localStorage.clear()

    const fragment = renderMarkup(createElement(
      MemoryRouter,
      { initialEntries: ['/app/task-board'] },
      createElement(AppShell),
    ))

    expect(fragment.querySelector('.app-shell')?.getAttribute('data-context-state')).toBe('collapsed')
  })

  it('reserves the expanded context rail for viewports that leave enough reading space', () => {
    localStorage.setItem('calmy_right_sidebar_collapsed', '0')
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1181 })
    const narrow = renderMarkup(createElement(MemoryRouter, { initialEntries: ['/app/today'] }, createElement(AppShell)))
    expect(narrow.querySelector('.right-rail')).toBeNull()
    expect(narrow.querySelector('[aria-label="调整情境栏宽度"]')).toBeNull()

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    const wide = renderMarkup(createElement(MemoryRouter, { initialEntries: ['/app/today'] }, createElement(AppShell)))
    expect(wide.querySelector('.right-rail')).not.toBeNull()
    localStorage.clear()
  })

  it('uses icon-only search before desktop topbar controls would clip', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 901 })
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/app/today'] }, createElement(AppShell)))
    document.body.append(host)
    const topbar = host.querySelector('.desktop-topbar')!
    expect(topbar.classList.contains('is-compact-search')).toBe(true)
    expect(topbar.querySelector('.topbar-search')?.getAttribute('aria-label')).toBe('搜索内容')

    const style = document.createElement('style')
    style.textContent = read('src/react/tactile-ui.css')
    document.head.append(style)
    document.documentElement.classList.add('tactile-ui')
    expect(getComputedStyle(topbar.querySelector('.topbar-search span')!).display).toBe('none')
    host.remove()
    style.remove()
    document.documentElement.classList.remove('tactile-ui')
  })

  it('uses the selected primary group as the secondary navigation disclosure control', () => {
    const nav = renderMarkup(createElement(DesktopPrimaryNav, { ...desktopNavProps, collapsed: true }))
    const context = renderMarkup(createElement(ContextRail, {
      collapsed: true,
      expanded: false,
      actions: [],
      onNavigate: () => undefined,
      onToggle: () => undefined,
    }))
    const selectedGroup = nav.querySelector('[data-group-id="daily"]')
    const contextToggle = context.querySelector('.right-sidebar-toggle')
    const sidebarToggle = nav.querySelector<HTMLButtonElement>('.sidebar-toggle')

    expect(sidebarToggle?.getAttribute('aria-label')).toBe('展开左侧菜单')
    expect(sidebarToggle?.getAttribute('aria-expanded')).toBe('false')
    expect(selectedGroup?.getAttribute('aria-expanded')).toBe('false')
    expect(selectedGroup?.getAttribute('aria-controls')).toBe('secondary-navigation')
    expect(contextToggle?.getAttribute('aria-expanded')).toBe('false')
    expect(contextToggle?.getAttribute('aria-controls')).toBe('context-drawer')
  })

  it('calls the shell toggle when the visible left menu control is activated', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onToggleSidebar = vi.fn()

    flushSync(() => root.render(createElement(DesktopPrimaryNav, { ...desktopNavProps, onToggleSidebar })))
    flushSync(() => host.querySelector<HTMLButtonElement>('.sidebar-toggle')!.click())

    expect(onToggleSidebar).toHaveBeenCalledOnce()
    flushSync(() => root.unmount())
    host.remove()
  })

  it('opens a group popup, switches groups, and closes it after navigating to a secondary module', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onNavigate = vi.fn()

    function NavigationHarness() {
      const [path, setPath] = useState('/app/today')
      return createElement('div', null, createElement(DesktopPrimaryNav, {
        ...desktopNavProps,
        active: path === '/app/task-board' ? 'task-board' : 'today',
        activePath: path,
        onNavigate: nextPath => { onNavigate(nextPath); setPath(nextPath) },
      }))
    }

    flushSync(() => root.render(createElement(NavigationHarness)))
    const daily = host.querySelector<HTMLButtonElement>('[data-group-id="daily"]')!
    expect(daily.querySelector('.group-disclosure')?.classList.contains('is-open')).toBe(false)
    flushSync(() => daily.click())
    expect(daily.getAttribute('aria-expanded')).toBe('true')
    expect(daily.querySelector('.group-disclosure')?.classList.contains('is-open')).toBe(true)
    expect(host.querySelector('#secondary-navigation')?.getAttribute('aria-hidden')).toBeNull()

    const work = host.querySelector<HTMLButtonElement>('[data-group-id="work"]')!
    flushSync(() => work.click())
    expect(host.querySelector('.sidebar')?.getAttribute('data-selected-group')).toBe('work')
    expect(work.getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector('.secondary-sidebar-title')?.textContent).toBe('工作')
    flushSync(() => work.click())
    expect(work.getAttribute('aria-expanded')).toBe('false')
    expect(work.querySelector('.group-disclosure')?.classList.contains('is-open')).toBe(false)
    flushSync(() => work.click())
    flushSync(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(work.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(work)
    flushSync(() => work.click())
    flushSync(() => host.firstElementChild?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })))
    expect(work.getAttribute('aria-expanded')).toBe('false')
    flushSync(() => work.click())
    flushSync(() => host.querySelector<HTMLButtonElement>('.secondary-nav button')!.click())
    expect(onNavigate).toHaveBeenCalledWith('/app/task-board')
    expect(host.querySelector('#secondary-navigation')?.getAttribute('aria-hidden')).toBe('true')
    expect(work.getAttribute('aria-expanded')).toBe('false')

    flushSync(() => root.unmount())
    host.remove()
  })

  it('keeps an operable context dock when the drawer is collapsed', () => {
    const fragment = renderMarkup(createElement(ContextRail, {
      collapsed: true,
      expanded: false,
      actions: [{ icon: '↓', label: '记录', hint: '先留下原话', path: '/app/capture' }],
      onNavigate: () => undefined,
      onToggle: () => undefined,
    }))
    const dock = fragment.querySelector('[data-context-dock]')

    expect(dock).not.toBeNull()
    expect(dock?.querySelectorAll('button').length).toBeGreaterThanOrEqual(2)
    expect(dock?.querySelector('button[aria-label="展开右侧栏"]')).not.toBeNull()
    expect(dock?.querySelector('button[aria-label="记录：先留下原话"]')).not.toBeNull()
  })

  it('uses the expanded context rail for real route actions without repeating the page header', () => {
    const fragment = renderMarkup(createElement(ContextRail, {
      collapsed: false,
      expanded: true,
      actions: [{ icon: '↓', label: '记录', hint: '先留下原话', path: '/app/capture' }],
      onNavigate: () => undefined,
      onToggle: () => undefined,
    }))
    const content = fragment.querySelector('.right-rail-content')!

    expect(content.querySelector('.edge-actions button')?.textContent).toContain('记录')
    expect(content.querySelector('.context-methods')).toBeNull()
    expect(content.querySelector('.edge-context')).toBeNull()
    expect(content.querySelector('.edge-note')).toBeNull()
  })

  it('explains an empty context rail without duplicating general navigation', () => {
    const fragment = renderMarkup(createElement(ContextRail, {
      collapsed: false,
      expanded: true,
      actions: [],
      onNavigate: () => undefined,
      onToggle: () => undefined,
    }))
    const content = fragment.querySelector('.right-rail-content')!

    expect(content.textContent).toContain('暂无快捷操作')
    expect(content.querySelector('.edge-context')).toBeNull()
  })

  it('opens the desktop feature directory as an anchored keyboard menu and restores focus when dismissed', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    localStorage.clear()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    flushSync(() => root.render(createElement(
      MemoryRouter,
      { initialEntries: ['/app/today'] },
      createElement(AppShell),
    )))
    const groupTrigger = host.querySelector<HTMLButtonElement>('[data-group-id="daily"]')!
    flushSync(() => groupTrigger.click())
    const trigger = host.querySelector<HTMLButtonElement>('.feature-group-button')!
    trigger.getBoundingClientRect = () => ({
      x: 100,
      y: 200,
      top: 200,
      right: 180,
      bottom: 244,
      left: 100,
      width: 80,
      height: 44,
      toJSON: () => ({}),
    })
    trigger.focus()
    flushSync(() => trigger.click())

    const menu = host.querySelector<HTMLElement>('#more-drawer')!
    expect(groupTrigger.getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector('#secondary-navigation')?.getAttribute('aria-hidden')).toBeNull()
    expect(host.querySelector('.app-shell')?.getAttribute('data-directory-open')).toBe('true')
    const css = read('src/react/tactile-ui.css')
    expect(css).toMatch(/\.app-shell\[data-directory-open="true"\] \.secondary-sidebar\s*\{[^}]*border-top-right-radius:\s*0/)
    expect(css).toMatch(/\.app-shell\[data-directory-open="true"\] \.el-drawer\[data-presentation="popover"\]\s*\{[^}]*border-top-left-radius:\s*0/)
    expect(menu.dataset.presentation).toBe('popover')
    expect(menu.getAttribute('role')).toBe('menu')
    expect(menu.hasAttribute('aria-modal')).toBe(false)
    expect(menu.style.left).toBe('192px')
    expect(menu.style.top).toBe('200px')

    await new Promise(resolve => window.setTimeout(resolve, 260))
    expect(menu.classList.contains('is-open')).toBe(true)
    const firstItem = menu.querySelector<HTMLButtonElement>('[data-directory-first]')!
    const secondItem = menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[1]
    expect(document.activeElement).toBe(firstItem)
    firstItem.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }))
    expect(document.activeElement).toBe(secondItem)

    flushSync(() => host.querySelector<HTMLElement>('.el-drawer-overlay')!.click())
    expect(host.querySelector('#more-drawer')?.classList.contains('is-closed')).toBe(true)
    expect(document.activeElement).toBe(groupTrigger)

    root.unmount()
    host.remove()
  })

  it('lets the workspace enter immersion and exit with Escape', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    localStorage.clear()
    const style = document.createElement('style')
    style.textContent = read('src/react/tactile-ui.css')
    document.head.append(style)
    document.documentElement.classList.add('tactile-ui')
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    flushSync(() => root.render(createElement(
      MemoryRouter,
      { initialEntries: ['/app/today'] },
      createElement(AppShell),
    )))

    const enterButton = host.querySelector<HTMLButtonElement>('.primary-rail-foot [aria-label="进入沉浸模式"]')!
    expect(enterButton).not.toBeNull()
    expect(enterButton.textContent?.trim()).toBe('')
    expect(host.querySelector('.topbar-immersive')).toBeNull()
    flushSync(() => enterButton.click())
    expect(host.querySelector('.app-shell')?.getAttribute('data-immersive')).toBe('true')
    const exitButton = host.querySelector<HTMLButtonElement>('[aria-label="退出沉浸模式"]')!
    expect(exitButton).not.toBeNull()
    expect(exitButton.textContent?.trim()).toBe('')
    expect(getComputedStyle(host.querySelector('#app-sidebar')!).display).toBe('none')
    expect(getComputedStyle(host.querySelector('.workspace-shell')!).gridColumn).toBe('1')
    expect(getComputedStyle(host.querySelector('.page-container')!).gridRow).toBe('1')

    flushSync(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(host.querySelector('.app-shell')?.getAttribute('data-immersive')).toBe('false')
    expect(host.querySelector('[aria-label="进入沉浸模式"]')).not.toBeNull()

    root.unmount()
    host.remove()
    style.remove()
    document.documentElement.classList.remove('tactile-ui')
  })

  it('keeps mobile immersion inside a full-height viewport instead of document flow', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    localStorage.clear()
    const style = document.createElement('style')
    style.textContent = read('src/react/tactile-ui.css')
    document.head.append(style)
    document.documentElement.classList.add('tactile-ui')
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    flushSync(() => root.render(createElement(
      MemoryRouter,
      { initialEntries: ['/app/today'] },
      createElement(AppShell),
    )))

    flushSync(() => host.querySelector<HTMLButtonElement>('.mobile-header .immersive-toggle')!.click())

    const shell = host.querySelector<HTMLElement>('.app-shell')!
    expect(shell.getAttribute('data-immersive')).toBe('true')
    expect(shell.getAttribute('data-compact')).toBe('true')
    expect(getComputedStyle(shell).display).toBe('grid')
    expect(getComputedStyle(shell).height).toBe('100dvh')
    expect(getComputedStyle(host.querySelector('.bottom-nav')!).display).toBe('none')

    root.unmount()
    host.remove()
    style.remove()
    document.documentElement.classList.remove('tactile-ui')
  })

  it('closes the feature directory when the active route changes outside its menu', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    localStorage.clear()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const router = createMemoryRouter([{ path: '*', element: createElement(AppShell) }], { initialEntries: ['/app/today'] })
    flushSync(() => root.render(createElement(RouterProvider, { router })))
    flushSync(() => host.querySelector<HTMLButtonElement>('[data-group-id="daily"]')!.click())
    flushSync(() => host.querySelector<HTMLButtonElement>('.feature-group-button')!.click())
    expect(host.querySelector('#more-drawer')?.classList.contains('is-open')).toBe(true)

    await act(async () => { await router.navigate('/app/task-board') })

    expect(host.querySelector('.sidebar')?.getAttribute('data-active-route')).toBe('task-board')
    expect(host.querySelector('#more-drawer')?.classList.contains('is-closed')).toBe(true)

    root.unmount()
    host.remove()
  })

  it('keeps the feature directory as a modal drawer on compact screens', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    localStorage.clear()
    const style = document.createElement('style')
    style.textContent = read('src/react/tactile-ui.css')
    document.head.append(style)
    document.documentElement.classList.add('tactile-ui')
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    flushSync(() => root.render(createElement(
      MemoryRouter,
      { initialEntries: ['/app/today'] },
      createElement(AppShell),
    )))

    flushSync(() => host.querySelector<HTMLButtonElement>('.mobile-header .menu')!.click())
    const drawer = host.querySelector<HTMLElement>('#more-drawer')!
    expect(drawer.dataset.presentation).toBe('drawer')
    expect(drawer.getAttribute('role')).toBe('dialog')
    expect(drawer.getAttribute('aria-modal')).toBe('true')
    const brandStyle = getComputedStyle(drawer.querySelector('.brand')!)
    expect(brandStyle.display).toBe('flex')
    expect(brandStyle.width).toBe('100%')
    expect(brandStyle.borderTopWidth).toBe('0px')

    root.unmount()
    host.remove()
    style.remove()
    document.documentElement.classList.remove('tactile-ui')
  })

  it('fills the desktop viewport without a decorative outer frame', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    localStorage.clear()
    const style = document.createElement('style')
    style.textContent = read('src/react/tactile-ui.css')
    document.head.append(style)
    document.documentElement.classList.add('tactile-ui')
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(createElement(
      MemoryRouter,
      { initialEntries: ['/app/today'] },
      createElement(AppShell),
    ))
    document.body.append(host)

    const shellStyle = getComputedStyle(host.querySelector('.app-shell')!)
    expect(shellStyle.width).toBe('100%')
    expect(shellStyle.height).toBe('100dvh')
    expect(shellStyle.minHeight).toBe('0px')
    expect(shellStyle.marginTop).toBe('0px')
    expect(shellStyle.marginRight).toBe('0px')
    expect(shellStyle.marginBottom).toBe('0px')
    expect(shellStyle.marginLeft).toBe('0px')
    expect(shellStyle.borderTopWidth).toBe('0px')
    expect(shellStyle.borderRadius).toBe('0px')
    expect(shellStyle.boxShadow).toBe('none')

    host.remove()
    style.remove()
    document.documentElement.classList.remove('tactile-ui')
  })

  it('keeps every primary group as a full-width disclosure target at both sidebar widths', () => {
    const style = document.createElement('style')
    style.textContent = read('src/react/tactile-ui.css')
    document.head.append(style)
    document.documentElement.classList.add('tactile-ui')
    const host = document.createElement('div')
    host.innerHTML = `<div class="app-shell" data-sidebar-state="expanded">${renderToStaticMarkup(createElement(DesktopPrimaryNav, desktopNavProps))}</div>`
    document.body.append(host)

    const group = host.querySelector('[data-group-id="daily"]')!
    const expandedStyle = getComputedStyle(group)
    expect(expandedStyle.width).toBe('100%')
    expect(expandedStyle.minHeight).toBe('48px')

    host.querySelector('.app-shell')?.setAttribute('data-sidebar-state', 'collapsed')
    const collapsedStyle = getComputedStyle(group)
    expect(collapsedStyle.width).toBe('100%')
    expect(collapsedStyle.minHeight).toBe('56px')

    host.remove()
    style.remove()
    document.documentElement.classList.remove('tactile-ui')
  })

  it('lays out a labelled primary rail with a floating secondary navigation panel', () => {
    const style = document.createElement('style')
    style.textContent = read('src/react/tactile-ui.css')
    document.head.append(style)
    document.documentElement.classList.add('tactile-ui')
    const host = document.createElement('div')
    host.innerHTML = `<div class="app-shell" data-sidebar-state="expanded">${renderToStaticMarkup(createElement(DesktopPrimaryNav, desktopNavProps))}</div>`
    document.body.append(host)

    const sidebar = getComputedStyle(host.querySelector('.sidebar')!)
    const rail = getComputedStyle(host.querySelector('.primary-rail')!)
    const secondary = getComputedStyle(host.querySelector('.secondary-sidebar')!)
    const railButton = getComputedStyle(host.querySelector('.navigation-group-rail button:not(.on)')!)

    expect(sidebar.display).toBe('grid')
    expect(sidebar.gridTemplateColumns).toBe('minmax(0, 1fr)')
    expect(rail.backgroundColor).toBe('rgba(250, 251, 251, 0.94)')
    expect(rail.gridTemplateRows).toBe('auto minmax(0, 1fr) auto')
    expect(railButton.minHeight).toBe('48px')
    expect(railButton.backgroundColor).toBe('rgb(238, 241, 243)')
    expect(secondary.position).toBe('fixed')
    expect(secondary.backgroundColor).toBe('rgb(255, 255, 255)')

    const selected = getComputedStyle(host.querySelector('.navigation-group-rail button.on')!)
    const selectedTrack = getComputedStyle(host.querySelector('.nav-active-track')!)
    const selectedIconShape = getComputedStyle(host.querySelector('.navigation-group-rail button.on svg > :first-child')!)
    expect(selectedTrack.backgroundColor).toBe('rgb(229, 234, 238)')
    expect(selected.color).toBe('rgb(31, 78, 170)')
    expect(selected.fontWeight).toBe('760')
    expect(selectedIconShape.fill).toBe('rgb(31, 78, 170)')

    host.querySelector('.app-shell')?.setAttribute('data-sidebar-state', 'collapsed')
    const collapsedGroup = getComputedStyle(host.querySelector('.navigation-group-rail button')!)
    const collapsedLabel = getComputedStyle(host.querySelector('.navigation-group-rail button > span')!)
    const collapsedDefaultBackground = getComputedStyle(host.querySelector('.navigation-group-rail button:not(.on)')!).backgroundColor
    const collapsedSelected = getComputedStyle(host.querySelector('.navigation-group-rail button.on')!)
    expect(collapsedGroup.flexDirection).toBe('column')
    expect(collapsedGroup.minHeight).toBe('56px')
    expect(collapsedLabel.display).toBe('block')
    expect(collapsedDefaultBackground).toBe('rgb(238, 241, 243)')
    expect(collapsedSelected.color).toBe('rgb(31, 78, 170)')
    expect(collapsedSelected.fontWeight).toBe('760')

    host.remove()
    style.remove()
    document.documentElement.classList.remove('tactile-ui')
  })

  it('keeps secondary navigation easy to target without boxing the current page', () => {
    const style = document.createElement('style')
    style.textContent = read('src/react/tactile-ui.css')
    document.head.append(style)
    document.documentElement.classList.add('tactile-ui')
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(createElement(DesktopPrimaryNav, desktopNavProps))
    document.body.append(host)

    const page = getComputedStyle(host.querySelector('.secondary-nav [aria-current="page"]')!)
    const search = getComputedStyle(host.querySelector('.secondary-sidebar-header button')!)
    expect(page.minHeight).toBe('44px')
    expect(page.borderWidth).toBe('0px')
    expect(search.minHeight).toBe('44px')
    expect(search.borderWidth).toBe('0px')

    host.remove()
    style.remove()
    document.documentElement.classList.remove('tactile-ui')
  })

  it('emphasizes resize dividers with transforms instead of layout-changing width animation', () => {
    const style = document.createElement('style')
    style.textContent = read('src/react/tactile-ui.css')
    document.head.append(style)
    document.documentElement.classList.add('tactile-ui')
    const handle = document.createElement('div')
    handle.className = 'shell-resize-handle'
    handle.innerHTML = '<span></span>'
    document.body.append(handle)

    const divider = getComputedStyle(handle.querySelector('span')!)

    expect(divider.width).toBe('3px')
    expect(divider.transform).toContain('scaleX')
    expect(divider.transitionProperty).not.toContain('width')

    handle.remove()
    style.remove()
    document.documentElement.classList.remove('tactile-ui')
  })

  it('keeps the feature directory reachable in the compact shell and provides 44px navigation targets', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    localStorage.clear()
    const fragment = renderMarkup(createElement(
      MemoryRouter,
      { initialEntries: ['/app/today'] },
      createElement(AppShell),
    ))

    expect(fragment.querySelector('.sidebar')).toBeNull()
    expect(fragment.querySelector('.right-rail')).toBeNull()
    expect(fragment.querySelector('.mobile-header button[aria-controls="more-drawer"]')).not.toBeNull()
    expect(fragment.querySelectorAll('.bottom-nav button')).toHaveLength(4)

    const style = document.createElement('style')
    style.textContent = read('src/react/tactile-ui.css')
    document.head.append(style)
    document.documentElement.classList.add('tactile-ui')
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    flushSync(() => root.render(createElement(MobilePrimaryNav, { active: 'today', onNavigate: () => undefined })))

    expect(getComputedStyle(host.querySelector('button')!).minHeight).toBe('44px')
    root.unmount()
    host.remove()
    style.remove()
    document.documentElement.classList.remove('tactile-ui')
  })
})
