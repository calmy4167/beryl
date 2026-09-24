import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('.', import.meta.url)
const chrome = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const port = 9237
const profile = await mkdtemp(join(tmpdir(), 'calmy-popup-'))
const url = 'http://127.0.0.1:4175/.impeccable/prototypes/calmy-tactile-ui/index.html?design=nav-v2'
const browser = spawn(chrome, [
  '--headless', '--disable-gpu', '--disable-software-rasterizer', '--disable-dev-shm-usage', '--no-sandbox', '--no-first-run', '--hide-scrollbars',
  '--force-device-scale-factor=1', '--window-size=1600,1024',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, url,
], { windowsHide: true, stdio: 'ignore' })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

let target
for (let i = 0; i < 80 && !target; i += 1) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`)
    target = (await response.json()).find(item => item.type === 'page')
  } catch { /* Browser is starting. */ }
  if (!target) await wait(250)
}
if (!target) throw new Error('Edge did not open the prototype')

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
  return result.result.value
}
async function capture(name) {
  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true })
  await writeFile(new URL(name, root), Buffer.from(screenshot.data, 'base64'))
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1024, deviceScaleFactor: 1, mobile: false })
  for (let i = 0; i < 40; i += 1) {
    if (await evaluate('!!document.querySelector("[data-group=work] .concept-group-button")')) break
    await wait(150)
  }
  await evaluate('document.querySelector("[data-group=work] .concept-group-button").click()')
  await wait(150)
  const popup = await evaluate(`(() => {
    const element = document.querySelector('[data-group=work] .concept-subnav')
    const rect = element.getBoundingClientRect()
    return { open: element.classList.contains('open'), rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }, frame: document.querySelector('.app-frame').getBoundingClientRect().toJSON() }
  })()`)
  if (!popup.open || popup.rect.right > popup.frame.right || popup.rect.bottom > popup.frame.bottom) throw new Error(`Popup is clipped: ${JSON.stringify(popup)}`)
  await capture('nav-v2-popup-open.png')

  const selected = await evaluate(`(() => {
    const page = [...document.querySelectorAll('[data-group=work] .concept-child')].find(item => item.textContent.includes('任务'))
    page.click()
    return { current: page.getAttribute('aria-current'), open: document.querySelector('[data-group=work] .concept-subnav').classList.contains('open'), group: document.querySelector('[data-group=work]').classList.contains('selected') }
  })()`)
  if (selected.current !== 'page' || selected.open || !selected.group) throw new Error(`Selection did not close popup: ${JSON.stringify(selected)}`)
  await wait(250)
  await capture('nav-v2-popup-selected.png')
  process.stdout.write(JSON.stringify({ popup, selected }) + '\n')
} finally {
  try { await send('Browser.close') } catch { browser.kill() }
  socket.close()
}
