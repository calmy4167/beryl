// 一次性截图脚本：「空」页面 (/kong)
// 复用仓库既有 CDP 工具链的启动方式（stdio:'ignore'），连接已运行的 dev server (5173)。
// 只写 PNG 到 tmp/kong/，不改动仓库源码。
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import net from 'node:net'

const root = fileURLToPath(new URL('..', import.meta.url))
// 注意：本工作区只有根目录对受限进程可写（子目录缺「取得所有权」授权），
// 因此截图输出到根目录下的 kong-shots/，而不是 tmp/。
const outDir = join(root, 'kong-shots')
mkdirSync(outDir, { recursive: true })

const baseUrl = process.env.KONG_BASE || 'http://127.0.0.1:5173'
const browser = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].find(existsSync)
if (!browser) { console.log('Chrome not found'); process.exit(0) }

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
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

const debugPort = await freePort()
const profile = mkdtempSync(join(tmpdir(), 'calmy-kong-'))
let chrome
let socket
let nextId = 0
const pending = new Map()

try {
  const health = await fetch(baseUrl).then(r => r.ok).catch(() => false)
  if (!health) throw new Error(`dev server not reachable at ${baseUrl}`)

  chrome = spawn(browser, [
    '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox',
    '--disable-background-networking', '--disable-component-update', '--disable-default-apps',
    '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1440,900',
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
    const file = join(outDir, `${name}.png`)
    writeFileSync(file, Buffer.from(data, 'base64'))
    console.log('saved', file)
  }
  // hash 导航不会重新加载页面，必须先离开再进入，否则拿到上一轮残留的状态
  const goto = async (hash, waitMs = 4200) => {
    await call('Page.navigate', { url: 'about:blank' })
    await sleep(400)
    await call('Page.navigate', { url: `${baseUrl}/#${hash}` })
    await sleep(waitMs)
    const mounted = await evaluate(`!!document.querySelector('.kong')`)
    if (!mounted) throw new Error(`kong-not-mounted at ${hash}`)
  }
  const stateOf = () => evaluate(`(() => {
    const root = document.querySelector('.kong')
    return {
      phase: root?.dataset.phase,
      theme: root?.dataset.theme,
      items: document.querySelectorAll('.kong-list li:not(.is-released)').length,
      hint: !!document.querySelector('.kong-hint.is-visible'),
      emptyNotes: [...document.querySelectorAll('.kong-empty-note, .kong-final')]
        .map(el => Number(getComputedStyle(el).opacity).toFixed(2)).join(','),
      shell: !!document.querySelector('.app-shell, .sidebar, .primary-nav, .stage-shell'),
      scroll: document.documentElement.scrollHeight > window.innerHeight + 1
    }
  })()`)

  await call('Page.enable')
  await call('Runtime.enable')

  // 1) 携带：九件东西 + 提示
  await goto('/kong', 5400)
  console.log('01', JSON.stringify(await stateOf()))
  await shot('01-carrying')

  // 2) 看见它的来处（就地展开）
  await evaluate(`document.getElementById('kong-item-judgement')?.click()`)
  await sleep(1600)
  await shot('02-open')

  // 3) 松开：散掉的过程
  await evaluate(`document.querySelector('.kong-list li.is-open .kong-release')?.click()`)
  await sleep(680)
  await shot('03-releasing')
  await sleep(1500)

  // 4) 全部松开之后的空白（等终点文案全部淡入）
  const ids = ['message', 'decision', 'should', 'project', 'worry', 'afternoon', 'records', 'page']
  for (const id of ids) {
    await evaluate(`document.querySelector('#kong-item-${id}')?.closest('li')?.querySelector('.kong-release')?.click()`)
    await sleep(1650)
  }
  for (let i = 0; i < 40; i++) {
    if (await evaluate(`document.querySelector('.kong')?.dataset.phase`) === 'empty') break
    await sleep(250)
  }
  await sleep(6500)
  console.log('04', JSON.stringify(await stateOf()))
  await shot('04-empty')

  // 5) 连这里也放下
  await evaluate(`document.querySelector('.kong-final')?.click()`)
  await sleep(6600)
  console.log('05', JSON.stringify(await stateOf()))
  await shot('05-void')

  // 6) 浅色主题（H 切换）
  await goto('/kong', 4400)
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }))`)
  await sleep(2000)
  console.log('06', JSON.stringify(await stateOf()))
  await shot('06-light')

  // 7) 手机尺寸
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await goto('/kong', 5400)
  console.log('07', JSON.stringify(await stateOf()))
  await shot('07-mobile')
} finally {
  try { socket?.close() } catch { /* ignore */ }
  try { chrome?.kill() } catch { /* ignore */ }
  await sleep(300)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* ignore */ }
}
