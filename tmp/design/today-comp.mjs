// 「今日」模块设计稿出图：在真实外壳（真令牌 + 真侧边栏）里注入提案 DOM/CSS 后截图。
// 只读仓库：不修改任何 src 文件。
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import net from 'node:net'

const root = fileURLToPath(new URL('../..', import.meta.url))
const outDir = join(root, 'tmp', 'design')
mkdirSync(outDir, { recursive: true })
const baseUrl = process.env.LIUBAI_BASE || 'http://localhost:5173'
const browser = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
].find(existsSync)
if (!browser) { console.log('Chrome not found'); process.exit(0) }

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port
    server.close(error => error ? reject(error) : resolve(port))
  })
})

/* ── 提案：新增样式（全部取设计层令牌；将来落到页面 scoped 里）────────── */
const compCss = `
.today-home .panel, .today-home .collapsible { position: relative; }
.today-home .day-list li { align-items: center; }
.today-home .day-list li.is-focus b { font-weight: 650; }
.today-home .day-list li.is-focus::before { transform: scale(1.35); }
.today-home .day-tag { flex: none; padding: 1px 7px; border: 1px solid var(--line); border-radius: 6px; font-size: .7rem; color: var(--muted); }
.today-home .day-list .act { color: var(--muted); }
.today-home .day-list .act:hover { color: var(--accent); background: var(--hover); }
.today-home .day-list li.is-habit b { color: var(--fg); font-weight: 500; }
.today-home .habit-week { flex: none; display: inline-flex; gap: 4px; }
.today-home .habit-week i { width: 6px; height: 6px; border-radius: 50%; background: var(--line); }
.today-home .habit-week i.on { background: var(--accent); }
.today-home .habit-check { flex: none; padding: 3px 10px; border: 1px solid var(--line); border-radius: 7px; background: none; color: var(--muted); font: inherit; font-size: .72rem; cursor: pointer; }
.today-home .habit-check:hover { border-color: var(--accent); color: var(--accent); }
.today-home .day-done { border-bottom: 0; padding-bottom: 0; font-size: .78rem; }
.today-home .tl-time { flex: none; width: 3.4em; font-size: .78rem; font-variant-numeric: tabular-nums; color: var(--muted); }
.today-home .tl-kind { flex: none; padding: 1px 7px; border: 1px solid var(--line); border-radius: 6px; font-size: .7rem; color: var(--muted); }
.today-home .add-matter { flex: 0 1 11em; min-width: 7em; padding: 6px 8px; font-size: .75rem; }
.today-home .comp-badge { display: inline-grid; flex: none; width: 18px; height: 18px; margin-right: 2px; place-items: center; border-radius: 50%; background: var(--accent); color: var(--accent-fg); font-size: .62rem; font-weight: 700; }
`

/* ── 提案：今日模块 DOM（组件类名与 LbPanel / LbCollapsible / LbStatGrid 一致）── */
const badges = process.argv.includes('--badges')
const tall = process.argv.includes('--tall')
const v2 = process.argv.includes('--v2')
const stack = process.argv.includes('--stack')
const tag = process.argv.includes('--empty') ? '-empty' : (v2 ? (process.argv.includes('--cards') ? '-v2-cards' : (stack ? '-v2-stack' : '-v2-workbench')) : (tall ? '-full' : ''))
const badge = n => badges ? `<span class="comp-badge">${n}</span>` : ''

const inner = `
<div class="today-home">
<header class="slide-head">
  <div class="head-main">
    <p class="hint">10月13日 · 星期二</p>
    <div class="head-title-row">
      <h1>今天还有 <em>3</em> 件事。</h1>
      <span class="info" tabindex="0" data-tip="当日重点按「重点 → 待办 → 习惯」排列。点标题设为重点，右侧 ✓ 完成；统计卡可用 H 键收起。">i</span>
    </div>
  </div>
  <div class="date-nav"><button class="dn-trigger" aria-haspopup="true" aria-expanded="false"><span class="dn-text">今天</span><span class="dn-caret" aria-hidden="true">▾</span></button></div>
</header>

<div class="panel grow">
  ${badge('①')}
  <div class="panel-head">
    <div class="panel-heading"><span class="panel-title">当日重点</span></div>
    <div class="panel-head-meta"><span class="panel-note">还剩 3 件 · 已完成 2 件</span></div>
  </div>
  <ul class="ov-list day-list">
    <li class="is-focus">
      <b>把 codex 的推理强度改成 medium 再试一次</b>
      <span class="day-tag">工具</span>
      <button class="act" type="button" title="标记完成">✓</button>
    </li>
    <li>
      <b>复核今日设计稿并确认</b>
      <button class="act" type="button" title="标记完成">✓</button>
    </li>
    <li>
      <b>整理侧边栏重做的交接记录</b>
      <span class="day-tag">工作</span>
      <button class="act" type="button" title="标记完成">✓</button>
    </li>
    <li class="is-habit">
      <b>习惯 · 晨间拉伸</b>
      <span class="habit-week" aria-label="本周打卡：一二三已打卡"><i class="on"></i><i class="on"></i><i class="on"></i><i></i><i></i><i></i><i></i></span>
      <button class="habit-check" type="button">打卡</button>
    </li>
    <li class="is-habit">
      <b>习惯 · 阅读 20 分钟</b>
      <span class="habit-week" aria-label="本周打卡：二已打卡"><i></i><i class="on"></i><i></i><i></i><i></i><i></i><i></i></span>
      <button class="habit-check" type="button">打卡</button>
    </li>
    <li class="dim day-done" style="color:var(--muted)">已完成 2 件 · 重做侧边栏（桌面常驻 + 窄屏浮层）、跑通全量测试 785/798</li>
  </ul>
  <div class="add-row">
    <input class="add-input" placeholder="添加任务，回车确认…" aria-label="新增现实行动">
    <select class="add-matter" aria-label="行动关联事项"><option>不关联事项</option></select>
    <button class="chip on" type="button">添加</button>
  </div>
</div>

<div class="collapsible" data-block="stats" data-hud-rank="2">
  ${badge('②')}
  <div class="collapsible-inner">
    <div class="panel">
      <div class="panel-head">
        <div class="panel-heading"><span class="panel-title">当日数据</span></div>
        <div class="panel-head-meta"><span class="panel-note">2/6 已结束</span></div>
      </div>
      <div class="stat-grid">
        <div class="stat">
          <span class="stat-label">完成率</span>
          <span class="stat-value">33<small>%</small></span>
          <div class="stat-bar"><span style="width:33%"></span></div>
          <span class="stat-sub">2/6 已结束</span>
        </div>
        <div class="stat">
          <span class="stat-label">待办</span>
          <span class="stat-value">3<small> 件</small></span>
          <span class="stat-sub">还剩 3 件</span>
        </div>
        <div class="stat">
          <span class="stat-label">习惯打卡</span>
          <span class="stat-value">1<small>/2</small></span>
          <span class="stat-sub">1 个未打卡</span>
        </div>
        <div class="stat">
          <span class="stat-label">收集箱</span>
          <span class="stat-value">4<small> 条</small></span>
          <span class="stat-sub">待归类 → 去处理</span>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="collapsible" data-block="timeline" data-hud-rank="3">
  ${badge('③')}
  <div class="collapsible-inner">
    <div class="panel">
      <div class="panel-head">
        <div class="panel-heading"><span class="panel-title">今日时间线</span></div>
        <div class="panel-head-meta"><span class="panel-note">5 条 · 由记录与完成时间推导</span></div>
      </div>
      <ul class="ov-list">
        <li><span class="tl-time">09:12</span><b>和产品确认今日范围：先出今日模块设计稿</b><span class="tl-kind">记录</span></li>
        <li><span class="tl-time">09:40</span><b>重做侧边栏（桌面常驻 + 窄屏浮层 + 毛玻璃）</b><span class="tl-kind">完成</span></li>
        <li><span class="tl-time">11:40</span><b>窄屏改成浮层 + 遮罩，内容不再被推挤</b><span class="tl-kind">记录</span></li>
        <li><span class="tl-time">14:20</span><b>确认报错来源是代理长连接被掐，不是 Codex 的问题</b><span class="tl-kind">记录</span></li>
        <li><span class="tl-time">15:05</span><b>跑通全量测试：785/798（余 13 条为另一批改造的既存失败）</b><span class="tl-kind">完成</span></li>
      </ul>
    </div>
  </div>
</div>
</div>
`

/* ── 空态模板：全部为 0 时页面不该是一片空白 ───────────────────────── */
const emptyInner = `
<div class="today-home">
<header class="slide-head">
  <div class="head-main">
    <p class="hint">10月13日 · 星期二</p>
    <div class="head-title-row">
      <h1>清单是空的。</h1>
      <span class="info" tabindex="0" data-tip="当日重点按「重点 → 待办 → 习惯」排列。">i</span>
    </div>
  </div>
  <div class="date-nav"><button class="dn-trigger"><span class="dn-text">今天</span><span class="dn-caret">▾</span></button></div>
</header>

<div class="panel grow">
  <div class="panel-head">
    <div class="panel-heading"><span class="panel-title">当日重点</span></div>
    <div class="panel-head-meta"><span class="panel-note">还没有待办</span></div>
  </div>
  <ul class="ov-list day-list">
    <li class="dim">这一天还没有待办。写下一件要在今天推进的事，它就会出现在这里。</li>
    <li class="is-habit">
      <b>习惯 · 晨间拉伸</b>
      <span class="habit-week" aria-label="本周尚未打卡"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
      <button class="habit-check" type="button">打卡</button>
    </li>
  </ul>
  <div class="add-row">
    <input class="add-input" placeholder="添加任务，回车确认…" aria-label="新增现实行动">
    <select class="add-matter" aria-label="行动关联事项"><option>不关联事项</option></select>
    <button class="chip on" type="button">添加</button>
  </div>
</div>

<div class="collapsible" data-block="stats" data-hud-rank="2">
  <div class="collapsible-inner">
    <div class="panel">
      <div class="panel-head">
        <div class="panel-heading"><span class="panel-title">当日数据</span></div>
        <div class="panel-head-meta"><span class="panel-note">—</span></div>
      </div>
      <div class="stat-grid">
        <div class="stat"><span class="stat-label">完成率</span><span class="stat-value">0<small>%</small></span><div class="stat-bar"><span style="width:0%"></span></div><span class="stat-sub">今天还没有结束的事</span></div>
        <div class="stat"><span class="stat-label">待办</span><span class="stat-value">0<small> 件</small></span><span class="stat-sub">这一天没有待办</span></div>
        <div class="stat"><span class="stat-label">习惯打卡</span><span class="stat-value">0<small>/1</small></span><span class="stat-sub">1 个未打卡</span></div>
        <div class="stat"><span class="stat-label">收集箱</span><span class="stat-value">0<small> 条</small></span><span class="stat-sub">没有待归类原文</span></div>
      </div>
    </div>
  </div>
</div>

<div class="collapsible" data-block="timeline" data-hud-rank="3">
  <div class="collapsible-inner">
    <div class="panel">
      <div class="panel-head">
        <div class="panel-heading"><span class="panel-title">今日时间线</span></div>
        <div class="panel-head-meta"><span class="panel-note">由记录与完成时间推导</span></div>
      </div>
      <ul class="ov-list">
        <li class="dim">今天还没有记录。写下一条，时间线就会长出来。</li>
      </ul>
    </div>
  </div>
</div>
</div>
`
/* ── v2：借 Amie / Linear 的做法（纯页面，不含侧边栏）───────────────
 * · 暖中性：层次靠底色差（--panel-2）而非投影，阴影只用 4%
 * · 双列工作台：主列(行动/时间线) + 侧列(进度/习惯/收集箱)，宽屏不空
 * · CTA 与内容色隔离：动作按钮用偏灰的蓝 --cta
 * · 4px 栅格 + 正文 1.7 行高 + 扁平字阶
 */
const v2Css = `
.today-v2 { max-width: 1120px; margin-inline: auto; }
.today-v2 .today-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: clamp(20px, 2.4vw, 36px); align-items: start; }
.today-v2.is-stack { max-width: 880px; }
.today-v2.is-stack .today-grid { grid-template-columns: minmax(0, 1fr); }
.today-v2 .today-col { display: flex; flex-direction: column; gap: clamp(20px, 2.4vh, 30px); min-width: 0; }
.today-v2 .side-card { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; border-radius: 14px; background: var(--panel-2); box-shadow: 0 1px 2px rgba(16, 24, 40, .04); }
.today-v2 .side-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.today-v2 .side-title { color: var(--fg); font-size: .86rem; font-weight: 600; letter-spacing: -.01em; }
.today-v2 .side-note { color: var(--muted); font-size: .74rem; }
.today-v2 .ring-row { display: flex; align-items: center; gap: 16px; }
.today-v2 .ring { flex: none; width: 78px; height: 78px; }
.today-v2 .ring circle { fill: none; stroke-width: 7; stroke-linecap: round; }
.today-v2 .ring .ring-track { stroke: var(--line); }
.today-v2 .ring .ring-value { stroke: var(--accent); transform: rotate(-90deg); transform-origin: 50% 50%; }
.today-v2 .ring-figure { display: flex; flex-direction: column; gap: 2px; }
.today-v2 .ring-figure b { color: var(--fg); font-size: 1.5rem; font-weight: 650; letter-spacing: -.04em; }
.today-v2 .ring-figure span { color: var(--muted); font-size: .76rem; }
.today-v2 .mini-row { display: flex; align-items: baseline; gap: 10px; padding: 6px 0; border-top: 1px solid color-mix(in srgb, var(--line) 70%, transparent); }
.today-v2 .mini-row:first-child { border-top: 0; }
.today-v2 .mini-row b { color: var(--fg); font-weight: 600; font-size: .92rem; font-variant-numeric: tabular-nums; }
.today-v2 .mini-row span { color: var(--muted); font-size: .78rem; }
.today-v2 .mini-row a { margin-left: auto; color: var(--cta); font-size: .76rem; text-decoration: none; }
.today-v2 .habit-line { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid color-mix(in srgb, var(--line) 70%, transparent); }
.today-v2 .habit-line:first-of-type { border-top: 0; }
.today-v2 .habit-line b { flex: 1; min-width: 0; color: var(--fg); font-weight: 500; font-size: .88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.today-v2 .habit-week { display: inline-flex; gap: 3px; flex: none; }
.today-v2 .habit-week i { width: 6px; height: 6px; border-radius: 50%; background: var(--line-strong); }
.today-v2 .habit-week i.on { background: var(--accent); }
.today-v2 .habit-check { flex: none; padding: 4px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); color: var(--cta); font: inherit; font-size: .74rem; cursor: pointer; }
.today-v2 .habit-check:hover { border-color: var(--cta); }
.today-v2 .day-list li { align-items: center; line-height: 1.7; }
.today-v2 .day-list li.is-focus b { font-weight: 650; }
.today-v2 .day-list li.is-focus::before { transform: scale(1.35); }
.today-v2 .day-tag { flex: none; padding: 1px 7px; border-radius: 6px; background: var(--panel); border: 1px solid var(--line); color: var(--muted); font-size: .7rem; }
.today-v2 .day-act { flex: none; padding: 2px 6px; border: 0; border-radius: 6px; background: none; color: var(--cta); font: inherit; font-size: .78rem; cursor: pointer; }
.today-v2 .day-act:hover { background: var(--hover); }
.today-v2 .tl-time { flex: none; width: 3.4em; color: var(--muted); font-size: .78rem; font-variant-numeric: tabular-nums; }
.today-v2 .tl-kind { flex: none; padding: 1px 7px; border-radius: 6px; background: var(--panel); border: 1px solid var(--line); color: var(--muted); font-size: .7rem; }
.today-v2 .add-matter { flex: 0 1 170px; min-width: 120px; }

html.liubai-active body #app .today-home.today-v2.is-cards .panel {
  padding: 16px 18px;
  border: 0;
  border-radius: 14px;
  background: var(--panel-2);
  box-shadow: 0 1px 2px rgba(16, 24, 40, .04);
}
html.liubai-active body #app .today-home.today-v2.is-cards .panel .panel-head { padding-bottom: 2px; }
html.liubai-active body #app .today-home.today-v2.is-cards .panel .add-row { margin-top: 4px; }
@media (max-width: 1080px) { .today-v2 .today-grid { grid-template-columns: minmax(0, 1fr); } }
`

const v2Row = (title, tag, done) => `
        <li${done ? '' : ''}>
          <b>${title}</b>${tag ? `
          <span class="day-tag">${tag}</span>` : ''}
          <button class="day-act" type="button">完成</button>
        </li>`

const v2Inner = stack => `
<div class="today-home today-v2${stack ? ' is-stack' : ''}${process.argv.includes('--cards') ? ' is-cards' : ''}">
<header class="slide-head">
  <div class="head-main">
    <p class="hint">10月13日 · 星期二</p>
    <div class="head-title-row">
      <h1>今天还有 <em>3</em> 件事。</h1>
      <span class="info" tabindex="0" data-tip="主列是今天要推进的事与时间线；侧列是进度、习惯与收集箱。">i</span>
    </div>
  </div>
  <div class="date-nav"><button class="dn-trigger"><span class="dn-text">今天</span><span class="dn-caret">▾</span></button></div>
</header>

<div class="today-grid">
  <div class="today-col">
    <div class="panel">
      <div class="panel-head">
        <div class="panel-heading"><span class="panel-title">当日重点</span></div>
        <div class="panel-head-meta"><span class="panel-note">还剩 3 件 · 已完成 2 件</span></div>
      </div>
      <ul class="ov-list day-list">
        <li class="is-focus"><b>把 codex 的推理强度改成 medium 再试一次</b><span class="day-tag">工具</span><button class="day-act" type="button">完成</button></li>
        <li><b>复核今日设计稿并确认</b><button class="day-act" type="button">完成</button></li>
        <li><b>整理侧边栏重做的交接记录</b><span class="day-tag">工作</span><button class="day-act" type="button">完成</button></li>
        <li class="dim day-done">已完成 2 件 · 重做侧边栏（桌面常驻 + 窄屏浮层）、跑通全量测试 785/798</li>
      </ul>
      <div class="add-row">
        <input class="add-input" placeholder="添加任务，回车确认…" aria-label="新增现实行动">
        <select class="add-matter" aria-label="行动关联事项"><option>不关联事项</option></select>
        <button class="chip on" type="button">添加</button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div class="panel-heading"><span class="panel-title">今日时间线</span></div>
        <div class="panel-head-meta"><span class="panel-note">5 条 · 记录与完成时间</span></div>
      </div>
      <ul class="ov-list">
        <li><span class="tl-time">09:12</span><b>和产品确认今日范围：先出今日模块设计稿</b><span class="tl-kind">记录</span></li>
        <li><span class="tl-time">09:40</span><b>重做侧边栏（桌面常驻 + 窄屏浮层 + 毛玻璃）</b><span class="tl-kind">完成</span></li>
        <li><span class="tl-time">11:40</span><b>窄屏改成浮层 + 遮罩，内容不再被推挤</b><span class="tl-kind">记录</span></li>
        <li><span class="tl-time">14:20</span><b>确认报错来源是代理长连接被掐，不是 Codex 的问题</b><span class="tl-kind">记录</span></li>
        <li><span class="tl-time">15:05</span><b>跑通全量测试：785/798（余 13 条为另一批改造的既存失败）</b><span class="tl-kind">完成</span></li>
      </ul>
    </div>
  </div>

  <div class="today-col">
    <div class="side-card">
      <div class="side-head"><span class="side-title">当日数据</span><span class="side-note">2/6 已结束</span></div>
      <div class="ring-row">
        <svg class="ring" viewBox="0 0 78 78" aria-hidden="true">
          <circle class="ring-track" cx="39" cy="39" r="32"></circle>
          <circle class="ring-value" cx="39" cy="39" r="32" style="stroke-dasharray:201;stroke-dashoffset:135"></circle>
        </svg>
        <span class="ring-figure"><b>33%</b><span>完成率</span></span>
      </div>
      <div>
        <div class="mini-row"><b>3</b><span>待办</span><span style="margin-left:auto">还剩 3 件</span></div>
        <div class="mini-row"><b>1/2</b><span>习惯打卡</span><span style="margin-left:auto">1 个未打卡</span></div>
        <div class="mini-row"><b>4</b><span>收集箱</span><a href="#/liubai-preview">去处理 →</a></div>
      </div>
    </div>

    <div class="side-card">
      <div class="side-head"><span class="side-title">习惯打卡</span><span class="side-note">本周</span></div>
      <div>
        <div class="habit-line">
          <b>晨间拉伸</b>
          <span class="habit-week" aria-label="本周：一二三已打卡"><i class="on"></i><i class="on"></i><i class="on"></i><i></i><i></i><i></i><i></i></span>
          <button class="habit-check" type="button">打卡</button>
        </div>
        <div class="habit-line">
          <b>阅读 20 分钟</b>
          <span class="habit-week" aria-label="本周：二已打卡"><i></i><i class="on"></i><i></i><i></i><i></i><i></i><i></i></span>
          <button class="habit-check" type="button">打卡</button>
        </div>
      </div>
    </div>

    <div class="side-card">
      <div class="side-head"><span class="side-title">收集箱</span><span class="side-note">4 条待归类</span></div>
      <div>
        <div class="mini-row"><span style="color:var(--fg);font-size:.84rem">codex 断流的排查笔记</span></div>
        <div class="mini-row"><span style="color:var(--fg);font-size:.84rem">今日模块的两版布局取舍</span></div>
        <div class="mini-row"><a href="#/liubai-preview">全部 4 条 →</a></div>
      </div>
    </div>
  </div>
</div>
</div>
`

const debugPort = await freePort()
const profile = mkdtempSync(join(tmpdir(), 'today-comp-'))
let chrome, socket
let nextId = 0
const pending = new Map()

try {
  if (!(await fetch(baseUrl).then(r => r.ok).catch(() => false))) throw new Error(`dev server not reachable: ${baseUrl}`)
  chrome = spawn(browser, [
    '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox',
    '--disable-background-networking', '--disable-component-update', '--disable-default-apps',
    '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1600,940',
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
    console.log('saved', name)
  }

  await call('Page.enable')
  await call('Runtime.enable')
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: tall ? 1520 : 940, deviceScaleFactor: 1, mobile: false })
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { try {
      const q = new URLSearchParams(location.search); const theme = q.get('theme');
      if (theme) localStorage.setItem('liubai-theme', theme);
      localStorage.setItem('liubai-nav', 'left'); localStorage.setItem('liubai-zen', '0'); localStorage.setItem('liubai-mode', 'full');
      localStorage.setItem('liubai-nav-open', '1');
    } catch (e) {} })()`
  })
  await call('Page.navigate', { url: `${baseUrl}/?theme=paper` })
  await sleep(2600)
  await evaluate(`(() => { location.hash = '#/liubai-preview'; return true })()`)
  await sleep(3400)

  if (process.argv.includes('--baseline')) {
    console.log('baseline:', JSON.stringify(await evaluate(`(() => {
      const inner = document.querySelector('.stage .slide.active .inner')
      const r = inner?.getBoundingClientRect()
      return {
        theme: document.body.dataset.theme, bodyClass: document.body.className,
        innerX: r ? Math.round(r.x) : null, innerW: r ? Math.round(r.width) : null,
        panels: document.querySelectorAll('.inner .panel').length,
        stats: document.querySelectorAll('.inner .stat').length,
        rows: document.querySelectorAll('.inner .ov-list li').length,
        text: (inner?.innerText || '').replace(/\s+/g, ' ').slice(0, 300)
      }
    })()`)))
    await shot('today-current-paper')

    // 用页面自身的输入框写入真实数据（走 addTask → ActionItem + TodayPlan）
    console.log('seed:', JSON.stringify(await evaluate(`(async () => {
      const set = (el, v) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
      const input = document.querySelector('[aria-label="添加今天要做的事"]')
      if (!input) return { ok: false }
      for (const text of ['把今天页改成参考稿布局', '确认四项指标的口径', '跑一遍今天的回归测试']) {
        set(input, text)
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await new Promise(r => setTimeout(r, 420))
      }
      return { ok: true, rows: document.querySelectorAll('.today-list > li').length }
    })()`)))
    await sleep(600)
    console.log('complete one:', JSON.stringify(await evaluate(`(async () => {
      const buttons = [...document.querySelectorAll('.today-list .today-row-action')]
      if (buttons[1]) buttons[1].click()
      await new Promise(r => setTimeout(r, 700))
      return { rows: document.querySelectorAll('.today-list > li').length, done: !!document.querySelector('.today-done-line') }
    })()`)))
    await sleep(900)
    await shot('today-current-seeded')
  } else {

  const inject = async () => evaluate(`(() => {
    const inner = document.querySelector('.stage .slide.active .inner')
    if (!inner) return { ok: false, why: 'inner not found' }
    let style = document.getElementById('today-comp-css')
    if (!style) { style = document.createElement('style'); style.id = 'today-comp-css'; document.head.appendChild(style) }
    style.textContent = ${JSON.stringify(process.argv.includes('--v2') ? v2Css : compCss)}
    inner.innerHTML = ${JSON.stringify(process.argv.includes('--v2') ? v2Inner(process.argv.includes('--stack')) : (process.argv.includes('--empty') ? emptyInner : inner))}
    return {
      ok: true, theme: document.body.dataset.theme, panels: document.querySelectorAll('.inner .panel').length,
      stats: document.querySelectorAll('.inner .stat').length, rows: document.querySelectorAll('.inner .ov-list li').length,
      badges: document.querySelectorAll('.comp-badge').length,
      title: document.querySelector('.inner h1')?.innerText
    }
  })()`)

  if (process.argv.includes('--v2')) console.log('body:', await evaluate(`(() => { document.body.classList.remove('nav-persistent', 'nav-show', 'nav-collapsed'); return document.body.className || '(none)' })()`))
  console.log('inject:', JSON.stringify(await inject()))
  await evaluate(`(() => { document.body.setAttribute('data-theme', 'paper'); return true })()`)
  await sleep(600)
  console.log('state:', JSON.stringify(await evaluate(`(() => {
    const dots = document.querySelector('.dots'); const dr = dots?.getBoundingClientRect()
    const slide = document.querySelector('.stage .slide.active')
    return {
      theme: document.body.dataset.theme, bodyClass: document.body.className,
      rail: dots ? { x: Math.round(dr.x), w: Math.round(dr.width), h: Math.round(dr.height) } : null,
      slidePadLeft: slide ? Math.round(parseFloat(getComputedStyle(slide).paddingLeft)) : null,
      accent: getComputedStyle(document.body).getPropertyValue('--accent').trim(),
      panels: document.querySelectorAll('.inner .panel').length, stats: document.querySelectorAll('.inner .stat').length
    }
  })()`)))
  await shot(`today-design-paper${tag}`)

  // 标注版：给三块面板加编号徽标（说明见交付说明）
  console.log('annotate:', JSON.stringify(await evaluate(`(() => {
    const marks = ['①', '②', '③']
    const hosts = [...document.querySelectorAll('.today-home > .panel, .today-home > .collapsible')]
    hosts.forEach((host, i) => {
      const el = document.createElement('span')
      el.className = 'comp-badge'
      el.textContent = marks[i] || String(i + 1)
      ;(host.querySelector('.panel-heading') || host.querySelector('.panel-head') || host).prepend(el)
    })
    return { badges: document.querySelectorAll('.comp-badge').length }
  })()`)))
  await shot(`today-design-annotated${tag}`)

  // 夜间主题（同一套结构，看令牌切换）
  await evaluate(`(() => { document.querySelectorAll('.comp-badge').forEach(el => el.remove()); document.body.setAttribute('data-theme', 'night'); return true })()`)
  await sleep(600)
  await shot(`today-design-night${tag}`)

  // 窄屏（纸面主题）
  await evaluate(`(() => { document.body.setAttribute('data-theme', 'paper'); document.body.classList.remove('nav-show'); return true })()`)
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await sleep(900)
  await shot(`today-design-mobile${tag}`)
  }
} finally {
  try { socket?.close() } catch { /* ignore */ }
  try { chrome?.kill() } catch { /* ignore */ }
  await sleep(300)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* ignore */ }
}
