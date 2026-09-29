import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import net from 'node:net'

const root = fileURLToPath(new URL('..', import.meta.url))
const viteScript = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const browser = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].find(existsSync)
if (!browser) {
  console.log('Production browser smoke skipped: Chrome/Chromium not found')
  process.exit(0)
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') return reject(new Error('port-not-resolved'))
      const port = address.port
      server.close(error => error ? reject(error) : resolve(port))
    })
  })
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(check, label, timeoutMs = 20000) {
  const started = Date.now()
  let last
  while (Date.now() - started < timeoutMs) {
    try { last = await check(); if (last) return last } catch { /* service is starting */ }
    await sleep(100)
  }
  throw new Error(`${label}-timeout ${JSON.stringify(last)}`)
}

const serverPort = await freePort()
const debugPort = await freePort()
const baseUrl = `http://127.0.0.1:${serverPort}`
const profile = mkdtempSync(join(tmpdir(), 'calmy-vue-production-'))
const preview = spawn(process.execPath, [viteScript, 'preview', '--host', '127.0.0.1', '--port', String(serverPort), '--strictPort'], { cwd: root, stdio: 'ignore' })
let chrome
let socket
let nextId = 0
const pending = new Map()
const mountSnapshots = []

try {
  await waitFor(async () => (await fetch(baseUrl)).ok, 'vite-preview')
  chrome = spawn(browser, [
    '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox',
    '--disable-background-networking', '--disable-component-update', '--disable-default-apps',
    '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore' })
  const target = await waitFor(async () => {
    const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
    return pages.find(page => page.type === 'page' && page.url === 'about:blank')
  }, 'chrome-target')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    const callback = pending.get(message.id)
    if (callback) { pending.delete(message.id); callback(message) }
  })
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, message => message.error ? reject(new Error(message.error.message)) : resolve(message.result))
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result?.value
  }
  await call('Page.enable')
  await call('Runtime.enable')
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      localStorage.clear()
      const auth = { u: 'ui-smoke', salt: '00'.repeat(16), hash: '00'.repeat(32), iter: 1 }
      localStorage.setItem('b_auth', JSON.stringify(auth))
      localStorage.setItem('b_session', JSON.stringify({ u: auth.u, ts: Date.now() }))
      localStorage.setItem('b_scene', JSON.stringify('personal'))
    })()`
  })
  await call('Page.navigate', { url: `${baseUrl}/#/app/today` })
  await waitFor(async () => {
    const snapshot = await evaluate(`(() => ({
      mounted: !!document.querySelector('.app-shell .today-page'),
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      root: document.querySelector('#app')?.innerHTML.slice(0, 600) || '',
      bodyText: (document.body?.innerText || '').slice(0, 400)
    }))()`)
    mountSnapshots.push(snapshot)
    return snapshot.mounted ? snapshot : false
  }, 'vue-production-mount')
  const entry = await fetch(baseUrl).then(response => response.text())
  if (!entry.includes('/assets/index-') || /react-preview\.html|src\/react\//i.test(entry)) throw new Error('production-html-entry-is-not-vue-build')
  await evaluate(`(() => { location.hash = '#/app/module/tasks'; return true })()`)
  await waitFor(async () => evaluate(`(() => location.hash.includes('/app/module/tasks') && !!document.querySelector('.tasks-page'))()`), 'vue-production-route')
  const report = await evaluate(`(() => ({
    title: document.title,
    page: document.querySelector('.page-container')?.getAttribute('data-page-id') || null,
    route: location.hash,
    vueAppMounted: !!document.querySelector('#app')?.__vue_app__,
    legacyEntryScripts: [...document.scripts].map(script => script.src).filter(src => /react-preview\\.html|src\\/react\\//i.test(src))
  }))()`)
  if (report.page !== 'tasks' || !report.vueAppMounted || report.legacyEntryScripts.length) throw new Error(`production-vue-check-failed ${JSON.stringify(report)}`)
  console.log('Vue production preview smoke passed:', JSON.stringify(report))
} catch (error) {
  const runtimeState = mountSnapshots.at(-1) || null
  console.error('Vue production preview smoke failed:', error instanceof Error ? error.stack || error.message : String(error), runtimeState ? JSON.stringify(runtimeState) : '')
  process.exitCode = 1
} finally {
  try { if (socket?.readyState === WebSocket.OPEN) await new Promise(resolve => { socket.addEventListener('close', resolve, { once: true }); socket.close() }) } catch { /* Browser may have exited */ }
  for (const child of [chrome, preview]) {
    if (child && child.exitCode === null) {
      child.kill()
      await Promise.race([new Promise(resolve => child.once('close', resolve)), sleep(2500)])
    }
  }
  rmSync(profile, { recursive: true, force: true })
}
