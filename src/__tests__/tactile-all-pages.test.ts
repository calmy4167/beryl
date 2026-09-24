import { act, createElement } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { AppShell } from '../react/AppShell'
import { CalendarPage } from '../react/pages/CalendarPage'
import { GraphPage } from '../react/pages/GraphPage'
import { appPageRegistry } from '../react/route-manifest'
import { Button } from '../react/ui'
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const tactileCss = readFileSync(resolve(process.cwd(), 'src/react/tactile-ui.css'), 'utf8')
const fullUiCss = [
  'src/styles/main.css',
  'src/react/react.css',
  'src/react/product-ui.css',
  'src/react/tactile-ui.css',
].map(path => readFileSync(resolve(process.cwd(), path), 'utf8')).join('\n')

function renderShell(path = '/app/matters') {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => {
    root.render(createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(
        Routes,
        null,
        createElement(
          Route,
          { path: '/app', element: createElement(AppShell) },
          createElement(Route, { path: '*', element: createElement('div', { 'data-page-probe': true }, 'page') }),
        ),
      ),
    ))
  })
  return { host, root }
}

afterEach(() => {
  document.documentElement.classList.remove('tactile-ui')
  document.body.replaceChildren()
  localStorage.clear()
})

describe('tactile full-site UI contracts', () => {
  it('keeps every routed app page attached to a declared tactile archetype', () => {
    const appPages = appPageRegistry.filter(page => page.shell === 'app')

    expect(appPages.length).toBeGreaterThan(20)
    expect(appPages.every(page => page.id && page.archetype)).toBe(true)
    expect(new Set(appPages.map(page => page.id)).size).toBe(appPages.length)
  })

  it('exposes keyboard-operable separators and persists adjusted panel widths', () => {
    localStorage.setItem('calmy_right_sidebar_collapsed', '0')
    const { host, root } = renderShell()
    const shell = host.querySelector<HTMLElement>('.app-shell')
    const left = host.querySelector<HTMLElement>('[role="separator"][aria-label="调整主导航宽度"]')
    const right = host.querySelector<HTMLElement>('[role="separator"][aria-label="调整情境栏宽度"]')

    expect(left).not.toBeNull()
    expect(right).not.toBeNull()
    expect(left?.getAttribute('aria-valuemin')).toBe('196')
    expect(left?.getAttribute('aria-valuemax')).toBe('320')
    expect(right?.getAttribute('aria-valuemin')).toBe('280')
    expect(right?.getAttribute('aria-valuemax')).toBe('480')

    act(() => left?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    act(() => right?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })))

    expect(shell?.style.getPropertyValue('--t-sidebar-width')).toBe('240px')
    expect(shell?.style.getPropertyValue('--t-context-width')).toBe('364px')
    expect(localStorage.getItem('calmy_sidebar_width')).toBe('240')
    expect(localStorage.getItem('calmy_context_width')).toBe('364')

    act(() => root.unmount())
  })

  it('gives default, primary, and danger actions visible tactile treatments', () => {
    document.documentElement.classList.add('tactile-ui')
    const style = document.createElement('style')
    style.textContent = tactileCss
    document.head.append(style)
    const host = document.createElement('div')
    host.className = 'page-container'
    document.body.append(host)
    const root = createRoot(host)

    act(() => root.render(createElement('div', { className: 'button-probe' },
      createElement(Button, { className: 'default-probe' }, '普通操作'),
      createElement(Button, { className: 'primary primary-probe' }, '主要操作'),
      createElement(Button, { className: 'danger danger-probe' }, '危险操作'),
      createElement('div', { className: 'memory-actions' },
        createElement('button', { className: 'memory-action-probe' }, '确认'),
        createElement('button', { className: 'memory-disabled-probe', disabled: true }, '正在保存')),
      createElement('div', { className: 'btns' }, createElement('button', { className: 'library-action-probe' }, '标记过期')),
      createElement('button', { className: 'future-primary future-disabled-probe', disabled: true }, '开始体验'),
      createElement('span', { className: 'future-example-label' }, '第一步'),
      createElement('a', { className: 'future-text-link' }, '回到今天'),
    )))

    const regular = getComputedStyle(host.querySelector('.default-probe')!)
    const primary = getComputedStyle(host.querySelector('.primary-probe')!)
    const danger = getComputedStyle(host.querySelector('.danger-probe')!)
    const memoryAction = getComputedStyle(host.querySelector('.memory-action-probe')!)
    const memoryDisabled = getComputedStyle(host.querySelector('.memory-disabled-probe')!)
    const libraryAction = getComputedStyle(host.querySelector('.library-action-probe')!)
    const futureDisabled = getComputedStyle(host.querySelector('.future-disabled-probe')!)
    const futureLabel = getComputedStyle(host.querySelector('.future-example-label')!)
    const futureLink = getComputedStyle(host.querySelector('.future-text-link')!)

    expect(regular.color).toBe('rgb(20, 33, 58)')
    expect(regular.backgroundColor).toBe('rgb(255, 255, 255)')
    expect(primary.color).toBe('rgb(255, 255, 255)')
    expect(primary.backgroundColor).toBe('rgb(51, 108, 244)')
    expect(danger.color).toBe('rgb(190, 62, 62)')
    expect(danger.backgroundColor).toBe('rgb(255, 255, 255)')
    expect(memoryAction.minHeight).toBe('40px')
    expect(memoryAction.borderColor).toBe('rgb(220, 227, 237)')
    expect(memoryAction.backgroundColor).toBe('rgb(255, 255, 255)')
    expect(memoryDisabled.opacity).toBe('1')
    expect(memoryDisabled.backgroundColor).toBe('rgb(238, 241, 245)')
    expect(libraryAction.minHeight).toBe('40px')
    expect(libraryAction.borderColor).toBe('rgb(220, 227, 237)')
    expect(futureDisabled.color).toBe('rgb(57, 91, 158)')
    expect(futureDisabled.backgroundColor).toBe('rgb(219, 229, 255)')
    expect(futureDisabled.borderColor).toBe('rgb(199, 214, 251)')
    expect(futureDisabled.opacity).toBe('1')
    expect(futureLabel.color).toBe('rgb(51, 108, 244)')
    expect(futureLink.color).toBe('rgb(51, 108, 244)')

    act(() => root.unmount())
    style.remove()
  })

  it('adapts legacy settings to the same open tactile hierarchy', () => {
    document.documentElement.classList.add('tactile-ui')
    const style = document.createElement('style')
    style.textContent = fullUiCss
    document.head.append(style)
    const host = document.createElement('div')
    host.id = 'app'
    host.innerHTML = `
      <main class="page-container">
        <section class="legacy-admin-host">
          <div class="admin-view">
            <header class="head"><span class="mod-icon">icon</span><div><p class="head-kicker">WORKSPACE CONTROL</p><h2 class="font-title mod-name">设置</h2></div></header>
            <div class="grid4"><div class="beryl-card card">任务数</div><div class="beryl-card card">习惯数</div></div>
            <section class="beryl-card block"><div class="appearance-mode"><button aria-pressed="true">浅色</button></div><button class="pill" aria-pressed="true" style="color:#329b63;border-color:#329b63;background:#eff9f3"><span>icon</span> 日常</button></section>
          </div>
        </section>
      </main>
    `
    document.body.append(host)

    const icon = getComputedStyle(host.querySelector('.mod-icon')!)
    const kicker = getComputedStyle(host.querySelector('.head-kicker')!)
    const title = getComputedStyle(host.querySelector('.mod-name')!)
    const metricGrid = getComputedStyle(host.querySelector('.grid4')!)
    const metric = getComputedStyle(host.querySelector('.grid4 .card')!)
    const pill = getComputedStyle(host.querySelector('.pill')!)
    const pillIcon = getComputedStyle(host.querySelector('.pill span')!)
    const appearanceMode = getComputedStyle(host.querySelector('.appearance-mode button')!)

    expect(icon.display).toBe('none')
    expect(kicker.display).toBe('none')
    expect(title.fontSize).toBe('30px')
    expect(metricGrid.gap).toBe('0px')
    expect(metric.borderRadius).toBe('0px')
    expect(pill.borderRadius).toBe('var(--t-radius-sm)')
    expect(pillIcon.display).toBe('none')
    expect(pill.color).toBe('rgb(51, 108, 244)')
    expect(appearanceMode.color).toBe('rgb(51, 108, 244)')

    style.remove()
  })

  it('keeps operational labels free of decorative emoji', () => {
    const operationalUi = [
      readFileSync(resolve(process.cwd(), 'src/react/pages/PomoPage.tsx'), 'utf8'),
      readFileSync(resolve(process.cwd(), 'src/views/AdminView.vue'), 'utf8'),
    ].join('\n')

    expect(operationalUi).not.toMatch(/[⚙📤📥🗑💾🔑🚪🔄☁🗄📂🔍🧬🍅☕]/u)
  })

  it('brings login, password, and scene selection into the tactile system', () => {
    document.documentElement.classList.add('tactile-ui')
    const style = document.createElement('style')
    style.textContent = fullUiCss
    document.head.append(style)
    const host = document.createElement('div')
    host.id = 'app'
    host.innerHTML = `
      <div class="login-wrap"><form class="beryl-card login-card"><input><button class="primary">登录</button></form></div>
      <div class="simple-page"><section class="beryl-card empty-state">设置访问密码</section></div>
      <div class="scene-page"><div class="scene-grid"><button class="beryl-card scene-card selected"><span class="scene-icon">icon</span><b>日常</b></button></div></div>
    `
    document.body.append(host)

    const loginCard = getComputedStyle(host.querySelector('.login-card')!)
    const loginInput = getComputedStyle(host.querySelector('.login-card input')!)
    const simpleState = getComputedStyle(host.querySelector('.simple-page .empty-state')!)
    const sceneGrid = getComputedStyle(host.querySelector('.scene-grid')!)
    const sceneCard = getComputedStyle(host.querySelector('.scene-card')!)
    const sceneIcon = getComputedStyle(host.querySelector('.scene-icon')!)

    expect(loginCard.borderRadius).toBe('var(--t-radius-lg)')
    expect(loginInput.borderRadius).toBe('var(--t-radius-sm)')
    expect(simpleState.maxWidth).toBe('520px')
    expect(sceneGrid.gridTemplateColumns).toContain('repeat(3')
    expect(sceneCard.borderRadius).toBe('var(--t-radius-md)')
    expect(sceneIcon.display).toBe('none')

    style.remove()
  })

  it('uses open page grouping instead of boxing every repeated row', () => {
    document.documentElement.classList.add('tactile-ui')
    const style = document.createElement('style')
    style.textContent = fullUiCss
    document.head.append(style)
    const host = document.createElement('main')
    host.id = 'app'
    host.innerHTML = `
      <main class="page-container">
        <section class="content-page">
          <header class="page-head"><div><p class="eyebrow">内容</p><h1>资料</h1><p>最近内容</p></div></header>
          <section class="beryl-card top-panel">编辑区</section>
          <div class="history-list"><article class="beryl-card history-card">第一条</article><article class="beryl-card history-card">第二条</article></div>
        </section>
      </main>
    `
    document.body.append(host)

    const pageHead = getComputedStyle(host.querySelector('.page-head')!)
    const topPanel = getComputedStyle(host.querySelector('.top-panel')!)
    const row = getComputedStyle(host.querySelector('.history-card')!)

    expect(pageHead.borderBottomWidth).toBe('0px')
    expect(topPanel.borderRadius).toBe('var(--t-radius-md)')
    expect(topPanel.boxShadow).toBe('none')
    expect(row.borderTopWidth).toBe('0px')
    expect(row.borderRightWidth).toBe('0px')
    expect(row.borderBottomWidth).toBe('1px')
    expect(row.borderLeftWidth).toBe('0px')
    expect(row.borderRadius).toBe('0px')
    expect(row.boxShadow).toBe('none')

    style.remove()
  })

  it('uses a compact page rhythm without shrinking focused writing surfaces', () => {
    document.documentElement.classList.add('tactile-ui')
    const style = document.createElement('style')
    style.textContent = fullUiCss
    document.head.append(style)
    const host = document.createElement('div')
    host.id = 'app'
    host.innerHTML = `
      <main class="workspace-shell">
        <section class="page-container" data-page-archetype="capture">
          <header class="page-head"><h1>记录</h1></header>
          <section class="beryl-card opening">内容</section>
          <section class="beryl-card empty-state">暂无记录</section>
          <section class="capture-box"><textarea></textarea></section>
          <article class="history-card">最近记录</article>
        </section>
      </main>
    `
    document.body.append(host)

    const page = getComputedStyle(host.querySelector('.page-container')!)
    const heading = getComputedStyle(host.querySelector('.page-head')!)
    const card = getComputedStyle(host.querySelector('.opening')!)
    const empty = getComputedStyle(host.querySelector('.empty-state')!)
    const editor = getComputedStyle(host.querySelector('.capture-box textarea')!)
    const row = getComputedStyle(host.querySelector('.history-card')!)

    expect(page.paddingTop).toBe('18px')
    expect(page.paddingLeft).toBe('24px')
    expect(heading.minHeight).toBe('56px')
    expect(heading.marginBottom).toBe('14px')
    expect(card.padding).toBe('14px')
    expect(empty.padding).toBe('22px 18px')
    expect(editor.minHeight).toBe('132px')
    expect(page.getPropertyValue('--page-row-height').trim()).toBe('46px')
    expect(row.minHeight).toBe('var(--page-row-height)')

    host.remove()
    style.remove()
  })

  it('lets page forms use the full available work surface', () => {
    document.documentElement.classList.add('tactile-ui')
    const style = document.createElement('style')
    style.textContent = fullUiCss
    document.head.append(style)
    const host = document.createElement('div')
    host.id = 'app'
    host.innerHTML = `
      <main class="page-container">
        <section class="posts-page">
          <section class="beryl-card matter-create"><form class="post-editor"><input><textarea></textarea><div>actions</div></form></section>
        </section>
        <section class="people-page">
          <section class="beryl-card admin-block"><form class="matter-create"><div class="two-col"><label>Name<input></label><label>Role<input></label></div><label>Notes<textarea></textarea></label></form></section>
        </section>
      </main>
    `
    document.body.append(host)

    const postForm = getComputedStyle(host.querySelector('.post-editor')!)
    const postTitle = getComputedStyle(host.querySelector('.post-editor input')!)
    const postBody = getComputedStyle(host.querySelector('.post-editor textarea')!)
    const peopleFields = getComputedStyle(host.querySelector('.people-page .two-col')!)
    const peopleInput = getComputedStyle(host.querySelector('.people-page input')!)

    expect(postForm.display).toBe('grid')
    expect(postTitle.width).toBe('100%')
    expect(postBody.width).toBe('100%')
    expect(peopleFields.gridTemplateColumns).toContain('minmax(0, 1fr)')
    expect(peopleInput.width).toBe('100%')

    style.remove()
  })

  it('keeps the workspace source switcher in flow so it cannot cover page actions', () => {
    document.documentElement.classList.add('tactile-ui')
    const style = document.createElement('style')
    style.textContent = fullUiCss
    document.head.append(style)
    const host = document.createElement('div')
    host.id = 'app'
    host.innerHTML = `
      <main class="workspace-shell">
        <section class="page-container">
          <section class="beryl-card workspace-source">来源切换</section>
          <header class="task-board-toolbar"><button>添加任务</button></header>
        </section>
      </main>
    `
    document.body.append(host)

    const source = getComputedStyle(host.querySelector('.workspace-source')!)
    expect(source.position).toBe('static')
    expect(source.borderTopWidth).toBe('0px')
    expect(source.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(tactileCss).toMatch(/\.workspace-shell\s*>\s*\.page-container:has\(>\s*\.workspace-source\)\s*>\s*\.workspace-source\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s)
    expect(tactileCss).toMatch(/#app\s+\.workspace-source\s*>\s*div\s*\{[^}]*min-width:\s*0/s)

    host.remove()
    style.remove()
  })

  it('removes the legacy 900px cap from the primary capture workspace', () => {
    document.documentElement.classList.add('tactile-ui')
    const style = document.createElement('style')
    style.textContent = fullUiCss
    document.head.append(style)
    const host = document.createElement('main')
    host.id = 'app'
    host.innerHTML = `
      <main class="page-container" data-page-archetype="capture">
        <section class="capture-gate-page">
          <header class="page-head"><h1>先收下来，再决定它是什么</h1></header>
          <section class="beryl-card capture-gate-input"><textarea></textarea></section>
        </section>
      </main>
    `
    document.body.append(host)

    const page = getComputedStyle(host.querySelector('.capture-gate-page')!)
    const composer = getComputedStyle(host.querySelector('.capture-gate-input')!)

    expect(page.maxWidth).toBe('none')
    expect(page.width).toBe('100%')
    expect(composer.width).toBe('100%')

    style.remove()
  })

  it('lets routed page roots fill the available work surface', () => {
    document.documentElement.classList.add('tactile-ui')
    const style = document.createElement('style')
    style.textContent = fullUiCss
    document.head.append(style)
    const host = document.createElement('div')
    host.id = 'app'
    host.innerHTML = `
      <main class="page-container" data-page-archetype="content"><section class="flow-page">探索</section></main>
      <main class="page-container" data-page-archetype="experiment"><section class="future-page">未来</section></main>
      <main class="page-container" data-page-archetype="calendar"><section class="calendar-page">日历</section></main>
      <main class="page-container" data-page-archetype="insight">${renderToStaticMarkup(createElement(MemoryRouter, null, createElement(GraphPage)))}</main>
    `
    document.body.append(host)

    const roots = host.querySelectorAll<HTMLElement>('.page-container > *')
    expect(roots).toHaveLength(4)
    roots.forEach(root => {
      const computed = getComputedStyle(root)
      expect(computed.width).toBe('100%')
      expect(computed.maxWidth).toBe('none')
      expect(computed.marginLeft).toBe('0px')
      expect(computed.marginRight).toBe('0px')
    })

    style.remove()
  })

  it('keeps calendar controls visibly distinct from the work surface', () => {
    document.documentElement.classList.add('tactile-ui')
    const style = document.createElement('style')
    style.textContent = fullUiCss
    document.head.append(style)
    const host = document.createElement('div')
    host.id = 'app'
    host.innerHTML = `<main class="page-container" data-page-archetype="calendar">${renderToStaticMarkup(createElement(MemoryRouter, null, createElement(CalendarPage)))}</main>`
    document.body.append(host)

    const controls = [...host.querySelectorAll<HTMLElement>('.calendar-controls button, .calendar-page .quiet, .evidence-actions button')]
    expect(controls.length).toBeGreaterThanOrEqual(3)
    controls.forEach(button => {
      const computed = getComputedStyle(button)
      expect(computed.minHeight).toBe('40px')
      expect(computed.color).toBe('rgb(20, 33, 58)')
      expect(computed.backgroundColor).toBe('rgb(255, 255, 255)')
      expect(Number.parseFloat(computed.borderTopWidth)).toBeGreaterThan(0)
      expect(computed.boxShadow).not.toBe('none')
    })

    style.remove()
  })

  it('removes the second frame from a surface nested inside a panel', () => {
    document.documentElement.classList.add('tactile-ui')
    const style = document.createElement('style')
    style.textContent = fullUiCss
    document.head.append(style)
    const host = document.createElement('div')
    host.id = 'app'
    host.innerHTML = `
      <main class="page-container">
        <section class="beryl-card primary-surface">
          <section class="beryl-card nested-surface">Details</section>
        </section>
      </main>
    `
    document.body.append(host)

    const nested = getComputedStyle(host.querySelector('.nested-surface')!)
    expect(nested.borderTopWidth).toBe('0px')
    expect(nested.boxShadow).toBe('none')
    expect(nested.backgroundColor).toBe('rgb(243, 246, 250)')

    style.remove()
  })

  it('keeps helper copy readable across page and compact states', () => {
    document.documentElement.classList.add('tactile-ui')
    const style = document.createElement('style')
    style.textContent = fullUiCss
    document.head.append(style)
    const host = document.createElement('div')
    host.id = 'app'
    host.innerHTML = `
      <main class="page-container">
        <section class="content-page">
          <header class="page-head"><div><h1>记录</h1><p>把重要内容先记下来</p></div></header>
          <p class="field-hint">辅助说明</p>
          <section class="today-page"><div class="recent-record-row"><span>记录类型</span></div></section>
        </section>
      </main>
      <aside class="right-rail"><section class="edge-actions"><button><span><small>下一步说明</small></span></button></section></aside>
    `
    document.body.append(host)

    for (const selector of ['.page-head p', '.field-hint', '.recent-record-row > span', '.edge-actions small']) {
      const size = Number.parseFloat(getComputedStyle(host.querySelector(selector)!).fontSize)
      expect(size, selector).toBeGreaterThanOrEqual(12)
    }

    host.remove()
    style.remove()
  })

  it('keeps secondary text contrast above 4.5:1 on the subtle surface', () => {
    document.documentElement.classList.add('tactile-ui')
    const style = document.createElement('style')
    style.textContent = tactileCss
    document.head.append(style)
    const css = getComputedStyle(document.documentElement)
    const luminance = (hex: string) => {
      const channels = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
    }
    const surface = luminance(css.getPropertyValue('--t-surface-subtle').trim())

    for (const token of ['--t-text-muted', '--t-text-faint']) {
      const foreground = luminance(css.getPropertyValue(token).trim())
      expect((surface + 0.05) / (foreground + 0.05), token).toBeGreaterThanOrEqual(4.5)
    }

    const host = document.createElement('div')
    host.innerHTML = '<div class="today-page"><div class="recent-record-row"><time>09:00</time></div><div class="attention-action-row"><span class="action-status">进行中</span></div></div>'
    document.body.append(host)
    for (const selector of ['.recent-record-row time', '.attention-action-row .action-status']) {
      const color = getComputedStyle(host.querySelector(selector)!).color
      const variable = color.match(/^var\((--[^)]+)\)$/)
      const channels = color.match(/\d+/g)?.slice(0, 3) ?? []
      const hex = variable
        ? css.getPropertyValue(variable[1]).trim()
        : `#${channels.map(value => Number(value).toString(16).padStart(2, '0')).join('')}`
      expect((surface + 0.05) / (luminance(hex) + 0.05), selector).toBeGreaterThanOrEqual(4.5)
    }

    host.remove()
    style.remove()
  })
})
