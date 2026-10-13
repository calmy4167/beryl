// 「留白」迁移走查截图：外壳 + 已迁移页面（开发通道 /#/liubai-preview）。
// 复用仓库既有 CDP 启动方式，连接已运行的 dev server（注意：Vite 只绑 IPv6，用 localhost）。
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import net from 'node:net'

const root = fileURLToPath(new URL('..', import.meta.url))
const outDir = join(root, 'liubai-shots')
mkdirSync(outDir, { recursive: true })

const baseUrl = process.env.LIUBAI_BASE || 'http://localhost:5173'
const browser = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].find(existsSync)
if (!browser) { console.log('Chrome not found'); process.exit(0) }

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (!address || typeof address === 'string') return reject(new Error('port-not-resolved'))
    const port = address.port
    server.close(error => error ? reject(error) : resolve(port))
  })
})

const debugPort = await freePort()
const profile = mkdtempSync(join(tmpdir(), 'liubai-shot-'))
let chrome, socket
let nextId = 0
const pending = new Map()

try {
  if (!(await fetch(baseUrl).then(r => r.ok).catch(() => false))) throw new Error(`dev server not reachable: ${baseUrl}`)
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
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(data, 'base64'))
    console.log('saved', `${name}.png`)
  }
  const openPreview = async (theme, module = '', waitMs = 3400) => {
    // 主题必须在页面脚本执行前写入：外壳在 onMounted 里读一次 liubai-theme。
    // theme 传空字符串表示"不播种"，用来验证应用自身的默认主题。
    await call('Page.navigate', { url: theme ? `${baseUrl}/?theme=${encodeURIComponent(theme)}` : `${baseUrl}/` })
    await sleep(2600)
    await evaluate(`(() => { location.hash = '#/liubai-preview${module}'; return true })()`)
    await sleep(waitMs)
    return evaluate(`(() => {
      const b = document.body
      return {
        route: location.hash, theme: b.dataset.theme, zen: b.classList.contains('zen-mode'),
        shell: document.documentElement.classList.contains('liubai-active'),
        // .slide-head 总数（>1 就是双标题）；ownHeads 是直接挂在 .inner 下的（外壳让位的页面应当只有页面的那一个）
        heads: document.querySelectorAll('.inner .slide-head').length,
        ownHeads: document.querySelectorAll('.inner > .slide-head').length,
        headTag: document.querySelector('.inner .slide-head h1, .inner .slide-head h2')?.tagName || null,
        panels: document.querySelectorAll('.inner .panel').length,
        stats: document.querySelectorAll('.inner .stat').length,
        rows: document.querySelectorAll('.inner .ov-list li').length,
        text: (document.querySelector('.inner')?.innerText || '').replace(/\\s+/g, ' ').slice(0, 220)
      }
    })()`)
  }

  await call('Page.enable')
  await call('Runtime.enable')
  // 挂载前播种外壳状态（等价于老用户已有的 localStorage）
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const q = new URLSearchParams(location.search);
      const theme = q.get('theme');
      try {
        if (theme) localStorage.setItem('liubai-theme', theme);
        else localStorage.removeItem('liubai-theme');
        localStorage.setItem('liubai-nav', 'left');
        localStorage.setItem('liubai-zen', '0');
        localStorage.setItem('liubai-mode', 'full');
      } catch (error) { /* 隐私模式 */ }
    })()`
  })

  console.log('today:', JSON.stringify(await openPreview('night', '')))
  await shot('11-today-night')

  console.log('tasks:', JSON.stringify(await openPreview('night', '/tasks')))
  await shot('14-tasks-night')

  console.log('habits:', JSON.stringify(await openPreview('night', '/habits')))
  await shot('15-habits-night')

  console.log('pomo:', JSON.stringify(await openPreview('night', '/pomo')))
  await shot('18-pomo-night')

  console.log('diary:', JSON.stringify(await openPreview('night', '/diary')))
  console.log('diary geometry:', JSON.stringify(await evaluate(`(() => {
    const notes = document.querySelector('.notes')
    const card = document.querySelector('.notes .note-item')
    if (!notes || !card) return { found: false }
    const cs = getComputedStyle(notes), ccs = getComputedStyle(card)
    return { notesDisplay: cs.display, columns: cs.gridTemplateColumns, cardWidth: Math.round(card.getBoundingClientRect().width), gridColumn: ccs.gridColumn, panelWidth: Math.round(notes.getBoundingClientRect().width) }
  })()`)))
  await sleep(400)
  await shot('19-diary-night')

  console.log('review:', JSON.stringify(await openPreview('night', '/review')))
  await shot('20-review-night')

  console.log('capture:', JSON.stringify(await openPreview('night', '/capture')))
  await shot('21-capture-night')

  // 外壳是否真的承接了全站反馈通道（beryl-toast / beryl-save-state）
  console.log('toast:', JSON.stringify(await evaluate(`(async () => {
    window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message: '提示通道自检', kind: 'success' } }))
    await new Promise(r => setTimeout(r, 400))
    const el = document.querySelector('.toast')
    const visible = !!el && getComputedStyle(el).opacity === '1'
    const text = el?.textContent || ''
    window.dispatchEvent(new CustomEvent('beryl-save-state', { detail: { state: 'failed' } }))
    await new Promise(r => setTimeout(r, 400))
    return { visible, text, afterSaveState: document.querySelector('.toast')?.textContent || '' }
  })()`)))
  await shot('23-capture-toast')

  console.log('matters:', JSON.stringify(await openPreview('night', '/matters')))
  await shot('22-matters-night')

  // 日期切换：位置与展开后的菜单
  await openPreview('night', '/review')
  console.log('dateNav:', JSON.stringify(await evaluate(`(() => {
    const head = document.querySelector('.inner > .slide-head')
    const nav = document.querySelector('.inner .date-nav')
    const trig = document.querySelector('.inner .dn-trigger')
    const gear = document.querySelector('.gear')
    const hud = document.querySelector('.hud-toggle')
    const title = document.querySelector('.inner > .slide-head h1, .inner > .slide-head h2')
    if (!nav || !head || !trig) return { found: false }
    const r = nav.getBoundingClientRect(); const h = head.getBoundingClientRect()
    const t = title?.getBoundingClientRect()
    const iconBottom = Math.max(gear?.getBoundingClientRect().bottom || 0, hud?.getBoundingClientRect().bottom || 0)
    return {
      found: true,
      navTop: Math.round(r.top), navRight: Math.round(r.right),
      titleTop: t ? Math.round(t.top) : null, titleBottom: t ? Math.round(t.bottom) : null,
      iconBottom: Math.round(iconBottom),
      overlapsIcons: Math.round(r.top) < Math.round(iconBottom),
      alignedWithTitle: t ? Math.abs(r.bottom - t.bottom) < 24 : null,
      text: trig.textContent?.trim() || ''
    }
  })()`)))
  await evaluate(`document.querySelector('.inner .dn-trigger')?.click()`)
  await sleep(700)
  console.log('menu:', JSON.stringify(await evaluate(`(() => {
    const menu = document.querySelector('.date-menu')
    if (!menu) return { open: false }
    const r = menu.getBoundingClientRect()
    return { open: menu.classList.contains('open'), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), items: [...menu.querySelectorAll('.dm-item')].filter(b => !b.hidden).map(b => b.textContent.trim()) , inViewport: r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 }
  })()`)))
  await shot('24-datenav')

  // 应用自身默认主题（不播种 liubai-theme）：应为参考稿默认的「深夜」
  console.log('defaultTheme:', JSON.stringify(await openPreview('', '/legacy/finance')))
  await shot('31-default-theme')

  // 删掉四层死 CSS 后的回归：已迁移页 + 手机尺寸
  console.log('after-css-purge today:', JSON.stringify(await openPreview('night', '')))
  await shot('40-purge-today')
  console.log('after-css-purge capture:', JSON.stringify(await openPreview('night', '/capture')))
  await shot('41-purge-capture')
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  console.log('after-css-purge mobile:', JSON.stringify(await openPreview('night', '')))
  await shot('42-purge-mobile')
  await call('Emulation.clearDeviceMetricsOverride')

  // 旧页面已全部迁完，legacy 走查通道只剩占位（保留以便回归时快速对照）
  console.log('legacy leftover:', JSON.stringify(await evaluate(`location.hash`)))

  // 人物（已迁到 v11：slide-head + 重要日期/新增人物/人物列表面板 + 统计块）
  console.log('people:', JSON.stringify(await openPreview('night', '/people')))
  await shot('70-people-night')
  console.log('people hud blocks:', await evaluate(`document.querySelectorAll('.inner .collapsible[data-hud-rank]').length`))
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }))`)
  await sleep(700)
  console.log('people hud1 hidden:', await evaluate(`document.querySelectorAll('.inner .hud-hidden').length`))
  await shot('71-people-hud1')
  console.log('people paper:', JSON.stringify(await openPreview('paper', '/people')))
  await shot('72-people-paper')

  // 主数据（已迁到 v11：slide-head + tab 段 + 句子素材面板 + 统计/说明块）
  console.log('masterData:', JSON.stringify(await openPreview('night', '/master-data')))
  await shot('80-masterdata-night')
  // 切到「人物」tab：验证 PeoplePage 的 embedded 形态不会渲染第二个标题
  console.log('masterData/people tab:', await evaluate(`(() => {
    const target = [...document.querySelectorAll('[role="tab"]')].find(item => item.textContent.trim() === '人物')
    target?.click()
    return !!target
  })()`))
  await sleep(900)
  console.log('masterData/people:', JSON.stringify(await evaluate(`(() => ({
    heads: document.querySelectorAll('.inner .slide-head').length,
    embedded: !!document.querySelector('.people-page-embedded'),
    panels: document.querySelectorAll('.inner .panel').length,
    h2: [...document.querySelectorAll('.inner h2')].map(n => n.textContent.trim()).slice(0, 3)
  }))()`)))
  await shot('81-masterdata-people')
  console.log('masterData paper:', JSON.stringify(await openPreview('paper', '/master-data')))
  await shot('82-masterdata-paper')

  // 现实情境（已迁到 v11：slide-head + 开始情境/长期空间面板 + 情境卡片面板）
  console.log('realityScenes:', JSON.stringify(await openPreview('night', '/reality-scenes')))
  await shot('90-scenes-night')
  console.log('scenes hud blocks:', await evaluate(`document.querySelectorAll('.inner .collapsible[data-hud-rank]').length`))
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }))`)
  await sleep(700)
  console.log('scenes hud1 hidden:', await evaluate(`document.querySelectorAll('.inner .hud-hidden').length`))
  await shot('91-scenes-hud1')
  console.log('scenes panel check:', JSON.stringify(await evaluate(`(() => {
    const heads = document.querySelectorAll('.inner .slide-head')
    return { heads: heads.length, ownHeads: document.querySelectorAll('.inner > .slide-head').length,
      headTag: document.querySelector('.inner .slide-head h1, .inner .slide-head h2')?.tagName || null,
      panels: document.querySelectorAll('.inner .panel').length }
  })()`)))
  console.log('scenes paper:', JSON.stringify(await openPreview('paper', '/reality-scenes')))
  await shot('92-scenes-paper')

  // 情境视图（已迁到 v11：slide-head + 筛选面板 + 概览/资料卡片面板）
  console.log('realityContext:', JSON.stringify(await openPreview('night', '/reality-context')))
  await shot('100-context-night')
  console.log('context panel check:', JSON.stringify(await evaluate(`(() => ({
    heads: document.querySelectorAll('.inner .slide-head').length,
    ownHeads: document.querySelectorAll('.inner > .slide-head').length,
    headTag: document.querySelector('.inner .slide-head h1, .inner .slide-head h2')?.tagName || null,
    panels: document.querySelectorAll('.inner .panel').length,
    filters: !!document.querySelector('.context-filters'),
    emptyText: (document.querySelector('.context-documents .dim')?.textContent || '').slice(0, 24)
  }))()`)))
  console.log('context paper:', JSON.stringify(await openPreview('paper', '/reality-context')))
  await shot('102-context-paper')

  // 目标 / 财务（已迁到 v11）
  for (const [name, route] of [['goals', '/goals'], ['finance', '/finance']]) {
    console.log(`${name}:`, JSON.stringify(await openPreview('night', route)))
    await shot(`110-${name}-night`)
    console.log(`${name} panel check:`, JSON.stringify(await evaluate(`(() => ({
      heads: document.querySelectorAll('.inner .slide-head').length,
      ownHeads: document.querySelectorAll('.inner > .slide-head').length,
      headTag: document.querySelector('.inner .slide-head h1, .inner .slide-head h2')?.tagName || null,
      panels: document.querySelectorAll('.inner .panel').length
    }))()`)))
  }
  console.log('goals paper:', JSON.stringify(await openPreview('paper', '/goals')))
  await shot('112-goals-paper')
  console.log('finance paper:', JSON.stringify(await openPreview('paper', '/finance')))
  await shot('113-finance-paper')

  // 资料（已迁到 v11：slide-head + 保存/附件面板 + 资源/洞察两个面板 + 统计）
  console.log('library:', JSON.stringify(await openPreview('night', '/library')))
  await shot('120-library-night')
  console.log('library panel check:', JSON.stringify(await evaluate(`(() => ({
    heads: document.querySelectorAll('.inner .slide-head').length,
    ownHeads: document.querySelectorAll('.inner > .slide-head').length,
    headTag: document.querySelector('.inner .slide-head h1, .inner .slide-head h2')?.tagName || null,
    panels: document.querySelectorAll('.inner .panel').length,
    gridSections: document.querySelectorAll('.library-grid > section').length,
    status: document.querySelector('.slide-head [role="status"]')?.textContent?.trim() || ''
  }))()`)))
  console.log('library paper:', JSON.stringify(await openPreview('paper', '/library')))
  await shot('122-library-paper')

  // 图谱（已迁到 v11：slide-head + 添加关系/关系图谱面板 + 节点与关系清单两个面板）
  console.log('graph:', JSON.stringify(await openPreview('night', '/graph')))
  await shot('130-graph-night')
  console.log('graph panel check:', JSON.stringify(await evaluate(`(() => ({
    heads: document.querySelectorAll('.inner .slide-head').length,
    ownHeads: document.querySelectorAll('.inner > .slide-head').length,
    headTag: document.querySelector('.inner .slide-head h1, .inner .slide-head h2')?.tagName || null,
    panels: document.querySelectorAll('.inner .panel').length,
    stats: document.querySelector('[aria-label="图谱统计"]')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
    nodeList: !!document.querySelector('.graph-node-list'),
    edgeList: !!document.querySelector('.edge-list'),
    inlineStyled: [...document.querySelectorAll('.inner *')].filter(n => (n.getAttribute('style') || '').includes('--c-')).length
  }))()`)))
  console.log('graph paper:', JSON.stringify(await openPreview('paper', '/graph')))
  await shot('132-graph-paper')

  // 收集 / 文章 / 我的 / 记忆 / 未来 / 探索 / 飞书 / 系统管理（已迁到 v11）
  for (const [name, route] of [['inbox', '/inbox'], ['posts', '/posts'], ['profile', '/profile'], ['memory', '/memory'], ['future', '/future'], ['flow', '/flow'], ['feishu', '/feishu'], ['system-admin', '/system/users'], ['matter-detail', '/matter/preview-id'], ['cycle', '/cycle']]) {
    console.log(`${name}:`, JSON.stringify(await openPreview('night', route)))
    await shot(`140-${name}-night`)
    console.log(`${name} panel check:`, JSON.stringify(await evaluate(`(() => ({
      heads: document.querySelectorAll('.inner .slide-head').length,
      ownHeads: document.querySelectorAll('.inner > .slide-head').length,
      headTag: document.querySelector('.inner .slide-head h1, .inner .slide-head h2')?.tagName || null,
      panels: document.querySelectorAll('.inner .panel').length,
      historyCards: document.querySelectorAll('.history-card').length,
      inlineLegacyTokens: [...document.querySelectorAll('.inner *')].filter(n => (n.getAttribute('style') || '').includes('--c-')).length
    }))()`)))
  }
  console.log('cycle style probe:', JSON.stringify(await evaluate(`(() => {
    const orbit = document.querySelector('.cycle-orbit')
    const center = document.querySelector('.cycle-center')
    const span = document.querySelector('.cycle-node > span')
    const cs = el => el ? getComputedStyle(el) : null
    return {
      orbitDataAttrs: orbit ? orbit.getAttributeNames().filter(n => n.startsWith('data-v')).join(',') : 'none',
      orbitBgImage: (cs(orbit)?.backgroundImage || '').slice(0, 80),
      centerBg: cs(center)?.backgroundColor,
      nodeSpanBg: cs(span)?.backgroundColor,
      panelVar: cs(document.body).getPropertyValue('--panel')
    }
  })()`)))
  console.log('inbox paper:', JSON.stringify(await openPreview('paper', '/inbox')))
  await shot('142-inbox-paper')
  console.log('posts paper:', JSON.stringify(await openPreview('paper', '/posts')))
  await shot('143-posts-paper')
  console.log('profile paper:', JSON.stringify(await openPreview('paper', '/profile')))
  await shot('144-profile-paper')
  console.log('memory paper:', JSON.stringify(await openPreview('paper', '/memory')))
  await shot('145-memory-paper')

  // 日程（已迁到 v11：slide-head + 月份面板 + 选中日面板 + 两个证据面板）
  console.log('calendar:', JSON.stringify(await openPreview('night', '/calendar')))
  await shot('150-calendar-night')
  console.log('calendar panel check:', JSON.stringify(await evaluate(`(() => ({
    heads: document.querySelectorAll('.inner .slide-head').length,
    ownHeads: document.querySelectorAll('.inner > .slide-head').length,
    headTag: document.querySelector('.inner .slide-head h1, .inner .slide-head h2')?.tagName || null,
    panels: document.querySelectorAll('.inner .panel').length,
    cells: document.querySelectorAll('.calendar-cell').length,
    monthLabel: document.querySelector('.month-panel')?.getAttribute('aria-label') || '',
    evidenceHeads: document.querySelectorAll('.evidence-panel .panel-head').length,
    inlineLegacyTokens: [...document.querySelectorAll('.inner *')].filter(n => (n.getAttribute('style') || '').includes('--c-')).length
  }))()`)))
  console.log('calendar paper:', JSON.stringify(await openPreview('paper', '/calendar')))
  await shot('152-calendar-paper')

  // 场景选择页：生产里是 standalone 路由（/scene，需登录），走查通道用免鉴权副本
  console.log('scene:', JSON.stringify(await openPreview('night', '/scene')))
  console.log('scene check:', JSON.stringify(await evaluate(`(() => ({
    archetype: !!document.querySelector('[data-page-archetype="experiment"]'),
    cards: document.querySelectorAll('.scene-card').length,
    pressed: document.querySelectorAll('.scene-card[aria-pressed="true"]').length,
    chips: document.querySelectorAll('.chip').length,
    inlineLegacyTokens: [...document.querySelectorAll('*')].filter(n => (n.getAttribute('style') || '').includes('--c-')).length
  }))()`)))
  await shot('151-scene-night')

  // 设置页（已迁到 v11：自带 .slide-head + .panel + .collapsible[data-hud-rank]）
  console.log('admin:', JSON.stringify(await openPreview('night', '/admin')))
  await shot('50-admin-night')
  console.log('admin hud blocks:', await evaluate(`document.querySelectorAll('.inner .collapsible[data-hud-rank]').length`))
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }))`)
  await sleep(700)
  console.log('admin hud1 hidden:', await evaluate(`document.querySelectorAll('.inner .hud-hidden').length`))
  await shot('51-admin-hud1')
  console.log('admin paper:', JSON.stringify(await openPreview('paper', '/admin')))
  await shot('52-admin-paper')

  // 看板（已迁到 v11：slide-head + .panel 列 + 筛选/统计/说明三块 collapsible）
  console.log('board:', JSON.stringify(await openPreview('night', '/board')))
  await shot('60-board-night')
  console.log('board hud blocks:', await evaluate(`document.querySelectorAll('.inner .collapsible[data-hud-rank]').length`))
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }))`)
  await sleep(700)
  console.log('board hud1 hidden:', await evaluate(`document.querySelectorAll('.inner .hud-hidden').length`))
  console.log('board columns:', JSON.stringify(await evaluate(`(() => {
    const board = document.querySelector('[aria-label="可拖动任务看板"]')
    if (!board) return { found: false }
    const cols = [...board.querySelectorAll('.task-board-column')]
    const r = board.getBoundingClientRect()
    return { found: true, count: cols.length, panels: cols.filter(c => c.classList.contains('panel')).length,
      heads: board.querySelectorAll('.panel-head').length,
      widths: cols.map(c => Math.round(c.getBoundingClientRect().width)),
      columnsMatchParent: cols.every(c => c.getBoundingClientRect().width <= r.width + 1),
      rowTops: [...new Set(cols.map(c => Math.round(c.getBoundingClientRect().top)))].length }
  })()`)))
  await shot('61-board-hud1')
  // 看板的飞书分支：第 25 轮把它的页面头也统一成 .slide-head（原来靠外壳的 .page-head 探针兜底）
  await evaluate(`(() => { const b = document.querySelectorAll('[aria-label="选择数据来源"] button'); b[1] && b[1].click(); return true })()`)
  await sleep(700)
  console.log('board feishu branch:', JSON.stringify(await evaluate(`(() => ({
    heads: document.querySelectorAll('.inner .slide-head').length,
    headTag: document.querySelector('.inner .slide-head h2')?.tagName || null,
    ownHeads: document.querySelectorAll('.inner > .slide-head').length,
    feishuBoard: !!document.querySelector('[aria-label="飞书任务看板"]'),
    legacyHead: !!document.querySelector('.inner .page-head'),
    shellHead: !!document.querySelector('.inner .shell-head')
  }))()`)))
  await shot('146-board-feishu')
  await evaluate(`(() => { const b = document.querySelectorAll('[aria-label="选择数据来源"] button'); b[0] && b[0].click(); return true })()`)
  await sleep(500)
  console.log('board paper:', JSON.stringify(await openPreview('paper', '/board')))
  await shot('62-board-paper')

  // 专注条布局：保护级别列已去掉，计时器不应落在中间列
  console.log('focusBar:', JSON.stringify(await evaluate(`(() => {
    const bar = document.querySelector('.focus-bar')
    const timer = document.querySelector('.fc-timer')
    if (!bar || !timer) return null
    const b = bar.getBoundingClientRect(); const t = timer.getBoundingClientRect()
    return { barWidth: Math.round(b.width), timerRight: Math.round(t.right), barRight: Math.round(b.right), timerLeft: Math.round(t.left) }
  })()`)))

  // HUD 档 1：辅助块应收起。必须在**习惯模块**上测量——之前这里紧接着旧页面循环，
  // 量到的是最后一个 legacy 页面（它没有 .collapsible），所以 16/17 两张图名不副实。
  await openPreview('night', '/habits')
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }))`)
  await sleep(900)
  console.log('hud1 hidden blocks:', await evaluate(`document.querySelectorAll('.inner .hud-hidden').length`))
  await shot('16-habits-hud1')

  // 简洁模式
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }))`)
  await sleep(900)
  console.log('simple:', await evaluate(`document.body.classList.contains('mode-simple')`))
  await shot('17-habits-simple')

  console.log('paper:', JSON.stringify(await openPreview('paper', '')))
  await shot('10-today-paper')

  // ── 模块导航（侧边栏）──────────────────────────────────────────────
  // 三种状态各截一张：桌面窄轨（默认）/ 桌面展开 / 窄屏抽屉。
  const navProbe = `(() => {
    const nav = document.querySelector('.dots')
    if (!nav) return { found: false }
    const r = nav.getBoundingClientRect()
    const cs = getComputedStyle(nav)
    const items = [...nav.querySelectorAll('.dot')]
    const visible = items.filter(item => item.getBoundingClientRect().height > 0)
    const labels = [...nav.querySelectorAll('.dot-label')].filter(el => el.getBoundingClientRect().width > 0)
    const slide = document.querySelector('.stage .slide.active')
    return {
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      radius: cs.borderRadius, border: cs.borderRightWidth + '/' + cs.borderLeftWidth,
      groups: nav.querySelectorAll('.dot-group').length, items: items.length, visibleItems: visible.length,
      visibleLabels: labels.length, active: nav.querySelectorAll('.dot.active').length,
      itemHeight: visible[0] ? Math.round(visible[0].getBoundingClientRect().height) : null,
      scrim: (() => { const el = document.querySelector('.nav-scrim'); return el ? getComputedStyle(el).visibility + '/' + getComputedStyle(el).opacity : 'none' })(),
      handle: (() => { const el = document.querySelector('.module-nav-handle'); return el ? getComputedStyle(el).opacity : 'none' })(),
      actionsVisible: nav.querySelectorAll('.desk-nav-actions button').length > 0 && getComputedStyle(nav.querySelector('.desk-nav-actions')).display !== 'none',
      brandNameVisible: (() => { const el = nav.querySelector('.desk-nav-brand-name'); return !!el && el.getBoundingClientRect().width > 0 })(),
      slidePadLeft: slide ? Math.round(parseFloat(getComputedStyle(slide).paddingLeft)) : null,
      brandOpacity: (() => { const el = document.querySelector('.brand'); return el ? getComputedStyle(el).opacity : null })()
    }
  })()`
  await openPreview('night', '')
  console.log('nav expanded:', JSON.stringify(await evaluate(navProbe)))
  await shot('160-nav-night')
  await evaluate(`(() => { const b = document.querySelector('.desk-nav-close'); if (b) b.click(); return true })()`)
  await sleep(600)
  console.log('nav rail:', JSON.stringify(await evaluate(navProbe)))
  await shot('162-nav-rail-night')
  await openPreview('paper', '')
  // 展开态是持久化的用户偏好；上一步刚收起过，这里显式展开再截图
  await evaluate(`(() => { if (!document.body.classList.contains('nav-show')) { const b = document.querySelector('.desk-nav-close') || document.querySelector('.module-nav-handle'); if (b) b.click() } return true })()`)
  await sleep(500)
  console.log('nav expanded paper:', JSON.stringify(await evaluate(navProbe)))
  await shot('161-nav-paper')
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  // 清掉桌面步骤写下的"侧边栏已展开"偏好，让窄屏走自己的默认（隐藏）
  await evaluate(`localStorage.removeItem('liubai-nav-open')`)
  await openPreview('night', '')
  await sleep(300)
  console.log('nav mobile diagnostics:', JSON.stringify(await evaluate(`(() => {
    const all = [...document.querySelectorAll('.dots')]
    return {
      viewport: [window.innerWidth, window.innerHeight],
      shell: !!document.querySelector('.liubai-shell'),
      bodyClass: document.body.className,
      dotsCount: all.length,
      dots: all.map(el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el)
        return { cls: el.className, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), radius: cs.borderRadius, pos: cs.position } })
    }
  })()`)))
  console.log('nav mobile closed:', JSON.stringify(await evaluate(navProbe)))
  await shot('163-nav-mobile-closed')
  await evaluate(`(() => { const h = document.querySelector('.module-nav-handle'); if (h) h.click(); return true })()`)
  await sleep(600)
  console.log('nav mobile open:', JSON.stringify(await evaluate(navProbe)))
  await shot('164-nav-mobile-open')
  await call('Emulation.clearDeviceMetricsOverride')
} finally {
  try { socket?.close() } catch { /* ignore */ }
  try { chrome?.kill() } catch { /* ignore */ }
  await sleep(300)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* ignore */ }
}
