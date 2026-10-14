// 给 today-ref.mjs 加 --combo：v2-cards 主体 + 参考稿顶部整块（标题栏 / 指标条 / 通栏添加）。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const file = join(fileURLToPath(new URL('../..', import.meta.url)), 'tmp', 'design', 'today-ref.mjs')
let c = readFileSync(file, 'utf8')
if (c.includes('comboInner')) { console.log('already patched'); process.exit(0) }

const combo = String.raw`
/* ── combo：v2-cards 主体 + 参考稿顶部块 ─────────────────────────── */
const comboCss = `
.today-combo .combo-col { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.today-combo .day-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.today-combo .day-list > li { display: flex; align-items: center; gap: 11px; padding: 12px 0; border-top: 1px solid color-mix(in srgb, var(--line) 80%, transparent); }
.today-combo .day-list > li:first-child { border-top: 0; }
.today-combo .day-list > li > b { flex: 1; min-width: 0; color: var(--fg); font-size: .95rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.today-combo .day-list > li.is-focus > b { font-weight: 650; }
.today-combo .day-list > li.is-focus::before { width: 7px; height: 7px; }
.today-combo .day-tag { flex: none; padding: 2px 8px; border-radius: 6px; background: color-mix(in srgb, var(--accent) 9%, var(--panel-2)); color: color-mix(in srgb, var(--accent) 82%, var(--fg)); font-size: .72rem; }
.today-combo .day-act { flex: none; padding: 3px 8px; border: 0; border-radius: 7px; background: none; color: var(--cta); font: inherit; font-size: .78rem; cursor: pointer; }
.today-combo .day-act:hover { background: var(--hover); }
.today-combo .day-done { display: block; padding: 10px 0 0; color: var(--muted); font-size: .78rem; border-top: 1px solid color-mix(in srgb, var(--line) 80%, transparent); }
.today-combo .day-list > li.dim { border-top: 1px solid color-mix(in srgb, var(--line) 80%, transparent); }
.today-combo .habit-line { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid color-mix(in srgb, var(--line) 80%, transparent); }
.today-combo .habit-line:first-of-type { border-top: 0; }
.today-combo .habit-line b { flex: 1; min-width: 0; color: var(--fg); font-size: .9rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.today-combo .habit-week { display: inline-flex; gap: 3px; flex: none; }
.today-combo .habit-week i { width: 6px; height: 6px; border-radius: 50%; background: var(--line-strong); }
.today-combo .habit-week i.on { background: var(--accent); }
.today-combo .habit-check { flex: none; padding: 4px 10px; border: 1px solid var(--line); border-radius: 8px; background: none; color: var(--cta); font: inherit; font-size: .74rem; cursor: pointer; }
.today-combo .habit-check:hover { border-color: var(--cta); }
.today-combo .combo-grid { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr); gap: 18px; align-items: start; }
.today-combo .combo-side { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.today-combo .mini-row { display: flex; align-items: baseline; gap: 10px; padding: 7px 0; border-top: 1px solid color-mix(in srgb, var(--line) 80%, transparent); }
.today-combo .mini-row:first-child { border-top: 0; }
.today-combo .mini-row b { color: var(--fg); font-weight: 650; font-size: .95rem; font-variant-numeric: tabular-nums; }
.today-combo .mini-row span { color: var(--muted); font-size: .8rem; }
.today-combo .mini-row a { margin-left: auto; color: var(--cta); font-size: .78rem; text-decoration: none; }
.today-combo .ref-ring-row .ref-facts { justify-content: center; }
@media (max-width: 1080px) { .today-combo .combo-grid { grid-template-columns: minmax(0, 1fr); } }
`

const comboInner = `
<div class="today-home today-ref today-combo">
  <header class="ref-head">
    <div class="ref-head-main">
      <h1>今天</h1>
      <span class="ref-date">周二 · 10月13日</span>
    </div>
    <div class="ref-head-actions">
      <div class="ref-nav"><button type="button" aria-label="前一天">‹</button><span>10月13日 周二</span><button type="button" aria-label="后一天">›</button></div>
      <button class="ref-primary" type="button">✓ 复盘今日</button>
    </div>
  </header>

  <div class="ref-metrics">
    <div class="ref-metric"><span>计划</span><b>6<small> 项</small></b></div>
    <div class="ref-metric"><span>已完成</span><b>2<small> 项</small></b></div>
    <div class="ref-metric"><span>今日专注</span><b>2<small> 小时</small>40<small> 分</small></b></div>
    <div class="ref-metric"><span>重点</span><b>2<small> 项</small></b></div>
  </div>

  <div class="ref-add">
    <input placeholder="添加今天要做的事…" aria-label="添加今天要做的事">
    <button type="button" aria-label="添加">+</button>
  </div>

  <div class="combo-grid">
    <div class="combo-col">
      <section class="ref-card">
        <header class="ref-card-head">
          <h2>今日计划</h2>
          <button class="ref-sort" type="button">≡ 重点优先 ▾</button>
        </header>
        <ul class="day-list">
          <li class="is-focus"><b>把 codex 的推理强度改成 medium 再试一次</b><span class="day-tag">工具</span><button class="day-act" type="button">完成</button></li>
          <li><b>复核今日设计稿并确认</b><button class="day-act" type="button">完成</button></li>
          <li><b>修复导航栏按钮对齐</b><span class="day-tag">前端</span><button class="day-act" type="button">完成</button></li>
          <li><b>准备周会材料</b><span class="day-tag">工作</span><button class="day-act" type="button">完成</button></li>
          <li><b>复盘今日进度</b><span class="day-tag">复盘</span><button class="day-act" type="button">完成</button></li>
          <li class="dim day-done">已完成 2 项 · 完成首页模块布局优化、整理本周需求与待办</li>
        </ul>
      </section>

      <section class="ref-card">
        <header class="ref-card-head">
          <h2>今日时间线</h2>
          <span class="ref-chev">›</span>
        </header>
        <ul class="ref-timeline">
          <li><span class="ref-dot"></span><span class="ref-time">09:12</span><b>和产品确认今日范围</b><span class="ref-chip">记录</span></li>
          <li class="is-focus"><span class="ref-dot"></span><span class="ref-time">09:40</span><b>专注 52 分钟</b><span class="ref-chip is-focus">专注</span></li>
          <li><span class="ref-dot"></span><span class="ref-time">11:00</span><b>整理本周需求与待办</b><span class="ref-chip">完成</span></li>
          <li class="is-focus"><span class="ref-dot"></span><span class="ref-time">15:05</span><b>专注 40 分钟</b><span class="ref-chip is-focus">专注</span></li>
        </ul>
      </section>
    </div>

    <div class="combo-side">
      <section class="ref-card">
        <header class="ref-card-head"><h2>当日数据</h2><span class="ref-chev">›</span></header>
        <div class="ref-ring-row">
          <svg class="ref-ring" viewBox="0 0 118 118" aria-hidden="true">
            <circle class="track" cx="59" cy="59" r="50"></circle>
            <circle class="value" cx="59" cy="59" r="50" style="stroke-dasharray:314;stroke-dashoffset:210"></circle>
          </svg>
          <svg class="ref-ring" viewBox="0 0 118 118" aria-hidden="true" style="display:none"></svg>
          <div class="ref-facts">
            <div class="ref-fact"><span>完成率</span><b>33%</b></div>
            <div class="ref-fact"><span>待办</span><b>3 件</b></div>
            <div class="ref-fact"><span>习惯打卡</span><b>1/2</b></div>
            <div class="ref-fact"><span>收集箱</span><b>4 条</b></div>
          </div>
        </div>
      </section>

      <section class="ref-card">
        <header class="ref-card-head"><h2>习惯打卡</h2><span class="ref-chev">›</span></header>
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
      </section>

      <section class="ref-card">
        <header class="ref-card-head"><h2>收集箱</h2><span class="ref-chev">›</span></header>
        <div>
          <div class="mini-row"><b style="font-weight:500;font-size:.86rem">codex 断流的排查笔记</b></div>
          <div class="mini-row"><b style="font-weight:500;font-size:.86rem">今日模块的两版布局取舍</b></div>
          <div class="mini-row"><a href="#/liubai-preview">全部 4 条 →</a></div>
        </div>
      </section>
    </div>
  </div>
</div>
`
`

c = c.replace('\nconst debugPort = await freePort()', combo + '\nconst debugPort = await freePort()')
c = c.replace(
  "    style.textContent = ${JSON.stringify(compBase + tealCss + refCss)}",
  "    style.textContent = ${JSON.stringify(process.argv.includes('--combo') ? (compBase + tealCss + refCss + comboCss) : (compBase + tealCss + refCss))}"
)
c = c.replace(
  "    inner.innerHTML = ${JSON.stringify(refInner)}",
  "    inner.innerHTML = ${JSON.stringify(process.argv.includes('--combo') ? comboInner : refInner)}"
)
c = c.replace(
  "const tag = teal ? '-ref-teal' : '-ref'",
  "const tag = process.argv.includes('--combo') ? (teal ? '-combo-teal' : '-combo') : (teal ? '-ref-teal' : '-ref')"
)
writeFileSync(file, c)
console.log('patched combo ok')
