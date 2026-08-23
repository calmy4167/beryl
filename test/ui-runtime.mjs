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
      sidebarState: localStorage.getItem('b_sidebar_collapsed'),
      sidebarClass: document.querySelector('.app-shell')?.className || null,
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
  const testUrl = `${baseUrl}/test/ui-runtime.html`
  const profile = mkdtempSync(join(tmpdir(), 'beryl-ui-runtime-'))
  const downloadDir = mkdtempSync(join(tmpdir(), 'beryl-ui-download-'))
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
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
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
      ok: document.querySelector('.app-shell')?.classList.contains('sidebar-collapsed') === true && localStorage.getItem('calmy_sidebar_collapsed') === '1' && document.querySelector('.sidebar-toggle')?.getAttribute('aria-label') === '展开侧边栏' && Math.round(document.querySelector('.sidebar')?.getBoundingClientRect().width || 0) === 72 && getComputedStyle(document.querySelector('.nav-label')).display === 'none'
    }))()`)
    await evaluateStable(cdp, `(() => { document.querySelector('.sidebar-toggle')?.click(); return true })()`)
    const expandedSidebar = await waitForCondition(cdp, 'sidebar-expand', `(() => ({
      ok: !document.querySelector('.app-shell')?.classList.contains('sidebar-collapsed') && localStorage.getItem('calmy_sidebar_collapsed') === '0' && document.querySelector('.sidebar-toggle')?.getAttribute('aria-label') === '收起侧边栏'
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

    const recordedAction = await evaluateStable(cdp, `(() => {
      const actions = JSON.parse(localStorage.getItem('b_mvpActions') || '[]')
      const action = actions.find(item => item.title === 'UI smoke synthetic task')
      const body = document.querySelector('.record-row textarea')
      const relation = document.querySelector('select[aria-label="结果关联行动"]')
      if (!action || !body || !relation) return { ok: false }
      const bodySetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      bodySetter?.call(body, 'UI smoke action result')
      body.dispatchEvent(new Event('input', { bubbles: true }))
      relation.value = action.calmyId
      relation.dispatchEvent(new Event('change', { bubbles: true }))
      document.querySelector('.record-row button')?.click()
      return { ok: true, actionId: action.calmyId }
    })()`)
    const actionResult = await waitForCondition(cdp, 'today-action-result', `(() => {
      const records = JSON.parse(localStorage.getItem('b_realityRecords') || '[]')
      const action = JSON.parse(localStorage.getItem('b_mvpActions') || '[]').find(item => item.title === 'UI smoke synthetic task')
      return {
        ok: !!action && action.status === 'done' && records.some(item => item.body === 'UI smoke action result' && item.actionId === action.calmyId) && !!document.querySelector('[aria-label="重新打开行动"]') && document.querySelector('.save-state')?.textContent?.includes('已保存'),
        persisted: records.some(item => item.body === 'UI smoke action result' && item.actionId === action?.calmyId),
        actionDone: action?.status === 'done',
        saveLabel: document.querySelector('.save-state')?.textContent || null
      }
    })()`)

    await evaluateStable(cdp, `(() => { location.hash = '#/app/today'; return true })()`)
    const today = await waitForCondition(cdp, 'today-route', `(() => ({
      ok: location.hash.includes('/app/today') && !!document.querySelector('.today-page') && document.body.innerText.includes('今天先定向'),
      route: location.hash
    }))()`)

    await evaluateStable(cdp, `(() => { location.hash = '#/app/capture'; return true })()`)
    const capture = await waitForCondition(cdp, 'capture-mount', `(() => ({
      ok: location.hash.includes('/app/capture') && !!document.querySelector('.capture-page') && !!document.querySelector('.capture-box textarea'),
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
      ok: [...document.querySelectorAll('.history-card p')].some(node => node.textContent?.includes('UI smoke capture')) && !!document.querySelector('.suggestion-card'),
      saveLabel: document.querySelector('.save-state')?.textContent || null,
      persistedCapture: localStorage.getItem('b_calmyCaptures')?.includes('UI smoke capture') || false
    }))()`)

    await evaluateStable(cdp, `(() => { document.querySelector('.suggestion-actions .reject')?.click(); return true })()`)
    const rejected = await waitForCondition(cdp, 'capture-reject-preserves-source', `(() => ({
      ok: [...document.querySelectorAll('.history-card p')].some(node => node.textContent?.includes('UI smoke capture')) && document.querySelectorAll('.suggestion-card').length === 0,
      persistedCapture: localStorage.getItem('b_calmyCaptures')?.includes('UI smoke capture') || false
    }))()`)

    await evaluateStable(cdp, `(() => { location.hash = '#/app/admin'; return true })()`)
    await waitForCondition(cdp, 'admin-data-management', `(() => ({
      ok: location.hash.includes('/app/admin') && !!document.querySelector('#file-import') && document.body.innerText.includes('数据管理')
    }))()`)
    await cdp.call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir })
    await evaluateStable(cdp, `(() => { [...document.querySelectorAll('.btns button')].find(button => button.textContent?.includes('导出'))?.click(); return true })()`)
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
    await cdp.call('Page.navigate', { url: testUrl })
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
    await evaluateStable(cdp, `(() => { location.hash = '#/app/today'; return true })()`)
    const importedToday = await waitForCondition(cdp, 'backup-visible-in-today', `(() => ({
      ok: location.hash.includes('/app/today') && [...document.querySelectorAll('.action-card')].some(node => node.textContent?.includes('UI smoke synthetic task'))
    }))()`)
    const accessibilityTree = await cdp.call('Accessibility.getFullAXTree')
    const accessibilityNames = new Set((accessibilityTree?.nodes || []).map(node => node.name?.value).filter(Boolean))
    const accessibilityTreeVisible = {
      ok: ['Today', 'Capture', '课题', '复盘', '保存记录', '现实记录内容'].every(name => accessibilityNames.has(name)),
      names: ['Today', 'Capture', '课题', '复盘', '保存记录', '现实记录内容'].filter(name => accessibilityNames.has(name))
    }

    await evaluateStable(cdp, `(() => {
      const field = document.querySelector('.record-row textarea')
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
    for (let index = 0; index < 4; index += 1) {
      await dispatchKey('Tab', 'Tab', 9)
      keyboardTrace.push(await evaluateStable(cdp, `(() => ({
        tag: document.activeElement?.tagName || null,
        aria: document.activeElement?.getAttribute('aria-label') || null,
        text: document.activeElement?.textContent?.trim().slice(0, 20) || null
      }))()`))
    }
    await evaluateStable(cdp, `(() => {
      const button = document.querySelector('.record-row button')
      window.__uiSmokeEnter = false
      button?.addEventListener('keydown', event => { if (event.key === 'Enter') window.__uiSmokeEnter = true }, { once: true })
      button?.focus()
      return true
    })()`)
    await dispatchKey('Enter', 'Enter', 13)
    const keyboardEnter = await waitForCondition(cdp, 'keyboard-enter-event', `(() => ({ ok: window.__uiSmokeEnter === true }))()`)
    const keyboardFocus = {
      ok: keyboardTrace.some(item => item?.aria === '记录类型') &&
        keyboardTrace.some(item => item?.aria === '结果关联行动') &&
        keyboardTrace.some(item => item?.aria === '记录关联 Matter') &&
        keyboardTrace.some(item => item?.tag === 'BUTTON' && item?.text === '保存记录') &&
        keyboardEnter.ok,
      trace: keyboardTrace
    }

    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    const mobileLayout = await waitForCondition(cdp, 'mobile-layout', `(() => {
      const width = window.innerWidth
      const record = document.querySelector('.record-row')?.getBoundingClientRect()
      const bottomButtons = [...document.querySelectorAll('.bottom-nav button')]
      return {
        ok: width === 390 && !!document.querySelector('.mobile-header') && !!document.querySelector('.bottom-nav') && !document.querySelector('.sidebar') && document.documentElement.scrollWidth <= width + 1 && (!record || record.right <= width + 1) && bottomButtons.length === 5 && bottomButtons.every(button => button.getBoundingClientRect().height >= 44),
        width,
        scrollWidth: document.documentElement.scrollWidth,
        bottomNav: !!document.querySelector('.bottom-nav'),
        recordRight: record?.right || null
      }
    })()`)

    await evaluateStable(cdp, `(() => { document.querySelector('.bottom-nav button[aria-label="更多导航"]')?.click(); return true })()`)
    const mobileDrawer = await waitForCondition(cdp, 'mobile-more-drawer', `(() => {
      const drawer = document.querySelector('#mobile-more-drawer')
      const panel = drawer?.closest('.el-drawer')
      const rect = panel?.getBoundingClientRect()
      return {
        ok: !!drawer && !!panel && !!rect && rect.width > 0 && rect.height > 0 && getComputedStyle(panel).visibility !== 'hidden' && !!document.querySelector('.drawer-close') && document.querySelector('.bottom-nav button[aria-label="更多导航"]')?.getAttribute('aria-expanded') === 'true',
        width: rect?.width || 0,
        expanded: document.querySelector('.bottom-nav button[aria-label="更多导航"]')?.getAttribute('aria-expanded') || null
      }
    })()`)
    const mobileDrawerAccessibilityTree = await cdp.call('Accessibility.getFullAXTree')
    const mobileDrawerAccessibilityNames = new Set((mobileDrawerAccessibilityTree?.nodes || []).map(node => node.name?.value).filter(Boolean))
    const mobileDialogs = (mobileDrawerAccessibilityTree?.nodes || []).filter(node => node.role?.value === 'dialog' && node.ignored !== true)
    const mobileDialog = mobileDialogs.find(node => node.name?.value === '更多入口')
    const mobileDialogIsModal = mobileDialog?.properties?.some(property => property.name === 'modal' && property.value?.value === true) === true
    const mobileDrawerDomState = await evaluateStable(cdp, `(() => ({
      text: document.querySelector('#mobile-more-drawer')?.textContent || '',
      hasDialogTrigger: document.querySelector('[aria-controls="mobile-more-drawer"]')?.getAttribute('aria-haspopup') === 'dialog'
    }))()`)
    const mobileDrawerAccessibilityVisible = {
      ok: ['更多入口', '搜索课题', '关闭更多入口'].every(name => mobileDrawerAccessibilityNames.has(name)) && !!mobileDialog && mobileDialogIsModal && ['设置与同步', '日历视图'].every(name => mobileDrawerDomState.text.includes(name)) && mobileDrawerDomState.hasDialogTrigger,
      names: ['更多入口', '搜索课题', '设置与同步', '日历视图', '关闭更多入口'].filter(name => mobileDrawerAccessibilityNames.has(name)),
      dialogs: mobileDialogs.map(node => ({ role: node.role?.value || null, name: node.name?.value || null, ignored: node.ignored, properties: node.properties?.map(property => ({ name: property.name, value: property.value?.value })) || [] }))
    }
    await dispatchKey('Escape', 'Escape', 27)
    const mobileDrawerClosed = await waitForCondition(cdp, 'mobile-more-drawer-closed', `(() => ({
      ok: document.querySelector('.mobile-header .menu')?.getAttribute('aria-expanded') === 'false' && document.querySelector('.bottom-nav button[aria-label="更多导航"]')?.getAttribute('aria-expanded') === 'false'
    }))()`)
    await waitForCondition(cdp, 'mobile-more-drawer-settled', `(() => {
      const panel = document.querySelector('#mobile-more-drawer')?.closest('.el-drawer')
      const rect = panel?.getBoundingClientRect()
      const style = panel ? getComputedStyle(panel) : null
      return { ok: !panel || style?.visibility === 'hidden' || (rect?.width || 0) === 0 }
    })()`, 5000)

    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 820, height: 900, deviceScaleFactor: 1, mobile: true })
    const tabletLayout = await waitForCondition(cdp, 'tablet-layout', `(() => ({
      ok: window.innerWidth === 820 && !!document.querySelector('.mobile-header') && !!document.querySelector('.bottom-nav') && document.documentElement.scrollWidth <= window.innerWidth + 1 && [...document.querySelectorAll('.page-container button,.page-container select,.mobile-header button')].filter(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 }).every(node => node.getBoundingClientRect().height >= 44) && ['.record-row', '.create-row', '.today-review'].map(selector => window.__auditLayout(selector)).every(result => result.ok),
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      undersizedControls: [...document.querySelectorAll('.page-container button,.page-container select,.mobile-header button')].filter(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && rect.height < 44 }).length
    }))()`)
    const tabletToday = await waitForCondition(cdp, 'tablet-today-route', `(() => ({
      ok: location.hash.includes('/app/today') && !!document.querySelector('.today-page') && document.querySelectorAll('.bottom-nav button[aria-current="page"]').length === 1 && document.querySelector('.bottom-nav button[aria-current="page"]')?.textContent?.includes('Today')
    }))()`)
    const tabletCapture = await navigateHashWithRetry('tablet-capture-route', '#/app/capture', `(() => ({
      ok: location.hash.includes('/app/capture') && !!document.querySelector('.capture-page') && document.documentElement.scrollWidth <= window.innerWidth + 1 && document.querySelectorAll('.bottom-nav button[aria-current="page"]').length === 1 && document.querySelector('.bottom-nav button[aria-current="page"]')?.textContent?.includes('Capture'),
      active: document.querySelector('.bottom-nav [aria-current="page"]')?.textContent?.trim() || null
    }))()`)
    const tabletReview = await navigateHashWithRetry('tablet-review-route', '#/app/review', `(() => ({
      ok: location.hash.includes('/app/review') && !!document.querySelector('.review-page') && !!document.querySelector('.today-review') && document.querySelectorAll('.today-review textarea[aria-label]').length === 4 && document.documentElement.scrollWidth <= window.innerWidth + 1 && document.querySelectorAll('.bottom-nav button[aria-current="page"]').length === 1 && document.querySelector('.bottom-nav button[aria-current="page"]')?.textContent?.includes('复盘'),
      active: document.querySelector('.bottom-nav [aria-current="page"]')?.textContent?.trim() || null
    }))()`)
    const tabletTodayRestored = await navigateHashWithRetry('tablet-today-route-restored', '#/app/today', `(() => ({
      ok: location.hash.includes('/app/today') && !!document.querySelector('.today-page') && document.querySelectorAll('.bottom-nav button[aria-current="page"]').length === 1 && document.querySelector('.bottom-nav button[aria-current="page"]')?.textContent?.includes('Today')
    }))()`)
    const tabletMatters = await navigateHashWithRetry('tablet-matters-route', '#/app/matters', `(() => ({
      ok: location.hash.includes('/app/matters') && !!document.querySelector('.matters-page') && document.documentElement.scrollWidth <= window.innerWidth + 1 && document.querySelectorAll('.bottom-nav button[aria-current="page"]').length === 1 && document.querySelector('.bottom-nav button[aria-current="page"]')?.textContent?.includes('课题'),
      active: document.querySelector('.bottom-nav [aria-current="page"]')?.textContent?.trim() || null
    }))()`)

    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1024, height: 900, deviceScaleFactor: 1, mobile: false })
    const mediumToday = await navigateHashWithRetry('medium-today-route', '#/app/today', `(() => ({
      ok: location.hash.includes('/app/today') && !!document.querySelector('.today-page') && !!document.querySelector('.sidebar') && !document.querySelector('.bottom-nav') && getComputedStyle(document.querySelector('.right-rail')).display === 'none' && document.documentElement.scrollWidth <= window.innerWidth + 1 && ['.record-row', '.create-row'].map(selector => window.__auditLayout(selector)).every(result => result.ok),
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
      ok: !!document.querySelector('.sidebar') && !!document.querySelector('.desktop-topbar') && !document.querySelector('.bottom-nav')
    }))()`)

    const rightSidebarDefault = await waitForCondition(cdp, 'right-sidebar-default-collapsed', `(() => {
      const shell = document.querySelector('.app-shell')
      const rail = document.querySelector('#app-right-sidebar')
      const trigger = document.querySelector('.sidebar-foot [aria-controls="app-right-sidebar"]')
      return {
        ok: shell?.classList.contains('right-sidebar-collapsed') === true && !!rail && getComputedStyle(rail).display === 'flex' && Math.round(rail.getBoundingClientRect().width) === 72 && trigger?.getAttribute('aria-expanded') === 'false' && !trigger?.hasAttribute('aria-haspopup') && document.documentElement.scrollWidth <= window.innerWidth + 1,
        width: rail?.getBoundingClientRect().width || 0,
        expanded: trigger?.getAttribute('aria-expanded') || null
      }
    })()`)
    await evaluateStable(cdp, `(() => { document.querySelector('.sidebar-foot [aria-controls="app-right-sidebar"]')?.click(); return true })()`)
    const rightSidebarExpanded = await waitForCondition(cdp, 'right-sidebar-expanded', `(() => {
      const shell = document.querySelector('.app-shell')
      const rail = document.querySelector('#app-right-sidebar')
      return {
        ok: shell?.classList.contains('right-sidebar-expanded') === true && localStorage.getItem('calmy_right_sidebar_collapsed') === '0' && Math.round(rail?.getBoundingClientRect().width || 0) === 264 && document.querySelector('.right-sidebar-toggle')?.getAttribute('aria-label') === '收起右侧栏' && document.documentElement.scrollWidth <= window.innerWidth + 1,
        width: rail?.getBoundingClientRect().width || 0
      }
    })()`)
    await evaluateStable(cdp, `(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, shiftKey: true, bubbles: true })); return true })()`)
    const rightSidebarKeyboardCollapsed = await waitForCondition(cdp, 'right-sidebar-keyboard-collapse', `(() => ({
      ok: document.querySelector('.app-shell')?.classList.contains('right-sidebar-collapsed') === true && localStorage.getItem('calmy_right_sidebar_collapsed') === '1' && document.querySelector('.right-sidebar-toggle')?.getAttribute('aria-label') === '展开右侧栏'
    }))()`)

    const cycleRoute = await navigateHashWithRetry('cycle-route', '#/app/cycle', `(() => ({
      ok: location.hash.includes('/app/cycle') && !!document.querySelector('.cycle-page') && !!document.querySelector('.cycle-orbit') && document.documentElement.scrollWidth <= window.innerWidth + 1
    }))()`)
    const profileRoute = await navigateHashWithRetry('profile-route', '#/app/profile', `(() => ({
      ok: location.hash.includes('/app/profile') && !!document.querySelector('.profile-page') && !!document.querySelector('.profile-module-grid') && document.body.innerText.includes('全部模块入口') && document.documentElement.scrollWidth <= window.innerWidth + 1
    }))()`)
    const goalsRoute = await navigateHashWithRetry('goals-route', '#/app/module/goals', `(() => ({
      ok: location.hash.includes('/app/module/goals') && !!document.querySelector('.goals-page') && document.documentElement.scrollWidth <= window.innerWidth + 1
    }))()`)
    const itemsAlias = await navigateHashWithRetry('items-alias-route', '#/app/items', `(() => ({
      ok: location.hash.includes('/app/matters') && !!document.querySelector('.matters-page')
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
        [...document.querySelectorAll('.action-card')].some(node => node.textContent?.includes('UI smoke synthetic task')) &&
        document.querySelector('.app-shell')?.classList.contains('sidebar-collapsed') === true &&
        document.querySelector('.app-shell')?.classList.contains('right-sidebar-collapsed') === true &&
        document.querySelector('.sidebar-toggle')?.getAttribute('aria-label') === '展开侧边栏',
      sidebarCollapsed: document.querySelector('.app-shell')?.classList.contains('sidebar-collapsed') === true && document.querySelector('.sidebar-toggle')?.getAttribute('aria-label') === '展开侧边栏',
      rightSidebarCollapsed: document.querySelector('.app-shell')?.classList.contains('right-sidebar-collapsed') === true && localStorage.getItem('calmy_right_sidebar_collapsed') === '1',
      route: location.hash,
      persistedTask: localStorage.getItem('b_mvpActions')?.includes('UI smoke synthetic task') || false,
      externalAttempts: window.__uiSmokeExternalAttempts?.length || 0
    }))()`)

    const checks = {
      appMounted: home.ok,
        sidebarCollapseVisible: collapsedSidebar.ok,
        sidebarExpandVisible: expandedSidebar.ok,
        sidebarKeyboardVisible: keyboardCollapsed.ok && typingGuard.ok,
      todayDefaultViewVisible: home.ok,
      syntheticLocalDataVisible: seeded.ok,
      recordActionResultVisible: recordedAction?.ok === true && actionResult.ok,
      todayRouteViewVisible: today.ok,
      captureFlowVisible: capture.ok && captured.ok,
      captureSaveStateVisible: captured.saveLabel?.includes('已保存') || false,
      captureRejectPreservesSource: rejected.ok && rejected.persistedCapture,
      refreshRestoredLocalData: refreshed.ok && refreshed.persistedTask,
      sidebarStateRestoredAfterRefresh: refreshed.sidebarCollapsed,
      rightSidebarVisible: rightSidebarDefault.ok && rightSidebarExpanded.ok && rightSidebarKeyboardCollapsed.ok,
      rightSidebarStateRestoredAfterRefresh: refreshed.rightSidebarCollapsed,
      referencePagesVisible: cycleRoute.ok && profileRoute.ok && goalsRoute.ok && itemsAlias.ok,
      mobileLayoutVisible: mobileLayout.ok,
      mobileDrawerVisible: mobileDrawer.ok,
      mobileDrawerClosed: mobileDrawerClosed.ok,
      mobileDrawerAccessibilityVisible: mobileDrawerAccessibilityVisible.ok,
      tabletLayoutVisible: tabletLayout.ok && tabletToday.ok && tabletMatters.ok && tabletCapture.ok && tabletReview.ok && tabletTodayRestored.ok,
      mediumLayoutVisible: mediumToday.ok && mediumReview.ok,
      keyboardFocusVisible: keyboardFocus.ok,
      keyboardEnterVisible: keyboardEnter.ok,
      accessibilityTreeVisible: accessibilityTreeVisible.ok
    }
    const report = {
      ok: Object.values(checks).every(Boolean),
      checks,
      exportImport: exportRoundTrip,
      mobileDrawerAccessibility: mobileDrawerAccessibilityVisible,
      route: refreshed.route,
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
    const message = error instanceof Error ? error.stack || error.message : String(error)
    throw new Error(`${message}\nchrome=${JSON.stringify(chromeLogs)}`)
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
