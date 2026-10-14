// 让 today-ref.mjs 支持 --combo：读取外部 combo-css.txt / combo-inner.html。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const file = join(fileURLToPath(new URL('../..', import.meta.url)), 'tmp', 'design', 'today-ref.mjs')
let c = readFileSync(file, 'utf8')
if (c.includes('comboPageHtml')) { console.log('already patched'); process.exit(0) }

// 1) fs 导入加 readFileSync
c = c.replace(
  "import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'",
  "import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'"
)

// 2) 在 compBase 定义后加载外部文件
const anchor = "const refCss = `"
const loader = [
  "const combo = process.argv.includes('--combo')",
  "const comboPageCss = combo ? readFileSync(join(root, 'tmp', 'design', 'combo-css.txt'), 'utf8') : ''",
  "const comboPageHtml = combo ? readFileSync(join(root, 'tmp', 'design', 'combo-inner.html'), 'utf8') : ''",
  ''
].join('\n')
if (!c.includes(anchor)) { console.log('MISS anchor'); process.exit(1) }
c = c.replace(anchor, loader + anchor)

// 3) 注入时按模式选择外部文件
c = c.replace(
  "style.textContent = ${JSON.stringify(compBase + tealCss + refCss)}",
  "style.textContent = ${JSON.stringify(compBase + tealCss + refCss)} + comboPageCss"
)
c = c.replace(
  "inner.innerHTML = ${JSON.stringify(refInner)}",
  "inner.innerHTML = combo ? comboPageHtml : ${JSON.stringify(refInner)}"
)

// 4) 命名
c = c.replace(
  "const tag = teal ? '-ref-teal' : '-ref'",
  "const tag = combo ? (teal ? '-combo-teal' : '-combo') : (teal ? '-ref-teal' : '-ref')"
)
writeFileSync(file, c)
console.log('patched combo loader ok')
