// 「今日」参考稿版设计出图：照用户给的参考图布局，在真实外壳 + 真令牌里注入页面 DOM。
// 只做页面（侧边栏在注入前移除）。--teal 切换为参考稿的墨绿/白配色。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import net from 'node:net'

const root = fileURLToPath(new URL('../..', import.meta.url))
const outDir = join(root, 'tmp', 'design')
mkdirSync(outDir, { recursive: true })
const baseUrl = process.env.LIUBAI_BASE || 'http://localhost:5173'
const teal = process.argv.includes('--teal')
const combo = process.argv.includes('--combo')
const comboPageCss = combo ? readFileSync(join(root, 'tmp', 'design', 'combo-css.txt'), 'utf8') : ''
const comboPageHtml = combo ? readFileSync(join(root, 'tmp', 'design', 'combo-inner.html'), 'utf8') : ''
const tag = combo ? (teal ? '-combo-teal' : '-combo') : (teal ? '-ref-teal' : '-ref')
const browser = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
].find(existsSync)
if (!browser) { console.log('Chrome not found'); process.exit(0) }

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port
    server.close(error => error ? reject(error) : resolve(port))
  })
})

/* 参考稿配色（仅 --teal 时覆盖令牌；默认沿用现有 Image2 令牌，不破坏设计层） */
const tealCss = `
html.liubai-active body[data-theme='paper'] { background: #eff1ef; }
html.liubai-active body[data-theme='paper']::before { opacity: 0; }
.today-ref.is-teal, .today-combo.is-teal { --cta: #0f766e; }
.today-ref.is-teal {
  --bg: #eff1ef; --fg: #14181a; --muted: #6b7280; --line: #e3e7e4; --line-strong: #cbd3cf;
  --accent: #0f766e; --accent-fg: #ffffff; --hover: #f1f4f2; --panel: #ffffff; --panel-2: #f6f8f7;
  --cta: #0f766e;
}
`

const compBase = `
html.liubai-active body #app .dots, html.liubai-active body #app .nav-scrim, html.liubai-active body #app .module-nav-handle { display: none !important; }
html.liubai-active body #app .stage .slide { padding-left: 0 !important; padding-right: 0 !important; }
html.liubai-active body[data-theme='paper']::before { opacity: 0 !important; }
`

const ctaFallback = `.today-ref, .today-combo { --cta: color-mix(in srgb, var(--accent) 68%, var(--muted)); }`

const refCss = `
.today-ref { max-width: 1180px; margin-inline: auto; display: flex; flex-direction: column; gap: 18px; }
.today-ref .ref-head { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
.today-ref .ref-head-main { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
.today-ref h1 { margin: 0; color: var(--fg); font-size: 1.9rem; font-weight: 700; letter-spacing: -.04em; }
.today-ref .ref-date { color: var(--muted); font-size: .92rem; }
.today-ref .ref-head-actions { display: flex; align-items: center; gap: 10px; }
.today-ref .ref-nav { display: flex; align-items: center; gap: 0; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); overflow: hidden; }
.today-ref .ref-nav button { width: 34px; height: 38px; border: 0; background: none; color: var(--muted); font: inherit; font-size: 1rem; cursor: pointer; }
.today-ref .ref-nav button:hover { background: var(--hover); color: var(--fg); }
.today-ref .ref-nav span { padding: 0 12px; color: var(--fg); font-size: .86rem; font-weight: 500; white-space: nowrap; }
.today-ref .ref-primary { display: inline-flex; align-items: center; gap: 7px; height: 38px; padding: 0 16px; border: 0; border-radius: 10px; background: var(--cta); color: var(--accent-fg); font: inherit; font-size: .86rem; font-weight: 600; cursor: pointer; }

/* 指标条：一张卡 + 1px 分隔（参考稿顶部四项） */
.today-ref .ref-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--line); border-radius: 14px; background: var(--panel); overflow: hidden; }
.today-ref .ref-metric { display: flex; flex-direction: column; gap: 6px; padding: 16px 20px; border-left: 1px solid var(--line); }
.today-ref .ref-metric:first-child { border-left: 0; }
.today-ref .ref-metric span { color: var(--muted); font-size: .8rem; }
.today-ref .ref-metric b { color: var(--fg); font-size: 1.5rem; font-weight: 650; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
.today-ref .ref-metric b small { color: var(--fg); font-size: .85rem; font-weight: 500; }

/* 通栏快速添加 */
.today-ref .ref-add { display: flex; gap: 10px; }
.today-ref .ref-add input { flex: 1; min-width: 0; height: 46px; padding: 0 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); color: var(--fg); font: inherit; font-size: .95rem; outline: none; }
.today-ref .ref-add input::placeholder { color: var(--muted); }
.today-ref .ref-add input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent); }
.today-ref .ref-add button { flex: none; width: 52px; height: 46px; border: 0; border-radius: 12px; background: var(--cta); color: var(--accent-fg); font-size: 1.3rem; font-weight: 400; cursor: pointer; }

/* 两列：主列 + 侧列 */
.today-ref .ref-grid { display: grid; grid-template-columns: minmax(0, 1.75fr) minmax(0, 1fr); gap: 18px; align-items: start; }
.today-ref .ref-side { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.today-ref .ref-card { display: flex; flex-direction: column; gap: 12px; padding: 18px 20px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); min-width: 0; }
.today-ref .ref-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.today-ref .ref-card-head h2 { margin: 0; color: var(--fg); font-size: 1.06rem; font-weight: 650; letter-spacing: -.02em; }
.today-ref .ref-chev { color: var(--muted); font-size: 1.1rem; line-height: 1; }
.today-ref .ref-sort { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: 1px solid var(--line); border-radius: 9px; background: none; color: var(--muted); font: inherit; font-size: .82rem; cursor: pointer; }
.today-ref .ref-sort:hover { color: var(--fg); border-color: var(--line-strong); }

/* 计划行 */
.today-ref .ref-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.today-ref .ref-list > li { display: flex; align-items: flex-start; gap: 12px; padding: 13px 0; border-top: 1px solid color-mix(in srgb, var(--line) 80%, transparent); }
.today-ref .ref-list > li:first-child { border-top: 0; }
.today-ref .ref-check { flex: none; width: 22px; height: 22px; margin-top: 1px; display: grid; place-items: center; border: 1.5px solid var(--line-strong); border-radius: 7px; background: var(--panel); color: transparent; font-size: .78rem; }
.today-ref .ref-check.on { border-color: var(--cta); background: var(--cta); color: #fff; }
.today-ref .ref-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 7px; }
.today-ref .ref-row-main > b { color: var(--fg); font-size: .95rem; font-weight: 550; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.today-ref .ref-list > li.is-done .ref-row-main > b { color: var(--muted); }
.today-ref .ref-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.today-ref .ref-chip { padding: 2px 8px; border-radius: 6px; background: color-mix(in srgb, var(--accent) 9%, var(--panel-2)); color: color-mix(in srgb, var(--accent) 82%, var(--fg)); font-size: .72rem; }
.today-ref .ref-chip.is-focus { background: color-mix(in srgb, var(--cta) 12%, var(--panel-2)); color: color-mix(in srgb, var(--cta) 88%, var(--fg)); font-weight: 600; }
.today-ref .ref-chip.is-doing { background: #fdf0e3; color: #b25a12; }
.today-ref .ref-status { flex: none; margin-top: 2px; color: var(--muted); font-size: .78rem; white-space: nowrap; }
.today-ref .ref-status.is-done { color: color-mix(in srgb, var(--cta) 80%, var(--fg)); }
.today-ref .ref-more { flex: none; width: 26px; height: 26px; border: 0; border-radius: 7px; background: none; color: var(--muted); font: inherit; font-size: 1rem; line-height: 1; cursor: pointer; }
.today-ref .ref-more:hover { background: var(--hover); color: var(--fg); }
.today-ref .ref-done-toggle { display: flex; align-items: center; gap: 8px; width: 100%; padding: 11px 14px; border: 0; border-radius: 10px; background: var(--panel-2); color: var(--muted); font: inherit; font-size: .86rem; text-align: left; cursor: pointer; }
.today-ref .ref-done-toggle:hover { color: var(--fg); }

/* 概览：环 + 三行事实 */
.today-ref .ref-ring-row { display: flex; align-items: center; gap: 18px; }
.today-ref .ref-ring { flex: none; width: 118px; height: 118px; }
.today-ref .ref-ring circle { fill: none; stroke-width: 9; stroke-linecap: round; }
.today-ref .ref-ring .track { stroke: var(--line); }
.today-ref .ref-ring .value { stroke: var(--accent); transform: rotate(-90deg); transform-origin: 50% 50%; }
.today-ref .ref-ring-label { text-align: center; }
.today-ref .ref-ring-label b { display: block; color: var(--fg); font-size: 1.05rem; font-weight: 650; letter-spacing: -.02em; }
.today-ref .ref-ring-label span { color: var(--muted); font-size: .72rem; }
.today-ref .ref-facts { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.today-ref .ref-fact { display: flex; align-items: baseline; gap: 8px; padding: 9px 0; border-top: 1px solid color-mix(in srgb, var(--line) 80%, transparent); }
.today-ref .ref-fact:first-child { border-top: 0; }
.today-ref .ref-fact span { color: var(--muted); font-size: .8rem; }
.today-ref .ref-fact b { margin-left: auto; color: var(--fg); font-size: .9rem; font-weight: 600; font-variant-numeric: tabular-nums; }

/* 时间线 */
.today-ref .ref-timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; position: relative; }
.today-ref .ref-timeline li { display: flex; align-items: baseline; gap: 10px; padding: 9px 0 9px 20px; position: relative; }
.today-ref .ref-timeline li::before { position: absolute; left: 5px; top: 0; bottom: 0; width: 1px; background: var(--line); content: ''; }
.today-ref .ref-timeline li:first-child::before { top: 50%; }
.today-ref .ref-timeline li:last-child::before { bottom: 50%; }
.today-ref .ref-timeline .ref-dot { position: absolute; left: 1px; top: 50%; width: 9px; height: 9px; margin-top: -4.5px; border-radius: 50%; background: var(--panel); border: 2px solid var(--line-strong); }
.today-ref .ref-timeline li.is-focus .ref-dot { border-color: var(--accent); background: var(--accent); }
.today-ref .ref-time { flex: none; width: 3.6em; color: var(--muted); font-size: .8rem; font-variant-numeric: tabular-nums; }
.today-ref .ref-timeline b { flex: 1; min-width: 0; color: var(--fg); font-size: .88rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 最近完成 */
.today-ref .ref-list-compact > li { align-items: center; padding: 8px 0; }
.today-ref .ref-list-compact .ref-check { width: 20px; height: 20px; margin-top: 0; }
.today-ref .ref-list-compact b { flex: 1; min-width: 0; color: var(--muted); font-size: .86rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 1080px) { .today-ref .ref-grid { grid-template-columns: minmax(0, 1fr); } .today-ref .ref-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`

const refInner = `
<div class="today-home today-ref${teal ? ' is-teal' : ''}">
  <header class="ref-head">
    <div class="ref-head-main">
      <h1>今天</h1>
      <span class="ref-date">周二 · 10月13日</span>
    </div>
    <div class="ref-head-actions">
      <div class="ref-nav"><button type="button" aria-label="前一天">‹</button><span>10月13日 周二</span><button type="button" aria-label="后一天">›</button></div>
      <button class="ref-primary" type="button">✓ 复盘今日</button>
    </div>
  </header>

  <div class="ref-metrics">
    <div class="ref-metric"><span>计划</span><b>6<small> 项</small></b></div>
    <div class="ref-metric"><span>已完成</span><b>2<small> 项</small></b></div>
    <div class="ref-metric"><span>今日专注</span><b>2<small> 小时</small>40<small> 分</small></b></div>
    <div class="ref-metric"><span>重点</span><b>2<small> 项</small></b></div>
  </div>

  <div class="ref-add">
    <input placeholder="添加今天要做的事…" aria-label="添加今天要做的事">
    <button type="button" aria-label="添加">+</button>
  </div>

  <div class="ref-grid">
    <section class="ref-card">
      <header class="ref-card-head">
        <h2>今日计划</h2>
        <button class="ref-sort" type="button">≡ 重点优先 ▾</button>
      </header>
      <ul class="ref-list">
        <li class="is-done">
          <span class="ref-check on" aria-hidden="true">✓</span>
          <div class="ref-row-main"><b>完成首页模块布局优化</b><div class="ref-chips"><span class="ref-chip">产品</span><span class="ref-chip is-focus">重点</span></div></div>
          <span class="ref-status is-done">已完成</span>
          <button class="ref-more" type="button" aria-label="更多操作">⋮</button>
        </li>
        <li class="is-done">
          <span class="ref-check on" aria-hidden="true">✓</span>
          <div class="ref-row-main"><b>整理本周需求与待办</b><div class="ref-chips"><span class="ref-chip">规划</span></div></div>
          <span class="ref-status is-done">已完成</span>
          <button class="ref-more" type="button" aria-label="更多操作">⋮</button>
        </li>
        <li>
          <span class="ref-check" aria-hidden="true"></span>
          <div class="ref-row-main"><b>修复导航栏按钮对齐</b><div class="ref-chips"><span class="ref-chip">前端</span><span class="ref-chip is-doing">进行中</span><span class="ref-chip is-focus">重点</span></div></div>
          <span class="ref-status">待办</span>
          <button class="ref-more" type="button" aria-label="更多操作">⋮</button>
        </li>
        <li>
          <span class="ref-check" aria-hidden="true"></span>
          <div class="ref-row-main"><b>准备周会材料</b><div class="ref-chips"><span class="ref-chip">工作</span></div></div>
          <span class="ref-status">待办</span>
          <button class="ref-more" type="button" aria-label="更多操作">⋮</button>
        </li>
        <li>
          <span class="ref-check" aria-hidden="true"></span>
          <div class="ref-row-main"><b>复盘今日进度</b><div class="ref-chips"><span class="ref-chip">复盘</span><span class="ref-chip">与 张三</span></div></div>
          <span class="ref-status">待办</span>
          <button class="ref-more" type="button" aria-label="更多操作">⋮</button>
        </li>
      </ul>
      <button class="ref-done-toggle" type="button">⌄ 已完成 2 项</button>
    </section>

    <div class="ref-side">
      <section class="ref-card">
        <header class="ref-card-head"><h2>今日概览</h2><span class="ref-chev">›</span></header>
        <div class="ref-ring-row">
          <svg class="ref-ring" viewBox="0 0 118 118" aria-hidden="true">
            <circle class="track" cx="59" cy="59" r="50"></circle>
            <circle class="value" cx="59" cy="59" r="50" style="stroke-dasharray:314;stroke-dashoffset:210"></circle>
          </svg>
          <div class="ref-facts">
            <div class="ref-fact"><span>计划完成</span><b>33%</b></div>
            <div class="ref-fact"><span>专注次数</span><b>3 次</b></div>
            <div class="ref-fact"><span>最长一次</span><b>52 分钟</b></div>
            <div class="ref-fact"><span>最近一次</span><b>15:05</b></div>
          </div>
        </div>
      </section>

      <section class="ref-card">
        <header class="ref-card-head"><h2>今日时间线</h2><span class="ref-chev">›</span></header>
        <ul class="ref-timeline">
          <li><span class="ref-dot"></span><span class="ref-time">09:12</span><b>和产品确认今日范围</b><span class="ref-chip">记录</span></li>
          <li class="is-focus"><span class="ref-dot"></span><span class="ref-time">09:40</span><b>专注 52 分钟</b><span class="ref-chip is-focus">专注</span></li>
          <li><span class="ref-dot"></span><span class="ref-time">11:00</span><b>整理本周需求与待办</b><span class="ref-chip">完成</span></li>
          <li class="is-focus"><span class="ref-dot"></span><span class="ref-time">15:05</span><b>专注 40 分钟</b><span class="ref-chip is-focus">专注</span></li>
        </ul>
      </section>

      <section class="ref-card">
        <header class="ref-card-head"><h2>最近完成</h2><span class="ref-chev">›</span></header>
        <ul class="ref-list ref-list-compact">
          <li><span class="ref-check on" aria-hidden="true">✓</span><b>完成首页模块布局优化</b><span class="ref-time">09:30</span></li>
          <li><span class="ref-check on" aria-hidden="true">✓</span><b>整理本周需求与待办</b><span class="ref-time">11:00</span></li>
        </ul>
      </section>
    </div>
  </div>
</div>
`

const debugPort = await freePort()
const profile = mkdtempSync(join(tmpdir(), 'today-ref-'))
let chrome, socket
let nextId = 0
const pending = new Map()

try {
  if (!(await fetch(baseUrl).then(r => r.ok).catch(() => false))) throw new Error(`dev server not reachable: ${baseUrl}`)
  chrome = spawn(browser, [
    '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox',
    '--disable-background-networking', '--disable-component-update', '--disable-default-apps',
    '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1500,1120',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore' })

  let target
  for (let i = 0; i < 200 && !target; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
      target = pages.find(page => page.type === 'page' && page.url === 'about:blank')
    } catch { /* starting */ }
    if (!target) await sleep(100)
  }
  if (!target) throw new Error('chrome-target-timeout')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    const callback = pending.get(message.id)
    if (callback) { pending.delete(message.id); callback(message) }
  })
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, message => message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result))
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result?.value
  }
  const shot = async name => {
    const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(data, 'base64'))
    console.log('saved', name)
  }

  await call('Page.enable')
  await call('Runtime.enable')
  await call('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1120, deviceScaleFactor: 1, mobile: false })
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { try {
      localStorage.setItem('liubai-theme', 'paper'); localStorage.setItem('liubai-nav', 'left');
      localStorage.setItem('liubai-zen', '0'); localStorage.setItem('liubai-mode', 'full'); localStorage.setItem('liubai-nav-open', '1');
    } catch (e) {} })()`
  })
  await call('Page.navigate', { url: `${baseUrl}/?theme=paper` })
  await sleep(2600)
  await evaluate(`(() => { location.hash = '#/liubai-preview'; return true })()`)
  await sleep(3400)

  console.log('page only:', await evaluate(`(() => {
    document.body.classList.remove('nav-persistent', 'nav-show', 'nav-collapsed')
    return document.body.className || '(none)'
  })()`))
  console.log('inject:', JSON.stringify(await evaluate(`(() => {
    const inner = document.querySelector('.stage .slide.active .inner')
    if (!inner) return { ok: false }
    let style = document.getElementById('today-ref-css')
    if (!style) { style = document.createElement('style'); style.id = 'today-ref-css'; document.head.appendChild(style) }
    style.textContent = ${JSON.stringify(compBase + (teal ? tealCss : '') + ctaFallback + refCss + comboPageCss)}
    inner.innerHTML = ${JSON.stringify(combo ? comboPageHtml : refInner)}
    return { ok: true, cards: document.querySelectorAll('.today-ref .ref-card').length, rows: document.querySelectorAll('.today-ref .ref-list > li').length }
  })()`)))
  await sleep(1200)
  await shot(`today-design${tag}`)
  await call('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1500, deviceScaleFactor: 1, mobile: false })
  await sleep(400)
  await shot(`today-design${tag}-full`)
} finally {
  try { socket?.close() } catch { /* ignore */ }
  try { chrome?.kill() } catch { /* ignore */ }
  await sleep(300)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* ignore */ }
}
