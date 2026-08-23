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

// ---- Plugin ----
return {
  apply(ctx) {
    styles.insert(CSDIY_CHAT_CSS)
    var slots = ctx.get('slots')
    if (slots === undefined) return
    var register = function (key, Comp) {
      return slots.register({ name: 'conversation.chat.node', key: key }, Comp)
    }
    slots.inject('conversation.chat.node', function () {
      var disposers = []
      disposers.push(register('user', CsdiyUserNode))
      disposers.push(register('assistant-step', CsdiyAssistantNode))
      disposers.push(register('tool-call', CsdiyToolNode))
      return function () {
        disposers.forEach(function (d) { if (d) d() })
      }
    })
  },
}
