// v2 补丁 2：给 v2 变体单独的图片命名，避免覆盖 v1 的图。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const file = join(fileURLToPath(new URL('../..', import.meta.url)), 'tmp', 'design', 'today-comp.mjs')
let c = readFileSync(file, 'utf8')
if (c.includes("'-v2-workbench'")) { console.log('already patched'); process.exit(0) }

const before = "const tag = process.argv.includes('--empty') ? '-empty' : (tall ? '-full' : '')"
const after = [
  "const v2 = process.argv.includes('--v2')",
  "const stack = process.argv.includes('--stack')",
  "const tag = process.argv.includes('--empty') ? '-empty' : (v2 ? (stack ? '-v2-stack' : '-v2-workbench') : (tall ? '-full' : ''))"
].join('\n')
if (!c.includes(before)) { console.log('MISS tag'); process.exit(1) }
c = c.replace(before, after)
writeFileSync(file, c)
console.log('patched naming ok')
