/* ================================================================
   工具
================================================================ */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const now = new Date();
const DAY_CHARS = ['日','一','二','三','四','五','六'];
const WEEK_CHARS = ['一','二','三','四','五','六','日'];

let uid = Date.now();
const nextId = () => ++uid;

const pad = n => String(n).padStart(2,'0');
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const TODAY_KEY = dayKey(now);

const BUDGET_COLORS = {
  deep:'var(--accent)', shallow:'#7dd3fc', meeting:'#a78bfa', recover:'#4ade80',
};

const TOTAL_SLIDES = 6;
const ALL_SENTINEL = 'all';

const HOLIDAYS = {
  '2024-01-01':'元旦',
  '2024-02-09':'除夕','2024-02-10':'春节','2024-02-11':'初二','2024-02-12':'初三',
  '2024-04-04':'清明','2024-05-01':'劳动节','2024-06-10':'端午',
  '2024-09-17':'中秋','2024-10-01':'国庆',
  '2025-01-01':'元旦',
  '2025-01-28':'除夕','2025-01-29':'春节','2025-01-30':'初二','2025-01-31':'初三',
  '2025-04-04':'清明','2025-05-01':'劳动节','2025-05-31':'端午',
  '2025-10-01':'国庆','2025-10-06':'中秋',
  '2026-01-01':'元旦',
  '2026-02-16':'除夕','2026-02-17':'春节','2026-02-18':'初二','2026-02-19':'初三',
  '2026-04-05':'清明','2026-05-01':'劳动节','2026-06-19':'端午',
  '2026-09-25':'中秋','2026-10-01':'国庆',
  '2027-01-01':'元旦',
  '2027-02-05':'除夕','2027-02-06':'春节','2027-02-07':'初二','2027-02-08':'初三',
  '2027-04-05':'清明','2027-05-01':'劳动节','2027-06-09':'端午',
  '2027-09-15':'中秋','2027-10-01':'国庆',
};

/* ================================================================
   视角库（Lens）——配置，不是数据
================================================================ */
const LENSES = [
  { id:'yijing', name:'易经视角', icon:'☯', questions:[
    '什么正在变化？',
    '现在处于开始、发展、转折还是收尾？',
    '当前更适合进、守还是退？',
    '什么条件变化后，我的判断也应该变化？',
  ]},
  { id:'philosophy', name:'哲学视角', icon:'?', questions:[
    '哪些是事实，哪些只是我的解释？',
    '我真正看重的是什么？',
    '哪些是我能控制的？',
    '这个选择会让我成为什么样的人？',
  ]},
  { id:'state', name:'状态视角', icon:'◐', questions:[
    '我现在的精力怎么样？',
    '最近是在持续消耗还是恢复？',
    '身体和作息有没有失衡？',
    '现在适合继续用力，还是先恢复？',
  ]},
  { id:'longterm', name:'长期视角', icon:'→', questions:[
    '1 个月后会怎样？',
    '1 年后会怎样？',
    '3 年后会怎样？',
  ]},
  { id:'reality', name:'现实视角', icon:'¥', questions:[
    '钱、时间、能力、风险分别是多少？',
  ]},
];
const LENS_MAP = Object.fromEntries(LENSES.map(l => [l.id, l]));

const finePointer = () => matchMedia('(hover:hover) and (pointer:fine)').matches;

function announce(msg){
  const el = $('liveRegion');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = msg; }, 20);
}

function parseDate(str){
  if (!str) return new Date();
  const [y,m,d] = str.split('-').map(Number);
  return new Date(y, m-1, d);
}
function addDays(str, delta){
  const d = parseDate(str);
  d.setDate(d.getDate() + delta);
  return dayKey(d);
}
function isToday(str){ return str === TODAY_KEY; }

function fmtDateHuman(str, opts = {}){
  if (!str || str === ALL_SENTINEL) return '全部';
  const d = parseDate(str);
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((d - todayMidnight) / 86400000);
  const holiday = HOLIDAYS[str];
  const md = `${d.getMonth()+1}月${d.getDate()}日`;
  const wd = '周' + DAY_CHARS[d.getDay()];
  const relative = { '-2':'前天', '-1':'昨天', '0':'今天', '1':'明天', '2':'后天' }[diff];

  if (opts.short){
    if (relative) return holiday ? `${relative}·${holiday}` : relative;
    if (holiday) return holiday;
    return md;
  }
  if (relative){
    return holiday
      ? `${relative} · ${md} · ${holiday}`
      : `${relative} · ${md} ${wd}`;
  }
  if (holiday) return `${md} ${wd} · ${holiday}`;
  return `${md} ${wd}`;
}
function fmtWeekRange(str){
  const dates = weekDatesOf(str);
  const s = parseDate(dates[0]);
  const e = parseDate(dates[6]);
  return `${s.getMonth()+1}/${s.getDate()} – ${e.getMonth()+1}/${e.getDate()}`;
}
function weekDatesOf(str){
  const d = parseDate(str);
  const dow = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - dow);
  return Array.from({length:7}, (_,i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return dayKey(dd);
  });
}
function isWeekOfToday(dateStr){
  const w1 = weekDatesOf(dateStr).join(',');
  const w2 = weekDatesOf(TODAY_KEY).join(',');
  return w1 === w2;
}

/* ================================================================
   Tooltip（info 图标气泡）
================================================================ */
const tooltipEl = $('tooltip');
function showTip(el){
  const text = el.dataset.tip;
  if (!text) return;
  tooltipEl.textContent = text;
  tooltipEl.classList.add('show');
  const r = el.getBoundingClientRect();
  const tr = tooltipEl.getBoundingClientRect();
  let left = r.left;
  let top = r.bottom + 8;
  if (left + tr.width > innerWidth - 12) left = innerWidth - tr.width - 12;
  if (left < 12) left = 12;
  if (top + tr.height > innerHeight - 12) top = r.top - tr.height - 8;
  tooltipEl.style.left = left + 'px';
  tooltipEl.style.top  = top  + 'px';
}
function hideTip(){ tooltipEl.classList.remove('show'); }

document.addEventListener('mouseover', e => {
  const info = e.target.closest('.info');
  if (info) showTip(info);
});
document.addEventListener('mouseout', e => {
  const info = e.target.closest('.info');
  if (info) hideTip();
});
document.addEventListener('focusin', e => {
  const info = e.target.closest('.info');
  if (info) showTip(info);
});
document.addEventListener('focusout', e => {
  const info = e.target.closest('.info');
  if (info) hideTip();
});
addEventListener('scroll', hideTip, true);
addEventListener('resize', hideTip);

/* ================================================================
   主题 / 导航 / 模式
================================================================ */
const THEMES = [
  { id:'night',  name:'深夜', bg:'#0a0a0b', accent:'#c8ff4d' },
  { id:'ink',    name:'墨蓝', bg:'#0d0f14', accent:'#7dd3fc' },
  { id:'forest', name:'森林', bg:'#0c1411', accent:'#4ade80' },
  { id:'sunset', name:'暮色', bg:'#171014', accent:'#ff8a5b' },
  { id:'paper',  name:'纸白', bg:'#f6f5f2', accent:'#2555d4' },
  { id:'sand',   name:'沙色', bg:'#f4efe6', accent:'#9a3412' },
];
const THEME_KEY = 'liubai-theme';
const NAV_KEY   = 'liubai-nav';
const ZEN_KEY   = 'liubai-zen';
const MODE_KEY  = 'liubai-mode';

function buildSwatches(){
  const wrap = $('swatches');
  wrap.innerHTML = '';
  THEMES.forEach(t => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.dataset.theme = t.id;
    b.title = t.name;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', `主题：${t.name}`);
    b.style.background = t.bg;
    b.innerHTML = `<span class="sw-dot" style="background:${t.accent}"></span>`;
    b.addEventListener('click', () => applyTheme(t.id));
    wrap.appendChild(b);
  });
}
function applyTheme(id, animate = true){
  if (animate){
    document.documentElement.classList.add('theme-fade');
    clearTimeout(window.__tf);
    window.__tf = setTimeout(() =>
      document.documentElement.classList.remove('theme-fade'), 430);
  }
  document.body.dataset.theme = id;
  try{ localStorage.setItem(THEME_KEY, id); }catch(e){}
  document.querySelectorAll('.swatch').forEach(s => {
    const on = s.dataset.theme === id;
    s.classList.toggle('on', on);
    s.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}
function applyNav(pos){
  document.body.dataset.nav = pos === 'right' ? 'right' : 'left';
  try{ localStorage.setItem(NAV_KEY, document.body.dataset.nav); }catch(e){}
  document.querySelectorAll('#segNav button').forEach(b => {
    const on = b.dataset.pos === document.body.dataset.nav;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}
function applyMode(mode, silent){
  const simple = mode === 'simple';
  document.body.classList.toggle('mode-simple', simple);
  try{ localStorage.setItem(MODE_KEY, simple ? 'simple' : 'full'); }catch(e){}
  const btn = $('modeToggle');
  btn.setAttribute('aria-pressed', simple ? 'true' : 'false');
  btn.setAttribute('aria-label', simple ? '切回全量模式' : '切换到简洁模式');
  document.querySelectorAll('#segMode button').forEach(b => {
    const on = b.dataset.mode === (simple ? 'simple' : 'full');
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  if (!silent){
    showToast(simple
      ? '简洁模式 · 只保留核心内容'
      : '全量模式 · 显示所有信息');
    announce(simple ? '已切到简洁模式' : '已切到全量模式');
  }
}
function toggleMode(){
  const simple = document.body.classList.contains('mode-simple');
  applyMode(simple ? 'full' : 'simple');
}
$('modeToggle').addEventListener('click', toggleMode);

/* ================================================================
   状态
================================================================ */
const STORAGE_KEY = 'liubai-pms-v8';

function emptyDay(){
  return {
    focusBlocks: [], inbox: [], interruptions: [], sources: [],
    budget: {
      deep:   { used: 0, total: 180 },
      shallow:{ used: 0, total: 120 },
      meeting:{ used: 0, total: 120 },
      recover:{ used: 0, total: 60  },
    },
    feel: 0,
  };
}

const defaultState = {
  tasks: [
    { id: 1, text: '完成产品需求文档 v2', tag: '工作', done: false, attn: 'high', date: TODAY_KEY },
    { id: 2, text: '健身 45 分钟',        tag: '健康', done: true,  attn: 'low',  date: TODAY_KEY },
    { id: 3, text: '阅读《深度工作》30 页', tag: '成长', done: false, attn: 'mid',  date: TODAY_KEY },
    { id: 4, text: '整理本周笔记归档',      tag: '成长', done: false, attn: 'high', date: TODAY_KEY },
  ],
  habits: [
    { id: 'h1', name: '早起', history: {} },
    { id: 'h2', name: '阅读', history: {} },
    { id: 'h3', name: '运动', history: {} },
    { id: 'h4', name: '冥想', history: {} },
  ],
  notes: [
    { id: 101, text: '把「少即是多」当成可执行的约束：每个界面元素都要为理解内容服务。', time: Date.now() - 86400000, date: addDays(TODAY_KEY, -1) },
    { id: 102, text: '注意力的基本单位不是时间，而是「一次不被打断的完整思考」。', time: Date.now() - 3600000, date: TODAY_KEY },
  ],
  insights: [],
  attention: {
    days: {},
    currentTask: '完成产品需求文档 v2',
    currentTaskId: 1,
    level: 2, running: false, sessionStart: null, sessionMin: 0,
    lastContext: {
      task: '完成产品需求文档 v2',
      nextStep: '补充第 4 节：权限模型草图',
      files: ['PRD-v2.md', 'figma.com/prd-v2', '权限模型-草稿.md'],
      unresolved: ['需要找后端确认 RBAC 粒度'],
      savedAt: Date.now() - 1000*60*52,
    },
  },
  hud: [0,0,0,0,0,0],
  dates: [TODAY_KEY, TODAY_KEY, TODAY_KEY, TODAY_KEY, TODAY_KEY, TODAY_KEY],
};

const DEFAULT_HUD_RULES = {
  0: { stats: [2], focusFlow: [1,2] },
  1: { taskStats: [1,2] },
  2: { habitSummary: [1,2] },
  3: { budget: [2], attnAux: [1,2] },
  4: { noteStats: [1,2] },
  5: { reviewMetrics: [2], reviewAux: [1,2], cognition: [1,2] },
};

const seedToday = {
  focusBlocks: [
    { id: 1, start:'09:00', end:'10:30', type:'深度工作', task:'完成产品需求文档 v2', level:3, status:'done' },
    { id: 2, start:'10:45', end:'12:00', type:'深度工作', task:'阅读《深度工作》', level:2, status:'active' },
    { id: 3, start:'14:00', end:'15:30', type:'创作',     task:'整理本周笔记归档', level:3, status:'planned' },
    { id: 4, start:'16:00', end:'17:00', type:'沟通',     task:'周会 / 回复',      level:1, status:'planned' },
  ],
  inbox: [
    { id:'i1', time:'09:42', source:'微信', content:'张总：下午开会改到 3 点？', type:'reply' },
    { id:'i2', time:'10:15', source:'念头', content:'突然想起要续费域名', type:'todo' },
    { id:'i3', time:'11:03', source:'邮件', content:'简历投递回复 — 下周面试', type:'reply' },
  ],
  interruptions: [
    { id:'ir1', time:'09:42', source:'微信', type:'外部', urgency:'可延迟', resolved:'记入收件箱', recover:2 },
    { id:'ir2', time:'10:15', source:'念头', type:'内部', urgency:'无关',   resolved:'记入收件箱', recover:3 },
    { id:'ir3', time:'11:03', source:'邮件', type:'外部', urgency:'紧急',   resolved:'立即处理',   recover:7 },
  ],
  sources: [
    { name:'微信', count:2, min:8 },
    { name:'邮件', count:1, min:4 },
  ],
  budget: {
    deep:   { used: 115, total: 180 },
    shallow:{ used: 60,  total: 120 },
    meeting:{ used: 90,  total: 120 },
    recover:{ used: 25,  total: 60  },
  },
  feel: 4,
};

let state = load();
const editing = { task: null, habit: null, day: null, note: null };

function migrateHabits(habits){
  return habits.map(hb => {
    if (hb.history && typeof hb.history === 'object') return hb;
    const history = {};
    if (Array.isArray(hb.days)){
      const dates = weekDatesOf(TODAY_KEY);
      hb.days.forEach((v, i) => { if (v) history[dates[i]] = 1; });
    }
    return { id: hb.id, name: hb.name, history };
  });
}
function migrateTasks(tasks){
  return tasks.map(t => t.date ? t : { ...t, date: TODAY_KEY });
}
function migrateNotes(notes){
  return notes.map(n => n.date ? n : { ...n, date: dayKey(new Date(n.time || Date.now())) });
}
function migrateInsights(insights){
  if (!Array.isArray(insights)) return [];
  return insights.map(i => ({
    id: i.id ?? nextId(),
    name: i.name || '',
    source: i.source || '',
    understanding: i.understanding || '',
    example: i.example || '',
    scenes: Array.isArray(i.scenes) ? i.scenes : [],
    relatedTaskIds: Array.isArray(i.relatedTaskIds) ? i.relatedTaskIds : [],
    date: i.date || TODAY_KEY,
    ts: i.ts || Date.now(),
  }));
}

function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw){
      const p = JSON.parse(raw);
      const a = p.attention || {};
      const days = (a.days && typeof a.days === 'object') ? a.days : {};
      if (!days[TODAY_KEY]){
        days[TODAY_KEY] = Object.assign(emptyDay(), structuredClone(seedToday));
      }
      return {
        tasks: migrateTasks(Array.isArray(p.tasks) ? p.tasks : structuredClone(defaultState.tasks)),
        habits: migrateHabits(Array.isArray(p.habits) ? p.habits : structuredClone(defaultState.habits)),
        notes: migrateNotes(Array.isArray(p.notes) ? p.notes : structuredClone(defaultState.notes)),
        insights: migrateInsights(p.insights),
        attention: {
          days,
          currentTask:  a.currentTask  ?? defaultState.attention.currentTask,
          currentTaskId:a.currentTaskId ?? defaultState.attention.currentTaskId,
          level:        a.level        ?? defaultState.attention.level,
          running:      !!a.running,
          sessionStart: a.sessionStart || null,
          sessionMin:   a.sessionMin   ?? 0,
          lastContext:  a.lastContext  || structuredClone(defaultState.attention.lastContext),
        },
        hud: Array.isArray(p.hud) && p.hud.length === 6
          ? p.hud.map(v => (v === 0 || v === 1 || v === 2) ? v : 0)
          : [0,0,0,0,0,0],
        dates: Array.isArray(p.dates) && p.dates.length === 6
          ? p.dates.slice(0,6)
          : [TODAY_KEY, TODAY_KEY, TODAY_KEY, TODAY_KEY, TODAY_KEY, TODAY_KEY],
      };
    }
  }catch(e){}
  const s = structuredClone(defaultState);
  s.attention.days = {};
  s.attention.days[TODAY_KEY] = Object.assign(emptyDay(), structuredClone(seedToday));
  const wk = weekDatesOf(TODAY_KEY);
  s.habits[0].history = { [wk[0]]:1, [wk[1]]:1, [wk[2]]:1, [wk[3]]:1, [wk[4]]:0, [wk[5]]:1, [wk[6]]:0 };
  s.habits[1].history = { [wk[0]]:1, [wk[1]]:0, [wk[2]]:1, [wk[3]]:1, [wk[4]]:1, [wk[5]]:0, [wk[6]]:0 };
  s.habits[2].history = { [wk[0]]:0, [wk[1]]:1, [wk[2]]:0, [wk[3]]:1, [wk[4]]:0, [wk[5]]:0, [wk[6]]:0 };
  s.habits[3].history = { [wk[0]]:1, [wk[1]]:1, [wk[2]]:1, [wk[3]]:1, [wk[4]]:1, [wk[5]]:1, [wk[6]]:1 };
  return s;
}
function save(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
}
function commit(){ save(); renderCurrentSlide(); }

function getDate(i){ return state.dates[i] || TODAY_KEY; }
function setDate(i, d){ state.dates[i] = d; save(); }
function isAll(i){ return state.dates[i] === ALL_SENTINEL; }
function isDetached(i){
  const d = state.dates[i];
  return state.dates.some((x, j) => j !== i && x !== d);
}
function syncAllDates(fromIdx){
  const d = state.dates[fromIdx];
  state.dates = state.dates.map(() => d);
  save();
}
function dateLabel(i){
  if (isAll(i)) return '全部';
  const d = getDate(i);
  if (i === 2 || i === 5) return isWeekOfToday(d) ? '本周' : fmtWeekRange(d);
  return fmtDateHuman(d);
}

function dayData(dateStr){
  if (!state.attention.days[dateStr]){
    state.attention.days[dateStr] = emptyDay();
  }
  return state.attention.days[dateStr];
}

/* ================================================================
   认知：understanding & insights 辅助
================================================================ */
function getUnderstanding(t){
  if (!t.understanding || typeof t.understanding !== 'object'){
    t.understanding = { facts:'', view:'', next:'', lenses:{} };
  }
  if (!t.understanding.lenses || typeof t.understanding.lenses !== 'object'){
    t.understanding.lenses = {};
  }
  return t.understanding;
}
function hasLensContent(l){
  if (!l || typeof l !== 'object') return false;
  return Object.values(l).some(v => String(v||'').trim());
}
function taskLensCount(t){
  const u = t.understanding;
  if (!u?.lenses) return 0;
  return Object.keys(u.lenses).filter(k => hasLensContent(u.lenses[k])).length;
}
function taskHasCognition(t){
  const u = t.understanding;
  if (!u) return false;
  if (String(u.facts||'').trim()) return true;
  if (String(u.view||'').trim()) return true;
  if (String(u.next||'').trim()) return true;
  return taskLensCount(t) > 0;
}
function insightsForTask(taskId){
  return state.insights.filter(i => (i.relatedTaskIds||[]).includes(taskId));
}

/* ================================================================
   统一渲染辅助
================================================================ */
function renderStatGrid(el, items){
  if (!el) return;
  el.innerHTML = '';
  items.forEach(it => {
    const div = document.createElement('div');
    div.className = 'stat' + (it.accent ? ' accent' : '');
    let html = `
      <span class="stat-label">${esc(it.label)}</span>
      <span class="stat-value">${it.value}${it.unit ? `<small>${esc(it.unit)}</small>` : ''}</span>`;
    if (it.bar){
      html += `<div class="stat-bar"><span style="width:${Math.max(0,Math.min(100,it.bar.pct))}%;background:${it.bar.color||'var(--accent)'}"></span></div>`;
    }
    if (it.sub){
      html += `<span class="stat-sub">${esc(it.sub)}</span>`;
    }
    div.innerHTML = html;
    el.appendChild(div);
  });
}

function renderGroupedTasks(ul, tasks){
  let last = null;
  tasks.forEach(t => {
    if (t.date !== last){
      const h = document.createElement('li');
      h.className = 'group-head';
      h.textContent = fmtDateHuman(t.date);
      ul.appendChild(h);
      last = t.date;
    }
    const li = document.createElement('li');
    li.className = t.done ? 'dim' : '';
    if (taskHasCognition(t)) li.classList.add('cog');
    li.dataset.id = t.id;
    li.style.cursor = 'pointer';
    li.innerHTML = `<b>${esc(t.text)}</b>` +
      (t.tag ? `<span class="right">${esc(t.tag)}</span>` : '');
    ul.appendChild(li);
  });
}
function renderGroupedNotes(ul, notes){
  let last = null;
  notes.forEach(n => {
    if (n.date !== last){
      const h = document.createElement('div');
      h.className = 'note-group-head';
      h.textContent = fmtDateHuman(n.date);
      ul.appendChild(h);
      last = n.date;
    }
    const li = document.createElement('li');
    li.className = 'note-item';
    li.dataset.id = n.id;
    li.innerHTML = `
      <div class="note-head">
        <span class="note-time">${fmtTime(n.time)}</span>
        <div class="acts"><button class="act del" title="删除">✕</button></div>
      </div>
      <textarea class="note-body" placeholder="写点什么…" maxlength="2000"></textarea>`;
    li.querySelector('.note-body').value = n.text;
    ul.appendChild(li);
  });
  ul.querySelectorAll('.note-body').forEach(autoGrow);
}

/* ================================================================
   详情弹窗
================================================================ */
const detailEl = $('detail');
const detailBox = $('detailBox');

function openDetail(html){
  detailBox.innerHTML = html;
  detailEl.classList.add('open');
  setTimeout(() => {
    const firstInput = detailBox.querySelector('input, select, textarea, button');
    if (firstInput) firstInput.focus();
  }, 60);
}
function closeDetail(){
  detailEl.classList.remove('open');
}
detailEl.addEventListener('click', e => {
  if (e.target.hasAttribute('data-close')) closeDetail();
});

/* —— 任务详情（双 tab） —— */
function openTaskDetail(taskId){
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;
  const u = getUnderstanding(t);
  const isFocus = state.attention.currentTaskId === t.id;
  const lensCount0 = taskLensCount(t);

  let activeTab = 'exec';
  let attn = t.attn;
  let done = t.done;

  function buildExecPane(){
    return `
      <div class="detail-row">
        <span class="dr-k">内容</span>
        <div class="dr-v"><input class="dr-input" id="dtText" value="${esc(t.text)}" maxlength="80"></div>
      </div>

      <div class="detail-row">
        <span class="dr-k">标签</span>
        <div class="dr-v"><input class="dr-input" id="dtTag" value="${esc(t.tag || '')}" maxlength="6" placeholder="无"></div>
      </div>

      <div class="detail-row">
        <span class="dr-k">日期</span>
        <div class="dr-v"><input class="dr-input" id="dtDate" type="date" value="${t.date}"></div>
      </div>

      <div class="detail-row">
        <span class="dr-k">认知</span>
        <div class="dr-v">
          <div class="detail-chips" id="dtAttn">
            <button class="chip ${t.attn==='high'?'on':''}" data-v="high">高</button>
            <button class="chip ${t.attn==='mid'?'on':''}"  data-v="mid">中</button>
            <button class="chip ${t.attn==='low'?'on':''}"  data-v="low">低</button>
          </div>
        </div>
      </div>

      <div class="detail-row">
        <span class="dr-k">状态</span>
        <div class="dr-v">
          <div class="detail-chips" id="dtDone">
            <button class="chip ${!t.done?'on':''}" data-v="0">未完成</button>
            <button class="chip ${t.done?'on':''}"  data-v="1">已完成</button>
          </div>
        </div>
      </div>

      <div class="detail-row">
        <span class="dr-k">专注</span>
        <div class="dr-v">
          <div class="detail-chips" id="dtFocus">
            <button class="chip ${isFocus?'on':''}" data-v="1">${isFocus ? '当前专注中' : '设为当前专注'}</button>
          </div>
          ${isFocus ? '<div class="detail-meta">此任务正在被追踪</div>' : ''}
        </div>
      </div>
    `;
  }

  function buildUnderPane(){
    const related = insightsForTask(t.id);
    const lensCount = taskLensCount(t);

    let lensHtml = '';
    LENSES.forEach(lens => {
      const l = u.lenses[lens.id] || {};
      const used = hasLensContent(l);
      const isOpen = used; // 默认已用的展开
      let qHtml = '';
      lens.questions.forEach((q, i) => {
        const val = l['q'+i] || '';
        qHtml += `
          <div class="lens-q">
            <span class="q-text">${esc(q)}</span>
            <textarea data-lens="${lens.id}" data-q="q${i}" placeholder="写下来…">${esc(val)}</textarea>
          </div>`;
      });
      lensHtml += `
        <div class="lens-item ${isOpen?'open':''}" data-lens-id="${lens.id}">
          <button class="lens-head" type="button">
            <span class="lens-icon">${lens.icon}</span>
            <span class="lens-name">${esc(lens.name)}</span>
            <span class="lens-state">${used?'已用':''}</span>
            <span class="lens-caret" aria-hidden="true">▸</span>
          </button>
          <div class="lens-body">
            <div class="lens-body-inner">
              <div class="lens-body-pad">${qHtml}</div>
            </div>
          </div>
        </div>`;
    });

    const relatedHtml = related.length ? `
      <div class="und-block" style="margin-top:16px">
        <label>相关知识卡</label>
        <div class="related-insights">
          ${related.map(i => `
            <div class="related-insight" data-insight-id="${i.id}" tabindex="0" role="button">
              <div class="ri-name">${esc(i.name||'未命名')}</div>
              ${i.source?`<div class="ri-src">${esc(i.source)}</div>`:''}
            </div>
          `).join('')}
        </div>
      </div>` : '';

    return `
      <div class="und-block">
        <label>事实</label>
        <textarea id="undFacts" placeholder="我知道什么？" maxlength="800">${esc(u.facts||'')}</textarea>
      </div>
      <div class="und-block">
        <label>我的看法</label>
        <textarea id="undView" placeholder="我怎么看这件事？" maxlength="800">${esc(u.view||'')}</textarea>
      </div>
      <div class="und-block">
        <label>下一步</label>
        <textarea id="undNext" placeholder="我准备怎么做？" maxlength="800">${esc(u.next||'')}</textarea>
      </div>

      <div class="und-lens-bar">
        <span class="und-lens-count">换个角度看看 · 已用 <b>${lensCount}</b> / ${LENSES.length}</span>
      </div>
      <div class="lens-list">${lensHtml}</div>
      ${relatedHtml}
    `;
  }

  detailBox.innerHTML = `
    <div class="detail-head">
      <span class="dh-title">任务详情</span>
      <button class="detail-close" aria-label="关闭">✕</button>
    </div>

    <div class="detail-tabs" role="tablist">
      <button class="detail-tab on" data-tab="exec" role="tab" aria-selected="true">执行</button>
      <button class="detail-tab" data-tab="under" role="tab" aria-selected="false">
        理解${lensCount0?`<span class="tab-badge">${lensCount0}</span>`:''}
      </button>
    </div>

    <div class="detail-pane" data-pane="exec">${buildExecPane()}</div>
    <div class="detail-pane" data-pane="under" hidden>${buildUnderPane()}</div>

    <div class="detail-actions">
      <button class="detail-btn danger" id="dtDel">删除</button>
      <button class="detail-btn" id="dtSaveCard">存为知识卡</button>
      <button class="detail-btn primary" id="dtSave">保存</button>
    </div>
  `;

  // —— 保存理解内容（合入 task.understanding）
  function commitUnderstanding(){
    const facts = detailBox.querySelector('#undFacts');
    const view  = detailBox.querySelector('#undView');
    const next  = detailBox.querySelector('#undNext');
    if (facts) u.facts = facts.value;
    if (view)  u.view  = view.value;
    if (next)  u.next  = next.value;
    detailBox.querySelectorAll('.lens-q textarea').forEach(ta => {
      const lid = ta.dataset.lens;
      const qk  = ta.dataset.q;
      if (!u.lenses[lid]) u.lenses[lid] = {};
      u.lenses[lid][qk] = ta.value;
    });
    save();
  }

  function refreshLensBadge(){
    const newCount = taskLensCount(t);
    const tab = detailBox.querySelector('.detail-tab[data-tab="under"]');
    if (!tab) return;
    let badge = tab.querySelector('.tab-badge');
    if (newCount > 0){
      if (!badge){
        badge = document.createElement('span');
        badge.className = 'tab-badge';
        tab.appendChild(badge);
      }
      badge.textContent = newCount;
    } else if (badge){
      badge.remove();
    }
    const bar = detailBox.querySelector('.und-lens-count b');
    if (bar) bar.textContent = newCount;
  }

  // —— tab 切换
  detailBox.querySelectorAll('.detail-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === activeTab) return;
      activeTab = tab;
      detailBox.querySelectorAll('.detail-tab').forEach(b => {
        b.classList.toggle('on', b.dataset.tab === tab);
        b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false');
      });
      detailBox.querySelectorAll('.detail-pane').forEach(p => {
        p.hidden = p.dataset.pane !== tab;
      });
    });
  });

  // —— 关闭
  detailBox.querySelector('.detail-close').onclick = () => {
    commitUnderstanding();
    closeDetail();
    renderAll();
  };

  // —— 理解 tab：主 textarea blur 保存
  detailBox.querySelectorAll('#undFacts, #undView, #undNext').forEach(ta => {
    ta.addEventListener('blur', () => { commitUnderstanding(); });
  });

  // —— lens accordion
  detailBox.querySelectorAll('.lens-head').forEach(head => {
    head.addEventListener('click', () => {
      const item = head.closest('.lens-item');
      item.classList.toggle('open');
    });
  });

  // —— lens textarea blur 保存
  detailBox.querySelectorAll('.lens-q textarea').forEach(ta => {
    ta.addEventListener('blur', () => {
      const lid = ta.dataset.lens;
      const qk = ta.dataset.q;
      if (!u.lenses[lid]) u.lenses[lid] = {};
      u.lenses[lid][qk] = ta.value;
      save();
      const item = ta.closest('.lens-item');
      if (item){
        const used = hasLensContent(u.lenses[lid]);
        const stateEl = item.querySelector('.lens-state');
        if (stateEl) stateEl.textContent = used ? '已用' : '';
      }
      refreshLensBadge();
    });
  });

  // —— 相关知识卡点击
  detailBox.querySelectorAll('.related-insight').forEach(el => {
    el.addEventListener('click', () => {
      commitUnderstanding();
      const iid = Number(el.dataset.insightId);
      openInsightDetail(iid);
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        el.click();
      }
    });
  });

  // —— 存为知识卡
  detailBox.querySelector('#dtSaveCard').onclick = () => {
    commitUnderstanding();
    if (!taskHasCognition(t)){
      showToast('先在「理解」里写点什么');
      return;
    }
    // 预填：名称用任务文本；理解用「我的看法」；例子用「事实」
    const draft = {
      name: t.text.slice(0, 40),
      source: '',
      understanding: u.view || '',
      example: u.facts || '',
      scenes: [],
      relatedTaskIds: [t.id],
    };
    openInsightDetail(null, draft);
  };

  // —— 执行 tab chips
  detailBox.querySelector('#dtAttn').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    attn = b.dataset.v;
    detailBox.querySelectorAll('#dtAttn .chip').forEach(c =>
      c.classList.toggle('on', c.dataset.v === attn));
  });
  detailBox.querySelector('#dtDone').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    done = b.dataset.v === '1';
    detailBox.querySelectorAll('#dtDone .chip').forEach(c =>
      c.classList.toggle('on', (c.dataset.v === '1') === done));
  });
  detailBox.querySelector('#dtFocus').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    state.attention.currentTask = t.text;
    state.attention.currentTaskId = t.id;
    state.attention.sessionMin = 0;
    commitUnderstanding();
    save();
    closeDetail();
    renderAll();
    showToast(`已设为当前专注：${t.text}`);
  });

  // —— 删除
  detailBox.querySelector('#dtDel').onclick = () => {
    if (!confirm(`确定删除「${t.text}」？`)) return;
    state.tasks = state.tasks.filter(x => x.id !== t.id);
    if (state.attention.currentTaskId === t.id){
      state.attention.currentTaskId = null;
      state.attention.currentTask = '未选择任务';
    }
    // 从知识卡的关联中移除
    state.insights.forEach(i => {
      if (i.relatedTaskIds) i.relatedTaskIds = i.relatedTaskIds.filter(id => id !== t.id);
    });
    save();
    closeDetail();
    renderAll();
    showToast('已删除');
  };

  // —— 保存（执行 tab）
  detailBox.querySelector('#dtSave').onclick = () => {
    const text = detailBox.querySelector('#dtText').value.trim();
    const tag  = detailBox.querySelector('#dtTag').value.trim();
    const date = detailBox.querySelector('#dtDate').value;
    if (!text){ showToast('任务内容不能为空'); return; }
    t.text = text;
    t.tag = tag || '其他';
    if (date) t.date = date;
    t.attn = attn;
    t.done = done;
    commitUnderstanding();
    save();
    closeDetail();
    renderAll();
    showToast('已保存');
  };
}

/* —— 知识卡详情 —— */
function openInsightDetail(insightId, draft = {}){
  const isNew = insightId === null || insightId === undefined;
  let ins;
  if (isNew){
    ins = Object.assign({
      id: null, name:'', source:'', understanding:'', example:'',
      scenes: [], relatedTaskIds: [], date: TODAY_KEY, ts: Date.now(),
    }, draft);
  } else {
    ins = state.insights.find(i => i.id === insightId);
    if (!ins) return;
  }

  const allTasks = state.tasks.slice();

  detailBox.innerHTML = `
    <div class="detail-head">
      <span class="dh-title">${isNew ? '新建知识卡' : '知识卡'}</span>
      <button class="detail-close" aria-label="关闭">✕</button>
    </div>

    <div class="detail-row">
      <span class="dr-k">名称</span>
      <div class="dr-v">
        <input class="dr-input" id="icName" value="${esc(ins.name)}" maxlength="60" placeholder="如：穷则变，变则通">
      </div>
    </div>

    <div class="detail-row">
      <span class="dr-k">来源</span>
      <div class="dr-v">
        <input class="dr-input" id="icSource" value="${esc(ins.source||'')}" maxlength="80" placeholder="如：《周易·系辞》">
      </div>
    </div>

    <div class="detail-row">
      <span class="dr-k">我的理解</span>
      <div class="dr-v">
        <textarea class="dr-input" id="icUnderstanding" rows="3" placeholder="用你自己的话说一遍…" maxlength="800">${esc(ins.understanding||'')}</textarea>
      </div>
    </div>

    <div class="detail-row">
      <span class="dr-k">适用场景</span>
      <div class="dr-v">
        <div class="detail-chips" id="icScenes">
          ${['学习','职业','项目','人际','健康','财务','其他'].map(s => 
            `<button class="chip ${(ins.scenes||[]).includes(s)?'on':''}" data-v="${s}">${s}</button>`
          ).join('')}
        </div>
      </div>
    </div>

    <div class="detail-row">
      <span class="dr-k">现实例子</span>
      <div class="dr-v">
        <textarea class="dr-input" id="icExample" rows="2" placeholder="具体发生过什么…" maxlength="600">${esc(ins.example||'')}</textarea>
      </div>
    </div>

    <div class="detail-row">
      <span class="dr-k">关联事情</span>
      <div class="dr-v">
        <div class="detail-chips" id="icTasks" style="max-height:160px;overflow-y:auto"></div>
      </div>
    </div>

    <div class="detail-actions">
      ${!isNew ? '<button class="detail-btn danger" id="icDel">删除</button>' : ''}
      <button class="detail-btn primary" id="icSave">保存</button>
    </div>
  `;

  // 渲染关联任务 chips
  function renderTaskChips(){
    const wrap = detailBox.querySelector('#icTasks');
    if (!allTasks.length){
      wrap.innerHTML = '<span style="color:var(--muted);font-size:.82rem">还没有任务</span>';
      return;
    }
    const related = ins.relatedTaskIds || [];
    wrap.innerHTML = allTasks.map(tk => {
      const label = tk.text.length > 12 ? tk.text.slice(0, 12) + '…' : tk.text;
      return `<button class="chip ${related.includes(tk.id)?'on':''}" data-task-id="${tk.id}" title="${esc(tk.text)}">${esc(label)}</button>`;
    }).join('');
    wrap.querySelectorAll('.chip').forEach(c => {
      c.addEventListener('click', () => {
        const tid = Number(c.dataset.taskId);
        ins.relatedTaskIds = ins.relatedTaskIds || [];
        const idx = ins.relatedTaskIds.indexOf(tid);
        if (idx >= 0) ins.relatedTaskIds.splice(idx, 1);
        else ins.relatedTaskIds.push(tid);
        c.classList.toggle('on');
      });
    });
  }
  renderTaskChips();

  // 场景 chips
  detailBox.querySelector('#icScenes').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    const v = b.dataset.v;
    ins.scenes = ins.scenes || [];
    const idx = ins.scenes.indexOf(v);
    if (idx >= 0) ins.scenes.splice(idx, 1);
    else ins.scenes.push(v);
    b.classList.toggle('on');
  });

  // 关闭
  detailBox.querySelector('.detail-close').onclick = () => {
    closeDetail();
    renderAll();
  };

  // 删除
  if (!isNew){
    detailBox.querySelector('#icDel').onclick = () => {
      if (!confirm(`确定删除知识卡「${ins.name}」？`)) return;
      state.insights = state.insights.filter(x => x.id !== ins.id);
      save();
      closeDetail();
      renderAll();
      showToast('已删除');
    };
  }

  // 保存
  detailBox.querySelector('#icSave').onclick = () => {
    const name = detailBox.querySelector('#icName').value.trim();
    if (!name){ showToast('请填写名称'); return; }
    ins.name = name;
    ins.source = detailBox.querySelector('#icSource').value.trim();
    ins.understanding = detailBox.querySelector('#icUnderstanding').value.trim();
    ins.example = detailBox.querySelector('#icExample').value.trim();
    if (isNew){
      ins.id = nextId();
      ins.date = TODAY_KEY;
      ins.ts = Date.now();
      state.insights.push(ins);
    } else {
      ins.ts = Date.now();
    }
    save();
    closeDetail();
    renderAll();
    showToast(isNew ? '已创建知识卡' : '已保存');
  };
}

/* —— 专注块详情 —— */
function openBlockDetail(dateKey, blockId){
  const day = dayData(dateKey);
  const b = day.focusBlocks.find(x => x.id === blockId);
  if (!b) return;

  detailBox.innerHTML = `
    <div class="detail-head">
      <span class="dh-title">专注块详情</span>
      <button class="detail-close" aria-label="关闭">✕</button>
    </div>

    <div class="detail-row">
      <span class="dr-k">任务</span>
      <div class="dr-v"><input class="dr-input" id="dbTask" value="${esc(b.task)}" maxlength="80"></div>
    </div>

    <div class="detail-row">
      <span class="dr-k">时间</span>
      <div class="dr-v">
        <div style="display:flex;gap:10px;align-items:center">
          <input class="dr-input" id="dbStart" type="time" value="${esc(b.start)}" style="flex:1">
          <span style="color:var(--muted)">–</span>
          <input class="dr-input" id="dbEnd" type="time" value="${esc(b.end)}" style="flex:1">
        </div>
      </div>
    </div>

    <div class="detail-row">
      <span class="dr-k">类型</span>
      <div class="dr-v"><input class="dr-input" id="dbType" value="${esc(b.type)}" maxlength="10"></div>
    </div>

    <div class="detail-row">
      <span class="dr-k">保护级别</span>
      <div class="dr-v">
        <div class="detail-chips" id="dbLv">
          <button class="chip ${b.level===0?'on':''}" data-v="0">L0 开放</button>
          <button class="chip ${b.level===1?'on':''}" data-v="1">L1 可中断</button>
          <button class="chip ${b.level===2?'on':''}" data-v="2">L2 仅紧急</button>
          <button class="chip ${b.level===3?'on':''}" data-v="3">L3 完全封锁</button>
        </div>
      </div>
    </div>

    <div class="detail-row">
      <span class="dr-k">状态</span>
      <div class="dr-v">
        <div class="detail-chips" id="dbSt">
          <button class="chip ${b.status==='planned'?'on':''}" data-v="planned">计划中</button>
          <button class="chip ${b.status==='active'?'on':''}"  data-v="active">进行中</button>
          <button class="chip ${b.status==='done'?'on':''}"    data-v="done">已完成</button>
        </div>
      </div>
    </div>

    <div class="detail-actions">
      <button class="detail-btn danger" id="dbDel">删除</button>
      <button class="detail-btn primary" id="dbSave">保存</button>
    </div>`;

  detailBox.querySelector('.detail-close').onclick = closeDetail;

  let level = b.level;
  let status = b.status;

  detailBox.querySelector('#dbLv').addEventListener('click', e => {
    const btn = e.target.closest('.chip'); if (!btn) return;
    level = Number(btn.dataset.v);
    detailBox.querySelectorAll('#dbLv .chip').forEach(c =>
      c.classList.toggle('on', Number(c.dataset.v) === level));
  });
  detailBox.querySelector('#dbSt').addEventListener('click', e => {
    const btn = e.target.closest('.chip'); if (!btn) return;
    status = btn.dataset.v;
    detailBox.querySelectorAll('#dbSt .chip').forEach(c =>
      c.classList.toggle('on', c.dataset.v === status));
  });

  detailBox.querySelector('#dbDel').onclick = () => {
    if (!confirm(`确定删除「${b.task}」？`)) return;
    day.focusBlocks = day.focusBlocks.filter(x => x.id !== b.id);
    closeDetail();
    save(); renderAll();
    showToast('已删除');
  };

  detailBox.querySelector('#dbSave').onclick = () => {
    const task = detailBox.querySelector('#dbTask').value.trim();
    const start = detailBox.querySelector('#dbStart').value || b.start;
    const end   = detailBox.querySelector('#dbEnd').value   || b.end;
    const type  = detailBox.querySelector('#dbType').value.trim() || '深度工作';
    if (!task){ showToast('任务名不能为空'); return; }
    b.task = task; b.start = start; b.end = end; b.type = type;
    b.level = level; b.status = status;
    closeDetail();
    save(); renderAll();
    showToast('已保存');
  };
}

/* ================================================================
   HUD 分层
================================================================ */
const slides = [...document.querySelectorAll('.slide')];
const dots   = [...document.querySelectorAll('.dot')];
const hudToggle = $('hudToggle');
let cur = 0;

const HUD_LABEL = ['切换信息分层', '切换到核心视图', '切换到全部视图'];
const HUD_ANNOUNCE = ['全部信息已显示', '已隐藏部分辅助信息', '仅显示核心内容'];

function applyHudToSlide(i){
  const lvl = state.hud[i] || 0;
  const rules = DEFAULT_HUD_RULES[i] || {};
  const slide = slides[i];
  slide.dataset.hud = lvl;
  slide.querySelectorAll('[data-block]').forEach(block => {
    const blockId = block.dataset.block;
    const hideAt = rules[blockId] || [];
    const hidden = hideAt.includes(lvl);
    block.classList.toggle('hud-hidden', hidden);
  });
}
function updateHudButton(){
  const lvl = state.hud[cur] || 0;
  hudToggle.dataset.level = lvl;
  hudToggle.setAttribute('aria-label', HUD_LABEL[lvl]);
  hudToggle.setAttribute('aria-pressed', lvl === 0 ? 'false' : 'true');
}
function cycleHud(){
  state.hud[cur] = ((state.hud[cur] || 0) + 1) % 3;
  save();
  applyHudToSlide(cur);
  updateHudButton();
  announce(HUD_ANNOUNCE[state.hud[cur]]);
}
hudToggle.addEventListener('click', cycleHud);

/* ================================================================
   禅模式
================================================================ */
function applyZen(on, silent){
  document.body.classList.toggle('zen-mode', on);
  try{ localStorage.setItem(ZEN_KEY, on ? '1' : '0'); }catch(e){}
  if (!silent){
    announce(on ? '禅模式已开启' : '禅模式已关闭');
    showToast(on ? '禅模式 · 按 <kbd>Esc</kbd> 退出' : '禅模式已退出');
  }
}
function toggleZen(){ applyZen(!document.body.classList.contains('zen-mode')); }

/* ================================================================
   Toast
================================================================ */
const toastEl = $('toast');
let toastTimer;
function showToast(html){
  toastEl.innerHTML = html;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

/* ================================================================
   键盘
================================================================ */
addEventListener('keydown', e => {
  if (e.target.closest('input, textarea, select')) return;

  if (e.key === 'Escape'){
    if (detailEl.classList.contains('open')){ e.preventDefault(); closeDetail(); return; }
    if (document.body.classList.contains('zen-mode')){
      e.preventDefault(); applyZen(false); return;
    }
    if (paletteEl.classList.contains('open')){ e.preventDefault(); closePalette(); return; }
    if (settingsEl.classList.contains('open')){ e.preventDefault(); closeSettings(); return; }
  }

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'){
    e.preventDefault();
    togglePalette();
    return;
  }
  if (e.shiftKey && (e.key === 'Z' || e.key === 'z')){
    e.preventDefault(); toggleZen(); return;
  }
  if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey){
    e.preventDefault(); toggleMode(); return;
  }
  if ((e.key === 'h' || e.key === 'H') && !e.metaKey && !e.ctrlKey && !e.altKey){
    e.preventDefault();
    if (e.shiftKey){
      const allHidden = state.hud.every(v => v === 2);
      const newLvl = allHidden ? 0 : 2;
      state.hud = state.hud.map(() => newLvl);
      save();
      slides.forEach((_, i) => applyHudToSlide(i));
      updateHudButton();
      announce(allHidden ? '所有模块已恢复' : '所有模块已进入核心视图');
    } else {
      cycleHud();
    }
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === 'j'){
    e.preventDefault(); go(cur + 1, 1);
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'k'){
    e.preventDefault(); go(cur - 1, -1);
  } else if (e.key === 'Home'){ e.preventDefault(); go(0, -1); }
  else if (e.key === 'End'){ e.preventDefault(); go(TOTAL_SLIDES - 1, 1); }
  else if (/^[1-9]$/.test(e.key)){
    const i = Number(e.key) - 1;
    if (i < TOTAL_SLIDES) go(i, i > cur ? 1 : -1);
  }
});

/* ================================================================
   导航自动收起
================================================================ */
const navEl = $('dots');
let navTimer = null;

function showNav(){
  document.body.classList.add('nav-show');
  clearTimeout(navTimer);
  navTimer = setTimeout(() => {
    if (!navEl.matches(':hover')){
      document.body.classList.remove('nav-show');
    }
  }, 1800);
}
function scheduleHide(delay = 1800){
  clearTimeout(navTimer);
  navTimer = setTimeout(() => {
    if (!navEl.matches(':hover')){
      document.body.classList.remove('nav-show');
    }
  }, delay);
}

addEventListener('mousemove', e => {
  const EDGE = 96;
  const isLeft = document.body.dataset.nav === 'left';
  const nearEdge = isLeft ? e.clientX < EDGE : e.clientX > innerWidth - EDGE;
  if (nearEdge) showNav();
}, { passive: true });

navEl.addEventListener('mouseenter', () => {
  document.body.classList.add('nav-show');
  clearTimeout(navTimer);
});
navEl.addEventListener('mouseleave', () => scheduleHide(1800));
navEl.addEventListener('focusin', () => {
  document.body.classList.add('nav-show');
  clearTimeout(navTimer);
});
navEl.addEventListener('focusout', () => scheduleHide(600));

/* ================================================================
   命令面板
================================================================ */
const paletteEl = $('palette');
const paletteInput = $('paletteInput');
const paletteList = $('paletteList');
let paletteActive = 0;

const commands = [
  { id:'go-0', icon:'◐', label:'跳转到 · 总览', run: () => go(0, -1), hint:'1' },
  { id:'go-1', icon:'○', label:'跳转到 · 任务', run: () => go(1, 1), hint:'2' },
  { id:'go-2', icon:'◎', label:'跳转到 · 习惯', run: () => go(2, 1), hint:'3' },
  { id:'go-3', icon:'◉', label:'跳转到 · 注意力', run: () => go(3, 1), hint:'4' },
  { id:'go-4', icon:'◇', label:'跳转到 · 笔记', run: () => go(4, 1), hint:'5' },
  { id:'go-5', icon:'◆', label:'跳转到 · 复盘', run: () => go(5, 1), hint:'6' },
  { id:'new-task', icon:'+', label:'新建任务', hint:'任务', run: () => {
    go(1, 1); setTimeout(() => $('addTaskInput')?.focus(), 600);
  }},
  { id:'new-note', icon:'+', label:'新建笔记', hint:'笔记', run: () => {
    noteTab = 'notes';
    document.querySelectorAll('#noteTabs .note-tab').forEach(b => {
      b.classList.toggle('on', b.dataset.tab === 'notes');
    });
    go(4, 1); setTimeout(() => $('addNoteBtn')?.click(), 600);
  }},
  { id:'new-insight', icon:'◇', label:'新建知识卡', hint:'笔记 · 知识卡', run: () => {
    noteTab = 'insights';
    document.querySelectorAll('#noteTabs .note-tab').forEach(b => {
      b.classList.toggle('on', b.dataset.tab === 'insights');
    });
    go(4, 1);
    setTimeout(() => openInsightDetail(null, { relatedTaskIds: [] }), 600);
  }},
  { id:'focus-toggle', icon:'▶', label:'开始 / 结束专注', hint:'注意力', run: () => {
    go(3, 1); setTimeout(() => $('focusBtn')?.click(), 500);
  }},
  { id:'today', icon:'⌂', label:'所有模块回到今天', run: () => {
    state.dates = state.dates.map(() => TODAY_KEY);
    save(); renderAll(); updateAllDateNav();
    showToast('已回到今天');
  }},
  { id:'sync-dates', icon:'⇄', label:'同步所有模块日期', run: () => {
    syncAllDates(cur);
    updateAllDateNav(); renderCurrentSlide();
    showToast(`已同步到「${dateLabel(cur)}」`);
  }},
  { id:'mode-toggle', icon:'◲', label:'切换简洁 / 全量模式', hint:'M', run: toggleMode },
  { id:'zen-toggle', icon:'◯', label:'切换禅模式', hint:'⇧Z', run: toggleZen },
  { id:'hud-toggle', icon:'☰', label:'切换信息分层', hint:'H', run: cycleHud },

  { id:'theme-night', icon:'●', label:'主题 · 深夜', run: () => applyTheme('night') },
  { id:'theme-ink', icon:'●', label:'主题 · 墨蓝', run: () => applyTheme('ink') },
  { id:'theme-forest', icon:'●', label:'主题 · 森林', run: () => applyTheme('forest') },
  { id:'theme-sunset', icon:'●', label:'主题 · 暮色', run: () => applyTheme('sunset') },
  { id:'theme-paper', icon:'●', label:'主题 · 纸白', run: () => applyTheme('paper') },
  { id:'theme-sand', icon:'●', label:'主题 · 沙色', run: () => applyTheme('sand') },

  { id:'export', icon:'↓', label:'导出数据', run: exportData },
  { id:'import', icon:'↑', label:'导入数据', run: importData },
];

let paletteCommands = commands;
function renderPalette(filter = ''){
  const q = filter.trim().toLowerCase();
  paletteCommands = q ? commands.filter(c =>
    c.label.toLowerCase().includes(q) || (c.hint && c.hint.toLowerCase().includes(q))
  ) : commands;

  paletteList.innerHTML = '';
  if (paletteCommands.length === 0){
    paletteList.innerHTML = '<li class="palette-empty">没有匹配的命令</li>';
    paletteActive = 0; return;
  }
  paletteActive = Math.min(paletteActive, paletteCommands.length - 1);
  paletteCommands.forEach((c, i) => {
    const li = document.createElement('li');
    li.className = 'palette-item' + (i === paletteActive ? ' active' : '');
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', i === paletteActive ? 'true' : 'false');
    li.innerHTML = `
      <span class="pi-icon">${c.icon || '·'}</span>
      <span class="pi-label">${esc(c.label)}</span>
      ${c.hint ? `<span class="pi-hint">${esc(c.hint)}</span>` : ''}`;
    li.addEventListener('click', () => runCommand(i));
    li.addEventListener('mouseenter', () => {
      paletteActive = i; updatePaletteActive();
    });
    paletteList.appendChild(li);
  });
}
function updatePaletteActive(){
  [...paletteList.children].forEach((el, i) => {
    const on = i === paletteActive;
    el.classList.toggle('active', on);
    el.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const el = paletteList.children[paletteActive];
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
}
function runCommand(i){
  const c = paletteCommands[i];
  if (!c) return;
  closePalette();
  setTimeout(() => c.run(), 60);
}
function openPalette(){
  paletteEl.classList.add('open');
  paletteInput.value = ''; paletteActive = 0;
  renderPalette('');
  document.body.classList.remove('idle');
  setTimeout(() => paletteInput.focus(), 30);
}
function closePalette(){
  paletteEl.classList.remove('open');
  paletteInput.blur();
}
function togglePalette(){
  paletteEl.classList.contains('open') ? closePalette() : openPalette();
}
paletteInput.addEventListener('input', e => {
  paletteActive = 0; renderPalette(e.target.value);
});
paletteInput.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown'){ e.preventDefault();
    paletteActive = Math.min(paletteActive + 1, paletteCommands.length - 1);
    updatePaletteActive();
  } else if (e.key === 'ArrowUp'){ e.preventDefault();
    paletteActive = Math.max(paletteActive - 1, 0);
    updatePaletteActive();
  } else if (e.key === 'Enter'){ e.preventDefault(); runCommand(paletteActive); }
});
paletteEl.addEventListener('click', e => {
  if (e.target.hasAttribute('data-close')) closePalette();
});

/* ================================================================
   导入导出
================================================================ */
function exportData(){
  const data = { version: 8, exportedAt: new Date().toISOString(), state };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;
  a.download = `liubai-backup-${stamp}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('已导出备份文件');
}
function importData(){ $('importFile').click(); }

$('importFile').addEventListener('change', e => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      const incoming = data.state || data;
      if (!incoming || typeof incoming !== 'object') throw new Error('invalid');
      if (!confirm('导入将覆盖当前所有数据，确定继续？')) return;
      state = incoming;
      if (!Array.isArray(state.hud) || state.hud.length !== 6) state.hud = [0,0,0,0,0,0];
      if (!Array.isArray(state.dates) || state.dates.length !== 6)
        state.dates = [TODAY_KEY,TODAY_KEY,TODAY_KEY,TODAY_KEY,TODAY_KEY,TODAY_KEY];
      if (!state.attention || typeof state.attention !== 'object')
        state.attention = structuredClone(defaultState.attention);
      if (!state.attention.days) state.attention.days = {};
      if (!state.attention.days[TODAY_KEY]) state.attention.days[TODAY_KEY] = emptyDay();
      if (!Array.isArray(state.insights)) state.insights = [];
      if (!Array.isArray(state.tasks)) state.tasks = [];
      save();
      slides.forEach((_, i) => applyHudToSlide(i));
      updateHudButton();
      renderAll(); updateAllDateNav();
      showToast('数据已导入');
    }catch(err){
      showToast('导入失败：文件格式错误');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});

$('resetBtn').addEventListener('click', () => {
  if (!confirm('确定要清空所有数据吗？此操作不可撤销。建议先导出备份。')) return;
  try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
  location.reload();
});

/* ================================================================
   日期菜单
================================================================ */
const dateMenu = $('dateMenu');
let dateMenuIdx = -1;
let dateMenuAnchor = null;

function openDateMenu(idx, triggerEl){
  dateMenuIdx = idx;
  dateMenuAnchor = triggerEl;

  dateMenu.querySelector('[data-action="all"]')
    .classList.toggle('on', isAll(idx));

  const isOnToday = !isAll(idx) && getDate(idx) === TODAY_KEY &&
    !(idx === 2 || idx === 5);
  dateMenu.querySelector('[data-action="today"]')
    .classList.toggle('on', isOnToday);

  const yBtn = dateMenu.querySelector('[data-action="yesterday"]');
  yBtn.innerHTML = (idx === 2 || idx === 5)
    ? '<span class="dm-icon">·</span>上周'
    : '<span class="dm-icon">·</span>昨天';

  const detached = isDetached(idx);
  dateMenu.querySelector('[data-action="sync"]').hidden = !detached;
  dateMenu.querySelector('.dm-sep').hidden = !detached;

  const r = triggerEl.getBoundingClientRect();
  dateMenu.style.left = '0px';
  dateMenu.style.top = '0px';
  dateMenu.classList.add('open');
  const mw = dateMenu.offsetWidth;
  const mh = dateMenu.offsetHeight;
  let left = r.right - mw;
  if (left < 12) left = 12;
  if (left + mw > innerWidth - 12) left = innerWidth - mw - 12;
  let top = r.bottom + 6;
  if (top + mh > innerHeight - 12) top = r.top - mh - 6;
  dateMenu.style.left = left + 'px';
  dateMenu.style.top  = top  + 'px';

  triggerEl.setAttribute('aria-expanded', 'true');
}

function closeDateMenu(){
  if (!dateMenu.classList.contains('open')) return;
  dateMenu.classList.remove('open');
  if (dateMenuAnchor) dateMenuAnchor.setAttribute('aria-expanded', 'false');
  dateMenuIdx = -1;
  dateMenuAnchor = null;
}

dateMenu.addEventListener('click', e => {
  const btn = e.target.closest('.dm-item');
  if (!btn) return;
  const idx = dateMenuIdx;
  const action = btn.dataset.action;
  if (idx < 0) return;

  if (action === 'sync'){
    syncAllDates(idx);
    closeDateMenu();
    updateAllDateNav();
    renderCurrentSlide();
    showToast(`已同步到「${dateLabel(idx)}」`);
    announce(`所有模块已同步到 ${dateLabel(idx)}`);
    return;
  }

  closeDateMenu();

  if (action === 'today')      setDate(idx, TODAY_KEY);
  else if (action === 'yesterday'){
    const delta = (idx === 2 || idx === 5) ? -7 : -1;
    setDate(idx, addDays(TODAY_KEY, delta));
  }
  else if (action === 'all')   setDate(idx, ALL_SENTINEL);
  else if (action === 'pick')  { openDatePicker(idx); return; }

  updateAllDateNav();
  renderCurrentSlide();
});

document.querySelectorAll('.date-nav .dn-trigger').forEach(trig => {
  const nav = trig.closest('.date-nav');
  const idx = Number(nav.dataset.navFor);
  trig.addEventListener('click', e => {
    e.stopPropagation();
    if (dateMenu.classList.contains('open') && dateMenuIdx === idx){
      closeDateMenu();
    } else {
      openDateMenu(idx, trig);
    }
  });
});

addEventListener('click', e => {
  if (!dateMenu.classList.contains('open')) return;
  if (e.target.closest('#dateMenu')) return;
  if (e.target.closest('.dn-trigger')) return;
  closeDateMenu();
});
addEventListener('keydown', e => {
  if (e.key === 'Escape' && dateMenu.classList.contains('open')){
    closeDateMenu();
  }
}, true);
addEventListener('scroll', () => {
  if (dateMenu.classList.contains('open')) closeDateMenu();
}, true);
addEventListener('resize', () => {
  if (dateMenu.classList.contains('open')) closeDateMenu();
});

function openDatePicker(idx){
  const input = document.createElement('input');
  input.type = 'date';
  input.value = isAll(idx) ? TODAY_KEY : getDate(idx);
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    if (input.value) setDate(idx, input.value);
    if (input.parentNode) input.parentNode.removeChild(input);
    updateAllDateNav();
    renderCurrentSlide();
  });
  input.addEventListener('blur', () => {
    setTimeout(() => { if (input.parentNode) input.parentNode.removeChild(input); }, 120);
  });
  input.showPicker?.() || input.click();
}

function updateDateNav(idx){
  const nav = document.querySelector(`.date-nav[data-nav-for="${idx}"]`);
  if (!nav) return;
  const text = nav.querySelector('.dn-text');
  const dot  = nav.querySelector('.dn-dot');
  const d = state.dates[idx];

  if (d === ALL_SENTINEL){
    text.textContent = '全部';
  } else if (idx === 2 || idx === 5){
    text.textContent = isWeekOfToday(d) ? '本周 · ' + fmtWeekRange(d) : fmtWeekRange(d);
  } else {
    text.textContent = fmtDateHuman(d, { short: true });
  }
  dot.hidden = !isDetached(idx);
}
function updateAllDateNav(){
  for (let i = 0; i < TOTAL_SLIDES; i++) updateDateNav(i);
}

/* ================================================================
   01 总览
================================================================ */
function renderOverview(){
  const dateStr = getDate(0);

  if (isAll(0)){
    const pending = state.tasks.filter(t => !t.done)
      .sort((a,b) => (b.date||'').localeCompare(a.date||''));
    const doneAll = state.tasks.filter(t => t.done).length;
    $('dateLine').textContent = '全部时间';
    $('headline').innerHTML = pending.length === 0
      ? '清单是空的。'
      : `全部还有 <em>${pending.length}</em> 件事。`;

    const list = $('overviewList');
    list.innerHTML = '';
    $('ovNote').textContent = `${pending.length} 件`;
    if (!pending.length){
      list.innerHTML = '<li class="dim">全部完成。</li>';
    } else {
      renderGroupedTasks(list, pending);
    }

    renderStatGrid($('overviewStats'), [
      { label:'全部任务', value: state.tasks.length, unit:'件' },
      { label:'已完成', value: doneAll, unit:'件' },
      { label:'未完成', value: pending.length, unit:'件' },
      { label:'完成率', value: state.tasks.length ? Math.round(doneAll/state.tasks.length*100) : 0, unit:'%' },
    ]);

    const fl = $('overviewFocus');
    fl.innerHTML = '';
    $('ovFocusNote').textContent = '—';
    fl.innerHTML = '<li class="dim">全部模式下不显示。</li>';
    return;
  }

  const d = parseDate(dateStr);
  const h = now.getHours();
  const greet = h < 5 ? '夜深了' : h < 11 ? '早上好' : h < 18 ? '下午好' : '晚上好';
  const holiday = HOLIDAYS[dateStr];

  const parts = [];
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((d - todayMidnight) / 86400000);
  const relative = { '-2':'前天', '-1':'昨天', '0':'今天', '1':'明天', '2':'后天' }[diff];
  if (relative) parts.push(relative);
  parts.push(`${d.getMonth()+1}月${d.getDate()}日`);
  parts.push(`周${DAY_CHARS[d.getDay()]}`);
  if (holiday) parts.push(holiday);
  if (isToday(dateStr)) parts.push(greet);
  $('dateLine').textContent = parts.join(' · ');

  const dayTasks = state.tasks.filter(t => t.date === dateStr);
  const total = dayTasks.length;
  const done = dayTasks.filter(t => t.done).length;
  const left = total - done;

  const dayLabel = relative || '这一天';
  if (holiday && isToday(dateStr)){
    $('headline').innerHTML = `今天<em>${holiday}</em>，还有 <em>${left}</em> 件事。`;
  } else if (!isToday(dateStr)){
    if (total === 0) $('headline').innerHTML = `${dayLabel}<em>没有任务</em>。`;
    else if (left === 0) $('headline').innerHTML = `${dayLabel}<em>全部完成</em>。`;
    else $('headline').innerHTML = `${dayLabel}还有 <em>${left}</em> 件事。`;
  } else {
    if (total === 0){
      $('headline').innerHTML = '清单是空的。';
    } else if (left === 0){
      $('headline').innerHTML = '今天<em>全部完成</em>。';
    } else {
      $('headline').innerHTML = `今天还有 <em>${left}</em> 件事。`;
    }
  }

  const day = dayData(dateStr);
  const habitsDone = state.habits.filter(hb => hb.history?.[dateStr]).length;
  const weekDates = weekDatesOf(dateStr);
  let weekFocus = 0;
  weekDates.forEach(k => {
    const dd = state.attention.days[k];
    if (dd) weekFocus += (dd.budget?.deep?.used || 0) + (dd.budget?.shallow?.used || 0);
  });
  weekFocus = Math.round(weekFocus / 60);
  const attnPts = day.focusBlocks.reduce((a,b) => a + (b.level||0)*10, 0);

  renderStatGrid($('overviewStats'), [
    { label:'当日任务', value: done, unit:`/${total}`,
      sub: total === 0 ? '无任务' : (left === 0 ? '全部完成' : `还剩 ${left} 件`) },
    { label:'习惯打卡', value: habitsDone, unit:`/${state.habits.length}`,
      sub: state.habits.length === 0 ? '无习惯' :
           (habitsDone === state.habits.length ? '全部完成' : `还差 ${state.habits.length - habitsDone} 个`) },
    { label:'本周专注', value: weekFocus, unit:'h', sub:'所在周' },
    { label:'当日注意力', value: attnPts, unit:'点',
      sub: attnPts === 0 ? '尚未分配' : `分布 ${day.focusBlocks.length} 项` },
  ]);

  const list = $('overviewList');
  list.innerHTML = '';
  const pending = dayTasks.filter(t => !t.done).slice(0, 5);

  if (!pending.length && habitsDone === state.habits.length && total > 0){
    list.innerHTML = '<li class="dim">已完成全部，休息一下。</li>';
    $('ovNote').textContent = '清空';
  } else if (total === 0 && habitsDone === 0){
    list.innerHTML = '<li class="dim">这一天没有待办。</li>';
    $('ovNote').textContent = '—';
  } else {
    $('ovNote').textContent = `还剩 ${pending.length} 件`;
    pending.forEach(t => {
      const li = document.createElement('li');
      li.dataset.id = t.id;
      li.style.cursor = 'pointer';
      if (taskHasCognition(t)) li.classList.add('cog');
      li.innerHTML = `<b>${esc(t.text)}</b>` +
        (t.attn ? `<span class="right">${attnLabel(t.attn)}</span>` : '');
      list.appendChild(li);
    });
    state.habits.filter(hb => !hb.history?.[dateStr]).slice(0,2).forEach(hb => {
      const li = document.createElement('li');
      li.className = 'dim';
      li.textContent = `习惯 · ${hb.name} 未打卡`;
      list.appendChild(li);
    });
  }

  const fl = $('overviewFocus');
  fl.innerHTML = '';
  const blocks = day.focusBlocks;
  const doneB = blocks.filter(b => b.status === 'done').length;
  $('ovFocusNote').textContent = `${doneB}/${blocks.length} 块完成`;

  if (blocks.length === 0){
    fl.innerHTML = '<li class="dim">这一天还没有安排专注块。</li>';
  } else {
    blocks.slice(0, 6).forEach(b => {
      const li = document.createElement('li');
      li.className = b.status === 'active' ? 'focus' : (b.status === 'done' ? '' : 'dim');
      li.innerHTML = `${b.start}–${b.end} <b>${esc(b.task)}</b>` +
        `<span class="right">${b.status === 'done' ? '已完成' : b.status === 'active' ? '进行中' : '计划'}</span>`;
      fl.appendChild(li);
    });
  }
}

function attnLabel(v){ return v === 'high' ? '高认知' : v === 'mid' ? '中认知' : '低认知'; }

/* 总览列表点击 → 任务详情 */
$('overviewList').addEventListener('click', e => {
  const li = e.target.closest('li[data-id]');
  if (!li) return;
  const id = Number(li.dataset.id);
  openTaskDetail(id);
});

/* ================================================================
   02 任务
================================================================ */
function renderTasks(){
  if (isAll(1)){
    const all = state.tasks.slice()
      .sort((a,b) => (b.date||'').localeCompare(a.date||''));
    const left = all.filter(t => !t.done).length;
    $('taskTitle').textContent = `全部 · 还剩 ${left} 件。`;

    const list = $('taskList');
    list.innerHTML = '';
    $('taskListNote').textContent = `${all.length} 条`;
    if (!all.length){
      list.innerHTML = '<li class="empty">还没有任务。</li>';
    } else {
      renderGroupedTasks(list, all);
    }

    const doneRate = all.length ? Math.round(all.filter(t=>t.done).length/all.length*100) : 0;
    renderStatGrid($('taskStats'), [
      { label:'总任务', value: all.length, unit:'件' },
      { label:'完成率', value: doneRate, unit:'%' },
      { label:'待办', value: left, unit:'件' },
      { label:'已完成', value: all.length - left, unit:'件' },
    ]);
    return;
  }

  const dateStr = getDate(1);
  const dayTasks = state.tasks.filter(t => t.date === dateStr);
  const total = dayTasks.length;
  const left = dayTasks.filter(t => !t.done).length;
  const dayLabel = (() => {
    const d = parseDate(dateStr);
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((d - todayMidnight) / 86400000);
    return { '-2':'前天', '-1':'昨天', '0':'今天', '1':'明天', '2':'后天' }[diff] || '这一天';
  })();

  $('taskTitle').textContent =
    isToday(dateStr)
      ? (total === 0 ? '今天还没有任务。' : left === 0 ? '今天已清空。' : `今天还剩 ${left} 件。`)
      : (total === 0 ? `${dayLabel}没有任务。` : left === 0 ? `${dayLabel}已全部完成。` : `${dayLabel}还剩 ${left} 件。`);
  $('taskListNote').textContent = `${total} 条`;

  const list = $('taskList');
  list.innerHTML = '';

  if (total === 0){
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = isToday(dateStr) ? '在下方添加第一件事。' : '在下方添加这一天的事。';
    list.appendChild(li);
  } else {
    dayTasks.forEach(t => {
      const li = document.createElement('li');
      li.dataset.id = t.id;
      const isFocus = state.attention.currentTaskId === t.id;
      const hasCog = taskHasCognition(t);

      li.className = 'task' + (t.done ? ' done' : '') + (isFocus ? ' is-focus' : '');
      li.innerHTML = `
        <button class="box" aria-label="${t.done ? '标记未完成' : '标记完成'}"></button>
        <span class="focus-flag" aria-hidden="true"></span>
        <span class="text" title="点击查看详情">${hasCog?'◇ ':''}${esc(t.text)}</span>
        <span class="tag">${esc(t.tag || '其他')}</span>
        <div class="acts">
          <button class="act focus-btn ${isFocus ? 'on' : ''}"
                  title="${isFocus ? '当前专注' : '设为当前专注'}"
                  ${isFocus ? 'disabled' : ''}>◎</button>
          <button class="act del" title="删除" aria-label="删除">✕</button>
        </div>`;
      list.appendChild(li);
    });
  }

  const doneRate = total ? Math.round(dayTasks.filter(t => t.done).length / total * 100) : 0;
  const highCount = dayTasks.filter(t => t.attn === 'high').length;
  const midCount = dayTasks.filter(t => t.attn === 'mid').length;
  const lowCount = dayTasks.filter(t => t.attn === 'low').length;
  const tagSet = new Set(dayTasks.map(t => t.tag).filter(Boolean));
  const cogCount = dayTasks.filter(taskHasCognition).length;
  renderStatGrid($('taskStats'), [
    { label:'完成率', value: doneRate, unit:'%' },
    { label:'待办', value: left, unit:'件' },
    { label:'高 / 中 / 低认知', value: `${highCount}/${midCount}/${lowCount}`, unit:'' },
    { label:'有理解记录', value: cogCount, unit:`/${total} 件` },
  ]);
}

$('taskList').addEventListener('click', e => {
  const li = e.target.closest('.task');
  if (!li) return;
  const id = Number(li.dataset.id);
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;

  if (e.target.closest('.text')){
    openTaskDetail(id);
    return;
  }
  if (e.target.closest('.focus-btn')){
    state.attention.currentTask = t.text;
    state.attention.currentTaskId = t.id;
    state.attention.sessionMin = 0;
    save(); renderTasks(); renderOverview(); renderAttention();
    return;
  }
  if (e.target.closest('.box')) { t.done = !t.done; commit(); renderTasks(); }
  else if (e.target.closest('.del')){
    state.tasks = state.tasks.filter(x => x.id !== id);
    if (state.attention.currentTaskId === id){
      state.attention.currentTaskId = null;
      state.attention.currentTask = '未选择任务';
    }
    state.insights.forEach(i => {
      if (i.relatedTaskIds) i.relatedTaskIds = i.relatedTaskIds.filter(tid => tid !== id);
    });
    commit(); renderTasks(); renderAttention();
  }
});

const addTaskInput = $('addTaskInput');
const addTaskTag = $('addTaskTag');
function addTask(){
  const text = addTaskInput.value.trim();
  if (!text) return;
  const tag = addTaskTag.value.trim() || '其他';
  const dateStr = isAll(1) ? TODAY_KEY : getDate(1);
  state.tasks.push({ id: nextId(), text, tag, done: false, attn: 'mid', date: dateStr });
  addTaskInput.value = ''; addTaskTag.value = '';
  addTaskInput.focus();
  commit(); renderTasks();
}
addTaskInput.addEventListener('keydown', e => {
  if (e.key === 'Enter'){ e.preventDefault(); addTask(); }
});
addTaskTag.addEventListener('keydown', e => {
  if (e.key === 'Enter'){ e.preventDefault(); addTask(); }
});

/* ================================================================
   03 习惯
================================================================ */
function renderHabits(){
  if (isAll(2)){
    $('habitTitle').textContent = `全部习惯 · ${state.habits.length} 个。`;
    $('habitNote').textContent = '历史总览';

    const list = $('habitList');
    list.innerHTML = '';
    if (!state.habits.length){
      list.innerHTML = '<li class="empty">还没有习惯。</li>';
    } else {
      state.habits.forEach(hb => {
        const history = hb.history || {};
        const total = Object.values(history).filter(Boolean).length;
        let best = 0, runLen = 0, prev = null;
        const dates = Object.keys(history).filter(d => history[d]).sort();
        dates.forEach(d => {
          if (prev && addDays(prev, 1) === d) runLen++;
          else runLen = 1;
          if (runLen > best) best = runLen;
          prev = d;
        });
        const li = document.createElement('li');
        li.className = 'habit';
        li.dataset.id = hb.id;
        li.innerHTML = `
          <span class="name">${esc(hb.name)}</span>
          <span class="src-meta" style="margin-left:auto">
            ${total} 次 · 最长 ${best} 天
          </span>`;
        list.appendChild(li);
      });
    }
    $('habitSummary').innerHTML = '';
    return;
  }

  const dateStr = getDate(2);
  const week = weekDatesOf(dateStr);
  const list = $('habitList');
  list.innerHTML = '';

  if (state.habits.length === 0){
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '在下方添加第一个习惯。';
    list.appendChild(li);
  } else {
    state.habits.forEach(hb => {
      const li = document.createElement('li');
      li.className = 'habit hover-acts' + (editing.habit === hb.id ? ' editing' : '');
      li.dataset.id = hb.id;

      if (editing.habit === hb.id){
        li.innerHTML = `
          <input class="edit-input" value="${esc(hb.name)}" maxlength="12">
          <div class="acts">
            <button class="act save">✓</button>
            <button class="act cancel">✕</button>
          </div>`;
        list.appendChild(li);
        const inp = li.querySelector('.edit-input');
        inp.focus(); inp.select();
        return;
      }

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = hb.name;
      li.appendChild(name);

      const days = document.createElement('div');
      days.className = 'days';
      week.forEach(dateKey => {
        const v = hb.history?.[dateKey] ? 1 : 0;
        const b = document.createElement('button');
        const isTodayCell = dateKey === TODAY_KEY;
        b.className = 'day' + (v ? ' on' : '') + (isTodayCell ? ' today' : '');
        b.textContent = WEEK_CHARS[week.indexOf(dateKey)];
        b.disabled = dateKey > TODAY_KEY;
        b.dataset.date = dateKey;
        b.setAttribute('aria-label', `${hb.name} ${dateKey} ${v ? '已完成' : '未完成'}`);
        days.appendChild(b);
      });
      li.appendChild(days);

      const acts = document.createElement('div');
      acts.className = 'acts';
      acts.innerHTML = `
        <button class="act edit" title="重命名">✎</button>
        <button class="act del" title="删除">✕</button>`;
      li.appendChild(acts);

      list.appendChild(li);
    });
  }

  const passedDates = week.filter(d => d <= TODAY_KEY);
  const totalDots = state.habits.length * passedDates.length;
  let doneDots = 0;
  state.habits.forEach(hb => {
    passedDates.forEach(d => { if (hb.history?.[d]) doneDots++; });
  });
  const rate = totalDots ? Math.round(doneDots / totalDots * 100) : 0;

  const weekLabel = isWeekOfToday(dateStr) ? '本周' : '该周';
  $('habitNote').textContent = `${state.habits.length} 个习惯 · ${weekLabel}`;

  const todayDone = state.habits.filter(hb => hb.history?.[TODAY_KEY]).length;
  let best = '—', bestN = 0;
  state.habits.forEach(hb => {
    let n = 0;
    let d = TODAY_KEY;
    while (hb.history?.[d]){ n++; d = addDays(d, -1); }
    if (n > bestN){ bestN = n; best = hb.name; }
  });

  renderStatGrid($('habitSummary'), [
    { label:`${weekLabel}完成率`, value: rate, unit:'%' },
    { label:'已打卡', value: doneDots, unit:`/${totalDots}` },
    { label:'今日完成', value: todayDone, unit:`/${state.habits.length}` },
    { label:'最长连续', value: bestN, unit:'天', sub: bestN > 0 ? best : '尚无记录' },
  ]);
}

$('habitList').addEventListener('click', e => {
  const li = e.target.closest('.habit');
  if (!li) return;
  const id = li.dataset.id;
  const hb = state.habits.find(x => x.id === id);
  if (!hb) return;

  if (isAll(2)) return;

  const dayBtn = e.target.closest('.day');
  if (dayBtn && !dayBtn.disabled){
    const dateKey = dayBtn.dataset.date;
    if (!hb.history) hb.history = {};
    if (hb.history[dateKey]) delete hb.history[dateKey];
    else hb.history[dateKey] = 1;
    commit(); renderHabits();
    return;
  }
  if (e.target.closest('.del')){
    state.habits = state.habits.filter(x => x.id !== id);
    commit(); renderHabits();
  } else if (e.target.closest('.edit')){ editing.habit = id; renderHabits(); }
  else if (e.target.closest('.cancel')){ editing.habit = null; renderHabits(); }
  else if (e.target.closest('.save')){
    const inp = li.querySelector('.edit-input');
    const name = inp.value.trim();
    if (name) hb.name = name;
    editing.habit = null;
    commit(); renderHabits();
  }
});

$('habitList').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('.edit-input')){
    e.preventDefault();
    const li = e.target.closest('.habit');
    const hb = state.habits.find(x => x.id === li.dataset.id);
    const name = e.target.value.trim();
    if (hb && name) hb.name = name;
    editing.habit = null;
    commit(); renderHabits();
  }
  if (e.key === 'Escape' && e.target.matches('.edit-input')){
    editing.habit = null; renderHabits();
  }
});

const addHabitInput = $('addHabitInput');
addHabitInput.addEventListener('keydown', e => {
  if (e.key === 'Enter'){
    e.preventDefault();
    const name = addHabitInput.value.trim();
    if (!name) return;
    state.habits.push({ id: 'h' + nextId(), name, history: {} });
    addHabitInput.value = ''; addHabitInput.focus();
    commit(); renderHabits();
  }
});

/* ================================================================
   04 注意力
================================================================ */
function renderAttention(){
  const a = state.attention;

  if (isAll(3)){
    $('attentionHeadline').textContent = '全部专注块。';

    const allBlocks = [];
    Object.entries(a.days).forEach(([date, d]) => {
      (d.focusBlocks || []).forEach(b => allBlocks.push({ ...b, _date: date }));
    });
    allBlocks.sort((x,y) => (y._date).localeCompare(x._date));

    $('fcTask').textContent = '（全部模式）';
    $('fcSub').textContent = '切换到具体日期可开始专注';
    $('fcTimer').textContent = '00:00';
    const btn = $('focusBtn');
    btn.disabled = true; btn.style.opacity = '.4';
    btn.textContent = '▶ 开始专注';
    btn.classList.remove('stop');
    document.querySelectorAll('#fcLevels .lv').forEach(el => {
      el.disabled = true; el.style.opacity = '.4';
    });

    const blockList = $('blockList');
    blockList.innerHTML = '';
    $('blockNote').textContent = `${allBlocks.length} 块`;
    if (!allBlocks.length){
      blockList.innerHTML = '<li class="inbox-empty">还没有任何专注块。</li>';
    } else {
      let last = null;
      allBlocks.forEach(blk => {
        if (blk._date !== last){
          const h = document.createElement('li');
          h.className = 'group-head';
          h.textContent = fmtDateHuman(blk._date);
          blockList.appendChild(h);
          last = blk._date;
        }
        const li = document.createElement('li');
        li.className = 'block ' + (blk.status === 'done' ? 'done past' :
                                   blk.status === 'active' ? 'active' : 'planned');
        li.dataset.date = blk._date;
        li.dataset.blockId = blk.id;
        const st = blk.status === 'done' ? '已完成' : blk.status === 'active' ? '进行中' : '计划';
        li.innerHTML = `
          <span class="time">${blk.start}–${blk.end}</span>
          <div class="body">
            <div class="task-line">${esc(blk.task)}</div>
            <div class="meta"><span>${esc(blk.type)}</span><span>·</span><span>L${blk.level}</span></div>
          </div>
          <span class="st">${st}</span>`;
        blockList.appendChild(li);
      });
    }

    renderStatGrid($('budgetGrid'), [
      { label:'全部专注块', value: allBlocks.length, unit:'块' },
      { label:'已完成', value: allBlocks.filter(b=>b.status==='done').length, unit:'块' },
      { label:'进行中', value: allBlocks.filter(b=>b.status==='active').length, unit:'块' },
      { label:'计划中', value: allBlocks.filter(b=>b.status==='planned').length, unit:'块' },
    ]);

    const allInbox = [];
    Object.entries(a.days).forEach(([date, d]) => {
      (d.inbox || []).forEach(i => allInbox.push({ ...i, _date: date }));
    });
    allInbox.sort((x,y) => (y._date + (y.time||'')).localeCompare(x._date + (x.time||'')));

    const inboxList = $('inboxList');
    inboxList.innerHTML = '';
    $('inboxNote').textContent = `${allInbox.length} 条`;
    if (!allInbox.length){
      inboxList.innerHTML = '<li class="inbox-empty">收件箱是空的。</li>';
    } else {
      allInbox.slice(0, 60).forEach(item => {
        const li = document.createElement('li');
        li.className = 'inbox-item';
        li.innerHTML = `
          <span class="inbox-time">${esc(item.time)}</span>
          <span class="inbox-src">${esc(item.source)}</span>
          <span class="inbox-text">${esc(item.content)}</span>`;
        inboxList.appendChild(li);
      });
    }

    $('srcList').innerHTML = '';
    $('srcNote').textContent = '全部模式下不显示';
    $('ctxBody').innerHTML = '';
    $('ctxNote').textContent = '—';
    return;
  }

  const dateStr = getDate(3);
  const day = dayData(dateStr);

  const isToday_ = isToday(dateStr);
  const doneB = day.focusBlocks.filter(x => x.status === 'done').length;
  const activeB = day.focusBlocks.find(x => x.status === 'active');
  $('attentionHeadline').textContent = activeB && isToday_
    ? `正在专注：${activeB.task}`
    : isToday_
      ? (doneB === day.focusBlocks.length && day.focusBlocks.length > 0
        ? '今日专注块全部完成。'
        : '今天的心神放在哪？')
      : (day.focusBlocks.length === 0 ? '这一天没有记录。' : '查看历史记录。');

  const showActive = isToday_;
  $('fcTask').textContent = showActive ? (a.currentTask || '未选择任务') : '（历史记录）';
  const lvNames = ['L0 开放','L1 可中断','L2 仅紧急','L3 完全封锁'];
  $('fcSub').textContent = showActive
    ? `${lvNames[a.level]} · ${a.running ? '进行中' : '待开始'}`
    : '切换到今天可开始专注';
  $('fcTimer').textContent = showActive
    ? `${pad(Math.floor(a.sessionMin/60))}:${pad(a.sessionMin%60)}`
    : '00:00';

  const btn = $('focusBtn');
  if (!showActive){
    btn.disabled = true; btn.style.opacity = '.4';
    btn.textContent = '▶ 开始专注';
    btn.classList.remove('stop');
  } else {
    btn.disabled = false; btn.style.opacity = '';
    if (a.running){ btn.textContent = '■ 结束专注'; btn.classList.add('stop'); }
    else { btn.textContent = '▶ 开始专注'; btn.classList.remove('stop'); }
  }

  document.querySelectorAll('#fcLevels .lv').forEach(el => {
    el.classList.toggle('on', Number(el.dataset.lv) === a.level);
    el.disabled = !showActive;
    el.style.opacity = showActive ? '' : '.4';
  });

  const order = ['deep','shallow','meeting','recover'];
  const names = { deep:'深度工作', shallow:'浅层工作', meeting:'会议', recover:'恢复' };
  renderStatGrid($('budgetGrid'), order.map(k => {
    const it = day.budget[k];
    const pct = it.total ? Math.round(it.used / it.total * 100) : 0;
    const remain = Math.max(0, it.total - it.used);
    return {
      label: names[k],
      value: it.used,
      unit: `/${it.total} min`,
      bar: { pct, color: BUDGET_COLORS[k] },
      sub: `剩余 ${remain} min · ${pct}%`,
    };
  }));

  const blockList = $('blockList');
  blockList.innerHTML = '';
  $('blockNote').textContent = `${doneB}/${day.focusBlocks.length} 完成`;
  day.focusBlocks.forEach(blk => {
    const li = document.createElement('li');
    li.className = 'block ' + (blk.status === 'done' ? 'done past' :
                               blk.status === 'active' ? 'active' : 'planned');
    li.dataset.date = dateStr;
    li.dataset.blockId = blk.id;
    const st = blk.status === 'done' ? '已完成' : blk.status === 'active' ? '进行中' : '计划';
    li.innerHTML = `
      <span class="time">${blk.start}–${blk.end}</span>
      <div class="body">
        <div class="task-line">${esc(blk.task)}</div>
        <div class="meta">
          <span>${esc(blk.type)}</span><span>·</span><span>L${blk.level}</span>
        </div>
      </div>
      <span class="st">${st}</span>`;
    blockList.appendChild(li);
  });
  if (day.focusBlocks.length === 0){
    const li = document.createElement('li');
    li.className = 'inbox-empty';
    li.textContent = '这一天还没有专注块。';
    blockList.appendChild(li);
  }

  const srcList = $('srcList');
  srcList.innerHTML = '';
  const totalInt = day.sources.reduce((s,x) => s + x.count, 0);
  $('srcNote').textContent = totalInt === 0 ? '无记录' : `共 ${totalInt} 次`;
  if (day.sources.length === 0){
    srcList.innerHTML = '<li class="inbox-empty">这一天还没有记录中断。</li>';
  } else {
    const maxCnt = Math.max(...day.sources.map(s => s.count), 1);
    day.sources.forEach(s => {
      const li = document.createElement('li');
      li.className = 'src';
      li.innerHTML = `
        <span class="src-name">${esc(s.name)}</span>
        <div class="src-bar"><span style="width:${s.count/maxCnt*100}%"></span></div>
        <span class="src-meta">${s.count} 次 · ${s.min}m</span>`;
      srcList.appendChild(li);
    });
  }

  const inboxList = $('inboxList');
  inboxList.innerHTML = '';
  $('inboxNote').textContent = `${day.inbox.length} 条`;
  if (day.inbox.length === 0){
    inboxList.innerHTML = '<li class="inbox-empty">收件箱是空的。</li>';
  } else {
    day.inbox.forEach(item => {
      const li = document.createElement('li');
      li.className = 'inbox-item';
      li.innerHTML = `
        <span class="inbox-time">${esc(item.time)}</span>
        <span class="inbox-src">${esc(item.source)}</span>
        <span class="inbox-text">${esc(item.content)}</span>
        <div class="acts"><button class="act del">✕</button></div>`;
      li.dataset.id = item.id;
      inboxList.appendChild(li);
    });
  }

  const ctx = a.lastContext;
  const ctxBody = $('ctxBody');
  if (!ctx){
    ctxBody.innerHTML = '<div class="inbox-empty">还没有保存的上下文。</div>';
    $('ctxNote').textContent = '—';
  } else {
    $('ctxNote').textContent = fmtAgo(ctx.savedAt);
    ctxBody.innerHTML = `
      <div class="ctx-row"><span class="ctx-k">任务</span><span class="ctx-v">${esc(ctx.task)}</span></div>
      <div class="ctx-row"><span class="ctx-k">下一步</span><span class="ctx-v">${esc(ctx.nextStep)}</span></div>
      <div class="ctx-row"><span class="ctx-k">文件</span><span class="ctx-v"><div class="files">${
        ctx.files.map(f => `<span>${esc(f)}</span>`).join('')
      }</div></span></div>
      <div class="ctx-row"><span class="ctx-k">未决</span><span class="ctx-v">${ctx.unresolved.map(u => esc(u)).join(' · ') || '—'}</span></div>
      <div class="ctx-actions">
        <button class="ctx-btn" id="restoreCtxBtn">↺ 恢复</button>
        <button class="ctx-btn" id="saveCtxBtn">保存当前</button>
      </div>`;
    $('restoreCtxBtn')?.addEventListener('click', () => {
      showToast(`已恢复：${ctx.task}`);
    });
    $('saveCtxBtn')?.addEventListener('click', () => {
      a.lastContext = {
        task: a.currentTask || '未命名会话',
        nextStep: '（请补充下一步）',
        files: ['当前打开的页面'],
        unresolved: [],
        savedAt: Date.now(),
      };
      save(); renderAttention();
      showToast('已保存');
    });
  }
}

/* 专注块点击 → 详情 */
$('blockList').addEventListener('click', e => {
  const li = e.target.closest('.block[data-block-id]');
  if (!li) return;
  openBlockDetail(li.dataset.date, Number(li.dataset.blockId));
});

function fmtAgo(ts){
  const d = Date.now() - ts;
  if (d < 60000) return '刚刚';
  if (d < 3600000) return Math.floor(d/60000) + ' 分钟前';
  if (d < 86400000) return Math.floor(d/3600000) + ' 小时前';
  return Math.floor(d/86400000) + ' 天前';
}

$('focusBtn').addEventListener('click', () => {
  const dateStr = getDate(3);
  if (!isToday(dateStr)) return;
  const a = state.attention;
  const day = dayData(dateStr);
  a.running = !a.running;
  if (a.running){ a.sessionStart = Date.now(); }
  else {
    a.sessionStart = null;
    const act = day.focusBlocks.find(x => x.status === 'active');
    if (act) act.status = 'done';
    const next = day.focusBlocks.find(x => x.status === 'planned');
    if (next) next.status = 'active';
    day.budget.deep.used = Math.min(day.budget.deep.total, day.budget.deep.used + 10);
  }
  save(); renderAttention(); renderOverview();
});
document.querySelectorAll('#fcLevels .lv').forEach(el => {
  el.addEventListener('click', () => {
    if (!isToday(getDate(3))) return;
    state.attention.level = Number(el.dataset.lv);
    save(); renderAttention();
  });
});
$('addInterruptBtn').addEventListener('click', () => {
  const dateStr = isAll(3) ? TODAY_KEY : getDate(3);
  const day = dayData(dateStr);
  const n = new Date();
  const time = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
  day.interruptions.push({ id: nextId(), time, source:'手动', type:'外部', urgency:'可延迟', resolved:'记入收件箱', recover:2 });
  day.sources.push({ name:'手动记录', count:1, min:2 });
  save(); renderAttention();
});
$('inboxList').addEventListener('click', e => {
  if (!e.target.closest('.del')) return;
  if (isAll(3)) return;
  const li = e.target.closest('.inbox-item');
  const dateStr = getDate(3);
  const day = dayData(dateStr);
  day.inbox = day.inbox.filter(x => x.id !== li.dataset.id);
  save(); renderAttention();
});
const addInboxInput = $('addInboxInput');
addInboxInput.addEventListener('keydown', e => {
  if (e.key === 'Enter'){
    e.preventDefault();
    const content = addInboxInput.value.trim();
    if (!content) return;
    const dateStr = isAll(3) ? TODAY_KEY : getDate(3);
    const day = dayData(dateStr);
    const n = new Date();
    const time = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
    day.inbox.push({ id: nextId(), time, source:'手动', content, type:'todo' });
    addInboxInput.value = ''; addInboxInput.focus();
    save(); renderAttention();
  }
});

/* ================================================================
   05 笔记 / 知识卡
================================================================ */
let noteTab = 'notes'; // 'notes' | 'insights'

function fmtTime(ts){
  const d = new Date(ts);
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff/60000) + ' 分钟前';
  if (d.toDateString() === now.toDateString())
    return '今天 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  return `${d.getMonth()+1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function autoGrow(ta){
  ta.style.height = 'auto';
  ta.style.height = Math.max(ta.scrollHeight, 80) + 'px';
}

function renderNoteList(){
  if (isAll(4)){
    const all = state.notes.slice().sort((a,b) => b.time - a.time);
    $('noteTitle').textContent = `全部 · ${all.length} 条`;
    $('noteListNote').textContent = `${all.length} 条`;

    const list = $('noteList');
    list.innerHTML = '';
    if (!all.length){
      list.innerHTML = '<li class="empty">还没有笔记。</li>';
    } else {
      renderGroupedNotes(list, all);
    }

    const totalChars = all.reduce((a,n) => a + (n.text||'').length, 0);
    const longest = all.reduce((m,n) => Math.max(m, (n.text||'').length), 0);
    renderStatGrid($('noteStats'), [
      { label:'总条数', value: all.length, unit:'条' },
      { label:'总字数', value: totalChars, unit:'字' },
      { label:'最长一条', value: longest, unit:'字' },
      { label:'平均字数', value: all.length ? Math.round(totalChars/all.length) : 0, unit:'字' },
    ]);
    return;
  }

  const dateStr = getDate(4);
  const list = $('noteList');
  list.innerHTML = '';

  const filtered = state.notes.filter(n => n.date === dateStr)
    .sort((a,b) => b.time - a.time);

  $('noteTitle').textContent = filtered.length === 0
    ? (isToday(dateStr) ? '今天还没有笔记。' : '这一天没有笔记。')
    : `${isToday(dateStr) ? '今天' : '当日'} · ${filtered.length} 条`;
  $('noteListNote').textContent = `${filtered.length} 条`;

  if (filtered.length === 0){
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '点击下方按钮新建一条。';
    list.appendChild(li);
  } else {
    filtered.forEach(n => {
      const li = document.createElement('li');
      li.className = 'note-item';
      li.dataset.id = n.id;
      li.innerHTML = `
        <div class="note-head">
          <span class="note-time">${fmtTime(n.time)}</span>
          <div class="acts">
            <button class="act del" title="删除">✕</button>
          </div>
        </div>
        <textarea class="note-body" placeholder="写点什么…" maxlength="2000"></textarea>`;
      li.querySelector('.note-body').value = n.text;
      list.appendChild(li);
    });
    list.querySelectorAll('.note-body').forEach(autoGrow);
  }

  const totalChars = filtered.reduce((a,n) => a + (n.text || '').length, 0);
  const weekNew = filtered.filter(n => Date.now() - n.time < 7*86400000).length;
  const longest = filtered.reduce((m,n) => Math.max(m, (n.text || '').length), 0);
  renderStatGrid($('noteStats'), [
    { label:'笔记数', value: filtered.length, unit:'条' },
    { label:'总字数', value: totalChars, unit:'字' },
    { label:'近 7 天新增', value: weekNew, unit:'条' },
    { label:'最长一条', value: longest, unit:'字' },
  ]);
}

function renderInsightList(){
  const list = $('insightList');
  list.innerHTML = '';

  let items;
  if (isAll(4)){
    items = state.insights.slice().sort((a,b) => (b.ts||0) - (a.ts||0));
    $('noteTitle').textContent = `全部知识卡 · ${items.length} 张。`;
  } else {
    const dateStr = getDate(4);
    items = state.insights.filter(i => i.date === dateStr)
      .sort((a,b) => (b.ts||0) - (a.ts||0));
    $('noteTitle').textContent = items.length === 0
      ? (isToday(dateStr) ? '今天还没有知识卡。' : '这一天没有知识卡。')
      : `${isToday(dateStr) ? '今天' : '当日'} · ${items.length} 张知识卡`;
  }
  $('noteListNote').textContent = `${state.insights.length} 张总`;

  if (!items.length){
    list.innerHTML = '<li class="empty">还没有知识卡。点下方按钮新建一张，或从任务详情里「存为知识卡」。</li>';
  } else {
    items.forEach(ins => {
      const li = document.createElement('li');
      li.className = 'insight-card';
      li.dataset.id = ins.id;
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.innerHTML = `
        <div class="ic-name">${esc(ins.name||'未命名')}</div>
        ${ins.source?`<div class="ic-src">${esc(ins.source)}</div>`:''}
        ${ins.understanding?`<div class="ic-body">${esc(ins.understanding)}</div>`:''}
        <div class="ic-foot">
          ${(ins.scenes||[]).map(s => `<span class="ic-tag">${esc(s)}</span>`).join('')}
          ${(ins.relatedTaskIds||[]).length ? `<span class="ic-rel">◇ 关联 ${ins.relatedTaskIds.length} 件事</span>` : ''}
        </div>`;
      li.addEventListener('click', () => openInsightDetail(ins.id));
      li.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' '){
          e.preventDefault();
          openInsightDetail(ins.id);
        }
      });
      list.appendChild(li);
    });
  }

  const total = state.insights.length;
  const linked = state.insights.filter(i => (i.relatedTaskIds||[]).length > 0).length;
  const scenesSet = new Set(state.insights.flatMap(i => i.scenes||[]));
  const recent = state.insights.filter(i => Date.now() - (i.ts||0) < 7*86400000).length;
  renderStatGrid($('noteStats'), [
    { label:'知识卡总数', value: total, unit:'张' },
    { label:'已关联事情', value: linked, unit:'张' },
    { label:'场景覆盖', value: scenesSet.size, unit:'类' },
    { label:'近 7 天新增', value: recent, unit:'张' },
  ]);
}

function renderNotes(){
  if (noteTab === 'insights'){
    $('noteList').hidden = true;
    $('insightList').hidden = false;
    $('noteAddRow').hidden = true;
    $('insightAddRow').hidden = false;
    renderInsightList();
  } else {
    $('noteList').hidden = false;
    $('insightList').hidden = true;
    $('noteAddRow').hidden = false;
    $('insightAddRow').hidden = true;
    renderNoteList();
  }
}

// 笔记 tab 切换
document.querySelectorAll('#noteTabs .note-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if (tab === noteTab) return;
    noteTab = tab;
    document.querySelectorAll('#noteTabs .note-tab').forEach(b => {
      b.classList.toggle('on', b.dataset.tab === tab);
      b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false');
    });
    renderNotes();
  });
});

// 笔记列表事件
$('noteList').addEventListener('input', e => {
  if (!e.target.matches('.note-body')) return;
  if (isAll(4)) return;
  const li = e.target.closest('.note-item');
  const n = state.notes.find(x => x.id === Number(li.dataset.id));
  if (!n) return;
  n.text = e.target.value;
  n.time = Date.now();
  save(); autoGrow(e.target);
});
$('noteList').addEventListener('click', e => {
  if (!e.target.closest('.del')) return;
  if (isAll(4)) return;
  const li = e.target.closest('.note-item');
  const id = Number(li.dataset.id);
  state.notes = state.notes.filter(x => x.id !== id);
  save(); renderNotes();
});
$('addNoteBtn').addEventListener('click', () => {
  const dateStr = isAll(4) ? TODAY_KEY : getDate(4);
  const n = { id: nextId(), text: '', time: Date.now(), date: dateStr };
  state.notes.push(n);
  save(); renderNotes();
  const ta = document.querySelector(`.note-item[data-id="${n.id}"] .note-body`);
  if (ta){ ta.focus(); autoGrow(ta); }
});
$('addInsightBtn').addEventListener('click', () => {
  openInsightDetail(null, { relatedTaskIds: [] });
});

/* ================================================================
   06 复盘
================================================================ */
function renderReview(){
  if (isAll(5)){
    const weekSet = new Set();
    Object.keys(state.attention.days).forEach(d => {
      weekSet.add(weekDatesOf(d).join(','));
    });
    const weeks = [...weekSet].sort((a,b) => b.localeCompare(a));

    $('reviewTitle').textContent = `全部周 · ${weeks.length} 周`;
    $('reviewTotal').textContent = `${weeks.length} 周`;

    $('bars').innerHTML = '<div class="inbox-empty" style="width:100%">全部模式下不显示柱状图。</div>';
    $('reviewNote').textContent = '切换回具体周查看柱状图。';

    renderStatGrid($('reviewStats'), [
      { label:'周数', value: weeks.length, unit:'周' },
      { label:'总专注', value: Math.round(weeks.reduce((a,w) => {
        const dates = w.split(',');
        return a + dates.reduce((s,d) => {
          const dd = state.attention.days[d];
          return s + ((dd?.budget?.deep?.used||0) + (dd?.budget?.shallow?.used||0));
        }, 0);
      }, 0) / 60), unit:'h' },
      { label:'平均每周', value: weeks.length ? Math.round(
          weeks.reduce((a,w) => {
            const dates = w.split(',');
            return a + dates.reduce((s,d) => {
              const dd = state.attention.days[d];
              return s + ((dd?.budget?.deep?.used||0) + (dd?.budget?.shallow?.used||0));
            }, 0);
          }, 0) / 60 / weeks.length
        ) : 0, unit:'h' },
      { label:'最早记录', value: weeks.length ? weeks[weeks.length-1].split(',')[0].slice(5) : '—' },
    ]);
    $('reviewAttention').innerHTML = '';

    const feelRow = $('feelRow');
    feelRow.innerHTML = '<span style="color:var(--muted);font-size:.85rem">全部模式下不显示。</span>';
    $('feelNote').textContent = '—';

    // 认知块（全部模式）
    renderCognitionBlockAll();

    const sg = $('reviewSuggest');
    sg.innerHTML = '';
    weeks.forEach(wk => {
      const dates = wk.split(',');
      const s = parseDate(dates[0]);
      const e = parseDate(dates[6]);
      const focusHrs = dates.reduce((a, d) => {
        const dd = state.attention.days[d];
        if (!dd) return a;
        return a + (dd.budget?.deep?.used || 0) + (dd.budget?.shallow?.used || 0);
      }, 0) / 60;
      const li = document.createElement('li');
      li.innerHTML = `<b>${s.getMonth()+1}/${s.getDate()} – ${e.getMonth()+1}/${e.getDate()}</b> —— 专注 ${Math.round(focusHrs*10)/10} 小时`;
      sg.appendChild(li);
    });
    if (!weeks.length){
      sg.innerHTML = '<li class="dim">还没有任何数据。</li>';
    }
    return;
  }

  const dateStr = getDate(5);
  const week = weekDatesOf(dateStr);
  const startDate = parseDate(week[0]);
  const endDate = parseDate(week[6]);

  const weekData = week.map(d => dayData(d));
  const weekFocusHrs = weekData.map((d, i) => {
    const total = (d.budget.deep.used + d.budget.shallow.used) / 60;
    return Math.round(total * 10) / 10;
  });
  const total = weekFocusHrs.reduce((a,b) => a + b, 0);
  const max = Math.max(...weekFocusHrs, 1);

  $('reviewTitle').textContent = `${startDate.getMonth()+1}月${startDate.getDate()}日 – ${endDate.getMonth()+1}月${endDate.getDate()} 专注 ${Math.round(total)} 小时。`;
  $('reviewTotal').textContent = `共 ${Math.round(total)} h`;

  const bars = $('bars');
  bars.innerHTML = '';
  weekFocusHrs.forEach((v, i) => {
    const dateKey = week[i];
    const isFuture = dateKey > TODAY_KEY;
    const isToday_ = dateKey === TODAY_KEY;
    const bar = document.createElement('div');
    bar.className = 'bar' + (isToday_ ? ' today' : '') +
                    (isFuture ? ' future' : '') +
                    (editing.day === dateKey ? ' editing' : '');
    bar.dataset.date = dateKey;
    bar.setAttribute('role', 'button');
    bar.setAttribute('tabindex', isFuture ? '-1' : '0');
    bar.setAttribute('aria-label', `${dateKey} 专注 ${v} 小时`);
    const top = editing.day === dateKey
      ? `<input class="day-input" type="number" min="0" max="24" value="${v}">`
      : `<span class="val">${v}h</span>`;
    bar.innerHTML = `
      ${top}
      <div class="fill" style="height:${Math.max(3, v/max*100)}%"></div>
      <span class="d">${WEEK_CHARS[i]}</span>`;
    bars.appendChild(bar);
  });

  const inp = bars.querySelector('.day-input');
  if (inp){ inp.focus(); inp.select(); }

  const peak = weekFocusHrs.indexOf(Math.max(...weekFocusHrs));
  const note = total === 0
    ? '这周还没记录。点击柱子填上专注时长。'
    : `最高在周${WEEK_CHARS[peak]}。点击柱子可以修改。`;
  $('reviewNote').textContent = note;

  let intTotal = 0, intMin = 0, blocksDone = 0, blocksTotal = 0;
  weekData.forEach(d => {
    intTotal += d.sources.reduce((s,x) => s + x.count, 0);
    intMin += d.sources.reduce((s,x) => s + x.min, 0);
    blocksDone += d.focusBlocks.filter(b => b.status === 'done').length;
    blocksTotal += d.focusBlocks.length;
  });
  const avgRecover = intTotal ? Math.round(intMin / intTotal * 10) / 10 : 0;

  renderStatGrid($('reviewStats'), [
    { label:'深度工作', value: weekData.reduce((s,d) => s + d.budget.deep.used, 0), unit:'min', accent:true },
    { label:'专注块完成率', value: blocksTotal ? Math.round(blocksDone / blocksTotal * 100) : 0, unit:'%' },
    { label:'中断次数', value: intTotal, unit:'次' },
    { label:'平均恢复', value: avgRecover, unit:'min' },
    { label:'活跃天数', value: weekFocusHrs.filter(v => v > 0).length, unit:'/7 天' },
  ]);

  const attnList = $('reviewAttention');
  attnList.innerHTML = '';
  const nameCount = {};
  weekData.forEach(d => {
    d.focusBlocks.forEach(b => {
      nameCount[b.task] = (nameCount[b.task] || 0) + b.level * 10;
    });
  });
  Object.entries(nameCount).sort((x,y) => y[1] - x[1]).slice(0, 6).forEach(([name, pts]) => {
    const li = document.createElement('li');
    li.innerHTML = `<b>${esc(name)}</b><span class="right">${pts} 点</span>`;
    attnList.appendChild(li);
  });
  if (!attnList.children.length){
    attnList.innerHTML = '<li class="dim">这周还没有安排专注块。</li>';
  }

  // 认知块（具体周）
  renderCognitionBlockWeek(week);

  const feelRow = $('feelRow');
  feelRow.innerHTML = '';
  const feelDate = week.filter(d => d <= TODAY_KEY).pop() || TODAY_KEY;
  const feelData = dayData(feelDate);
  const feelVal = feelData.feel || 0;
  const FEEL_LABELS = ['很差', '较差', '一般', '不错', '很好'];
  for (let i = 1; i <= 5; i++){
    const b = document.createElement('button');
    b.className = 'feel-btn' + (feelVal === i ? ' on' : '');
    b.textContent = i;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', feelVal === i ? 'true' : 'false');
    b.setAttribute('aria-label', `专注感 ${i}：${FEEL_LABELS[i-1]}`);
    b.addEventListener('click', () => {
      feelData.feel = (feelData.feel === i) ? 0 : i;
      save(); renderReview();
    });
    feelRow.appendChild(b);
  }
  $('feelNote').textContent = feelVal ? `${FEEL_LABELS[feelVal-1]}（${fmtDateHuman(feelDate, {short:true})}）` : '点击打分';

  const sg = $('reviewSuggest');
  sg.innerHTML = '';
  const items = [];
  if (intTotal >= 3) items.push(['上午完全关闭群聊', '干扰源集中在消息类，试试在深度块期间彻底断开。']);
  if (weekData.reduce((s,d) => s + d.budget.deep.used, 0) < 180 * 7 * 0.5)
    items.push(['把深度块前置', '深度工作使用率低于 50%，尝试把第一块提前到早晨。']);
  if (avgRecover > 4) items.push(['缩短恢复时间', '平均恢复超过 4 分钟，考虑用固定动作快速回神。']);
  if (feelVal && feelVal <= 2) items.push(['检查能量来源', '主观专注感偏低，睡眠或运动可能影响了状态。']);
  if (!items.length) items.push(['保持当前节奏', '数据健康，继续记录一周再调整。']);
  items.slice(0, 4).forEach(([tt, d]) => {
    const li = document.createElement('li');
    li.innerHTML = `<b>${tt}</b> —— ${d}`;
    sg.appendChild(li);
  });
}

function renderCognitionBlockWeek(week){
  const weekStart = week[0];
  const weekEnd = week[6];
  const weekStartTs = parseDate(weekStart).getTime();
  const weekEndTs = parseDate(addDays(weekEnd, 1)).getTime() - 1;

  const weekInsights = state.insights.filter(i => i.date >= weekStart && i.date <= weekEnd);
  const updatedInsights = state.insights.filter(i => 
    (i.ts||0) >= weekStartTs && (i.ts||0) <= weekEndTs &&
    !(i.date >= weekStart && i.date <= weekEnd)
  );
  const weekTasks = state.tasks.filter(t => t.date >= weekStart && t.date <= weekEnd);
  const understoodTasks = weekTasks.filter(taskHasCognition);

  renderStatGrid($('cognitionStats'), [
    { label:'新建知识卡', value: weekInsights.length, unit:'张' },
    { label:'更新知识卡', value: updatedInsights.length, unit:'张' },
    { label:'有理解记录的事', value: understoodTasks.length, unit:'件' },
    { label:'累计知识卡', value: state.insights.length, unit:'张' },
  ]);

  const list = $('cognitionList');
  list.innerHTML = '';
  $('cogNote').textContent = isWeekOfToday(weekStart) ? '本周' : '该周';
  if (!weekInsights.length){
    list.innerHTML = '<li class="dim">这周还没有新建知识卡。</li>';
    return;
  }
  weekInsights.slice(0, 6).forEach(ins => {
    const li = document.createElement('li');
    li.innerHTML = `<b>${esc(ins.name)}</b> —— ${fmtDateHuman(ins.date, {short:true})}`;
    li.style.cursor = 'pointer';
    li.addEventListener('click', () => openInsightDetail(ins.id));
    list.appendChild(li);
  });
}

function renderCognitionBlockAll(){
  const total = state.insights.length;
  const linked = state.insights.filter(i => (i.relatedTaskIds||[]).length).length;
  const scenesSet = new Set(state.insights.flatMap(i => i.scenes||[]));
  const understoodTotal = state.tasks.filter(taskHasCognition).length;

  renderStatGrid($('cognitionStats'), [
    { label:'知识卡总数', value: total, unit:'张' },
    { label:'已关联事情', value: linked, unit:'张' },
    { label:'场景覆盖', value: scenesSet.size, unit:'类' },
    { label:'全部任务中', value: understoodTotal, unit:'件有理解' },
  ]);

  const list = $('cognitionList');
  list.innerHTML = '';
  $('cogNote').textContent = '全部';
  if (!total){
    list.innerHTML = '<li class="dim">还没有知识卡。</li>';
    return;
  }
  state.insights.slice()
    .sort((a,b) => (b.ts||0) - (a.ts||0))
    .slice(0, 10)
    .forEach(ins => {
      const li = document.createElement('li');
      li.innerHTML = `<b>${esc(ins.name)}</b> —— ${fmtDateHuman(ins.date, {short:true})}`;
      li.style.cursor = 'pointer';
      li.addEventListener('click', () => openInsightDetail(ins.id));
      list.appendChild(li);
    });
}

$('bars').addEventListener('click', e => {
  if (isAll(5)) return;
  const bar = e.target.closest('.bar');
  if (!bar || bar.classList.contains('future')) return;
  if (e.target.matches('.day-input')) return;
  editing.day = bar.dataset.date;
  renderReview();
});
$('bars').addEventListener('keydown', e => {
  if (isAll(5)) return;
  if (e.target.matches('.bar') && (e.key === 'Enter' || e.key === ' ')){
    if (e.target.classList.contains('future')) return;
    e.preventDefault();
    editing.day = e.target.dataset.date;
    renderReview();
    return;
  }
  if (!e.target.matches('.day-input')) return;
  if (e.key === 'Enter'){ e.preventDefault(); commitDay(e.target); }
  if (e.key === 'Escape'){ editing.day = null; renderReview(); }
});
$('bars').addEventListener('blur', e => {
  if (e.target.matches('.day-input')) commitDay(e.target);
}, true);

function commitDay(input){
  const bar = input.closest('.bar');
  const dateKey = bar.dataset.date;
  let v = parseFloat(input.value);
  if (isNaN(v) || v < 0) v = 0;
  if (v > 24) v = 24;
  const day = dayData(dateKey);
  const totalMin = Math.round(v * 60);
  const deep = Math.min(totalMin, day.budget.deep.total);
  day.budget.deep.used = deep;
  day.budget.shallow.used = Math.max(0, totalMin - deep);
  editing.day = null;
  save();
  renderReview(); renderOverview();
}

/* ================================================================
   渲染
================================================================ */
function renderCurrentSlide(){
  if (cur === 0) renderOverview();
  else if (cur === 1) renderTasks();
  else if (cur === 2) renderHabits();
  else if (cur === 3) renderAttention();
  else if (cur === 4) renderNotes();
  else if (cur === 5) renderReview();
  updateHudButton();
  updateDateNav(cur);
}
function renderAll(){
  renderOverview();
  renderTasks();
  renderHabits();
  renderAttention();
  renderNotes();
  renderReview();
  updateHudButton();
}

/* ================================================================
   模块切换
================================================================ */
const progress = $('progress');
const curNum = $('curNum');
let locked = false;
const LOCK_MS = 560;

function go(target, dir){
  target = Math.max(0, Math.min(TOTAL_SLIDES - 1, target));
  if (target === cur || locked) return;

  locked = true;
  const from = slides[cur];
  const to = slides[target];

  to.style.setProperty('--enter-y', dir > 0 ? '22px' : '-22px');
  from.style.setProperty('--enter-y', dir > 0 ? '-22px' : '22px');

  from.classList.remove('active');
  dots[cur].classList.remove('active');
  dots[cur].removeAttribute('aria-current');

  cur = target;

  void to.offsetWidth;
  to.classList.add('active');
  dots[cur].classList.add('active');
  dots[cur].setAttribute('aria-current', 'true');

  progress.style.transform = `scaleX(${(cur + 1) / TOTAL_SLIDES})`;
  curNum.textContent = String(cur + 1).padStart(2, '0');

  renderCurrentSlide();

  if (document.body.classList.contains('nav-show')){
    scheduleHide(1200);
  }
  setTimeout(() => { locked = false; }, LOCK_MS);
}

dots.forEach(dot => {
  dot.addEventListener('click', () => {
    const i = Number(dot.dataset.index);
    go(i, i > cur ? 1 : -1);
  });
});

let wheelAcc = 0, wheelTimer = null;
addEventListener('wheel', e => {
  if (e.target.closest('.settings-panel, .palette-box, .date-menu, .detail-box')) return;
  const ta = e.target.closest('textarea');
  if (ta && ta.scrollHeight > ta.clientHeight + 1) return;
  if (locked) return;
  wheelAcc += e.deltaY;
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => { wheelAcc = 0; }, 150);
  if (Math.abs(wheelAcc) > 26){
    const dir = wheelAcc > 0 ? 1 : -1;
    const inner = slides[cur].querySelector('.inner');
    if (inner && inner.scrollHeight > inner.clientHeight + 1){
      const atTop = inner.scrollTop <= 0;
      const atBottom = inner.scrollTop + inner.clientHeight >= inner.scrollHeight - 1;
      if (dir > 0 && !atBottom){ wheelAcc = 0; return; }
      if (dir < 0 && !atTop){ wheelAcc = 0; return; }
    }
    go(cur + dir, dir);
    wheelAcc = 0;
  }
}, { passive: true });

let touchY = null;
addEventListener('touchstart', e => {
  if (e.target.closest('textarea, input, .settings-panel, .palette-box, .date-nav, .date-menu, .detail-box')) return;
  touchY = e.touches[0].clientY;
}, { passive: true });
addEventListener('touchend', e => {
  if (touchY === null) return;
  const delta = touchY - e.changedTouches[0].clientY;
  touchY = null;
  if (Math.abs(delta) < 44) return;
  const dir = delta > 0 ? 1 : -1;
  go(cur + dir, dir);
}, { passive: true });

addEventListener('dblclick', e => {
  if (e.target.closest('input, textarea, button, a, .settings-panel, .palette-box, .dots, .panel, .panel *, .date-nav, .date-menu, .detail-box')) return;
  cycleHud();
});

/* ================================================================
   设置面板
================================================================ */
const settingsEl = $('settings');
const gearEl = $('gear');
function openSettings(){
  settingsEl.classList.add('open');
  gearEl.classList.add('on');
  gearEl.setAttribute('aria-expanded', 'true');
  document.body.classList.remove('idle');
}
function closeSettings(){
  settingsEl.classList.remove('open');
  gearEl.classList.remove('on');
  gearEl.setAttribute('aria-expanded', 'false');
  wake();
}
gearEl.addEventListener('click', () => {
  settingsEl.classList.contains('open') ? closeSettings() : openSettings();
});
settingsEl.addEventListener('click', e => {
  if (e.target.hasAttribute('data-close')) closeSettings();
});
document.querySelectorAll('#segNav button').forEach(b => {
  b.addEventListener('click', () => {
    applyNav(b.dataset.pos);
    showNav();
  });
});
document.querySelectorAll('#segMode button').forEach(b => {
  b.addEventListener('click', () => {
    applyMode(b.dataset.mode);
  });
});

/* ================================================================
   闲置柔化
================================================================ */
let idleTimer;
function wake(){
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!settingsEl.classList.contains('open') &&
        !paletteEl.classList.contains('open') &&
        !detailEl.classList.contains('open')){
      document.body.classList.add('idle');
    }
  }, 2800);
}
['mousemove','touchstart','keydown','wheel','click'].forEach(ev =>
  addEventListener(ev, wake, { passive: true })
);
wake();

/* ================================================================
   专注计时
================================================================ */
let timerTick = null;
function startTimerTick(){
  if (timerTick) return;
  timerTick = setInterval(() => {
    const a = state.attention;
    if (a.running && a.sessionStart && isToday(getDate(3))){
      const elapsedMin = Math.floor((Date.now() - a.sessionStart) / 60000);
      const shown = a.sessionMin + elapsedMin;
      $('fcTimer').textContent = `${pad(Math.floor(shown/60))}:${pad(shown%60)}`;
    }
  }, 1000);
}
startTimerTick();

/* ================================================================
   启动
================================================================ */
buildSwatches();

let savedTheme = 'night';
let savedNav = 'left';
let savedZen = false;
let savedMode = 'full';
try{
  savedTheme = localStorage.getItem(THEME_KEY) || 'night';
  savedNav = localStorage.getItem(NAV_KEY) || 'left';
  savedZen = localStorage.getItem(ZEN_KEY) === '1';
  savedMode = localStorage.getItem(MODE_KEY) || 'full';
}catch(e){}
if (!THEMES.some(t => t.id === savedTheme)) savedTheme = 'night';
applyTheme(savedTheme, false);
applyNav(savedNav);
applyMode(savedMode, true);

slides.forEach((_, i) => applyHudToSlide(i));
updateHudButton();
if (savedZen) applyZen(true, true);

renderAll();
updateAllDateNav();
progress.style.transform = `scaleX(${1 / TOTAL_SLIDES})`;

if (finePointer()){
  setTimeout(showNav, 500);
  setTimeout(() => scheduleHide(300), 2400);
}