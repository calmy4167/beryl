import { createElement, useState, type ComponentType, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as TodayPageModule from '../react/pages/TodayPage'
import { TodayNowPanel } from '../react/pages/today/TodayNowPanel'
import { TodayRealityRecordPanel } from '../react/pages/today/TodayActionForms'
import type { JournalCategory } from '@/domain/record/model'

interface TodayWorkspaceLayoutProps {
  status: ReactNode
  alert?: ReactNode
  now: ReactNode
  capture: ReactNode
  records: ReactNode
  body: ReactNode
  context: ReactNode
  secondary: ReactNode
}

const TodayWorkspaceLayout = (TodayPageModule as unknown as {
  TodayWorkspaceLayout?: ComponentType<TodayWorkspaceLayoutProps>
}).TodayWorkspaceLayout

const region = (name: string) => createElement('div', { 'data-probe': name }, name)

afterEach(() => {
  document.body.replaceChildren()
})

describe('tactile Today workspace structure', () => {
  it('orders status, a record-first journal, then a default-collapsed 其他 section', () => {
    expect(TodayWorkspaceLayout).toBeTypeOf('function')
    if (!TodayWorkspaceLayout) return

    const markup = renderToStaticMarkup(createElement(TodayWorkspaceLayout, {
      status: region('status'),
      alert: region('alert'),
      now: region('now'),
      capture: region('capture'),
      records: region('records'),
      body: region('body'),
      context: region('context'),
      secondary: region('secondary'),
    }))
    const template = document.createElement('template')
    template.innerHTML = markup
    const order = Array.from(template.content.querySelectorAll('[data-today-region]'))
      .map(node => node.getAttribute('data-today-region'))

    expect(order).toEqual(['page-status', 'today-journal', 'other-modules'])
    const disclosure = template.content.querySelector<HTMLDetailsElement>('details.today-other')
    expect(disclosure?.open).toBe(false)
    expect(disclosure?.querySelector('summary')?.textContent).toContain('其他')
    for (const regionName of ['capture', 'records']) {
      expect(template.content.querySelector(`.today-journal-stack [data-probe="${regionName}"]`)).not.toBeNull()
    }
    for (const regionName of ['now', 'body', 'context', 'secondary']) {
      expect(disclosure?.querySelector(`[data-probe="${regionName}"]`)).not.toBeNull()
    }
  })

  it('marks exactly one primary CTA across the focus and capture surfaces', () => {
    const markup = renderToStaticMarkup(createElement('div', null,
      createElement(TodayNowPanel, {
        primaryAction: undefined,
        extraActions: [],
        matters: [],
        realityMessage: '',
        onGoToReality: () => undefined,
        onToggleAction: () => undefined,
        onCreateAction: () => undefined,
      }),
      createElement(TodayRealityRecordPanel, {
        body: '',
        journalCategory: 'fact',
        onBodyChange: () => undefined,
        onJournalCategoryChange: () => undefined,
        onSave: () => undefined,
      }),
    ))
    const template = document.createElement('template')
    template.innerHTML = markup

    expect(template.content.querySelectorAll('[data-primary-action]')).toHaveLength(1)
    expect(template.content.querySelector('[data-primary-action]')?.textContent).toContain('写下第一步')
  })

  it('keeps the secondary action area legible on the same light workspace surface', () => {
    const style = document.createElement('style')
    style.textContent = readFileSync(resolve(process.cwd(), 'src/react/tactile-ui.css'), 'utf8')
    document.head.append(style)
    document.documentElement.classList.add('tactile-ui')
    const host = document.createElement('main')
    host.className = 'page-container today-page'
    host.innerHTML = renderToStaticMarkup(createElement(TodayNowPanel, {
      primaryAction: undefined,
      extraActions: [],
      matters: [],
      realityMessage: '',
      onGoToReality: () => undefined,
      onToggleAction: () => undefined,
      onCreateAction: () => undefined,
    }))
    document.body.append(host)

    const extra = getComputedStyle(host.querySelector('.extra-action-section')!)
    expect(extra.color).toBe('rgb(20, 33, 58)')
    expect(extra.backgroundColor).toBe('rgb(243, 246, 250)')

    style.remove()
    document.documentElement.classList.remove('tactile-ui')
  })

  it('lets the Today workspace use wide screens and keeps its surfaces visually related', () => {
    const style = document.createElement('style')
    style.textContent = readFileSync(resolve(process.cwd(), 'src/react/tactile-ui.css'), 'utf8')
    document.head.append(style)
    document.documentElement.classList.add('tactile-ui')
    const host = document.createElement('main')
    host.className = 'today-page tactile-today-workspace'
    document.body.append(host)

    const layout = getComputedStyle(host)
    expect(Number.parseInt(layout.maxWidth, 10)).toBeGreaterThanOrEqual(1280)
    expect(layout.getPropertyValue('--t-today-border').trim()).not.toBe('')

    style.remove()
    document.documentElement.classList.remove('tactile-ui')
  })

  it('offers 心 / 事实 categories, a multiline record field, and preserves save behavior', () => {
    const onSave = vi.fn()
    const onJournalCategoryChange = vi.fn<(category: JournalCategory) => void>()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)

    flushSync(() => root.render(createElement(TodayRealityRecordPanel, {
      body: '',
      journalCategory: 'fact',
      onBodyChange: () => undefined,
      onJournalCategoryChange,
      onSave,
    })))

    const textarea = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="记录原文"]')
    const mind = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.trim() === '心')
    const fact = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.trim() === '事实')
    const save = Array.from(host.querySelectorAll('button')).find(button => button.textContent === '记录')
    expect(textarea).not.toBeNull()
    expect(textarea?.rows).toBeGreaterThan(1)
    expect(mind).toBeDefined()
    expect(fact).toBeDefined()
    expect(save).not.toBeUndefined()
    expect(host.querySelector('section.record-composer')).not.toBeNull()
    expect(host.querySelector('.capture-surface')).toBeNull()
    expect(host.querySelector('summary')).toBeNull()
    expect(host.querySelector('small')).toBeNull()

    mind?.click()
    fact?.click()
    expect(onJournalCategoryChange).toHaveBeenNthCalledWith(1, 'mind')
    expect(onJournalCategoryChange).toHaveBeenNthCalledWith(2, 'fact')
    save?.click()
    expect(onSave).toHaveBeenCalledTimes(1)
    root.unmount()
  })

  it('centers the journal column and animates the selected category state', () => {
    const style = document.createElement('style')
    style.textContent = readFileSync(resolve(process.cwd(), 'src/react/tactile-ui.css'), 'utf8')
    document.head.append(style)
    document.documentElement.classList.add('tactile-ui')

    const shell = document.createElement('main')
    shell.className = 'tactile-today-workspace'
    const stack = document.createElement('section')
    stack.className = 'today-journal-stack'
    shell.append(stack)
    document.body.append(shell)

    function CategoryHarness() {
      const [category, setCategory] = useState<JournalCategory>('mind')
      return createElement(TodayRealityRecordPanel, {
        body: '',
        journalCategory: category,
        onBodyChange: () => undefined,
        onJournalCategoryChange: setCategory,
        onSave: () => undefined,
      })
    }

    const root = createRoot(stack)
    flushSync(() => root.render(createElement(CategoryHarness)))

    const group = stack.querySelector<HTMLElement>('.journal-category')!
    const fact = group.querySelector<HTMLButtonElement>('button:last-child')!
    const columnStyle = getComputedStyle(stack)

    expect(columnStyle.maxWidth).toBe('760px')
    expect(columnStyle.marginLeft).toBe('auto')
    expect(columnStyle.marginRight).toBe('auto')
    expect(group.dataset.selectedCategory).toBe('mind')

    flushSync(() => fact.click())
    expect(group.dataset.selectedCategory).toBe('fact')
    expect(fact.getAttribute('aria-pressed')).toBe('true')
    root.unmount()
    style.remove()
    document.documentElement.classList.remove('tactile-ui')
  })

  it('keeps the writing area large and user-resizable on desktop', () => {
    const style = document.createElement('style')
    style.textContent = readFileSync(resolve(process.cwd(), 'src/react/tactile-ui.css'), 'utf8')
    document.head.append(style)
    document.documentElement.classList.add('tactile-ui')
    const host = document.createElement('div')
    host.id = 'app'
    host.innerHTML = `<main class="tactile-today-workspace">${renderToStaticMarkup(createElement(TodayRealityRecordPanel, {
      body: '',
      journalCategory: 'fact',
      onBodyChange: () => undefined,
      onJournalCategoryChange: () => undefined,
      onSave: () => undefined,
    }))}</main>`
    document.body.append(host)

    const textarea = host.querySelector<HTMLTextAreaElement>('.record-composer > textarea')!
    const composerStyle = getComputedStyle(textarea)
    expect(Number.parseInt(composerStyle.minHeight, 10)).toBeGreaterThanOrEqual(176)
    expect(composerStyle.resize).toBe('vertical')

    host.remove()
    style.remove()
    document.documentElement.classList.remove('tactile-ui')
  })

  it('uses restrained translucent layers with soft depth on the Today shell and composer', () => {
    const style = document.createElement('style')
    style.textContent = readFileSync(resolve(process.cwd(), 'src/react/tactile-ui.css'), 'utf8')
    document.head.append(style)
    document.documentElement.classList.add('tactile-ui')
    const host = document.createElement('div')
    host.id = 'app'
    host.innerHTML = `<header class="desktop-topbar"></header><aside class="sidebar"></aside><main class="tactile-today-workspace">${renderToStaticMarkup(createElement(TodayRealityRecordPanel, {
      body: '',
      journalCategory: 'fact',
      onBodyChange: () => undefined,
      onJournalCategoryChange: () => undefined,
      onSave: () => undefined,
    }))}</main>`
    document.body.append(host)

    const alpha = (color: string) => Number(color.match(/,\s*([\d.]+)\)$/)?.[1] ?? 1)
    const topbar = getComputedStyle(host.querySelector('.desktop-topbar')!)
    const sidebar = getComputedStyle(host.querySelector('.sidebar')!)
    const textarea = getComputedStyle(host.querySelector('textarea')!)

    expect(alpha(topbar.backgroundColor)).toBeGreaterThanOrEqual(0.9)
    expect(topbar.backdropFilter).toMatch(/blur\(8px\)/)
    expect(alpha(sidebar.backgroundColor)).toBeGreaterThanOrEqual(0.9)
    expect(sidebar.backdropFilter).toMatch(/blur\(8px\)/)
    expect(alpha(textarea.backgroundColor)).toBeGreaterThanOrEqual(0.9)
    expect(textarea.backdropFilter).toMatch(/blur\(6px\)/)
    expect(textarea.borderRadius).toBe('22px')
    expect(textarea.boxShadow).not.toBe('none')

    host.remove()
    style.remove()
    document.documentElement.classList.remove('tactile-ui')
  })
})
