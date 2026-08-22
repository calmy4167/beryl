import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import net from 'node:net'

const root = fileURLToPath(new URL('..', import.meta.url))
const viteScript = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
]
const browser = browserCandidates.find(existsSync)

if (!browser) {
  console.log('UI browser smoke skipped: Chrome/Chromium not found')
  process.exit(0)
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (!address || typeof address === 'string') {
        probe.close()
        reject(new Error('free-port-resolution-failed'))
        return
      }
      const port = address.port
      probe.close(error => error ? reject(error) : resolve(port))
    })
  })
}

function tail(value, limit = 1200) {
  return value.length > limit ? value.slice(-limit) : value
}

function spawnWithLogs(command, args, options) {
  const child = spawn(command, args, options)
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', chunk => { stdout += String(chunk) })
  child.stderr?.on('data', chunk => { stderr += String(chunk) })
  return { child, logs: () => ({ stdout: tail(stdout), stderr: tail(stderr) }) }
}

async function waitForServer(url, logs, timeoutMs = 20000) {
  const started = Date.now()
  while (Date.now() - started <= timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch { /* Vite is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`vite-server-timeout url=${url} logs=${JSON.stringify(logs())}`)
}

async function waitForTarget(debugPort, timeoutMs = 20000) {
  const started = Date.now()
  while (Date.now() - started <= timeoutMs) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
      const page = targets.find(target => target.type === 'page' && target.url.includes('/test/ui-runtime.html'))
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch { /* Chrome is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`chrome-debug-target-timeout port=${debugPort}`)
}

function connectCdp(url) {
  const socket = new WebSocket(url)
  let nextId = 0
  const pending = new Map()
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    clearTimeout(request.timer)
    if (message.error) request.reject(new Error(JSON.stringify(message.error)))
    else request.resolve(message.result)
  })
  socket.addEventListener('close', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer)
      request.reject(new Error('cdp-socket-closed'))
    }
    pending.clear()
  })

  function call(method, params = {}, timeoutMs = 15000) {
    const id = ++nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`cdp-timeout method=${method}`))
      }, timeoutMs)
      pending.set(id, { resolve, reject, timer })
      try {
        socket.send(JSON.stringify({ id, method, params }))
      } catch (error) {
        clearTimeout(timer)
        pending.delete(id)
        reject(error)
      }
    })
  }

  return { socket, opened, call }
}

function isNavigationRace(error) {
  return error instanceof Error && /Execution context was destroyed|Cannot find context|Inspected target navigated|Target closed|cdp-socket-closed/i.test(error.message)
}

async function evaluateStable(cdp, expression, attempts = 40) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const evaluation = await cdp.call('Runtime.evaluate', {
        awaitPromise: true,
        returnByValue: true,
        expression
      })
      if (evaluation?.exceptionDetails) {
        const description = evaluation.exceptionDetails.exception?.description || evaluation.exceptionDetails.text || 'runtime-exception'
        throw new Error(description)
      }
      return evaluation?.result?.value
    } catch (error) {
      lastError = error
      if (!isNavigationRace(error) || attempt === attempts - 1) throw error
      await new Promise(resolve => setTimeout(resolve, 150))
    }
  }
  throw new Error(`execution-context-retry-exhausted: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function waitForCondition(cdp, label, expression, timeoutMs = 20000) {
  const started = Date.now()
  let lastValue
  while (Date.now() - started <= timeoutMs) {
    try {
      lastValue = await evaluateStable(cdp, expression)
      if (lastValue?.ok) return lastValue
    } catch (error) {
      if (!isNavigationRace(error)) throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`)
      lastValue = { ok: false, race: error instanceof Error ? error.message : String(error) }
    }
    await new Promise(resolve => setTimeout(resolve, 150))
  }

  let diagnostic = lastValue
  try {
    diagnostic = await evaluateStable(cdp, `(() => ({
      href: location.href,
      title: document.title,
      seedStatus: document.querySelector('#result')?.textContent || null,
      body: (document.body?.innerText || '').slice(0, 500)
    }))()`)
  } catch (error) {
    diagnostic = { diagnosticError: error instanceof Error ? error.message : String(error) }
  }
  throw new Error(`${label}-timeout diagnostic=${JSON.stringify(diagnostic)}`)
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return
  const closed = new Promise(resolve => child.once('close', resolve))
  child.kill()
  await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 2500))])
}

async function run() {
  const [serverPort, debugPort] = await Promise.all([getFreePort(), getFreePort()])
  const baseUrl = `http://127.0.0.1:${serverPort}`
  const testUrl = `${baseUrl}/test/ui-runtime.html`
  const profile = mkdtempSync(join(tmpdir(), 'beryl-ui-runtime-'))
  const vite = spawnWithLogs(process.execPath, [viteScript, '--host', '127.0.0.1', '--port', String(serverPort)], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let chrome
  let cdp

  try {
    await waitForServer(testUrl, vite.logs)
    chrome = spawnWithLogs(browser, [
      '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox',
      '--disable-background-networking', '--disable-component-update', '--disable-default-apps',
      '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      testUrl
    ], { stdio: ['ignore', 'pipe', 'pipe'] })

    const target = await waitForTarget(debugPort)
    cdp = connectCdp(target)
    await cdp.opened
    await cdp.call('Page.enable')
    await cdp.call('Runtime.enable')
    await cdp.call('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        window.__uiSmokeExternalAttempts = [];
        const nativeFetch = window.fetch.bind(window);
        window.fetch = (input, init) => {
          const url = typeof input === 'string' ? input : input?.url || '';
          try {
            const parsed = new URL(url, location.href);
            if (parsed.origin !== location.origin && /^https?:$/.test(parsed.protocol)) {
              window.__uiSmokeExternalAttempts.push(parsed.href);
              return Promise.reject(new Error('ui-smoke-external-network-blocked'));
            }
          } catch { /* Let native fetch report malformed URLs. */ }
          return nativeFetch(input, init);
        };
      })();`
    })

    // Re-run the fixture page after installing the network guard. This also
    // makes the first app navigation deterministic if the module raced ahead.
    await cdp.call('Page.reload', { ignoreCache: true })

    const home = await waitForCondition(cdp, 'today-mount', `(() => {
      return {
        ok: location.hash.includes('/app/today') && !!document.querySelector('.app-shell') && !!document.querySelector('.today-page'),
        route: location.hash,
      };
    })()`)

    await evaluateStable(cdp, `(() => {
      const input = document.querySelector('.create-row input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'UI smoke synthetic task');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.create-row button')?.click();
      return true;
    })()`)
    const seeded = await waitForCondition(cdp, 'today-action-write', `(() => ({
      ok: [...document.querySelectorAll('.action-card')].some(node => node.textContent?.includes('UI smoke synthetic task'))
    }))()`)

    await evaluateStable(cdp, `(() => { location.hash = '#/app/today'; return true })()`)
    const today = await waitForCondition(cdp, 'today-route', `(() => ({
      ok: location.hash.includes('/app/today') && !!document.querySelector('.today-page') && document.body.innerText.includes('今天先定向'),
      route: location.hash
    }))()`)

    await evaluateStable(cdp, `(() => { location.hash = '#/app/home'; return true })()`)
    await waitForCondition(cdp, 'home-compatibility-redirect', `(() => ({
      ok: location.hash.includes('/app/today') && !!document.querySelector('.today-page')
    }))()`)

    await cdp.call('Page.reload', { ignoreCache: true })
    const refreshed = await waitForCondition(cdp, 'refresh-recovery', `(() => ({
      ok: location.hash.includes('/app/today') && !!document.querySelector('.app-shell') &&
        [...document.querySelectorAll('.action-card')].some(node => node.textContent?.includes('UI smoke synthetic task')),
      route: location.hash,
      persistedTask: localStorage.getItem('b_mvpActions')?.includes('UI smoke synthetic task') || false,
      externalAttempts: window.__uiSmokeExternalAttempts?.length || 0
    }))()`)

    const report = {
      ok: true,
      checks: {
        appMounted: home.ok,
        todayDefaultViewVisible: home.ok,
        syntheticLocalDataVisible: seeded.ok,
        todayRouteViewVisible: today.ok,
        refreshRestoredLocalData: refreshed.ok && refreshed.persistedTask
      },
      route: refreshed.route,
      externalNetworkAttemptsBlocked: refreshed.externalAttempts,
      note: 'External fetch is blocked in-page; the app must use its offline fallback.'
    }
    console.log('UI browser smoke passed:', JSON.stringify(report))
  } catch (error) {
    const chromeLogs = chrome?.logs?.() || {}
    const message = error instanceof Error ? error.stack || error.message : String(error)
    throw new Error(`${message}\nchrome=${JSON.stringify(chromeLogs)}`)
  } finally {
    try { await cdp?.call('Browser.close') } catch { /* Browser may already be closed. */ }
    cdp?.socket.close()
    await stopProcess(chrome?.child)
    await stopProcess(vite.child)
    rmSync(profile, { recursive: true, force: true })
  }
}

try {
  await run()
} catch (error) {
  console.error(`UI browser smoke failed: ${error instanceof Error ? error.stack || error.message : String(error)}`)
  process.exitCode = 1
}
