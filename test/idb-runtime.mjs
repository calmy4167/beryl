import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const root = new URL('..', import.meta.url).pathname.replace(/^\//, '').replaceAll('/', '\\')
const viteScript = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
]
const browser = browserCandidates.find(existsSync)
const debugPort = 9225
const testUrl = 'http://127.0.0.1:4179/test/idb-runtime.html'

if (!browser) {
  console.log('IndexedDB browser runtime skipped: Chrome/Chromium not found')
  process.exit(0)
}

function waitForServer(url, timeoutMs = 15000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const probe = async () => {
      try {
        const response = await fetch(url)
        if (response.ok) return resolve()
      } catch { /* vite is still starting */ }
      if (Date.now() - started > timeoutMs) return reject(new Error('vite-server-timeout'))
      setTimeout(probe, 100)
    }
    probe()
  })
}

async function waitForTarget(timeoutMs = 15000) {
  const started = Date.now()
  while (Date.now() - started <= timeoutMs) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
      const page = targets.find(target => target.type === 'page' && target.url.includes('/test/idb-runtime.html'))
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch { /* browser is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('chrome-debug-target-timeout')
}

function connectCdp(url) {
  const socket = new WebSocket(url)
  let nextId = 0
  const pending = new Map()
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(JSON.stringify(message.error)))
    else request.resolve(message.result)
  })
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  const call = (method, params = {}) => {
    const id = ++nextId
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }
  return { socket, opened, call }
}

async function evaluateWhenStable(cdp, params, attempts = 20) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await cdp.call('Runtime.evaluate', params)
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Execution context was destroyed') || attempt === attempts - 1) throw error
      await new Promise(resolve => setTimeout(resolve, 150))
    }
  }
  throw new Error('browser-evaluation-retry-exhausted')
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return
  const closed = new Promise(resolve => child.once('close', resolve))
  child.kill()
  await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 2000))])
}

const profile = mkdtempSync(join(tmpdir(), 'beryl-idb-runtime-'))
const server = spawn(process.execPath, [viteScript, '--host', '127.0.0.1', '--port', '4179'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe']
})
let chrome
let cdp

try {
  await waitForServer(testUrl)
  chrome = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    testUrl
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  const target = await waitForTarget()
  cdp = connectCdp(target)
  await cdp.opened
  await cdp.call('Page.enable')
  const evaluation = await evaluateWhenStable(cdp, {
    awaitPromise: true,
    returnByValue: true,
    expression: `new Promise(resolve => {
      const started = Date.now()
      const poll = () => {
        const value = document.querySelector('#result')?.textContent || ''
        if (value && value !== 'pending') return resolve(value)
        if (Date.now() - started > 15000) return resolve(JSON.stringify({ ok: false, error: 'browser-test-timeout:' + value }))
        setTimeout(poll, 100)
      }
      poll()
    })`
  })
  const reportText = evaluation?.result?.value
  if (typeof reportText !== 'string') throw new Error(`browser-result-missing:${JSON.stringify(evaluation)}`)
  const report = JSON.parse(reportText)
  if (!report.ok) throw new Error(`IndexedDB runtime checks failed: ${JSON.stringify(report)}`)
  console.log('IndexedDB browser runtime passed:', JSON.stringify(report.checks))
} finally {
  try { await cdp?.call('Browser.close') } catch { /* browser may already be closed */ }
  cdp?.socket.close()
  await stopProcess(chrome)
  await stopProcess(server)
  rmSync(profile, { recursive: true, force: true })
}
