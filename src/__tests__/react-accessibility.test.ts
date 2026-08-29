import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appShell = readFileSync(resolve(process.cwd(), 'src/react/AppShell.tsx'), 'utf8')
const ui = readFileSync(resolve(process.cwd(), 'src/react/ui.tsx'), 'utf8')
const css = readFileSync(resolve(process.cwd(), 'src/react/react.css'), 'utf8')

describe('React 工作台键盘与触控边界', () => {
  it('保留全局搜索快捷键、弹层 Escape、焦点循环和移动触控尺寸', () => {
    expect(appShell).toContain("event.key.toLowerCase() === 'k'")
    expect(ui).toContain('export function trapFocus')
    expect(appShell).toContain("if (event.key === 'Escape')")
    expect(appShell).toContain('searchReturnRef.current')
    expect(appShell).toContain('drawerReturnRef.current')
    expect(css).toContain('.drawer-links button,.search-results button{min-height:44px}')
    expect(css).toContain(':focus-visible')
  })
})
