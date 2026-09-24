(() => {
  const params = new URLSearchParams(location.search)
  if (params.get('design') !== 'nav-v2') return

  document.documentElement.classList.add('nav-v2')

  const sidebar = document.querySelector('.sidebar')
  const workspace = document.querySelector('.workspace')
  const icon = id => `<svg aria-hidden="true"><use href="#${id}"></use></svg>`
  const groups = [
    { id: 'daily', label: '日常', icon: 'i-home', pages: [['今天', 'i-home'], ['记录', 'i-note'], ['处境', 'i-compass'], ['回顾', 'i-review']] },
    { id: 'work', label: '工作', icon: 'i-panel', pages: [['看板', 'i-panel'], ['任务', 'i-list'], ['目标', 'i-target'], ['日历', 'i-review'], ['飞书', 'i-note'], ['周期', 'i-review']] },
    { id: 'records', label: '内容', icon: 'i-note', pages: [['收集', 'i-note'], ['资料', 'i-book'], ['探索', 'i-compass'], ['日记', 'i-review'], ['文章', 'i-pen']] },
    { id: 'understanding', label: '关系', icon: 'i-compass', pages: [['人物', 'i-home'], ['图谱', 'i-target'], ['记忆', 'i-book']] },
    { id: 'tools', label: '工具', icon: 'i-grid', pages: [['习惯', 'i-review'], ['财务', 'i-panel'], ['专注', 'i-target']] },
    { id: 'experiments', label: '试验', icon: 'i-bulb', pages: [['未来', 'i-bulb'], ['场景', 'i-grid']] },
    { id: 'personal', label: '个人', icon: 'i-settings', pages: [['我的', 'i-home'], ['设置', 'i-settings']] },
  ]
  const groupMarkup = group => `
    <section class="concept-group ${group.id === 'daily' ? 'selected' : ''}" data-group="${group.id}">
      <button class="concept-group-button" type="button" aria-controls="concept-subnav-${group.id}" aria-expanded="false" aria-label="${group.label}，展开页面" title="${group.label}">
        ${icon(group.icon)}<span>${group.label}</span>${icon('i-chevron').replace('<svg ', '<svg class="concept-chevron" ')}
      </button>
      <nav class="concept-subnav" id="concept-subnav-${group.id}" aria-label="${group.label}页面">
        ${group.pages.map(([label, symbol]) => `<button class="concept-child ${label === '今天' ? 'current' : ''}" type="button" ${label === '今天' ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span></button>`).join('')}
      </nav>
    </section>`

  sidebar.innerHTML = `
    <div class="concept-brand"><span class="brand-mark" aria-hidden="true"></span><strong>CALMY</strong></div>
    <div class="concept-groups">
      <p class="concept-overline">导航</p>
      <nav aria-label="功能分组">${groups.map(groupMarkup).join('')}</nav>
    </div>
    <div class="concept-sidebar-foot">
      <button class="concept-directory-trigger" type="button" aria-label="打开全部功能" aria-haspopup="dialog" aria-controls="concept-directory" aria-expanded="false">
        ${icon('i-grid')}<span>全部功能</span>${icon('i-chevron').replace('<svg ', '<svg class="concept-chevron" ')}
      </button>
      <div class="concept-directory" id="concept-directory" role="dialog" aria-label="全部功能">
        <div class="concept-directory-head"><strong>全部功能</strong><button type="button" class="concept-directory-close" aria-label="关闭全部功能">×</button></div>
        <label class="concept-directory-search">${icon('i-search')}<input type="search" aria-label="搜索功能" placeholder="搜索功能…"></label>
        <div class="concept-directory-list">
          ${groups.map(group => `<button type="button" class="concept-directory-item" data-target-group="${group.id}" data-keywords="${group.label} ${group.pages.map(page => page[0]).join(' ')}">${icon(group.icon)}<span><strong>${group.label}</strong><small>${group.pages.map(page => page[0]).join(' · ')}</small></span></button>`).join('')}
        </div>
      </div>
    </div>
    <div class="concept-profile"><span class="avatar">林</span><span><strong>林晓</strong><small>本地空间</small></span></div>`

  const directory = sidebar.querySelector('.concept-directory')
  const directoryTrigger = sidebar.querySelector('.concept-directory-trigger')
  const setDirectory = open => {
    directory.classList.toggle('open', open)
    directoryTrigger.setAttribute('aria-expanded', String(open))
  }
  const closeGroup = () => {
    sidebar.querySelectorAll('.concept-group').forEach(group => {
      group.querySelector('.concept-subnav').classList.remove('open')
      const button = group.querySelector('.concept-group-button')
      button.setAttribute('aria-expanded', 'false')
      button.setAttribute('aria-label', `${button.title}，展开页面`)
    })
  }
  const openGroup = id => {
    const group = sidebar.querySelector(`[data-group="${id}"]`)
    const isOpen = group.querySelector('.concept-subnav').classList.contains('open')
    closeGroup()
    if (isOpen) return
    group.querySelector('.concept-subnav').classList.add('open')
    const button = group.querySelector('.concept-group-button')
    button.setAttribute('aria-expanded', 'true')
    button.setAttribute('aria-label', `${button.title}，收起页面`)
    setDirectory(false)
  }

  sidebar.querySelectorAll('.concept-group-button').forEach(button => button.addEventListener('click', () => openGroup(button.closest('.concept-group').dataset.group)))
  sidebar.querySelectorAll('.concept-directory-item').forEach(button => button.addEventListener('click', () => openGroup(button.dataset.targetGroup)))
  sidebar.querySelectorAll('.concept-child').forEach(button => button.addEventListener('click', () => {
    const group = button.closest('.concept-group')
    sidebar.querySelectorAll('.concept-child').forEach(child => { child.classList.remove('current'); child.removeAttribute('aria-current') })
    button.classList.add('current')
    button.setAttribute('aria-current', 'page')
    sidebar.querySelectorAll('.concept-group').forEach(item => item.classList.toggle('selected', item === group))
    closeGroup()
    group.querySelector('.concept-group-button').focus()
  }))
  directoryTrigger.addEventListener('click', () => { closeGroup(); setDirectory(!directory.classList.contains('open')) })
  sidebar.querySelector('.concept-directory-close').addEventListener('click', () => setDirectory(false))
  sidebar.querySelector('.concept-directory-search input').addEventListener('input', event => {
    const query = event.target.value.trim().toLocaleLowerCase()
    sidebar.querySelectorAll('.concept-directory-item').forEach(item => { item.hidden = !item.dataset.keywords.toLocaleLowerCase().includes(query) })
  })
  document.addEventListener('click', event => {
    if (!event.target.closest?.('.concept-group, .concept-directory-item')) closeGroup()
    if (!event.target.closest?.('.concept-directory, .concept-directory-trigger')) setDirectory(false)
  })
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeGroup(); setDirectory(false) } })
  if (params.get('menu') === 'open') setDirectory(true)

  workspace.querySelector('.topbar').insertAdjacentHTML('afterend', `
    <div class="concept-tabs" role="tablist" aria-label="工作区页面">
      <button class="concept-tab active" role="tab" aria-selected="true" type="button">今天</button>
      <button class="concept-tab" role="tab" aria-selected="false" type="button" draggable="true"><span class="concept-tab-grip" aria-hidden="true">⠿</span>看板</button>
      <button class="concept-tab" role="tab" aria-selected="false" type="button" draggable="true"><span class="concept-tab-grip" aria-hidden="true">⠿</span>记录</button>
    </div>`)
  const tabs = workspace.querySelector('.concept-tabs')
  tabs.querySelectorAll('.concept-tab').forEach(tab => tab.addEventListener('click', () => {
    tabs.querySelectorAll('.concept-tab').forEach(item => { item.classList.remove('active'); item.setAttribute('aria-selected', 'false') })
    tab.classList.add('active')
    tab.setAttribute('aria-selected', 'true')
  }))
  let draggedTab
  tabs.querySelectorAll('[draggable="true"]').forEach(tab => {
    tab.addEventListener('dragstart', event => { draggedTab = tab; tab.classList.add('is-dragging'); event.dataTransfer.effectAllowed = 'move' })
    tab.addEventListener('dragend', () => { tab.classList.remove('is-dragging'); draggedTab = undefined })
    tab.addEventListener('dragover', event => event.preventDefault())
    tab.addEventListener('drop', event => {
      event.preventDefault()
      if (draggedTab && draggedTab !== tab) tabs.insertBefore(draggedTab, tab)
    })
  })
})()
