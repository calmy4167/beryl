// CSDIY-style Package 1: theme overrides + hero (welcome page) + sidebar browser.
// Plain JavaScript, no JSX, no imports. Client half only.

var CSDIY_CSS = [
  '/* ---- csdiy hero ---- */',
  '.csdiy-hero{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100%;width:100%;padding:48px 32px;box-sizing:border-box;}',
  '.csdiy-hero-badge{font-size:11px;letter-spacing:2.5px;color:var(--dsw-alias-brand-primary);font-weight:600;text-transform:uppercase;margin-bottom:16px;}',
  '.csdiy-hero-title{font-size:34px;font-weight:700;color:var(--dsw-alias-label-primary);margin:0 0 10px;letter-spacing:-0.5px;line-height:1.2;}',
  '.csdiy-hero-sub{font-size:15px;color:var(--dsw-alias-label-secondary);margin:0 0 36px;line-height:1.6;max-width:560px;text-align:center;}',
  '.csdiy-hero-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;width:100%;max-width:920px;}',
  '.csdiy-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:18px 18px 14px;cursor:pointer;text-align:left;transition:border-color .15s ease,transform .15s ease,box-shadow .15s ease;font-family:inherit;color:inherit;}',
  '.csdiy-card:hover{transform:translateY(-2px);border-color:var(--dsw-alias-brand-primary);box-shadow:0 6px 18px rgba(14,165,233,.10);}',
  '.csdiy-card-active{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary);}',
  '.csdiy-card-title{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary);margin:0 0 4px;display:flex;align-items:center;gap:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
  '.csdiy-card-path{font-size:12px;color:var(--dsw-alias-label-secondary);margin:0 0 12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
  '.csdiy-card-meta{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--dsw-alias-label-secondary);}',
  '.csdiy-badge{display:inline-block;font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;background:rgba(14,165,233,.12);color:var(--dsw-alias-brand-primary);flex-shrink:0;}',
  '.csdiy-hero-add{margin-top:28px;display:inline-flex;align-items:center;gap:8px;padding:10px 20px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;cursor:pointer;transition:border-color .15s ease,color .15s ease;font-family:inherit;}',
  '.csdiy-hero-add:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);}',
  '.csdiy-hero-add:disabled{opacity:.6;cursor:default;}',
  '.csdiy-hero-empty{text-align:center;color:var(--dsw-alias-label-secondary);font-size:14px;margin:8px 0 0;}',
  '/* ---- csdiy sidebar ---- */',
  '.csdiy-sidebar{display:flex;flex-direction:column;height:100%;overflow:hidden;font-size:13px;}',
  '.csdiy-sidebar-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 10px;}',
  '.csdiy-sidebar-title{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--dsw-alias-label-secondary);}',
  '.csdiy-sidebar-new{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:16px;line-height:1;transition:all .15s ease;}',
  '.csdiy-sidebar-new:hover{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);}',
  '.csdiy-search{margin:0 16px 10px;padding:7px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;outline:none;transition:border-color .15s ease;font-family:inherit;}',
  '.csdiy-search:focus{border-color:var(--dsw-alias-brand-primary);}',
  '.csdiy-sidebar-scroll{flex:1;overflow-y:auto;padding:0 8px 12px;}',
  '.csdiy-group-title{display:flex;align-items:center;gap:6px;padding:12px 10px 5px;font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none;transition:color .15s ease;}',
  '.csdiy-group-title:hover{color:var(--dsw-alias-label-primary);}',
  '.csdiy-group-count{font-size:10px;color:var(--dsw-alias-label-secondary);opacity:.7;}',
  '.csdiy-item{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;cursor:pointer;color:var(--dsw-alias-label-primary);border:1px solid transparent;white-space:nowrap;overflow:hidden;transition:background .15s ease;font-family:inherit;}',
  '.csdiy-item:hover{background:var(--dsw-alias-bg-layer-1);}',
  '.csdiy-item-active{background:rgba(14,165,233,.10);border-color:rgba(14,165,233,.25);}',
  '.csdiy-item-title{flex:1;overflow:hidden;text-overflow:ellipsis;}',
  '.csdiy-item-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary);flex-shrink:0;}',
  '.csdiy-item-dot-run{background:var(--dsw-alias-brand-primary);}',
  '.csdiy-item-dot-warn{background:var(--dsw-alias-state-warn-primary);}',
  '/* ---- csdiy rail ---- */',
  '.csdiy-rail{display:flex;flex-direction:column;align-items:center;gap:10px;padding:12px 0;}',
  '.csdiy-rail-btn{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:16px;transition:all .15s ease;}',
  '.csdiy-rail-btn:hover{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);}',
  '.csdiy-rail-dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-brand-primary);}',
  ''
].join('\n')

// ---- Hero: the new-session welcome page ----
function CsdiyHero(props) {
  var items = props.useWorkspaces((s) => s.items || [])
  var recent = props.useWorkspaces((s) => s.recentWorkspaceId)
  var busy = React.useState(false)
  var isBusy = busy[0]
  var setBusy = busy[1]

  var doAdd = function () {
    if (isBusy) return
    setBusy(true)
    var p = props.onAdd ? props.onAdd() : Promise.resolve(null)
    Promise.resolve(p).then(function () { setBusy(false) }, function () { setBusy(false) })
  }

  var cards = (items || []).map(function (w) {
    var active = props.selectedId === w.workspaceId
    var isRecent = !active && recent === w.workspaceId
    var count = (w.sessionIds || []).length
    var children = []
    children.push(React.createElement('div', { className: 'csdiy-card-title' },
      React.createElement('span', null, w.title || w.path),
      isRecent ? React.createElement('span', { className: 'csdiy-badge' }, '最近') : null,
      active ? React.createElement('span', { className: 'csdiy-badge' }, '当前') : null,
    ))
    children.push(React.createElement('div', { className: 'csdiy-card-path' }, w.path))
    children.push(React.createElement('div', { className: 'csdiy-card-meta' },
      React.createElement('span', null, String(count) + ' 个会话'),
    ))
    return React.createElement('button', {
      key: w.workspaceId,
      type: 'button',
      className: 'csdiy-card' + (active ? ' csdiy-card-active' : ''),
      onClick: function () { if (props.onPick) props.onPick(w.workspaceId) },
    }, children)
  })

  return React.createElement('div', { className: 'csdiy-hero' },
    React.createElement('div', { className: 'csdiy-hero-badge' }, 'DEEPSEEK HARNESS'),
    React.createElement('h1', { className: 'csdiy-hero-title' }, '开始你的工作'),
    React.createElement('p', { className: 'csdiy-hero-sub' }, '选择一个工作区进入会话，或添加一个新的工作区。'),
    cards.length
      ? React.createElement('div', { className: 'csdiy-hero-grid' }, cards)
      : React.createElement('p', { className: 'csdiy-hero-empty' }, '还没有工作区，先添加一个吧'),
    React.createElement('button', {
      type: 'button',
      className: 'csdiy-hero-add',
      onClick: doAdd,
      disabled: isBusy,
    }, isBusy ? '正在选择目录…' : '＋ 添加工作区'),
  )
}

// ---- Sidebar: workspace/session browser ----
function CsdiySidebar(props) {
  var wide = props.wide !== false
  var ws = props.useWorkspaces((s) => s.items || [])
  var archived = props.useWorkspaces((s) => s.archivedSessionIds || [])
  var ids = props.useSessions((s) => s.ids || [])
  var byId = props.useSessions((s) => s.byId || {})
  var current = props.useSessions((s) => s.current)
  var qState = React.useState('')
  var q = qState[0]
  var setQ = qState[1]

  if (!wide) {
    var railChildren = [
      React.createElement('button', {
        key: 'new',
        type: 'button',
        className: 'csdiy-rail-btn',
        title: '新建会话',
        onClick: function () { if (props.onNew) props.onNew() },
      }, '＋'),
      React.createElement('button', {
        key: 'expand',
        type: 'button',
        className: 'csdiy-rail-btn',
        title: '展开侧边栏',
        onClick: function () { if (props.expandSidebar) props.expandSidebar() },
      }, '»'),
      React.createElement('span', { key: 'dot', className: 'csdiy-rail-dot' }),
    ]
    return React.createElement('div', { className: 'csdiy-rail' }, railChildren)
  }

  var archivedSet = {}
  ;(archived || []).forEach(function (id) { archivedSet[id] = true })

  var query = (q || '').trim().toLowerCase()
  var visible = function (s) {
    if (!s) return false
    if (archivedSet[s.id]) return false
    if (s.blank) return false
    if (query) {
      var hay = String(((s.displayTitle || '') + ' ' + (s.title || '') + ' ' + (s.cwd || '') + ' ' + s.id)).toLowerCase()
      if (hay.indexOf(query) === -1) return false
    }
    return true
  }

  var groups = []
  var owned = {}
  ;(ws || []).forEach(function (w) {
    var sess = []
    ;(w.sessionIds || []).forEach(function (sid) {
      owned[sid] = true
      var s = byId[sid]
      if (visible(s)) sess.push(s)
    })
    groups.push({ title: w.title || w.path, count: sess.length, items: sess, onOpenWorkspace: function () { if (props.onNew) props.onNew(w.workspaceId) } })
  })
  var ungrouped = []
  ;(ids || []).forEach(function (sid) {
    if (owned[sid]) return
    var s = byId[sid]
    if (visible(s)) ungrouped.push(s)
  })
  if (ungrouped.length) groups.push({ title: '其他会话', count: ungrouped.length, items: ungrouped, onOpenWorkspace: null })

  var rows = []
  groups.forEach(function (g) {
    if (!g.count) return
    var head = React.createElement('div', {
      key: 'g-' + g.title,
      className: 'csdiy-group-title',
      onClick: g.onOpenWorkspace ? g.onOpenWorkspace : null,
    },
      React.createElement('span', null, g.title),
      React.createElement('span', { className: 'csdiy-group-count' }, String(g.count)),
    )
    rows.push(head)
    g.items.forEach(function (s) {
      var active = current === s.id
      var dot = s.running
        ? 'csdiy-item-dot csdiy-item-dot-run'
        : (s.completed ? 'csdiy-item-dot' : (s.pendingInteraction ? 'csdiy-item-dot csdiy-item-dot-warn' : ''))
      var title = s.displayTitle || s.id
      rows.push(React.createElement('div', {
        key: 's-' + s.id,
        className: 'csdiy-item' + (active ? ' csdiy-item-active' : ''),
        title: title + (s.cwd ? ' — ' + s.cwd : ''),
        onClick: function (sid) { return function () { if (props.onOpen) props.onOpen(sid) } }(s.id),
      },
        dot ? React.createElement('span', { className: dot }) : null,
        React.createElement('span', { className: 'csdiy-item-title' }, title),
      ))
    })
  })

  return React.createElement('div', { className: 'csdiy-sidebar' },
    React.createElement('div', { className: 'csdiy-sidebar-head' },
      React.createElement('span', { className: 'csdiy-sidebar-title' }, '工作区'),
      React.createElement('button', {
        type: 'button',
        className: 'csdiy-sidebar-new',
        title: '新建会话',
        onClick: function () { if (props.onNew) props.onNew() },
      }, '＋'),
    ),
    React.createElement('input', {
      className: 'csdiy-search',
      placeholder: '搜索会话…',
      value: q,
      onChange: function (e) { setQ(e.target.value) },
    }),
    React.createElement('div', { className: 'csdiy-sidebar-scroll' },
      rows.length ? rows : React.createElement('p', { className: 'csdiy-hero-empty' }, '没有会话'),
    ),
  )
}


// CSDIY-style Package 2: chat node renderers (user / assistant-step / tool-call)
// + a tiny markdown renderer. Plain JavaScript, no JSX, no imports.

var CSDIY_CHAT_CSS = [
  '/* ---- csdiy chat ---- */',
  '.csdiy-user-wrap{display:flex;justify-content:flex-end;margin:10px 0;}',
  '.csdiy-user-bubble{max-width:76%;background:rgba(14,165,233,.08);border:1px solid rgba(14,165,233,.22);border-radius:12px 12px 4px 12px;padding:10px 14px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.7;}',
  '.csdiy-assistant-wrap{margin:14px 0;font-size:14px;line-height:1.75;color:var(--dsw-alias-label-primary);}',
  '.csdiy-assistant-status{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:12px;margin-top:10px;}',
  '.csdiy-pulse{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-brand-primary);animation:csdiy-pulse 1.2s ease-in-out infinite;flex-shrink:0;}',
  '@keyframes csdiy-pulse{0%,100%{opacity:1}50%{opacity:.3}}',
  '.csdiy-md-p{margin:6px 0;}',
  '.csdiy-md-h1{margin:14px 0 6px;font-size:18px;font-weight:700;}',
  '.csdiy-md-h2{margin:12px 0 6px;font-size:16px;font-weight:600;}',
  '.csdiy-md-h3{margin:10px 0 6px;font-size:14px;font-weight:600;}',
  '.csdiy-md-code{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:12px 14px;overflow-x:auto;font-size:12.5px;line-height:1.6;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--dsw-alias-label-primary);margin:8px 0;white-space:pre-wrap;word-break:break-word;}',
  '.csdiy-inline-code{background:var(--dsw-alias-bg-layer-2);border-radius:4px;padding:1px 5px;font-size:.9em;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;border:1px solid var(--dsw-alias-border-l1);}',
  '.csdiy-link{color:var(--dsw-alias-brand-primary);text-decoration:none;}',
  '.csdiy-link:hover{text-decoration:underline;}',
  '.csdiy-md-ul{margin:6px 0;padding-left:22px;}',
  '.csdiy-md-ol{margin:6px 0;padding-left:22px;}',
  '.csdiy-md-li{margin:2px 0;}',
  '.csdiy-md-quote{margin:8px 0;padding:4px 14px;border-left:3px solid var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-secondary);}',
  '.csdiy-reasoning{margin:8px 0;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;}',
  '.csdiy-reasoning summary{cursor:pointer;padding:8px 12px;font-size:12px;color:var(--dsw-alias-label-secondary);user-select:none;display:flex;align-items:center;gap:6px;}',
  '.csdiy-reasoning summary:hover{color:var(--dsw-alias-label-primary);}',
  '.csdiy-reasoning-body{padding:0 12px 12px;font-size:13px;color:var(--dsw-alias-label-secondary);line-height:1.6;white-space:pre-wrap;word-break:break-word;}',
  '.csdiy-inline-tool{display:inline-flex;align-items:center;gap:6px;margin:6px 0;padding:3px 10px;border-radius:6px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}',
  '.csdiy-img{max-width:420px;max-height:420px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);margin:8px 0;display:block;}',
  '.csdiy-img-placeholder{padding:14px;border-radius:10px;border:1px dashed var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font-size:12px;margin:8px 0;text-align:center;}',
  '/* ---- tool cards ---- */',
  '.csdiy-toolcard{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);margin:10px 0;overflow:hidden;font-size:13px;}',
  '.csdiy-toolcard-head{display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:pointer;user-select:none;transition:background .15s ease;}',
  '.csdiy-toolcard-head:hover{background:var(--dsw-alias-bg-layer-2);}',
  '.csdiy-toolcard-status{display:inline-block;width:8px;height:8px;border-radius:50%;flex-shrink:0;}',
  '.csdiy-toolcard-status-ok{background:var(--dsw-alias-state-success-primary);}',
  '.csdiy-toolcard-status-err{background:var(--dsw-alias-state-error-primary);}',
  '.csdiy-toolcard-status-run{background:var(--dsw-alias-brand-primary);animation:csdiy-pulse 1.2s ease-in-out infinite;}',
  '.csdiy-toolcard-name{font-weight:600;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
  '.csdiy-toolcard-headmeta{margin-left:auto;display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:11px;flex-shrink:0;}',
  '.csdiy-toolcard-inspect{flex-shrink:0;font-size:11px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:2px 8px;background:transparent;cursor:pointer;transition:all .15s ease;font-family:inherit;}',
  '.csdiy-toolcard-inspect:hover{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);}',
  '.csdiy-toolcard-body{padding:0 12px 12px;border-top:1px solid var(--dsw-alias-border-l1);}',
  '.csdiy-toolcard-pre{background:var(--dsw-alias-bg-layer-2);border-radius:6px;padding:10px 12px;overflow-x:auto;font-size:12px;line-height:1.6;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;margin:10px 0 0;white-space:pre-wrap;word-break:break-all;color:var(--dsw-alias-label-primary);}',
  '.csdiy-toolcard-result{margin:10px 0 0;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-primary);}',
  '.csdiy-toolcard-result-err{color:var(--dsw-alias-state-error-primary);}',
  '.csdiy-toolcard-sub{margin:10px 0 0 18px;border-left:2px solid var(--dsw-alias-border-l1);padding-left:10px;}',
  '.csdiy-toolcard-empty{color:var(--dsw-alias-label-secondary);font-size:12px;margin:10px 0 0;}',
  ''
].join('\n')

// ---- tiny inline markdown: `code`, **bold**, *italic*, [label](url) ----
function parseInline(text) {
  var out = []
  var re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g
  var last = 0
  var m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    var tok = m[0]
    if (tok.charAt(0) === '`') {
      out.push(React.createElement('code', { className: 'csdiy-inline-code' }, tok.slice(1, -1)))
    } else if (tok.indexOf('**') === 0) {
      out.push(React.createElement('strong', { key: 'b' + out.length }, parseInline(tok.slice(2, -2))))
    } else if (tok.charAt(0) === '[') {
      var close = tok.indexOf('](')
      var label = tok.slice(1, close)
      var url = tok.slice(close + 2, -1)
      out.push(React.createElement('a', { key: 'a' + out.length, className: 'csdiy-link', href: url, target: '_blank', rel: 'noreferrer' }, label))
    } else {
      out.push(React.createElement('em', { key: 'i' + out.length }, parseInline(tok.slice(1, -1))))
    }
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// ---- block markdown: fenced code, headings, lists, quotes, paragraphs ----
function MiniMarkdown(text) {
  if (!text) return null
  var lines = String(text).split(/\r?\n/)
  var nodes = []
  var para = []
  var flush = function () {
    if (para.length) {
      nodes.push(React.createElement('p', { className: 'csdiy-md-p' }, parseInline(para.join(' '))))
      para = []
    }
  }
  var i = 0
  while (i < lines.length) {
    var line = lines[i]
    var codeMatch = /^```([\w+-]*)\s*$/.exec(line)
    if (codeMatch) {
      flush()
      var buf = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++ }
      i++
      nodes.push(React.createElement('pre', { className: 'csdiy-md-code' }, React.createElement('code', null, buf.join('\n'))))
      continue
    }
    var h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) {
      flush()
      nodes.push(React.createElement('div', { className: 'csdiy-md-h' + h[1].length }, parseInline(h[2])))
      i++
      continue
    }
    var ul = /^[-*]\s+(.*)$/.exec(line)
    if (ul) {
      flush()
      var list = [React.createElement('li', { key: 'li' + i, className: 'csdiy-md-li' }, parseInline(ul[1]))]
      i++
      while (i < lines.length) {
        var ul2 = /^[-*]\s+(.*)$/.exec(lines[i])
        if (!ul2) break
        list.push(React.createElement('li', { key: 'li' + i, className: 'csdiy-md-li' }, parseInline(ul2[1])))
        i++
      }
      nodes.push(React.createElement('ul', { className: 'csdiy-md-ul' }, list))
      continue
    }
    var ol = /^(\d+)\.\s+(.*)$/.exec(line)
    if (ol) {
      flush()
      var olist = [React.createElement('li', { key: 'li' + i, className: 'csdiy-md-li' }, parseInline(ol[2]))]
      i++
      while (i < lines.length) {
        var ol2 = /^(\d+)\.\s+(.*)$/.exec(lines[i])
        if (!ol2) break
        olist.push(React.createElement('li', { key: 'li' + i, className: 'csdiy-md-li' }, parseInline(ol2[2])))
        i++
      }
      nodes.push(React.createElement('ol', { className: 'csdiy-md-ol' }, olist))
      continue
    }
    var q = /^>\s?(.*)$/.exec(line)
    if (q) {
      flush()
      var qlines = [q[1]]
      i++
      while (i < lines.length) {
        var q2 = /^>\s?(.*)$/.exec(lines[i])
        if (!q2) break
        qlines.push(q2[1])
        i++
      }
      nodes.push(React.createElement('div', { className: 'csdiy-md-quote' }, parseInline(qlines.join(' '))))
      continue
    }
    if (/^\s*$/.test(line)) { flush(); i++; continue }
    para.push(line.trim())
    i++
  }
  flush()
  return nodes
}

function truncate(s, n) {
  if (!s) return ''
  var str = String(s)
  if (str.length <= n) return str
  return str.slice(0, n) + ' …'
}

function CsdiyImage(props) {
  var st = React.useState(null)
  var url = st[0]
  var setUrl = st[1]
  React.useEffect(function () {
    var ok = true
    if (!props.attachment || !props.loadImage) return undefined
    Promise.resolve(props.loadImage(props.attachment)).then(function (u) {
      if (ok && u) setUrl(String(u))
    }, function () {})
    return function () { ok = false }
  }, [])
  if (url) return React.createElement('img', { className: 'csdiy-img', src: url, alt: 'image' })
  return React.createElement('div', { className: 'csdiy-img-placeholder' }, '🖼 图片')
}

// ---- user node ----
function CsdiyUserNode(props) {
  var node = props.node || {}
  var data = node.data || {}
  var content = data.content || []
  var children = content.map(function (b, i) {
    return renderContentBlock(b, String(i), props)
  }).filter(Boolean)
  if (!children.length) children.push(React.createElement('span', { key: 'e' }, '…'))
  return React.createElement('div', { className: 'csdiy-user-wrap' },
    React.createElement('div', { className: 'csdiy-user-bubble' }, children))
}

function renderContentBlock(b, key, props) {
  if (!b) return null
  var t = b.type
  if (t === 'text') return React.createElement('div', { key: key }, MiniMarkdown(b.text))
  if (t === 'reasoning') return React.createElement('div', { key: key, className: 'csdiy-reasoning' },
    React.createElement('details', null,
      React.createElement('summary', null, '🧠 思考过程'),
      React.createElement('div', { className: 'csdiy-reasoning-body' }, b.text)))
  if (t === 'image') return React.createElement(CsdiyImage, { key: key, attachment: b.attachment, loadImage: props.loadImage })
  if (t === 'tool-call') return React.createElement('div', { key: key, className: 'csdiy-inline-tool' }, '🔧 ' + (b.name || b.id || 'tool'))
  if (t === 'tool-result') return React.createElement('div', { key: key, className: 'csdiy-toolcard-empty' }, '工具结果已折叠')
  return null
}

// ---- assistant node ----
function CsdiyAssistantNode(props) {
  var data = (props.node || {}).data || {}
  var status = data.status || 'settled'
  var blocks = data.blocks || []
  var children = blocks.map(function (b, i) {
    return renderAssistantBlock(b, String(i), props)
  }).filter(Boolean)
  var footer = null
  if (status === 'running') {
    footer = React.createElement('div', { className: 'csdiy-assistant-status' },
      React.createElement('span', { className: 'csdiy-pulse' }),
      React.createElement('span', null, '正在生成…'))
  } else if (status === 'interrupted') {
    footer = React.createElement('div', { className: 'csdiy-assistant-status' },
      React.createElement('span', null, '⏹ 已中断'))
  }
  return React.createElement('div', { className: 'csdiy-assistant-wrap' }, children, footer)
}

function renderAssistantBlock(b, key, props) {
  if (!b) return null
  var k = b.kind
  if (k === 'text') return React.createElement('div', { key: key }, MiniMarkdown(b.text))
  if (k === 'reasoning') return React.createElement('div', { key: key, className: 'csdiy-reasoning' },
    React.createElement('details', null,
      React.createElement('summary', null, '🧠 思考过程'),
      React.createElement('div', { className: 'csdiy-reasoning-body' }, b.text)))
  if (k === 'image') return React.createElement(CsdiyImage, { key: key, attachment: b.attachment, loadImage: props.loadImage })
  if (k === 'tool-call') return React.createElement('div', { key: key, className: 'csdiy-inline-tool' }, '🔧 ' + (b.name || b.callId || 'tool'))
  return null
}

// ---- tool call node ----
function CsdiyToolNode(props) {
  var data = (props.node || {}).data || {}
  var root = data.root
  if (!root) return null
  return React.createElement(CsdiyToolCard, {
    block: root,
    depth: 0,
    inspectCall: props.inspectCall,
  })
}

function CsdiyToolCard(props) {
  var block = props.block
  var settled = block && block.kind === 'tool-result'
  var st = React.useState(props.depth === 0)
  var open = st[0]
  var setOpen = st[1]

  var name = settled ? ((block.call && block.call.name) || block.callId || 'tool') : (block.name || block.callId || 'tool')
  var argsRaw = settled ? ((block.call && block.call.argsRaw) || '') : (block.argsRaw || '')
  var argsText = ''
  if (argsRaw) {
    try { argsText = JSON.stringify(JSON.parse(argsRaw), null, 2) } catch (e) { argsText = argsRaw }
  }
  var statusCls = settled
    ? (block.isError ? 'csdiy-toolcard-status-err' : 'csdiy-toolcard-status-ok')
    : 'csdiy-toolcard-status-run'
  var statusText = settled ? (block.isError ? '失败' : '完成') : '运行中'

  var body = null
  if (open) {
    var bodyChildren = []
    if (argsText) bodyChildren.push(React.createElement('pre', { key: 'args', className: 'csdiy-toolcard-pre' }, truncate(argsText, 2500)))
    if (settled) {
      var resultText = ''
      ;(block.content || []).forEach(function (c) {
        if (c && c.type === 'text') resultText += c.text
      })
      if (resultText) {
        bodyChildren.push(React.createElement('div', {
          key: 'res',
          className: 'csdiy-toolcard-result' + (block.isError ? ' csdiy-toolcard-result-err' : ''),
        }, truncate(resultText, 1200)))
      } else if (!argsText) {
        bodyChildren.push(React.createElement('div', { key: 'no', className: 'csdiy-toolcard-empty' }, '无输出'))
      }
    } else if (!argsText) {
      bodyChildren.push(React.createElement('div', { key: 'no', className: 'csdiy-toolcard-empty' }, '正在执行…'))
    }
    var subs = (block.subCalls || []).filter(Boolean)
    if (subs.length && props.depth < 2) {
      bodyChildren.push(React.createElement('div', { key: 'sub', className: 'csdiy-toolcard-sub' },
        subs.map(function (s, i) {
          return React.createElement(CsdiyToolCard, {
            key: String(i),
            block: s,
            depth: props.depth + 1,
            inspectCall: props.inspectCall,
          })
        })))
    }
    body = React.createElement('div', { className: 'csdiy-toolcard-body' }, bodyChildren)
  }

  var headChildren = [
    React.createElement('span', { key: 'st', className: statusCls + ' csdiy-toolcard-status' }),
    React.createElement('span', { key: 'nm', className: 'csdiy-toolcard-name' }, name),
  ]
  if (props.inspectCall && block.callId) {
    headChildren.push(React.createElement('button', {
      key: 'ins',
      type: 'button',
      className: 'csdiy-toolcard-inspect',
      onClick: function (e) {
        e.stopPropagation()
        props.inspectCall(block.callId)
      },
    }, '详情'))
  }
  headChildren.push(React.createElement('span', { key: 'meta', className: 'csdiy-toolcard-headmeta' },
    React.createElement('span', null, statusText),
    React.createElement('span', null, open ? '▾' : '▸')))

  return React.createElement('div', { className: 'csdiy-toolcard' },
    React.createElement('div', { className: 'csdiy-toolcard-head', onClick: function () { setOpen(!open) } }, headChildren),
    body,
  )
}


// ---- Plugin (merged pkg-3) ----
return {
  apply(ctx) {
    var theme = ctx.get('theme')
    if (theme !== undefined) {
      theme.overrideTokens('csdiy-ui', {
        '--dsw-alias-bg-base': { light: '#ffffff', dark: '#0d1117' },
        '--dsw-alias-bg-layer-1': { light: '#f6f8fa', dark: '#161b22' },
        '--dsw-alias-bg-layer-2': { light: '#eef1f4', dark: '#21262d' },
        '--dsw-alias-bg-overlay': { light: '#ffffff', dark: '#1c2128' },
        '--dsw-alias-border-l1': { light: '#d0d7de', dark: '#30363d' },
        '--dsw-alias-border-l2': { light: '#afb8c1', dark: '#484f58' },
        '--dsw-alias-brand-primary': { light: '#0ea5e9', dark: '#38bdf8' },
        '--dsw-alias-label-primary': { light: '#1f2328', dark: '#f0f6fc' },
        '--dsw-alias-label-secondary': { light: '#656d76', dark: '#8b949e' },
        '--dsw-alias-state-error-primary': { light: '#cf222e', dark: '#f85149' },
        '--dsw-alias-state-success-primary': { light: '#1a7f37', dark: '#3fb950' },
        '--dsw-alias-state-warn-primary': { light: '#9a6700', dark: '#d29922' },
        '--dsw-specific-sidebar-fill': { light: '#f6f8fa', dark: '#161b22' },
      })
    }

    styles.insert(CSDIY_CSS)
    styles.insert(CSDIY_CHAT_CSS)

    var slots = ctx.get('slots')
    if (slots === undefined) return
    var workspacesSvc = ctx.get('workspaces')
    var sessionsSvc = ctx.get('sessions')

    var addWorkspace = function (onPick) {
      if (workspacesSvc === undefined) return Promise.resolve(null)
      return workspacesSvc.pickDirectory().then(function (path) {
        if (path === null || path === undefined) return null
        return workspacesSvc.create({ path: path }).then(function (view) {
          if (view && view.workspaceId && onPick) onPick(view.workspaceId)
          return view
        })
      })
    }
    var startNewSession = function (workspaceId) {
      if (workspacesSvc === undefined) return
      if (workspaceId === undefined) workspacesSvc.startSession()
      else workspacesSvc.startSession(workspaceId)
    }
    var openSession = function (id) {
      if (sessionsSvc === undefined || id === undefined) return
      sessionsSvc.open(id)
    }

    var HeroEntry = function (props) {
      return React.createElement(CsdiyHero, Object.assign({}, props, {
        onAdd: function () { return addWorkspace(props.onPick) },
      }))
    }
    var SidebarEntry = function (props) {
      return React.createElement(CsdiySidebar, Object.assign({}, props, {
        onNew: startNewSession,
        onOpen: openSession,
      }))
    }
    var registerChatNode = function (key, Comp) {
      return slots.register({ name: 'conversation.chat.node', key: key }, Comp)
    }

    slots.inject('conversation.hero.workspace', function () {
      return slots.register({ name: 'conversation.hero.workspace', id: 'csdiy-hero' }, HeroEntry)
    })
    slots.inject('sidebar.workspaces', function () {
      return slots.register({ name: 'sidebar.workspaces', id: 'csdiy-sidebar' }, SidebarEntry)
    })
    slots.inject('conversation.chat.node', function () {
      var disposers = []
      disposers.push(registerChatNode('user', CsdiyUserNode))
      disposers.push(registerChatNode('assistant-step', CsdiyAssistantNode))
      disposers.push(registerChatNode('tool-call', CsdiyToolNode))
      return function () {
        disposers.forEach(function (d) { if (d) d() })
      }
    })
  },
}
