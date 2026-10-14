// 修正：浏览器表达式里不能引用 Node 变量，改成 JSON 插值。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const file = join(fileURLToPath(new URL('../..', import.meta.url)), 'tmp', 'design', 'today-ref.mjs')
let c = readFileSync(file, 'utf8')

const a1 = "style.textContent = ${JSON.stringify(compBase + tealCss + refCss)} + comboPageCss"
const b1 = "style.textContent = ${JSON.stringify(compBase + tealCss + refCss + comboPageCss)}"
const a2 = "inner.innerHTML = combo ? comboPageHtml : ${JSON.stringify(refInner)}"
const b2 = "inner.innerHTML = ${JSON.stringify(combo ? comboPageHtml : refInner)}"
for (const [a, b] of [[a1, b1], [a2, b2]]) {
  if (!c.includes(a)) { console.log('MISS:', a.slice(0, 60)); process.exit(1) }
  c = c.replace(a, b)
}
writeFileSync(file, c)
console.log('interpolation fixed')
