import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const tactileCss = () => readFileSync(resolve(process.cwd(), 'src/styles/shared/tactile-ui.css'), 'utf8')
const productCss = () => readFileSync(resolve(process.cwd(), 'src/styles/shared/product-ui.css'), 'utf8')

describe('workspace motion feedback', () => {
  it('gives pressed controls a compress-and-release response instead of only shifting them', () => {
    const style = document.createElement('style')
    style.textContent = productCss() + tactileCss()
    document.head.append(style)
    const activeRule = Array.from(style.sheet?.cssRules ?? []).find(rule =>
      rule instanceof CSSStyleRule && rule.selectorText.includes(':where(button') && rule.selectorText.includes(':active'),
    ) as CSSStyleRule | undefined

    expect(activeRule?.style.transform).toContain('scale(')
    expect(activeRule?.style.boxShadow).not.toBe('')

    style.remove()
  })

  it('disables workspace route animation when reduced motion is requested', () => {
    const style = document.createElement('style')
    style.textContent = tactileCss()
    document.head.append(style)
    const motionRules = Array.from(style.sheet?.cssRules ?? []).filter(rule =>
      rule instanceof CSSMediaRule && rule.conditionText.includes('prefers-reduced-motion'),
    ) as CSSMediaRule[]
    const routeRule = motionRules.flatMap(rule => Array.from(rule.cssRules)).find(rule =>
      rule instanceof CSSStyleRule && rule.selectorText.includes('.route-motion'),
    ) as CSSStyleRule | undefined

    expect(routeRule?.style.animation).toBe('none')

    style.remove()
  })

  it('keeps the Vue route wrapper visually identical to the React page without entrance animation', () => {
    const style = document.createElement('style')
    style.textContent = tactileCss()
    document.head.append(style)
    const routeRule = Array.from(style.sheet?.cssRules ?? []).find(rule =>
      rule instanceof CSSStyleRule && rule.selectorText === 'html.tactile-ui .route-motion',
    ) as CSSStyleRule | undefined

    expect(routeRule?.style.animation).toBe('none')
    expect(routeRule?.style.animationFillMode).toBe('')
    expect(routeRule?.style.willChange).toBe('')

    style.remove()
  })
})
