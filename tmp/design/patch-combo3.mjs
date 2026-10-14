// 修正 today-ref.mjs 里 combo 的声明顺序（必须在 tag 之前）。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const file = join(fileURLToPath(new URL('../..', import.meta.url)), 'tmp', 'design', 'today-ref.mjs')
let c = readFileSync(file, 'utf8')

// 1) 删掉插在 refCss 之前的那段
const inserted = [
  "const combo = process.argv.includes('--combo')",
  "const comboPageCss = combo ? readFileSync(join(root, 'tmp', 'design', 'combo-css.txt'), 'utf8') : ''",
  "const comboPageHtml = combo ? readFileSync(join(root, 'tmp', 'design', 'combo-inner.html'), 'utf8') : ''",
  ''
].join('\n')
c = c.replace(inserted + 'const refCss = `', 'const refCss = `')

// 2) 在 teal 声明后插入（root 已定义）
const anchor = "const teal = process.argv.includes('--teal')\n"
if (!c.includes(anchor)) { console.log('MISS teal'); process.exit(1) }
c = c.replace(anchor, anchor + [
  "const combo = process.argv.includes('--combo')",
  "const comboPageCss = combo ? readFileSync(join(root, 'tmp', 'design', 'combo-css.txt'), 'utf8') : ''",
  "const comboPageHtml = combo ? readFileSync(join(root, 'tmp', 'design', 'combo-inner.html'), 'utf8') : ''"
].join('\n') + '\n')

writeFileSync(file, c)
console.log('order fixed')
