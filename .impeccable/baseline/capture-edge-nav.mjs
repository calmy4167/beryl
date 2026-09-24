import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const outputDir = resolve(process.argv[2] ?? '.impeccable/prototypes/calmy-tactile-ui')
const width = Number(process.argv[3] ?? 1600)
const height = Number(process.argv[4] ?? 1000)
const route = process.argv[5] ?? '/app/today'
const port = 9241
const profile = await mkdtemp(join(tmpdir(), 'calmy-live-nav-'))
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const url = `http://127.0.0.1:4175/.impeccable/baseline/current.html?route=${encodeURIComponent(route)}`
const browser = spawn(edge, [
  '--headless', '--disable-gpu', '--disable-software-rasterizer', '--disable-dev-shm-usage', '--no-sandbox', '--no-first-run', '--hide-scrollbars',
  `--force-device-scale-factor=1`, `--window-size=${width},${height}`, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, url,
], { windowsHide: true, stdio: 'ignore' })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
let target
for (let i = 0; i < 80 && !target; i += 1) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`)
    target = (await response.json()).find(item => item.type === 'page')
  } catch { /* Edge is starting. */ }
  if (!target) await wait(250)
}
if (!target) throw new Error('Edge did not load the live UI baseline')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
const pending = new Map()
let requestId = 0
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (!pending.has(message.id)) return
  const { resolve, reject } = pending.get(message.id)
  pending.delete(message.id)
  if (message.error) reject(new Error(message.error.message))
  else resolve(message.result)
})
function send(method, params = {}) {
  const id = ++requestId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
async function screenshot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true })
  await writeFile(join(outputDir, name), Buffer.from(result.data, 'base64'))
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  let ready = false
  for (let i = 0; i < 100; i += 1) {
    ready = await evaluate('!!document.querySelector(".app-shell .navigation-group-rail [data-group-id=work]")')
    if (ready) break
    await wait(200)
  }
  if (!ready) throw new Error('Live app shell did not become ready')
  await evaluate('document.querySelector(".sidebar-toggle").click()')
  await wait(400)
  const sidebarCollapsed = await evaluate(`(() => {
    const shell = document.querySelector('.app-shell')
    const firstLabel = document.querySelector('.navigation-group-rail button > span')
    return { state: shell.dataset.sidebarState, labelVisible: getComputedStyle(firstLabel).display !== 'none', label: firstLabel.textContent, width: getComputedStyle(shell).gridTemplateColumns }
  })()`)
  if (sidebarCollapsed.state !== 'collapsed' || !sidebarCollapsed.labelVisible) throw new Error(`Collapsed sidebar did not retain its labels: ${JSON.stringify(sidebarCollapsed)}`)
  await screenshot('live-nav-sidebar-collapsed.png')
  await evaluate('document.querySelector(".sidebar-toggle").click()')
  await wait(400)
  if (await evaluate('document.querySelector(".app-shell").dataset.sidebarState') !== 'expanded') throw new Error('Sidebar did not expand after activating its control')

  await evaluate('document.querySelector(".navigation-group-rail [data-group-id=work]").click()')
  await wait(250)
  const opened = await evaluate(`(() => {
    const panel = document.querySelector('#secondary-navigation')
    const rect = panel.getBoundingClientRect()
    return { open: panel.classList.contains('is-open'), left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight, selectedBg: getComputedStyle(document.querySelector('.nav-active-track')).backgroundColor, selectedColor: getComputedStyle(document.querySelector('.navigation-group-rail button.on')).color }
  })()`)
  if (!opened.open || opened.left < 0 || opened.top < 0 || opened.right > width || opened.bottom > height) throw new Error(`Group popup is misplaced: ${JSON.stringify(opened)}`)
  await screenshot('live-nav-popup-open.png')

  await evaluate('document.querySelector("#secondary-navigation .secondary-nav [data-path=\\"/app/task-board\\"]").click()')
  await wait(300)
  const closed = await evaluate(`(() => ({ hidden: document.querySelector('#secondary-navigation').getAttribute('aria-hidden'), expanded: document.querySelector('.navigation-group-rail [data-group-id=work]').getAttribute('aria-expanded'), route: document.querySelector('.page-container')?.dataset.pageId }))()`)
  if (closed.hidden !== 'true' || closed.expanded !== 'false') throw new Error(`Group popup did not close after navigation: ${JSON.stringify(closed)}`)
  await screenshot('live-nav-popup-selected.png')
  process.stdout.write(JSON.stringify({ sidebarCollapsed, opened, closed }) + '\n')
} finally {
  try { await send('Browser.close') } catch { browser.kill() }
  socket.close()
  if (browser.exitCode === null && browser.signalCode === null) {
    await Promise.race([new Promise(resolve => browser.once('exit', resolve)), wait(2500)])
  }
  if (browser.exitCode !== null || browser.signalCode !== null) await rm(profile, { recursive: true, force: true })
}
