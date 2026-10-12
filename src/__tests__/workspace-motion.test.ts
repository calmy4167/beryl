import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 动效契约。
 *
 * 原文件同时读 `tactile-ui.css`，但那一层 599/603 条规则挂在运行期从不添加的 `html.tactile-ui` 上，
 * 已随四层死 CSS 一起移除；`.route-motion` 包装器也只存在于旧壳里。
 * 现在守的是仍然生效的层：`product-ui.css`（按下反馈）与 `liubai-v11.css`（减弱动效）。
 */
const readStyle = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')
const productCss = () => readStyle('src/styles/shared/product-ui.css')
const liubaiCss = () => readStyle('src/styles/liubai/liubai-v11.css')

describe('workspace motion feedback', () => {
  it('gives pressed controls a compress-and-release response instead of only shifting them', () => {
    const style = document.createElement('style')
    style.textContent = productCss()
    document.head.append(style)
    const activeRule = Array.from(style.sheet?.cssRules ?? []).find(rule =>
      rule instanceof CSSStyleRule && rule.selectorText.includes(':where(button') && rule.selectorText.includes(':active'),
    ) as CSSStyleRule | undefined

    expect(activeRule?.style.transform).toContain('scale(')
    expect(activeRule?.style.boxShadow).not.toBe('')

    style.remove()
  })

  it('neutralizes animation and transition in the 留白 layer when reduced motion is requested', () => {
    expect(liubaiCss()).toMatch(
      /prefers-reduced-motion:reduce\)\{[\s\S]{0,80}animation-duration:\.01ms !important[\s\S]{0,80}transition-duration:\.01ms !important/,
    )
  })
})
