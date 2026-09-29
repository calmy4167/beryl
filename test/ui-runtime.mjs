import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
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

async function waitForTarget(debugPort, expectedUrl = 'about:blank', timeoutMs = 20000) {
  const started = Date.now()
  while (Date.now() - started <= timeoutMs) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
      const page = targets.find(target => target.type === 'page' && target.url === expectedUrl)
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
  const events = []
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    const requestUrl = message.params?.request?.url || message.params?.response?.url || ''
    const relevantNetworkEvent = message.method?.startsWith('Network.') && /ui-runtime|src\/react\/main|@vite\/client/.test(requestUrl)
    if (!message.id && (['Runtime.exceptionThrown', 'Runtime.consoleAPICalled', 'Log.entryAdded', 'Network.loadingFailed', 'Page.frameNavigated'].includes(message.method) || relevantNetworkEvent)) events.push(message)
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

  return { socket, opened, call, events }
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
      sidebarState: localStorage.getItem('calmy_sidebar_collapsed'),
      sidebarClass: document.querySelector('.app-shell')?.className || null,
      activeElement: document.activeElement ? { tag: document.activeElement.tagName, ariaLabel: document.activeElement.getAttribute('aria-label'), className: document.activeElement.className || null } : null,
      moreTrigger: document.querySelector('.mobile-header .menu[aria-controls="more-drawer"]') ? { expanded: document.querySelector('.mobile-header .menu[aria-controls="more-drawer"]')?.getAttribute('aria-expanded'), sameAsActive: document.activeElement === document.querySelector('.mobile-header .menu[aria-controls="more-drawer"]'), connected: document.querySelector('.mobile-header .menu[aria-controls="more-drawer"]')?.isConnected } : null,
      drawer: document.querySelector('#more-drawer') ? { ariaHidden: document.querySelector('#more-drawer')?.getAttribute('aria-hidden'), className: document.querySelector('#more-drawer')?.className, visibility: getComputedStyle(document.querySelector('#more-drawer')).visibility } : null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      readyState: document.readyState,
      appMarkup: document.querySelector('#app')?.innerHTML.slice(0, 500) || null,
      scripts: Array.from(document.scripts).map(script => ({ src: script.src, type: script.type })),
      body: (document.body?.innerText || '').slice(0, 500)
    }))()`)
  } catch (error) {
    diagnostic = { diagnosticError: error instanceof Error ? error.message : String(error) }
  }
  throw new Error(`${label}-timeout last=${JSON.stringify(lastValue)} diagnostic=${JSON.stringify(diagnostic)}`)
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return
  const closed = new Promise(resolve => child.once('close', resolve))
  child.kill()
  await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 2500))])
}

async function waitForDownload(directory, timeoutMs = 10000) {
  const started = Date.now()
  while (Date.now() - started <= timeoutMs) {
    const files = readdirSync(directory).filter(name => name.endsWith('.json'))
    if (files.length) return join(directory, files[0])
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`download-timeout directory=${directory}`)
}

async function run() {
  const [serverPort, debugPort] = await Promise.all([getFreePort(), getFreePort()])
  const baseUrl = `http://127.0.0.1:${serverPort}`
  const appUrl = `${baseUrl}/#/app/today`
  const profile = mkdtempSync(join(tmpdir(), 'beryl-ui-runtime-'))
  const downloadDir = mkdtempSync(join(tmpdir(), 'beryl-ui-download-'))
  const vite = spawnWithLogs(process.execPath, [viteScript, '--host', '127.0.0.1', '--port', String(serverPort)], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let chrome
  let cdp

  try {
    await waitForServer(`${baseUrl}/`, vite.logs)
    chrome = spawnWithLogs(browser, [
      '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox',
      '--disable-background-networking', '--disable-component-update', '--disable-default-apps',
      '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      'about:blank'
    ], { stdio: ['ignore', 'pipe', 'pipe'] })

    const target = await waitForTarget(debugPort)
    cdp = connectCdp(target)
    await cdp.opened
    await cdp.call('Page.enable')
    await cdp.call('Runtime.enable')
    await cdp.call('Log.enable')
    await cdp.call('Network.enable')
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
    const setViewport = async (width, height, mobile, pageScaleFactor = 1) => {
      await cdp.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
      // CDP pageScaleFactor changes the visual viewport but keeps DOM geometry
      // expressed in layout-viewport CSS pixels; the audits below check both.
      await cdp.call('Emulation.setPageScaleFactor', { pageScaleFactor })
    }
    await cdp.call('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        window.__uiSmokeExternalAttempts = [];
        try {
          if (!localStorage.getItem('b_auth')) {
            const sidebarState = localStorage.getItem('calmy_sidebar_collapsed');
            localStorage.clear();
            sessionStorage.clear();
            const auth = { u: 'ui-smoke', salt: '00'.repeat(16), hash: '00'.repeat(32), iter: 1 };
            localStorage.setItem('b_auth', JSON.stringify(auth));
            localStorage.setItem('b_session', JSON.stringify({ u: auth.u, ts: Date.now() }));
            localStorage.setItem('b_scene', JSON.stringify('personal'));
            if (sidebarState !== null) localStorage.setItem('calmy_sidebar_collapsed', sidebarState);
          }
        } catch (error) { window.__uiSmokeSeedError = String(error); }
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
        window.__auditLayout = selector => {
          const container = document.querySelector(selector)
          if (!container) return { ok: true, missing: true }
          const boundary = container.getBoundingClientRect()
          const controls = [...container.querySelectorAll('input,textarea,select,button')].filter(node => {
            const rect = node.getBoundingClientRect(); const style = getComputedStyle(node)
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
          })
          const inside = controls.every(node => { const rect = node.getBoundingClientRect(); return rect.left >= boundary.left - 1 && rect.right <= boundary.right + 1 })
          const overlap = controls.some((left, index) => controls.slice(index + 1).some(right => {
            const a = left.getBoundingClientRect(); const b = right.getBoundingClientRect()
            return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
          }))
          return { ok: inside && !overlap && controls.every(node => node.getBoundingClientRect().width > 0), controls: controls.length, inside, overlap }
        }
      })();`
    })

    // Start the redirecting fixture only after the network guard is installed.
    await cdp.call('Page.navigate', { url: appUrl })

    const home = await waitForCondition(cdp, 'today-mount', `(() => {
      return {
        ok: location.hash.includes('/app/today') && !!document.querySelector('.app-shell') && !!document.querySelector('.today-page'),
        route: location.hash,
      };
    })()`, 60000)
    await evaluateStable(cdp, `(() => {
      window.__auditLayout = selector => {
        const container = document.querySelector(selector)
        if (!container) return { ok: true, missing: true }
        const containerRect = container.getBoundingClientRect()
        const controls = [...container.querySelectorAll('input, textarea, select, button')].filter(node => {
          const rect = node.getBoundingClientRect()
          const style = getComputedStyle(node)
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
        })
        const inside = controls.every(node => {
          const rect = node.getBoundingClientRect()
          return rect.left >= containerRect.left - 1 && rect.right <= containerRect.right + 1
        })
        const overlap = controls.some((left, index) => controls.slice(index + 1).some(right => {
          const a = left.getBoundingClientRect(); const b = right.getBoundingClientRect()
          return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
        }))
        return { ok: inside && !overlap && controls.every(node => node.getBoundingClientRect().width > 0), controls: controls.length, inside, overlap }
      }
      return true
    })()`)

    await evaluateStable(cdp, `(() => { document.querySelector('.sidebar-toggle')?.click(); return true })()`)
    const collapsedSidebar = await waitForCondition(cdp, 'sidebar-collapse', `(() => ({
      ok: document.querySelector('.app-shell')?.classList.contains('sidebar-collapsed') === true && localStorage.getItem('calmy_sidebar_collapsed') === '1' && document.querySelector('.sidebar-toggle')?.getAttribute('aria-label') === '展开左侧菜单' && Math.round(document.querySelector('.sidebar')?.getBoundingClientRect().width || 0) === 76 && [...document.querySelectorAll('.navigation-group-rail button > span')].every(node => getComputedStyle(node).display === 'block' && node.getBoundingClientRect().height > 0)
    }))()`)
    await evaluateStable(cdp, `(() => { document.querySelector('.sidebar-toggle')?.click(); return true })()`)
    const expandedSidebar = await waitForCondition(cdp, 'sidebar-expand', `(() => ({
      ok: !document.querySelector('.app-shell')?.classList.contains('sidebar-collapsed') && localStorage.getItem('calmy_sidebar_collapsed') === '0' && document.querySelector('.sidebar-toggle')?.getAttribute('aria-label') === '收起左侧菜单'
    }))()`)
    await evaluateStable(cdp, `(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true })); return true })()`)
    const keyboardCollapsed = await waitForCondition(cdp, 'sidebar-keyboard-collapse', `(() => ({
      ok: document.querySelector('.app-shell')?.classList.contains('sidebar-collapsed') === true && localStorage.getItem('calmy_sidebar_collapsed') === '1'
    }))()`)
    await evaluateStable(cdp, `(() => { const input = document.querySelector('.create-row input'); input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true })); return true })()`)
    const typingGuard = await waitForCondition(cdp, 'sidebar-keyboard-typing-guard', `(() => ({
      ok: document.querySelector('.app-shell')?.classList.contains('sidebar-collapsed') === true && localStorage.getItem('calmy_sidebar_collapsed') === '1'
    }))()`)
    await evaluateStable(cdp, `(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true })); return true })()`)
    await waitForCondition(cdp, 'sidebar-keyboard-expand', `(() => ({
      ok: !document.querySelector('.app-shell')?.classList.contains('sidebar-collapsed') && localStorage.getItem('calmy_sidebar_collapsed') === '0'
    }))()`)

    await evaluateStable(cdp, `(() => {
      const details = document.querySelector('.today-other');
      if (details) details.open = true;
      const input = document.querySelector('[aria-label="新增现实行动"]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'UI smoke synthetic task');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      [...document.querySelectorAll('#today-add-action button')].find(button => button.textContent?.includes('加入今天'))?.click();
      return true;
    })()`)
    const seeded = await waitForCondition(cdp, 'today-action-write', `(() => ({
      ok: [...document.querySelectorAll('.action-card')].some(node => node.textContent?.includes('UI smoke synthetic task'))
    }))()`)

    await evaluateStable(cdp, `(() => {
      const body = document.querySelector('[aria-label="记录原文"]');
      if (!body) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(body, 'UI smoke journal record');
      body.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.record-composer .capture-submit')?.click();
      return true;
    })()`)
    const actionResult = await waitForCondition(cdp, 'today-record-save', `(() => {
      const records = JSON.parse(localStorage.getItem('b_realityRecords') || '[]')
      const actions = JSON.parse(localStorage.getItem('b_mvpActions') || '[]')
      return {
        ok: records.some(item => item.body === 'UI smoke journal record') && actions.some(item => item.title === 'UI smoke synthetic task') && [...document.querySelectorAll('.recent-record-row')].some(node => node.textContent?.includes('UI smoke journal record')),
        persisted: records.some(item => item.body === 'UI smoke journal record'),
        actionVisible: actions.some(item => item.title === 'UI smoke synthetic task'),
        saveLabel: document.querySelector('.save-state')?.textContent || null
      }
    })()`)

    await evaluateStable(cdp, `(() => { location.hash = '#/app/today'; return true })()`)
    const today = await waitForCondition(cdp, 'today-route', `(() => ({
      ok: location.hash.includes('/app/today') && !!document.querySelector('.today-page') && document.querySelector('.today-minimal-heading h1')?.textContent?.trim() === '今天',
      route: location.hash
    }))()`)

    await evaluateStable(cdp, `(() => { location.hash = '#/app/capture'; return true })()`)
    const capture = await waitForCondition(cdp, 'capture-mount', `(() => ({
      ok: location.hash.includes('/app/capture') && !!document.querySelector('.capture-gate-page') && !!document.querySelector('.capture-box textarea'),
      route: location.hash
    }))()`)

    await evaluateStable(cdp, `(() => {
      const input = document.querySelector('.capture-box textarea');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(input, 'UI smoke capture：需要确认一个真实下一步');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.capture-footer button')?.click();
      return true;
    })()`)
    const captured = await waitForCondition(cdp, 'capture-write-and-suggestion', `(() => ({
      ok: [...document.querySelectorAll('.capture-gate-card p')].some(node => node.textContent?.includes('UI smoke capture')) && !!document.querySelector('.capture-ai-suggestion'),
      saveLabel: document.querySelector('.save-state')?.textContent || null,
      persistedCapture: localStorage.getItem('b_calmyCaptures')?.includes('UI smoke capture') || false
    }))()`)

    await evaluateStable(cdp, `(() => { document.querySelector('.suggestion-actions button:last-child')?.click(); return true })()`)
    const rejected = await waitForCondition(cdp, 'capture-reject-preserves-source', `(() => ({
      ok: [...document.querySelectorAll('.capture-history-row b')].some(node => node.textContent?.includes('UI smoke capture')) && document.querySelectorAll('.capture-ai-suggestion').length === 0,
      persistedCapture: localStorage.getItem('b_calmyCaptures')?.includes('UI smoke capture') || false
    }))()`)

    await evaluateStable(cdp, `(() => { location.hash = '#/app/admin'; return true })()`)
    await waitForCondition(cdp, 'admin-data-management', `(() => ({
      ok: location.hash.includes('/app/admin') && !!document.querySelector('#file-import') && document.body.innerText.includes('数据管理')
    }))()`)
    const adminRoute = await waitForCondition(cdp, 'admin-route', `(() => ({
      ok: location.hash.includes('/app/admin') && !!document.querySelector('.legacy-admin-host .admin-view') && document.body.innerText.includes('管理本机数据')
    }))()`)
    await evaluateStable(cdp, `(() => { location.hash = '#/app/admin/advanced'; return true })()`)
    const legacyAdminRoute = await waitForCondition(cdp, 'legacy-admin-route', `(() => ({
      ok: location.hash.includes('/app/admin/advanced') && !!document.querySelector('.legacy-admin-host .admin-view') && document.body.innerText.includes('管理本机数据') && !!document.querySelector('#file-import')
    }))()`)
    await evaluateStable(cdp, `(() => { location.hash = '#/app/admin'; return true })()`)
    const legacyAdminUnmounted = await waitForCondition(cdp, 'legacy-admin-unmounted', `(() => ({
      ok: location.hash.includes('/app/admin') && !!document.querySelector('.legacy-admin-host .admin-view') && !!document.querySelector('#file-import')
    }))()`)
    await cdp.call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir })
    await evaluateStable(cdp, `(() => { [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === '导出')?.click(); return true })()`)
    const backupPath = await waitForDownload(downloadDir)
    const exported = JSON.parse(readFileSync(backupPath, 'utf8'))
    const exportRoundTrip = {
      ok: exported.b_mvpActions?.includes('UI smoke synthetic task') === true &&
        !Object.prototype.hasOwnProperty.call(exported, 'b_auth') &&
        !Object.prototype.hasOwnProperty.call(exported, 'b_session') &&
        !Object.prototype.hasOwnProperty.call(exported, 'b_cloud'),
      sensitiveKeysExcluded: !Object.keys(exported).some(key => ['b_auth', 'b_session', 'b_cloud', 'b_s3'].includes(key))
    }

    await cdp.call('Storage.clearDataForOrigin', { origin: baseUrl, storageTypes: 'all' })
    await cdp.call('Page.navigate', { url: appUrl })
    await waitForCondition(cdp, 'fixture-after-data-clear', `(() => ({
      ok: location.hash.includes('/app/today') && !!document.querySelector('.app-shell') && !localStorage.getItem('b_mvpActions')
    }))()`)
    await evaluateStable(cdp, `(() => { location.hash = '#/app/admin'; return true })()`)
    await waitForCondition(cdp, 'admin-after-data-clear', `(() => ({
      ok: location.hash.includes('/app/admin') && !!document.querySelector('#file-import')
    }))()`)
    const documentTree = await cdp.call('DOM.getDocument', { depth: -1 })
    const fileInput = await cdp.call('DOM.querySelector', { nodeId: documentTree.root.nodeId, selector: '#file-import' })
    if (!fileInput?.nodeId) throw new Error('file-input-not-found-after-data-clear')
    await cdp.call('DOM.setFileInputFiles', { nodeId: fileInput.nodeId, files: [backupPath] })
    await evaluateStable(cdp, `(() => { document.querySelector('#file-import')?.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
    const imported = await waitForCondition(cdp, 'backup-imported', `(() => ({
      ok: localStorage.getItem('b_mvpActions')?.includes('UI smoke synthetic task') === true &&
        localStorage.getItem('b_calmyCaptures')?.includes('UI smoke capture') === true,
      restoredActions: localStorage.getItem('b_mvpActions')?.includes('UI smoke synthetic task') || false,
      restoredCaptures: localStorage.getItem('b_calmyCaptures')?.includes('UI smoke capture') || false
    }))()`)
    await evaluateStable(cdp, `(() => { location.hash = '#/app/task-board'; return true })()`)
    const importedToday = await waitForCondition(cdp, 'backup-visible-in-task-board', `(() => ({
      ok: location.hash.includes('/app/task-board') && !!document.querySelector('.task-board-page') && [...document.querySelectorAll('.task-board-card')].some(node => node.textContent?.includes('UI smoke synthetic task'))
    }))()`)
    await evaluateStable(cdp, `(() => { location.hash = '#/app/today'; return true })()`)
    await waitForCondition(cdp, 'today-route-after-import', `(() => ({
      ok: location.hash.includes('/app/today') && !!document.querySelector('.today-page')
    }))()`)
    const accessibilityTree = await cdp.call('Accessibility.getFullAXTree')
    const accessibilityNames = new Set((accessibilityTree?.nodes || []).map(node => node.name?.value).filter(Boolean))
    const currentTodayNames = ['今天', '记录', '回顾', '记录原文', '记录类别']
    const accessibilityTreeVisible = {
      ok: currentTodayNames.every(name => accessibilityNames.has(name)),
      names: currentTodayNames.filter(name => accessibilityNames.has(name))
    }

    await evaluateStable(cdp, `(() => {
      const field = document.querySelector('.record-composer textarea[aria-label="记录原文"]')
      field?.focus()
      return document.activeElement === field
    })()`)
    const dispatchKey = async (key, code, keyCode) => {
      await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode })
      await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode })
    }
    const navigateHashWithRetry = async (label, path, expression) => {
      let lastError
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await evaluateStable(cdp, `(() => { location.hash = ${JSON.stringify(path)}; return true })()`)
        try { return await waitForCondition(cdp, label, expression, 5000) } catch (error) {
          lastError = error
          await new Promise(resolve => setTimeout(resolve, 200))
        }
      }
      throw lastError
    }
    const keyboardTrace = []
    for (let index = 0; index < 3; index += 1) {
      await dispatchKey('Tab', 'Tab', 9)
      keyboardTrace.push(await evaluateStable(cdp, `(() => ({
        tag: document.activeElement?.tagName || null,
        aria: document.activeElement?.getAttribute('aria-label') || null,
        text: document.activeElement?.textContent?.trim().slice(0, 20) || null,
        group: document.activeElement?.closest('[role="group"]')?.getAttribute('aria-label') || null
      }))()`))
    }
    await evaluateStable(cdp, `(() => {
      const button = document.querySelector('.record-composer .capture-submit')
      window.__uiSmokeEnter = false
      button?.addEventListener('keydown', event => { if (event.key === 'Enter') window.__uiSmokeEnter = true }, { once: true })
      button?.focus()
      return true
    })()`)
    await dispatchKey('Enter', 'Enter', 13)
    const keyboardEnter = await waitForCondition(cdp, 'keyboard-enter-event', `(() => ({ ok: window.__uiSmokeEnter === true }))()`)
    const keyboardFocus = {
      ok: keyboardTrace.some(item => item?.group === '记录类别') &&
        keyboardTrace.some(item => item?.tag === 'BUTTON' && item?.text === '事实') &&
        keyboardTrace.some(item => item?.tag === 'BUTTON' && item?.text === '记录') &&
        keyboardEnter.ok,
      trace: keyboardTrace
    }

    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    const mobileLayout = await waitForCondition(cdp, 'mobile-layout', `(() => {
      const width = window.innerWidth
      const record = document.querySelector('.record-composer')?.getBoundingClientRect()
      const bottomButtons = [...document.querySelectorAll('.bottom-nav button')]
      return {
        ok: width === 390 && !!document.querySelector('.mobile-header') && !!document.querySelector('.bottom-nav') && !document.querySelector('.sidebar') && document.documentElement.scrollWidth <= width + 1 && (!record || record.right <= width + 1) && bottomButtons.length === 4 && bottomButtons.every(button => button.getBoundingClientRect().height >= 44),
        width,
        scrollWidth: document.documentElement.scrollWidth,
        bottomNav: !!document.querySelector('.bottom-nav'),
        recordRight: record?.right || null
      }
    })()`)

    await evaluateStable(cdp, `(() => { const trigger = document.querySelector('.mobile-header .menu'); trigger?.focus(); trigger?.click(); return document.activeElement === trigger })()`)
    const mobileDrawer = await waitForCondition(cdp, 'mobile-more-drawer', `(() => {
      const drawer = document.querySelector('#more-drawer')
      const panel = drawer
      const rect = panel?.getBoundingClientRect()
      return {
        ok: !!drawer && !!panel && !!rect && rect.width > 0 && rect.height > 0 && getComputedStyle(panel).visibility !== 'hidden' && !!document.querySelector('.drawer-close') && document.querySelector('.mobile-header .menu')?.getAttribute('aria-expanded') === 'true',
        width: rect?.width || 0,
        expanded: document.querySelector('.mobile-header .menu')?.getAttribute('aria-expanded') || null
      }
    })()`)
    await evaluateStable(cdp, 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))')
    const mobileDrawerAccessibilityTree = await cdp.call('Accessibility.getFullAXTree')
    const mobileDrawerAccessibilityNames = new Set((mobileDrawerAccessibilityTree?.nodes || []).map(node => node.name?.value).filter(Boolean))
    const mobileDialogs = (mobileDrawerAccessibilityTree?.nodes || []).filter(node => node.role?.value === 'dialog' && node.ignored !== true)
    const mobileDialog = mobileDialogs.find(node => node.name?.value === '功能目录')
    const mobileDialogIsModal = mobileDialog?.properties?.some(property => property.name === 'modal' && property.value?.value === true) === true
    const mobileSearchAccessibleName = [...mobileDrawerAccessibilityNames].find(name => name.includes('搜索处境、行动、记录或人物'))
    const mobileDrawerDomState = await evaluateStable(cdp, `(() => ({
      text: document.querySelector('#more-drawer')?.textContent || '',
      hasDialogTrigger: document.querySelector('[aria-controls="more-drawer"]')?.getAttribute('aria-haspopup') === 'dialog'
    }))()`)
    const mobileDrawerAccessibilityVisible = {
      ok: ['功能目录', '关闭功能目录'].every(name => mobileDrawerAccessibilityNames.has(name)) && !!mobileSearchAccessibleName && !!mobileDialog && mobileDialogIsModal && ['设置', '日历'].every(name => mobileDrawerDomState.text.includes(name)) && mobileDrawerDomState.hasDialogTrigger,
      names: ['功能目录', mobileSearchAccessibleName, '设置', '日历', '关闭功能目录'].filter(Boolean),
      dialogs: mobileDialogs.map(node => ({ role: node.role?.value || null, name: node.name?.value || null, ignored: node.ignored, properties: node.properties?.map(property => ({ name: property.name, value: property.value?.value })) || [] }))
    }
    await dispatchKey('Escape', 'Escape', 27)
    const mobileDrawerClosed = await waitForCondition(cdp, 'mobile-more-drawer-closed', `(() => ({
      ok: document.querySelector('.mobile-header .menu')?.getAttribute('aria-expanded') === 'false' && document.activeElement === document.querySelector('.mobile-header .menu'),
      focusReturned: document.activeElement?.getAttribute('aria-label') || null
    }))()`)
    await waitForCondition(cdp, 'mobile-more-drawer-settled', `(() => {
      const panel = document.querySelector('#more-drawer')
      const rect = panel?.getBoundingClientRect()
      const style = panel ? getComputedStyle(panel) : null
      return { ok: !panel || style?.visibility === 'hidden' || (rect?.width || 0) === 0 }
    })()`, 5000)

    // closeDrawer restores focus again after 50ms; let that final callback settle before changing viewport.
    await new Promise(resolve => setTimeout(resolve, 75))
    await setViewport(320, 844, true)
    const narrow320Today = await navigateHashWithRetry('narrow-320-today-route', '#/app/today', `(() => {
      document.querySelector('.today-other')?.setAttribute('open', '')
      const visual = window.visualViewport
      const left = visual?.offsetLeft || 0
      const top = visual?.offsetTop || 0
      const width = visual?.width || window.innerWidth
      const height = visual?.height || window.innerHeight
      const visibleHorizontally = node => {
        const rect = node?.getBoundingClientRect()
        return !!rect && rect.width > 0 && rect.height > 0 && rect.left >= left - 1 && rect.right <= left + width + 1
      }
      const coreControls = [
        document.querySelector('.add-action-panel input'),
        document.querySelector('.add-action-panel [role="combobox"], .add-action-panel select'),
        document.querySelector('.add-action-panel button.primary'),
        document.querySelector('.record-composer textarea'),
        document.querySelector('.mobile-header .brand[aria-label="返回今天"]'),
        document.querySelector('.mobile-header .menu[aria-label="打开功能目录"]')
      ]
      const page = document.querySelector('.attention-today-page, .today-page')
      const pageRect = page?.getBoundingClientRect()
      return {
        ok: window.innerWidth === 320 && !!page && !!document.querySelector('.body-state-panel') && !!document.querySelector('.now-panel') &&
          !!document.querySelector('.add-action-panel') && !!document.querySelector('.record-composer') &&
          visibleHorizontally(document.querySelector('.add-action-panel button.primary')) &&
          visibleHorizontally(document.querySelector('.mobile-header .brand[aria-label="返回今天"]')) &&
          coreControls.every(visibleHorizontally) && document.documentElement.scrollWidth <= window.innerWidth + 1 &&
          (!pageRect || pageRect.left >= left - 1 && pageRect.right <= left + width + 1),
        width: window.innerWidth,
        visualWidth: width,
        visualHeight: height,
        scrollWidth: document.documentElement.scrollWidth,
        primaryAction: document.querySelector('.add-action-panel button.primary')?.textContent?.trim() || null,
        exitLabel: document.querySelector('.mobile-header .brand[aria-label="返回今天"]')?.getAttribute('aria-label') || null
      }
    })()`)
    await evaluateStable(cdp, `(() => { const trigger = document.querySelector('.mobile-header .menu'); trigger?.focus(); trigger?.click(); return document.activeElement === trigger })()`)
    const narrow320Drawer = await waitForCondition(cdp, 'narrow-320-more-drawer', `(() => {
      const visual = window.visualViewport
      const left = visual?.offsetLeft || 0
      const width = visual?.width || window.innerWidth
      const panel = document.querySelector('#more-drawer')
      const rect = panel?.getBoundingClientRect()
      const close = document.querySelector('#more-drawer .drawer-close')
      const closeRect = close?.getBoundingClientRect()
      return {
        ok: !!panel && !!rect && rect.width > 0 && rect.height > 0 && getComputedStyle(panel).visibility !== 'hidden' &&
          !!close && !!closeRect && closeRect.width > 0 && closeRect.height > 0 && closeRect.left >= left - 1 &&
          closeRect.right <= left + width + 1 && document.querySelector('.mobile-header .menu')?.getAttribute('aria-expanded') === 'true',
        width: rect?.width || 0,
        closeRight: closeRect?.right || 0,
        visualWidth: width,
        panelClass: panel?.className || null,
        presentation: panel?.getAttribute('data-presentation') || null,
        visibility: panel ? getComputedStyle(panel).visibility : null,
        expanded: document.querySelector('.mobile-header .menu')?.getAttribute('aria-expanded') || null,
        directoryOpen: document.querySelector('.app-shell')?.getAttribute('data-directory-open') || null,
        drawerCloseFound: !!close
      }
    })()`)
    await evaluateStable(cdp, 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))')
    await dispatchKey('Escape', 'Escape', 27)
    const narrow320DrawerClosed = await waitForCondition(cdp, 'narrow-320-more-drawer-closed', `(() => ({
      ok: document.querySelector('.mobile-header .menu')?.getAttribute('aria-expanded') === 'false' && document.activeElement === document.querySelector('.mobile-header .menu'),
      focusReturned: document.activeElement?.getAttribute('aria-label') || null
    }))()`)
    await waitForCondition(cdp, 'narrow-320-more-drawer-settled', `(() => {
      const panel = document.querySelector('#more-drawer')
      const rect = panel?.getBoundingClientRect()
      const style = panel ? getComputedStyle(panel) : null
      return { ok: !panel || style?.visibility === 'hidden' || (rect?.width || 0) === 0 }
    })()`, 5000)

    const narrow320Capture = await navigateHashWithRetry('narrow-320-capture-route', '#/app/capture', `(() => {
      const visual = window.visualViewport
      const left = visual?.offsetLeft || 0
      const width = visual?.width || window.innerWidth
      const visibleHorizontally = node => {
        const rect = node?.getBoundingClientRect()
        return !!rect && rect.width > 0 && rect.height > 0 && rect.left >= left - 1 && rect.right <= left + width + 1
      }
      const coreControls = [
        document.querySelector('.capture-box textarea'),
        document.querySelector('.capture-footer button'),
        document.querySelector('.mobile-header .brand[aria-label="返回今天"]'),
        document.querySelector('.mobile-header .menu[aria-label="打开功能目录"]')
      ]
      return {
        ok: window.innerWidth === 320 && !!document.querySelector('.capture-gate-page') && !!document.querySelector('.capture-box') &&
          coreControls.every(visibleHorizontally) && document.documentElement.scrollWidth <= window.innerWidth + 1,
        width: window.innerWidth,
        visualWidth: width,
        scrollWidth: document.documentElement.scrollWidth,
        saveLabel: document.querySelector('.capture-footer button')?.textContent?.trim() || null
      }
    })()`)

    await setViewport(640, 844, true, 2)
    const zoom200Capture = await navigateHashWithRetry('zoom-200-capture-route', '#/app/capture', `(() => {
      const visual = window.visualViewport
      const scale = visual?.scale || 1
      const width = visual?.width || window.innerWidth / scale
      const height = visual?.height || window.innerHeight / scale
      const visibleHorizontally = node => {
        const rect = node?.getBoundingClientRect()
        return !!rect && rect.width > 0 && rect.height > 0 && rect.left >= -1 && rect.right <= window.innerWidth + 1
      }
      const coreControls = [document.querySelector('.capture-box textarea'), document.querySelector('.capture-footer button'), document.querySelector('.mobile-header .brand[aria-label="返回今天"]')]
      return {
        ok: !!document.querySelector('.capture-gate-page'),
        layoutOk: scale >= 1.99 && width <= 320.5 && height > 0 && coreControls.every(visibleHorizontally) && document.documentElement.scrollWidth <= window.innerWidth + 1,
        scale,
        layoutWidth: window.innerWidth,
        visualWidth: width,
        visualHeight: height,
        scrollWidth: document.documentElement.scrollWidth,
        saveLabel: document.querySelector('.capture-footer button')?.textContent?.trim() || null,
        controlRects: coreControls.map(node => { const rect = node?.getBoundingClientRect(); return { tag: node?.tagName || null, label: node?.getAttribute('aria-label') || null, left: rect?.left || 0, right: rect?.right || 0, width: rect?.width || 0, height: rect?.height || 0 } })
      }
    })()`)
    const zoom200Today = await navigateHashWithRetry('zoom-200-today-route', '#/app/today', `(() => {
      const visual = window.visualViewport
      const scale = visual?.scale || 1
      const width = visual?.width || window.innerWidth / scale
      const visibleHorizontally = node => {
        const rect = node?.getBoundingClientRect()
        return !!rect && rect.width > 0 && rect.height > 0 && rect.left >= -1 && rect.right <= window.innerWidth + 1
      }
      const coreControls = [
        document.querySelector('.add-action-panel input'),
        document.querySelector('.add-action-panel [role="combobox"], .add-action-panel select'),
        document.querySelector('.add-action-panel button.primary'),
        document.querySelector('.record-composer textarea'),
        document.querySelector('.mobile-header .brand[aria-label="返回今天"]')
      ]
      return {
        ok: !!document.querySelector('.attention-today-page'),
        layoutOk: scale >= 1.99 && width <= 320.5 &&
          visibleHorizontally(document.querySelector('.add-action-panel button.primary')) && coreControls.every(visibleHorizontally) &&
          document.documentElement.scrollWidth <= window.innerWidth + 1,
        scale,
        layoutWidth: window.innerWidth,
        visualWidth: width,
        scrollWidth: document.documentElement.scrollWidth,
        primaryAction: document.querySelector('.add-action-panel button.primary')?.textContent?.trim() || null,
        exitLabel: document.querySelector('.mobile-header .brand[aria-label="返回今天"]')?.getAttribute('aria-label') || null,
        controlRects: coreControls.map(node => { const rect = node?.getBoundingClientRect(); return { tag: node?.tagName || null, label: node?.getAttribute('aria-label') || null, left: rect?.left || 0, right: rect?.right || 0, width: rect?.width || 0, height: rect?.height || 0 } })
      }
    })()`)
    await setViewport(820, 900, true)

    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 820, height: 900, deviceScaleFactor: 1, mobile: true })
    const tabletLayout = await waitForCondition(cdp, 'tablet-layout', `(() => {
      const controls = [...document.querySelectorAll('.page-container button,.page-container select,.mobile-header button')].filter(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 })
      const shellTouchTargets = [...document.querySelectorAll('.mobile-header .menu,.bottom-nav button')].filter(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 })
      const layoutAudits = ['.record-composer', '.create-row', '.today-review'].map(selector => ({ selector, ...window.__auditLayout(selector) }))
      const undersizedShellTargets = shellTouchTargets.filter(node => node.getBoundingClientRect().height < 44).map(node => ({ tag: node.tagName, text: node.textContent?.trim().slice(0, 48), label: node.getAttribute('aria-label'), className: typeof node.className === 'string' ? node.className : '', height: +node.getBoundingClientRect().height.toFixed(1) }))
      const compactPageControls = controls.filter(node => node.getBoundingClientRect().height < 44).map(node => ({ tag: node.tagName, text: node.textContent?.trim().slice(0, 48), label: node.getAttribute('aria-label'), className: typeof node.className === 'string' ? node.className : '', height: +node.getBoundingClientRect().height.toFixed(1) }))
      const checks = { width: window.innerWidth === 820, mobileHeader: !!document.querySelector('.mobile-header'), bottomNav: !!document.querySelector('.bottom-nav'), noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1, shellTouchTargets: undersizedShellTargets.length === 0, layouts: layoutAudits.every(result => result.ok) }
      return { ok: Object.values(checks).every(Boolean), checks, width: window.innerWidth, height: window.innerHeight, visualViewport: { width: visualViewport?.width, height: visualViewport?.height, scale: visualViewport?.scale }, scrollWidth: document.documentElement.scrollWidth, undersizedShellTargets, compactPageControls, layoutAudits }
    })()`)
    const tabletToday = await waitForCondition(cdp, 'tablet-today-route', `(() => ({
      ok: location.hash.includes('/app/today') && !!document.querySelector('.today-page') && document.querySelectorAll('.bottom-nav button[aria-current="page"]').length === 1 && document.querySelector('.bottom-nav button[aria-current="page"]')?.textContent?.includes('今天')
    }))()`)
    const tabletCapture = await navigateHashWithRetry('tablet-capture-route', '#/app/capture', `(() => ({
      ok: location.hash.includes('/app/capture') && !!document.querySelector('.capture-gate-page') && document.documentElement.scrollWidth <= window.innerWidth + 1 && document.querySelectorAll('.bottom-nav button[aria-current="page"]').length === 1 && document.querySelector('.bottom-nav button[aria-current="page"]')?.textContent?.includes('记录'),
      active: document.querySelector('.bottom-nav [aria-current="page"]')?.textContent?.trim() || null
    }))()`)
    const tabletReview = await navigateHashWithRetry('tablet-review-route', '#/app/review', `(() => ({
      ok: location.hash.includes('/app/review') && !!document.querySelector('.review-page') && !!document.querySelector('.today-review') && document.querySelectorAll('.today-review textarea[aria-label]').length === 4 && document.documentElement.scrollWidth <= window.innerWidth + 1 && document.querySelectorAll('.bottom-nav button[aria-current="page"]').length === 1 && document.querySelector('.bottom-nav button[aria-current="page"]')?.textContent?.includes('回顾'),
      active: document.querySelector('.bottom-nav [aria-current="page"]')?.textContent?.trim() || null
    }))()`)
    const tabletTodayRestored = await navigateHashWithRetry('tablet-today-route-restored', '#/app/today', `(() => ({
      ok: location.hash.includes('/app/today') && !!document.querySelector('.today-page') && document.querySelectorAll('.bottom-nav button[aria-current="page"]').length === 1 && document.querySelector('.bottom-nav button[aria-current="page"]')?.textContent?.includes('今天')
    }))()`)
    const tabletMatters = await navigateHashWithRetry('tablet-matters-route', '#/app/matters', `(() => ({
      ok: location.hash.includes('/app/matters') && !!document.querySelector('.matters-page') && document.documentElement.scrollWidth <= window.innerWidth + 1 && document.querySelectorAll('.bottom-nav button[aria-current="page"]').length === 1 && document.querySelector('.bottom-nav button[aria-current="page"]')?.textContent?.includes('处境'),
      active: document.querySelector('.bottom-nav [aria-current="page"]')?.textContent?.trim() || null
    }))()`)

    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1024, height: 900, deviceScaleFactor: 1, mobile: false })
    const mediumToday = await navigateHashWithRetry('medium-today-route', '#/app/today', `(() => ({
      ok: location.hash.includes('/app/today') && !!document.querySelector('.today-page') && !!document.querySelector('.sidebar') && (!document.querySelector('.bottom-nav') || getComputedStyle(document.querySelector('.bottom-nav')).display === 'none') && !document.querySelector('.right-rail') && document.documentElement.scrollWidth <= window.innerWidth + 1 && ['.record-composer', '.create-row'].map(selector => window.__auditLayout(selector)).every(result => result.ok),
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth
    }))()`)
    const mediumReview = await navigateHashWithRetry('medium-review-route', '#/app/review', `(() => ({
      ok: location.hash.includes('/app/review') && !!document.querySelector('.review-page') && document.documentElement.scrollWidth <= window.innerWidth + 1 && window.__auditLayout('.today-review').ok,
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth
    }))()`)

    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
    await waitForCondition(cdp, 'desktop-layout-restored', `(() => ({
      ok: !!document.querySelector('.sidebar') && !!document.querySelector('.desktop-topbar') && (!document.querySelector('.bottom-nav') || getComputedStyle(document.querySelector('.bottom-nav')).display === 'none')
    }))()`)

    const rightSidebarRemoved = await waitForCondition(cdp, 'right-sidebar-absent-from-current-shell', `(() => ({
      ok: !document.querySelector('.right-rail') && !document.querySelector('.right-sidebar-toggle') && document.documentElement.scrollWidth <= window.innerWidth + 1,
      rail: !!document.querySelector('.right-rail'),
      toggle: !!document.querySelector('.right-sidebar-toggle')
    }))()`)

    const cycleRoute = await navigateHashWithRetry('cycle-route', '#/app/cycle', `(() => ({
      ok: location.hash.includes('/app/cycle') && !!document.querySelector('.cycle-page') && !!document.querySelector('.cycle-orbit') && document.documentElement.scrollWidth <= window.innerWidth + 1
    }))()`)
    const profileRoute = await navigateHashWithRetry('profile-route', '#/app/profile', `(() => ({
      ok: location.hash.includes('/app/profile') && !!document.querySelector('.profile-page') && !!document.querySelector('.profile-identity-card') && !!document.querySelector('.profile-overview') && document.body.innerText.includes('现有数据概览') && document.documentElement.scrollWidth <= window.innerWidth + 1
    }))()`)
    const goalsRoute = await navigateHashWithRetry('goals-route', '#/app/module/goals', `(() => ({
      ok: location.hash.includes('/app/module/goals') && !!document.querySelector('.goals-page') && document.documentElement.scrollWidth <= window.innerWidth + 1
    }))()`)
    const itemsAlias = await navigateHashWithRetry('items-alias-route', '#/app/items', `(() => ({
      ok: location.hash.includes('/app/matters') && !!document.querySelector('.matters-page')
    }))()`)
    const legacyCasesRoute = await navigateHashWithRetry('legacy-cases-route', '#/app/cases', `(() => ({
      ok: location.hash.includes('/app/matters') && !!document.querySelector('.matters-page')
    }))()`)
    const legacyCaseDetailRoute = await navigateHashWithRetry('legacy-case-detail-route', '#/app/cases/unknown-legacy-case', `(() => ({
      ok: location.hash.includes('/app/matters') && !location.hash.includes('/app/cases/') && !!document.querySelector('.matters-page')
    }))()`)
    const legacyCharsRoute = await navigateHashWithRetry('legacy-chars-route', '#/app/module/chars', `(() => ({
      ok: location.hash.includes('/app/people') && !!document.querySelector('.people-page')
    }))()`)
    const legacyMomentsRoute = await navigateHashWithRetry('legacy-moments-route', '#/app/module/moments', `(() => ({
      ok: location.hash.includes('/app/module/posts') && !!document.querySelector('.posts-page')
    }))()`)
    const legacyUnknownModuleRoute = await navigateHashWithRetry('legacy-unknown-module-route', '#/app/module/unknown', `(() => ({
      ok: location.hash.includes('/app/module/inbox') && !!document.querySelector('.inbox-page')
    }))()`)

    await evaluateStable(cdp, `(() => { location.hash = '#/app/home'; return true })()`)
    await waitForCondition(cdp, 'home-compatibility-redirect', `(() => ({
      ok: location.hash.includes('/app/today') && !!document.querySelector('.today-page')
    }))()`)

    await evaluateStable(cdp, `(() => { document.querySelector('.sidebar-toggle')?.click(); return true })()`)
    await waitForCondition(cdp, 'sidebar-collapse-before-refresh', `(() => ({
      ok: document.querySelector('.app-shell')?.classList.contains('sidebar-collapsed') === true && localStorage.getItem('calmy_sidebar_collapsed') === '1'
    }))()`)

    await cdp.call('Page.reload', { ignoreCache: true })
    const refreshed = await waitForCondition(cdp, 'refresh-recovery', `(() => ({
      ok: location.hash.includes('/app/today') && !!document.querySelector('.app-shell') &&
        localStorage.getItem('b_mvpActions')?.includes('UI smoke synthetic task') === true &&
        document.querySelector('.app-shell')?.classList.contains('sidebar-collapsed') === true &&
        document.querySelector('.sidebar-toggle')?.getAttribute('aria-label') === '展开左侧菜单',
      sidebarCollapsed: document.querySelector('.app-shell')?.classList.contains('sidebar-collapsed') === true && document.querySelector('.sidebar-toggle')?.getAttribute('aria-label') === '展开左侧菜单',
      rightSidebarRemoved: !document.querySelector('.right-rail') && !document.querySelector('.right-sidebar-toggle'),
      route: location.hash,
      persistedTask: localStorage.getItem('b_mvpActions')?.includes('UI smoke synthetic task') || false,
      externalAttempts: window.__uiSmokeExternalAttempts?.length || 0
    }))()`)

    await navigateHashWithRetry('login-route-for-accessibility', '#/login', `(() => ({
      ok: location.hash.includes('/login') && !!document.querySelector('.login-card') && !!document.querySelector('.login-card button')
    }))()`)
    await evaluateStable(cdp, `(() => { document.querySelector('.login-card button')?.click(); return true })()`)
    const loginError = await waitForCondition(cdp, 'login-error-announcement', `(() => ({
      ok: document.querySelector('.login-card [role="alert"]')?.textContent?.includes('请输入用户名和密码') === true
    }))()`)
    const loginAccessibilityTree = await cdp.call('Accessibility.getFullAXTree')
    const loginAlert = (loginAccessibilityTree?.nodes || []).find(node => node.role?.value === 'alert' && node.ignored !== true)
    const loginErrorAccessible = {
      ok: loginError.ok && !!loginAlert,
      role: loginAlert?.role?.value || null,
      name: loginAlert?.name?.value || null
    }

    await cdp.call('Page.navigate', { url: `${baseUrl}/vue-preview.html#/app/task-board` })
    const vueTaskBoardMounted = await waitForCondition(cdp, 'vue-task-board-mounted', `(() => ({
      ok: location.pathname.endsWith('/vue-preview.html') && location.hash.includes('/app/task-board') &&
        !!document.querySelector('#app[data-v-app] .task-board-page')
    }))()`)
    const keyboardTask = await evaluateStable(cdp, `(async () => {
      const { actionAsyncRepository } = await import('/src/domain/action/repository.ts')
      const item = await actionAsyncRepository.create({ title: 'Vue keyboard status smoke', date: new Date().toISOString().slice(0, 10) })
      window.dispatchEvent(new CustomEvent('beryl-data-synced'))
      return { id: item.calmyId, title: item.title }
    })()`)
    await waitForCondition(cdp, 'vue-keyboard-task-visible', `(() => ({
      ok: !![...document.querySelectorAll('.task-board-card h3')].find(node => node.textContent?.trim() === ${JSON.stringify(keyboardTask.title)})
    }))()`)
    const statusSelector = `select[aria-label="${keyboardTask.title}状态"]`
    const statusFocused = await evaluateStable(cdp, `(() => {
      const select = document.querySelector(${JSON.stringify(statusSelector)})
      select?.focus()
      return !!select && document.activeElement === select && select.value === 'planned'
    })()`)
    if (!statusFocused) throw new Error('vue-task-status-select-did-not-focus-at-planned')
    await dispatchKey('ArrowDown', 'ArrowDown', 40)
    await dispatchKey('Enter', 'Enter', 13)
    const vueKeyboardChange = await waitForCondition(cdp, 'vue-keyboard-status-change', `(async () => {
      const select = document.querySelector(${JSON.stringify(statusSelector)})
      const { actionAsyncRepository } = await import('/src/domain/action/repository.ts')
      const item = await actionAsyncRepository.find(${JSON.stringify(keyboardTask.id)})
      return { ok: !!select && select.value === 'in_progress' && item?.status === 'in_progress',
        value: select?.value || null, repositoryStatus: item?.status || null, activeElement: document.activeElement?.tagName || null }
    })()`)
    await cdp.call('Page.reload', { ignoreCache: true })
    const vueKeyboardRefresh = await waitForCondition(cdp, 'vue-keyboard-status-persisted', `(async () => {
      const select = document.querySelector(${JSON.stringify(statusSelector)})
      const { actionAsyncRepository } = await import('/src/domain/action/repository.ts')
      const item = await actionAsyncRepository.find(${JSON.stringify(keyboardTask.id)})
      return { ok: location.pathname.endsWith('/vue-preview.html') && !!select && select.value === 'in_progress' && item?.status === 'in_progress',
        value: select?.value || null, repositoryStatus: item?.status || null }
    })()`)
    const checks = {
      appMounted: home.ok,
        sidebarCollapseVisible: collapsedSidebar.ok,
        sidebarExpandVisible: expandedSidebar.ok,
        sidebarKeyboardVisible: keyboardCollapsed.ok && typingGuard.ok,
      todayDefaultViewVisible: home.ok,
      syntheticLocalDataVisible: seeded.ok,
      recordActionResultVisible: actionResult.ok,
      todayRouteViewVisible: today.ok,
      captureFlowVisible: capture.ok && captured.ok,
      captureSaveStateVisible: captured.saveLabel?.includes('已保存') || false,
      captureRejectPreservesSource: rejected.ok && rejected.persistedCapture,
      adminRoute: adminRoute.ok,
      legacyAdminRoute: legacyAdminRoute.ok,
      legacyAdminUnmounted: legacyAdminUnmounted.ok,
      refreshRestoredLocalData: refreshed.ok && refreshed.persistedTask,
      sidebarStateRestoredAfterRefresh: refreshed.sidebarCollapsed,
      rightSidebarRemoved: rightSidebarRemoved.ok && refreshed.rightSidebarRemoved,
      referencePagesVisible: cycleRoute.ok && profileRoute.ok && goalsRoute.ok && itemsAlias.ok,
      legacyCaseRoutesCompatible: legacyCasesRoute.ok && legacyCaseDetailRoute.ok,
      legacyModuleRoutesCompatible: legacyCharsRoute.ok && legacyMomentsRoute.ok && legacyUnknownModuleRoute.ok,
      mobileLayoutVisible: mobileLayout.ok,
      mobileDrawerVisible: mobileDrawer.ok,
      mobileDrawerClosed: mobileDrawerClosed.ok,
      mobileDrawerAccessibilityVisible: mobileDrawerAccessibilityVisible.ok,
      narrow320TodayVisible: narrow320Today.ok,
      narrow320DrawerVisible: narrow320Drawer.ok,
      narrow320DrawerClosed: narrow320DrawerClosed.ok,
      narrow320CaptureVisible: narrow320Capture.ok,
      zoom200CaptureVisible: zoom200Capture.ok && zoom200Capture.layoutOk,
      zoom200TodayVisible: zoom200Today.ok && zoom200Today.layoutOk,
      tabletLayoutVisible: tabletLayout.ok && tabletToday.ok && tabletMatters.ok && tabletCapture.ok && tabletReview.ok && tabletTodayRestored.ok,
      mediumLayoutVisible: mediumToday.ok && mediumReview.ok,
      keyboardFocusVisible: keyboardFocus.ok,
      keyboardEnterVisible: keyboardEnter.ok,
      accessibilityTreeVisible: accessibilityTreeVisible.ok,
      loginErrorAccessible: loginErrorAccessible.ok,
      vueTaskBoardKeyboardStatusChange: vueTaskBoardMounted.ok && vueKeyboardChange.ok && vueKeyboardRefresh.ok
    }
    const report = {
      ok: Object.values(checks).every(Boolean),
      checks,
      accessibilityTree: accessibilityTreeVisible,
      exportImport: exportRoundTrip,
      mobileDrawerAccessibility: mobileDrawerAccessibilityVisible,
      narrow320: { today: narrow320Today, drawer: narrow320Drawer, drawerClosed: narrow320DrawerClosed, capture: narrow320Capture },
      zoom200: { capture: zoom200Capture, today: zoom200Today },
      legacyCaseRoutes: { list: legacyCasesRoute, detail: legacyCaseDetailRoute },
      legacyModuleRoutes: { chars: legacyCharsRoute, moments: legacyMomentsRoute, unknown: legacyUnknownModuleRoute },
      vueTaskBoardKeyboard: { mounted: vueTaskBoardMounted, focus: statusFocused, changed: vueKeyboardChange, persistedAfterRefresh: vueKeyboardRefresh },
      route: refreshed.route,
      loginErrorAccessible,
      externalNetworkAttemptsBlocked: refreshed.externalAttempts,
      note: 'External fetch is blocked in-page; the app must use its offline fallback.'
    }
    report.checks.exportImportSafe = exportRoundTrip.ok && exportRoundTrip.sensitiveKeysExcluded
    report.checks.importedDataVisible = imported.ok && importedToday.ok
    report.ok = Object.values(report.checks).every(Boolean)
    if (!report.ok) throw new Error(`UI smoke checks failed: ${JSON.stringify(report)}`)
    console.log('UI browser smoke passed:', JSON.stringify(report))
  } catch (error) {
    const chromeLogs = chrome?.logs?.() || {}
    const viteLogs = vite.logs()
    const cdpDiagnostics = cdp?.events
    const message = error instanceof Error ? error.stack || error.message : String(error)
    throw new Error(`${message}\nchrome=${JSON.stringify(chromeLogs)}\nvite=${JSON.stringify(viteLogs)}\ncdp=${JSON.stringify(cdpDiagnostics?.slice(-40) || [])}`)
  } finally {
    try { await cdp?.call('Browser.close') } catch { /* Browser may already be closed. */ }
    cdp?.socket.close()
    await stopProcess(chrome?.child)
    await stopProcess(vite.child)
    rmSync(profile, { recursive: true, force: true })
    rmSync(downloadDir, { recursive: true, force: true })
  }
}

try {
  await run()
} catch (error) {
  console.error(`UI browser smoke failed: ${error instanceof Error ? error.stack || error.message : String(error)}`)
  process.exitCode = 1
}
