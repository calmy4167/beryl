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

// ---- Plugin ----
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

    slots.inject('conversation.hero.workspace', function () {
      return slots.register(
        { name: 'conversation.hero.workspace', id: 'csdiy-hero' },
        HeroEntry,
      )
    })
    slots.inject('sidebar.workspaces', function () {
      return slots.register(
        { name: 'sidebar.workspaces', id: 'csdiy-sidebar' },
        SidebarEntry,
      )
    })
  },
}
