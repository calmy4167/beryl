// 给 today-comp.mjs 注入 v2（纯页面版）模板与样式；用 Node 做补丁避免 shell 转义问题。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../..', import.meta.url))
const file = join(root, 'tmp', 'design', 'today-comp.mjs')
let c = readFileSync(file, 'utf8')

if (c.includes('const v2Css')) { console.log('already patched'); process.exit(0) }

const v2 = `
/* ── v2：借 Amie / Linear 的做法（纯页面，不含侧边栏）───────────────
 * · 暖中性：层次靠底色差（--panel-2）而非投影，阴影只用 4%
 * · 双列工作台：主列(行动/时间线) + 侧列(进度/习惯/收集箱)，宽屏不空
 * · CTA 与内容色隔离：动作按钮用偏灰的蓝 --cta
 * · 4px 栅格 + 正文 1.7 行高 + 扁平字阶
 */
const v2Css = \`
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
@media (max-width: 1080px) { .today-v2 .today-grid { grid-template-columns: minmax(0, 1fr); } }
\`

const v2Row = (title, tag, done) => \`
        <li\${done ? '' : ''}>
          <b>\${title}</b>\${tag ? \`
          <span class="day-tag">\${tag}</span>\` : ''}
          <button class="day-act" type="button">完成</button>
        </li>\`

const v2Inner = stack => \`
<div class="today-home today-v2\${stack ? ' is-stack' : ''}">
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
\`
`

c = c.replace('\nconst debugPort = await freePort()', v2 + '\nconst debugPort = await freePort()')

const before1 = '    inner.innerHTML = ${JSON.stringify(process.argv.includes(\'--empty\') ? emptyInner : inner)}'
const after1 = '    inner.innerHTML = ${JSON.stringify(process.argv.includes(\'--v2\') ? v2Inner(process.argv.includes(\'--stack\')) : (process.argv.includes(\'--empty\') ? emptyInner : inner))}'
const before2 = '    style.textContent = ${JSON.stringify(compCss)}'
const after2 = '    style.textContent = ${JSON.stringify(process.argv.includes(\'--v2\') ? v2Css : compCss)}'
const before3 = "  console.log('inject:', JSON.stringify(await inject()))"
const after3 = "  if (process.argv.includes('--v2')) console.log('body:', await evaluate(`(() => { document.body.classList.remove('nav-persistent', 'nav-show', 'nav-collapsed'); return document.body.className || '(none)' })()`))\n" + before3

for (const [b, a] of [[before1, after1], [before2, after2], [before3, after3]]) {
  if (!c.includes(b)) { console.log('MISS:', b.slice(0, 50)); process.exit(1) }
  c = c.replace(b, a)
}
writeFileSync(file, c)
console.log('patched ok')
