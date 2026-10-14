// 修 today-ref.mjs：tealCss 仅在 --teal 时注入；非 teal 时给 --cta 兜底。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const file = join(fileURLToPath(new URL('../..', import.meta.url)), 'tmp', 'design', 'today-ref.mjs')
let c = readFileSync(file, 'utf8')

// 1) 底色只属于 teal 变体
c = c.replace(
  "html.liubai-active body[data-theme='paper'] { background: #eff1ef; }\nhtml.liubai-active body[data-theme='paper']::before { opacity: 0; }",
  "html.liubai-active body[data-theme='paper'] { background: #eff1ef; }\nhtml.liubai-active body[data-theme='paper']::before { opacity: 0; }\n.today-ref.is-teal, .today-combo.is-teal { --cta: #0f766e; }"
)

// 2) --cta 兜底（Image2 令牌没有这个变量）：接在 refCss 之前
const anchor = "const refCss = `"
if (!c.includes(anchor)) { console.log('MISS refCss'); process.exit(1) }
c = c.replace(anchor,
  "const ctaFallback = `.today-ref, .today-combo { --cta: color-mix(in srgb, var(--accent) 68%, var(--muted)); }`\n\n" + anchor)

// 3) 注入：非 teal 不注入 tealCss
c = c.replace(
  "style.textContent = ${JSON.stringify(compBase + tealCss + refCss + comboPageCss)}",
  "style.textContent = ${JSON.stringify(compBase + (teal ? tealCss : '') + ctaFallback + refCss + comboPageCss)}"
)
writeFileSync(file, c)
console.log('patched palette/cta ok')
