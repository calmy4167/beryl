import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const [outputPath, widthArg = '1440', heightArg = '1000', portArg = '9223', routeArg = '/app/today', interactionArg = 'capture'] = process.argv.slice(2)
if (!outputPath) throw new Error('Usage: capture-cdp.mjs <output> [width] [height] [port] [route] [capture|resize-check|sidebar-collapse-check|directory-check]')

const width = Number(widthArg)
const height = Number(heightArg)
const port = Number(portArg)
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const profile = join(tmpdir(), `calmy-cdp-${port}-${Date.now()}`)
const bootstrapUrl = `http://127.0.0.1:4175/.impeccable/baseline/current.html?route=${encodeURIComponent(routeArg)}`

await mkdir(dirname(outputPath), { recursive: true })

const child = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  `--window-size=${width},${height}`,
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  bootstrapUrl,
], { windowsHide: true, stdio: 'ignore' })

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

async function readPageTarget() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`)
  const targets = await response.json()
  return targets.find(target => target.type === 'page')
}

let target
for (let attempt = 0; attempt < 80 && !target; attempt += 1) {
  try { target = await readPageTarget() } catch { /* browser still starting */ }
  if (!target) await wait(250)
}
if (!target) throw new Error('Chrome DevTools target did not become available')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let requestId = 0
const pending = new Map()
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (!message.id || !pending.has(message.id)) return
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

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  })

  let state = ''
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await send('Runtime.evaluate', {
      expression: `(() => { const route = ${JSON.stringify(routeArg)}; const standaloneSelector = route === '/scene' ? '.scene-page' : route === '/login' ? '.login-wrap' : route === '/pass' ? '.simple-page' : ''; return JSON.stringify({ text: document.body?.innerText || '', route, pageId: document.querySelector('.page-container')?.dataset.pageId || route.slice(1), ready: !!(standaloneSelector ? document.querySelector(standaloneSelector) : document.querySelector('.page-container > *')) && !(document.body?.innerText || '').includes('正在加载') }) })()`,
      returnByValue: true,
    })
    state = result.result?.value || ''
    if (state.includes('"ready":true') && !state.includes('正在恢复本机数据')) break
    await wait(250)
  }

  if (!state.includes('"ready":true') || state.includes('正在恢复本机数据')) {
    throw new Error(`Route ${routeArg} did not become ready: ${state.slice(0, 240)}`)
  }

  let resizeState
  if (interactionArg === 'directory-check') {
    const result = await send('Runtime.evaluate', {
      expression: `(() => { const trigger = document.querySelector(window.innerWidth <= 900 ? '.mobile-header .menu' : '.feature-group-button'); trigger?.click(); return !!trigger })()`,
      returnByValue: true,
    })
    if (!result.result?.value) throw new Error('Feature directory trigger was not found')
    await wait(350)
    const directoryResult = await send('Runtime.evaluate', {
      expression: `(() => { const panel = document.querySelector('#more-drawer'); const rect = panel?.getBoundingClientRect(); return JSON.stringify({ presentation: panel?.dataset.presentation, role: panel?.getAttribute('role'), open: panel?.classList.contains('is-open'), left: rect?.left, top: rect?.top, right: rect?.right, bottom: rect?.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight }) })()`,
      returnByValue: true,
    })
    const directory = JSON.parse(directoryResult.result?.value || '{}')
    const expectedPresentation = width <= 900 ? 'drawer' : 'popover'
    if (!directory.open || directory.presentation !== expectedPresentation || directory.left < 0 || directory.top < 0 || directory.right > directory.viewportWidth + 1 || directory.bottom > directory.viewportHeight + 1) {
      throw new Error(`Feature directory interaction failed: ${JSON.stringify(directory)}`)
    }
  }

  if (interactionArg === 'sidebar-collapse-check') {
    const result = await send('Runtime.evaluate', {
      expression: `(() => { const selected = document.querySelector('.navigation-group-rail button.on'); selected?.click(); return !!selected })()`,
      returnByValue: true,
    })
    if (!result.result?.value) throw new Error('Selected primary navigation group was not found')
    await wait(500)
    const collapsed = await send('Runtime.evaluate', {
      expression: `document.querySelector('.app-shell')?.getAttribute('data-sidebar-state')`,
      returnByValue: true,
    })
    if (collapsed.result?.value !== 'collapsed') throw new Error('Primary navigation group did not collapse the secondary sidebar')
    const expanded = await send('Runtime.evaluate', {
      expression: `(() => { const next = [...document.querySelectorAll('.navigation-group-rail button')].find(button => !button.classList.contains('on')); next?.click(); return next?.dataset.groupId || '' })()`,
      returnByValue: true,
    })
    await wait(500)
    const expandedState = await send('Runtime.evaluate', {
      expression: `JSON.stringify({ state: document.querySelector('.app-shell')?.getAttribute('data-sidebar-state'), selected: document.querySelector('.sidebar')?.getAttribute('data-selected-group'), expanded: document.querySelector('.navigation-group-rail button.on')?.getAttribute('aria-expanded') })`,
      returnByValue: true,
    })
    const parsed = JSON.parse(expandedState.result?.value || '{}')
    if (!expanded.result?.value || parsed.state !== 'expanded' || parsed.selected !== expanded.result.value || parsed.expanded !== 'true') {
      throw new Error(`Primary navigation group did not expand the secondary sidebar: ${expandedState.result?.value}`)
    }
  }

  if (interactionArg === 'resize-check') {
    await send('Runtime.evaluate', {
      expression: `localStorage.setItem('calmy_right_sidebar_collapsed', '0'); location.reload(); true`,
      returnByValue: true,
    })
    await wait(900)
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const ready = await send('Runtime.evaluate', {
        expression: `!!document.querySelector('[role="separator"][aria-label="调整主导航宽度"]') && !!document.querySelector('[role="separator"][aria-label="调整情境栏宽度"]')`,
        returnByValue: true,
      })
      if (ready.result?.value) break
      await wait(250)
    }

    async function dragSeparator(label, delta) {
      const rect = await send('Runtime.evaluate', {
        expression: `(() => { const r = document.querySelector('[role="separator"][aria-label="${label}"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`,
        returnByValue: true,
      })
      const { x, y } = rect.result.value
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + delta, y, button: 'left', buttons: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + delta, y, button: 'left', clickCount: 1 })
    }

    await dragSeparator('调整主导航宽度', 28)
    await dragSeparator('调整情境栏宽度', -32)
    await wait(250)
    const result = await send('Runtime.evaluate', {
      expression: `JSON.stringify({ sidebar: localStorage.getItem('calmy_sidebar_width'), context: localStorage.getItem('calmy_context_width'), sidebarCss: document.querySelector('.app-shell')?.style.getPropertyValue('--t-sidebar-width'), contextCss: document.querySelector('.app-shell')?.style.getPropertyValue('--t-context-width') })`,
      returnByValue: true,
    })
    resizeState = result.result?.value
    const parsed = JSON.parse(resizeState || '{}')
    if (parsed.sidebar !== '260' || parsed.context !== '388') throw new Error(`Resize interaction failed: ${resizeState}`)
  }

  await wait(600)
  const layoutResult = await send('Runtime.evaluate', {
    expression: `JSON.stringify({ viewport: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })`,
    returnByValue: true,
  })
  const layoutState = layoutResult.result?.value || '{}'
  const layout = JSON.parse(layoutState)
  if (width < 600 && layout.scrollWidth > layout.clientWidth + 1) {
    throw new Error(`Mobile viewport overflow on ${routeArg}: ${layoutState}`)
  }
  const screenshot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true,
  })
  await writeFile(outputPath, Buffer.from(screenshot.data, 'base64'))
  process.stdout.write(`${state}\n${resizeState ? `${resizeState}\n` : ''}${layoutState}\n`)
} finally {
  try { await send('Browser.close') } catch { child.kill() }
  socket.close()
}
