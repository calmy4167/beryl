// 给 today-comp.mjs 的 --baseline 分支加"用页面自身写入两条行动并完成一条，再截一张有数据的图"。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const file = join(fileURLToPath(new URL('../..', import.meta.url)), 'tmp', 'design', 'today-comp.mjs')
let c = readFileSync(file, 'utf8')
if (c.includes('today-current-seeded')) { console.log('already patched'); process.exit(0) }

const anchor = "    await shot('today-current-paper')"
const seed = [
  "    await shot('today-current-paper')",
  "",
  "    // 用页面自身的输入框写入真实数据（走 addTask → ActionItem + TodayPlan）",
  "    console.log('seed:', JSON.stringify(await evaluate(`(async () => {",
  "      const set = (el, v) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }",
  "      const input = document.querySelector('[aria-label=\"添加今天要做的事\"]')",
  "      if (!input) return { ok: false }",
  "      for (const text of ['把今天页改成参考稿布局', '确认四项指标的口径', '跑一遍今天的回归测试']) {",
  "        set(input, text)",
  "        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))",
  "        await new Promise(r => setTimeout(r, 420))",
  "      }",
  "      return { ok: true, rows: document.querySelectorAll('.today-list > li').length }",
  "    })()`)))",
  "    await sleep(600)",
  "    console.log('complete one:', JSON.stringify(await evaluate(`(async () => {",
  "      const buttons = [...document.querySelectorAll('.today-list .today-row-action')]",
  "      if (buttons[1]) buttons[1].click()",
  "      await new Promise(r => setTimeout(r, 700))",
  "      return { rows: document.querySelectorAll('.today-list > li').length, done: !!document.querySelector('.today-done-line') }",
  "    })()`)))",
  "    await sleep(900)",
  "    await shot('today-current-seeded')"
].join('\n')
if (!c.includes(anchor)) { console.log('MISS anchor'); process.exit(1) }
c = c.replace(anchor, seed)
writeFileSync(file, c)
console.log('patched seeded shot ok')
