import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = readFileSync(resolve(process.cwd(), '.impeccable/prototypes/calmy-tactile-ui/nav-v2.js'), 'utf8')

function renderPrototype() {
  const prototypeDocument = document.implementation.createHTMLDocument()
  prototypeDocument.body.innerHTML = '<div class="app-frame"><aside class="sidebar"></aside><main class="workspace"><header class="topbar"></header></main></div>'
  new Function('document', 'location', script)(prototypeDocument, { search: '?design=nav-v2' })
  return { document: prototypeDocument, MouseEvent, KeyboardEvent }
}

describe('Calmy prototype secondary navigation', () => {
  it('opens a floating second-level list from a first-level item and closes it after choosing a page', () => {
    const { document, MouseEvent } = renderPrototype()
    const work = document.querySelector<HTMLElement>('[data-group="work"]')!
    const trigger = work.querySelector<HTMLButtonElement>('.concept-group-button')!
    const page = [...work.querySelectorAll<HTMLButtonElement>('.concept-child')].find(item => item.textContent?.includes('任务'))!

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(trigger.getAttribute('aria-label')).toContain('收起')
    expect(work.querySelector('.concept-subnav')?.classList.contains('open')).toBe(true)

    page.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-label')).toContain('展开')
    expect(work.querySelector('.concept-subnav')?.classList.contains('open')).toBe(false)
    expect(page.getAttribute('aria-current')).toBe('page')
    expect(work.classList.contains('selected')).toBe(true)
    expect(document.querySelector('.app-frame')?.classList.contains('sidebar-collapsed')).toBe(false)
  })

  it('closes the second-level popup on outside click and Escape', () => {
    const { document, MouseEvent, KeyboardEvent } = renderPrototype()
    const trigger = document.querySelector<HTMLButtonElement>('[data-group="daily"] .concept-group-button')!
    trigger.click()
    document.querySelector('.workspace')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    trigger.click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('can open a group popup from the all-features directory', () => {
    const { document } = renderPrototype()
    document.querySelector<HTMLButtonElement>('.concept-directory-trigger')!.click()
    document.querySelector<HTMLButtonElement>('[data-target-group="work"]')!.click()

    expect(document.querySelector('[data-group="work"] .concept-subnav')?.classList.contains('open')).toBe(true)
    expect(document.querySelector('.concept-directory')?.classList.contains('open')).toBe(false)
  })
})
