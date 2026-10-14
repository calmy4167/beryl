// v2 补丁 3：加 --cards 变体（主列也做成暖中性卡片），并给它单独命名。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const file = join(fileURLToPath(new URL('../..', import.meta.url)), 'tmp', 'design', 'today-comp.mjs')
let c = readFileSync(file, 'utf8')
if (c.includes('is-cards')) { console.log('already patched'); process.exit(0) }

// 1) CSS：主列 .panel 也变成暖中性卡片（特异性要压过 image2 的扁平化规则）
const cssAnchor = '@media (max-width: 1080px) { .today-v2 .today-grid { grid-template-columns: minmax(0, 1fr); } }'
const cardsCss = `
html.liubai-active body #app .today-home.today-v2.is-cards .panel {
  padding: 16px 18px;
  border: 0;
  border-radius: 14px;
  background: var(--panel-2);
  box-shadow: 0 1px 2px rgba(16, 24, 40, .04);
}
html.liubai-active body #app .today-home.today-v2.is-cards .panel .panel-head { padding-bottom: 2px; }
html.liubai-active body #app .today-home.today-v2.is-cards .panel .add-row { margin-top: 4px; }
` + cssAnchor
c = c.replace(cssAnchor, cardsCss)

// 2) 模板：--cards 时加 is-cards 类
c = c.replace(
  "<div class=\"today-home today-v2${stack ? ' is-stack' : ''}\">",
  "<div class=\"today-home today-v2${stack ? ' is-stack' : ''}${process.argv.includes('--cards') ? ' is-cards' : ''}\">"
)

// 3) 命名：--cards 时用 -v2-cards
c = c.replace(
  "const tag = process.argv.includes('--empty') ? '-empty' : (v2 ? (stack ? '-v2-stack' : '-v2-workbench') : (tall ? '-full' : ''))",
  "const tag = process.argv.includes('--empty') ? '-empty' : (v2 ? (process.argv.includes('--cards') ? '-v2-cards' : (stack ? '-v2-stack' : '-v2-workbench')) : (tall ? '-full' : ''))"
)
writeFileSync(file, c)
console.log('patched cards ok')
