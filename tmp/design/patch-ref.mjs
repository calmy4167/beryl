// 修 today-ref.mjs：出图前彻底隐藏侧栏与其遮罩、释放内容左内边距、关掉纸面纹理；并延长稳定等待。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const file = join(fileURLToPath(new URL('../..', import.meta.url)), 'tmp', 'design', 'today-ref.mjs')
let c = readFileSync(file, 'utf8')
if (c.includes('compBase')) { console.log('already patched'); process.exit(0) }

// 1) 加入 compBase（只作用于截图：隐藏外壳导航 + 关掉纹理）
const anchor = "const refCss = `"
const compBase = "const compBase = `\n" +
  "html.liubai-active body #app .dots, html.liubai-active body #app .nav-scrim, html.liubai-active body #app .module-nav-handle { display: none !important; }\n" +
  "html.liubai-active body #app .stage .slide { padding-left: 0 !important; padding-right: 0 !important; }\n" +
  "html.liubai-active body[data-theme='paper']::before { opacity: 0 !important; }\n" +
  "`\n\n"
c = c.replace(anchor, compBase + anchor)

// 2) 注入时使用 compBase + tealCss + refCss，并等待过渡结束
c = c.replace('style.textContent = ${JSON.stringify(tealCss + refCss)}', 'style.textContent = ${JSON.stringify(compBase + tealCss + refCss)}')
c = c.replace("  await shot(`today-design${tag}`)", "  await sleep(1200)\n  await shot(`today-design${tag}`)")
writeFileSync(file, c)
console.log('patched ok')
