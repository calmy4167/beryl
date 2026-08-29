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

const thresholds = {
  navigationDurationMs: 12000,
  domContentLoadedMs: 10000,
  loadEventEndMs: 15000,
  appFirstRenderMs: 12000,
  routeTransitionMs: 5000,
  externalNetworkAllowedRequests: 0
}

if (!browser) {
  console.log('Browser performance baseline skipped: Chrome/Chromium not found')
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

function tail(value, limit = 1800) {
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

async function waitForTarget(debugPort, expectedUrl, timeoutMs = 20000) {
  const started = Date.now()
  while (Date.now() - started <= timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
      const targets = await response.json()
      const page = targets.find(target => target.type === 'page' && target.url === expectedUrl)
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch { /* Chrome is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`chrome-debug-target-timeout port=${debugPort} expected=${expectedUrl}`)
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

async function evaluateStable(cdp, expression, attempts = 50) {
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
      await new Promise(resolve => setTimeout(resolve, 120))
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
    await new Promise(resolve => setTimeout(resolve, 120))
  }

  let diagnostic
  try {
    diagnostic = await evaluateStable(cdp, `(() => ({
      href: location.href,
      readyState: document.readyState,
      title: document.title,
      body: (document.body?.innerText || '').slice(0, 800),
      appShell: !!document.querySelector('.app-shell'),
      externalNetworkAttempts: window.__perfHarnessExternalNetworkAttempts || []
    }))()`)
  } catch (error) {
    diagnostic = { diagnosticError: error instanceof Error ? error.message : String(error) }
  }
  throw new Error(`${label}-timeout diagnostic=${JSON.stringify(diagnostic)} last=${JSON.stringify(lastValue)}`)
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return
  const closed = new Promise(resolve => child.once('close', resolve))
  child.kill()
  await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 2500))])
}

async function measureRoute(cdp, route, readyExpression, label) {
  await evaluateStable(cdp, `(() => {
    window.__perfHarnessRouteReadyAt = 0
    window.__perfHarnessRouteStart = performance.now()
    performance.mark(${JSON.stringify(`${label}-start`)})
    location.hash = ${JSON.stringify(`#${route}`)}
    return true
  })()`)

  const ready = await waitForCondition(cdp, `${label}-render`, `(() => {
    const routeReady = ${readyExpression}
    if (!routeReady) return { ok: false, route: location.hash }
    if (!window.__perfHarnessRouteReadyAt) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.__perfHarnessRouteReadyAt = performance.now()
      }))
      return { ok: false, route: location.hash, waitingForFrames: true }
    }
    return {
      ok: true,
      route: location.hash,
      readyAt: window.__perfHarnessRouteReadyAt,
      duration: window.__perfHarnessRouteReadyAt - window.__perfHarnessRouteStart
    }
  })()`)

  await evaluateStable(cdp, `performance.mark(${JSON.stringify(`${label}-end`)})`)
  return {
    route,
    durationMs: Number(ready.duration.toFixed(2)),
    readyAtMs: Number(ready.readyAt.toFixed(2))
  }
}

async function run() {
  const [serverPort, debugPort] = await Promise.all([getFreePort(), getFreePort()])
  const baseUrl = `http://127.0.0.1:${serverPort}`
  const fixtureUrl = `${baseUrl}/test/performance-runtime.html`
  const appUrl = `${baseUrl}/#/app/today`
  const profile = mkdtempSync(join(tmpdir(), 'beryl-performance-runtime-'))
  const vite = spawnWithLogs(process.execPath, [viteScript, '--host', '127.0.0.1', '--port', String(serverPort)], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let chrome
  let cdp

  try {
    await waitForServer(fixtureUrl, vite.logs)
    chrome = spawnWithLogs(browser, [
      '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox',
      '--disable-background-networking', '--disable-component-update', '--disable-default-apps',
      '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      fixtureUrl
    ], { stdio: ['ignore', 'pipe', 'pipe'] })

    const fixtureTarget = await waitForTarget(debugPort, fixtureUrl)
    cdp = connectCdp(fixtureTarget)
    await cdp.opened
    await cdp.call('Page.enable')
    await cdp.call('Runtime.enable')
    await cdp.call('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        performance.mark('perf-harness-document-start')
        window.__perfHarnessDocumentStart = performance.now()
        window.__perfHarnessExternalNetworkAttempts = []
        window.__perfHarnessExternalNetworkAllowed = 0
        const originalFetch = window.fetch.bind(window)
        window.fetch = (input, init) => {
          const value = typeof input === 'string' ? input : input?.url || ''
          try {
            const url = new URL(value, location.href)
            if (url.origin !== location.origin && /^https?:$/.test(url.protocol)) {
              window.__perfHarnessExternalNetworkAttempts.push(url.href)
              return Promise.reject(new Error('performance-baseline-external-network-blocked'))
            }
          } catch { /* Preserve native handling for malformed requests. */ }
          return originalFetch(input, init)
        }
        const originalOpen = XMLHttpRequest.prototype.open
        XMLHttpRequest.prototype.open = function(method, value, ...rest) {
          try {
            const url = new URL(value, location.href)
            if (url.origin !== location.origin && /^https?:$/.test(url.protocol)) {
              window.__perfHarnessExternalNetworkAttempts.push(url.href)
              throw new Error('performance-baseline-external-xhr-blocked')
            }
          } catch (error) {
            if (error?.message === 'performance-baseline-external-xhr-blocked') throw error
          }
          return originalOpen.call(this, method, value, ...rest)
        }
        const originalBeacon = navigator.sendBeacon?.bind(navigator)
        if (originalBeacon) {
          navigator.sendBeacon = (value, data) => {
            try {
              const url = new URL(value, location.href)
              if (url.origin !== location.origin && /^https?:$/.test(url.protocol)) {
                window.__perfHarnessExternalNetworkAttempts.push(url.href)
                return false
              }
            } catch { /* Preserve native handling for malformed requests. */ }
            return originalBeacon(value, data)
          }
        }
      })();`
    })

    await cdp.call('Page.reload', { ignoreCache: true })
    await waitForCondition(cdp, 'performance-fixture', `(() => ({
      ok: window.__performanceFixtureReady?.ok === true,
      fixture: window.__performanceFixtureReady || null
    }))()`)

    await cdp.call('Page.navigate', { url: appUrl })
    const home = await waitForCondition(cdp, 'app-today-first-render', `(() => {
      const ready = location.hash.includes('/app/today') &&
        !!document.querySelector('.app-shell') &&
        !!document.querySelector('.today-page')
      if (!ready) return { ok: false, route: location.hash }
      if (!window.__perfHarnessAppReadyAt) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          window.__perfHarnessAppReadyAt = performance.now()
        }))
        return { ok: false, route: location.hash, waitingForFrames: true }
      }
      return {
        ok: true,
        route: location.hash,
        appReadyAt: window.__perfHarnessAppReadyAt,
        documentStart: window.__perfHarnessDocumentStart
      }
    })()`)

    await waitForCondition(cdp, 'document-load', `(() => {
      const entry = performance.getEntriesByType('navigation')[0]
      return {
        ok: document.readyState === 'complete' && !!entry && entry.loadEventEnd > 0,
        readyState: document.readyState,
        loadEventEnd: entry?.loadEventEnd || 0
      }
    })()`)

    const navigation = await evaluateStable(cdp, `(() => {
      const entry = performance.getEntriesByType('navigation')[0]
      return entry ? {
        type: entry.type,
        startTime: entry.startTime,
        responseEnd: entry.responseEnd,
        domContentLoaded: entry.domContentLoadedEventEnd,
        loadEventEnd: entry.loadEventEnd,
        duration: entry.duration,
        transferSize: entry.transferSize,
        decodedBodySize: entry.decodedBodySize
      } : null
    })()`)
    if (!navigation) throw new Error('navigation-timing-entry-missing')

    const initialRender = {
      durationMs: Number((home.appReadyAt - home.documentStart).toFixed(2)),
      route: home.route
    }
    const routes = []
    routes.push(await measureRoute(cdp, '/app/today',
      `location.hash.includes('/app/today') && !!document.querySelector('.today-page')`,
      'route-home-to-today'))
    routes.push(await measureRoute(cdp, '/app/capture',
      `location.hash.includes('/app/capture') && !!document.querySelector('.capture-gate-page')`,
      'route-today-to-capture'))

    const externalNetworkAttempts = await evaluateStable(cdp, `window.__perfHarnessExternalNetworkAttempts || []`)
    const externalNetworkAllowedRequests = await evaluateStable(cdp, `window.__perfHarnessExternalNetworkAllowed || 0`)
    const metrics = {
      ok: true,
      environment: {
        browser,
        node: process.version,
        serverPort,
        debugPort,
        externalNetwork: 'blocked by in-page fetch/XHR guard; browser background networking disabled'
      },
      thresholds,
      navigation,
      initialRender,
      routes,
      externalNetworkAttempts,
      externalNetworkAllowedRequests
    }

    const violations = [
      ['navigationDurationMs', navigation.duration],
      ['domContentLoadedMs', navigation.domContentLoadedEventEnd],
      ['loadEventEndMs', navigation.loadEventEnd],
      ['appFirstRenderMs', initialRender.durationMs],
      ...routes.map(route => ['routeTransitionMs', route.durationMs]),
      ['externalNetworkAllowedRequests', externalNetworkAllowedRequests]
    ].filter(([metric, value]) => value > thresholds[metric])
    if (violations.length) {
      throw new Error(`performance-threshold-violations=${JSON.stringify(violations)} metrics=${JSON.stringify(metrics)}`)
    }

    console.log(`Browser performance baseline passed: ${JSON.stringify(metrics)}`)
  } catch (error) {
    const diagnostics = await (async () => {
      try {
        return await evaluateStable(cdp, `(() => ({
          href: location.href,
          readyState: document.readyState,
          route: location.hash,
          title: document.title,
          body: (document.body?.innerText || '').slice(0, 800),
          externalNetworkAttempts: window.__perfHarnessExternalNetworkAttempts || []
        }))()`)
      } catch (diagnosticError) {
        return { diagnosticError: diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError) }
      }
    })()
    const message = error instanceof Error ? error.stack || error.message : String(error)
    throw new Error(`${message}\ndiagnostics=${JSON.stringify(diagnostics)}\nchrome=${JSON.stringify(chrome?.logs?.() || {})}\nvite=${JSON.stringify(vite.logs())}`)
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
  console.error(`Browser performance baseline failed: ${error instanceof Error ? error.stack || error.message : String(error)}`)
  process.exitCode = 1
}
