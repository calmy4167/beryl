import { useState, type DragEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { FeishuRecord, FeishuTableKey } from '@/core/api/feishu'
import { boundField, fieldValue, relationIds, statusOptions, valueText, type FieldRole } from '@/core/feishu/model'
import type { WorkspaceSnapshot } from '@/core/feishu/workspace'
import { todayKey } from '@/core/storage'
import { addFeishuTaskToToday, feishuWorkspace, useFeishuToday, useFeishuWorkspace } from './feishu-workspace'
import { Button, PageHead } from './ui'

function value(snapshot: WorkspaceSnapshot, table: FeishuTableKey, record: FeishuRecord, role: FieldRole): unknown {
  return fieldValue(record, snapshot.fields[table] || [], snapshot.bindings[table] || {}, role)
}
function label(snapshot: WorkspaceSnapshot, table: FeishuTableKey, record: FeishuRecord, role: FieldRole): string {
  const raw = value(snapshot, table, record, role)
  const target = role === 'project' ? 'projects' : table === 'tasks' && role === 'owner' ? 'members' : null
  if (target) {
    const names = relationIds(raw).map(id => {
      const item = snapshot.tables[target].find(candidate => candidate.record_id === id)
      return item ? valueText(value(snapshot, target, item, 'title')) || id : id
    })
    if (names.length) return names.join('、')
  }
  return valueText(raw)
}
function title(snapshot: WorkspaceSnapshot, table: FeishuTableKey, record: FeishuRecord): string {
  return label(snapshot, table, record, 'title') || '标题字段未识别'
}
function dateLabel(raw: unknown): string {
  if (raw == null || raw === '') return '无截止日期'
  const text = valueText(raw)
  const date = new Date(/^\d+$/.test(text) ? Number(text) : text)
  return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString('zh-CN')
}
function notify(message: string, kind: 'success' | 'warning' | 'error' = 'success') {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

export function FeishuReadState({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const cacheTime = snapshot.cacheUpdatedAt ? new Date(snapshot.cacheUpdatedAt).toLocaleString('zh-CN') : ''
  return <>
    <section className="feishu-read-state" aria-label="飞书连接状态">
      <span role="status">{snapshot.saving ? '正在写入飞书…' : snapshot.loading ? cacheTime ? `正在检查更新 · 当前显示 ${cacheTime} 的本机缓存` : '正在连接飞书并读取数据…' : snapshot.error ? cacheTime ? `飞书暂不可用 · 当前显示 ${cacheTime} 的本机缓存（只读）` : '飞书未连接，尚无本机缓存' : snapshot.usingCache && cacheTime ? `部分数据来自本机缓存 · ${cacheTime}` : snapshot.lastRead ? `上次读取 ${new Date(snapshot.lastRead).toLocaleTimeString('zh-CN')}` : '尚未读取飞书数据'}</span>
      <Button disabled={snapshot.loading || snapshot.saving} onClick={() => void feishuWorkspace.refresh()}>刷新</Button>
    </section>
    {snapshot.error && <section className="beryl-card empty-state" role="alert"><b>飞书连接暂不可用</b><p>{snapshot.error}</p><small>{cacheTime ? `下方内容来自本机缓存，更新时间：${cacheTime}。当前只能查看，不能修改飞书数据。` : '没有可显示的本机缓存；连接恢复后可重新读取飞书数据。'}</small><p><Link to="/app/admin">检查 Worker 地址与同步密码</Link></p></section>}
    {snapshot.writeError && <p className="beryl-card feishu-message" role="alert">{snapshot.writeError}</p>}
  </>
}

function TaskComposer({ snapshot, today = false }: { snapshot: WorkspaceSnapshot; today?: boolean }) {
  const [draft, setDraft] = useState('')
  const [projectId, setProjectId] = useState('')
  const [message, setMessage] = useState('')
  const titleField = boundField(snapshot.fields.tasks || [], snapshot.bindings.tasks || {}, 'title')
  const projectField = boundField(snapshot.fields.tasks || [], snapshot.bindings.tasks || {}, 'project')
  const canCreate = snapshot.ready && titleField?.type === 1
  async function create() {
    if (!draft.trim() || !canCreate || snapshot.saving) return
    setMessage('')
    try {
      const workspaceId = snapshot.workspaceId
      const recordId = await feishuWorkspace.createTask(draft, projectId)
      setDraft(''); setProjectId('')
      let result = '任务已保存到飞书。'
      if (today) {
        try { addFeishuTaskToToday(workspaceId, recordId); result += '已加入今天。' }
        catch (cause) { result += cause instanceof Error ? cause.message : '今日选择未保存。'; notify(result, 'warning'); setMessage(result); return }
      }
      setMessage(result); notify(result)
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : '任务保存未确认'); notify('飞书保存未确认，输入已保留，请先检查飞书。', 'error') }
  }
  return <section className="beryl-card feishu-composer" aria-label="创建飞书任务">
    <label>任务标题<textarea aria-label="飞书任务标题" value={draft} disabled={snapshot.saving} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void create() } }} placeholder="只写一个可以去做的下一步…" /></label>
    <div className="create-row"><label>项目（可选）<select aria-label="飞书任务关联项目" value={projectId} disabled={snapshot.saving || !!snapshot.tableErrors.projects || !projectField || ![18, 21].includes(projectField.type)} onChange={event => setProjectId(event.target.value)}><option value="">不关联项目</option>{snapshot.tables.projects.map(record => <option key={record.record_id} value={record.record_id}>{title(snapshot, 'projects', record)}</option>)}</select></label><Button className="primary" disabled={!draft.trim() || !canCreate || snapshot.saving} onClick={() => void create()}>{snapshot.saving ? '正在保存…' : today ? '保存到飞书并加入今天' : '保存到飞书'}</Button></div>
    {snapshot.ready && !canCreate && <p role="alert">任务标题字段缺失或类型已变化，暂不能新增。</p>}
    <small>不要求日期或优先级；不会另建本地行动。Ctrl / ⌘ + Enter 保存。</small>
    {message && <p role="status">{message}</p>}
  </section>
}

function TaskCard({ snapshot, record, children, onOpen }: { snapshot: WorkspaceSnapshot; record: FeishuRecord; children?: ReactNode; onOpen?: (record: FeishuRecord) => void }) {
  const status = label(snapshot, 'tasks', record, 'status') || '未设置'
  const statusField = boundField(snapshot.fields.tasks || [], snapshot.bindings.tasks || {}, 'status')
  const options = statusField?.type === 3 ? statusField.property?.options?.map(item => item.name) || [] : []
  const selectable = [...new Set([status, ...options])]
  const [error, setError] = useState('')
  return <article className="task-board-card beryl-card" draggable onDragStart={event => { event.dataTransfer.setData('text/plain', record.record_id); event.dataTransfer.effectAllowed = 'move' }}>
    <div className="task-board-card-top"><span className={`action-status ${status === '已完成' ? 'done' : status === '进行中' ? 'in_progress' : 'planned'}`}>{status}</span><span>飞书</span></div>
    <h3>{title(snapshot, 'tasks', record)}</h3>
    <small>{label(snapshot, 'tasks', record, 'project') || '未关联项目'} · {dateLabel(value(snapshot, 'tasks', record, 'due'))}</small>
    {label(snapshot, 'tasks', record, 'owner') && <small>执行人：{label(snapshot, 'tasks', record, 'owner')}</small>}
    {label(snapshot, 'tasks', record, 'body') && <details><summary>已有解决方案</summary><p>{label(snapshot, 'tasks', record, 'body')}</p></details>}
    <label>状态<select aria-label={`${title(snapshot, 'tasks', record)}状态`} value={status} disabled={!snapshot.ready || snapshot.saving || !options.length} onChange={event => { setError(''); void feishuWorkspace.changeStatus(record.record_id, event.target.value).catch(cause => setError(cause instanceof Error ? cause.message : '保存失败')) }}>{selectable.map(name => <option key={name} value={name} disabled={!options.includes(name)}>{name}</option>)}</select></label>
    {onOpen && <button type="button" className="feishu-detail-link" onClick={() => onOpen(record)}>打开详情 →</button>}
    {error && <small role="alert">{error}</small>}{children}
  </article>
}

export function FeishuCaptureView() {
  const snapshot = useFeishuWorkspace()
  return <div className="feishu-page"><PageHead eyebrow="记录 · 飞书" title="快速记下一项任务" description="这里明确创建飞书任务。通用想法和原文仍可切换到本地记录保存。" /><FeishuReadState snapshot={snapshot} /><TaskComposer snapshot={snapshot} /><p><Link to="/app/today">去今天选择任务 →</Link>　<Link to="/app/task-board">查看看板 →</Link></p></div>
}

export function FeishuTodayView() {
  const snapshot = useFeishuWorkspace()
  const { ids, save, error } = useFeishuToday(snapshot.workspaceId)
  const [query, setQuery] = useState('')
  const selected = ids.flatMap(id => { const record = snapshot.tables.tasks.find(item => item.record_id === id); return record ? [record] : [] })
  const candidates = snapshot.tables.tasks.filter(record => !ids.includes(record.record_id) && label(snapshot, 'tasks', record, 'status') !== '已完成' && (!query.trim() || title(snapshot, 'tasks', record).toLowerCase().includes(query.trim().toLowerCase())))
  const missing = snapshot.ready ? ids.filter(id => !snapshot.tables.tasks.some(item => item.record_id === id)) : []
  return <div className="feishu-page"><PageHead eyebrow={`今天 · 飞书 · ${todayKey()}`} title="今天，先做一件事" description="从飞书任务中选 1 项主任务、最多 2 项备选。选择只保存在本机，不会修改任务截止日期。" /><FeishuReadState snapshot={snapshot} />
    {error && <p role="alert">{error}</p>}
    <section className="feishu-today-focus" aria-label="今天选择的飞书任务">
      {selected.map(record => <div key={record.record_id}><h2>{record.record_id === ids[0] ? '现在先做' : '有余力再做'}</h2><TaskCard snapshot={snapshot} record={record}><div className="feishu-card-actions">{record.record_id !== ids[0] && <Button disabled={!snapshot.ready} onClick={() => save([record.record_id, ...ids.filter(id => id !== record.record_id)])}>设为主任务</Button>}<Button disabled={!snapshot.ready} onClick={() => save(ids.filter(id => id !== record.record_id))}>移出今天</Button></div></TaskCard></div>)}
      {!selected.length && <section className="beryl-card empty-state"><b>先选一项值得做的任务</b><p>无日期的任务也能加入今天，不必先填完整表单。</p></section>}
      {missing.map(id => <p className="beryl-card feishu-message" key={id}>所选任务 {id} 已删除或不在当前视图中。<Button onClick={() => save(ids.filter(item => item !== id))}>移除引用</Button></p>)}
    </section>
    <details className="beryl-card feishu-candidates" open={!ids.length}><summary>从飞书选择任务（已选 {ids.length}/3）</summary><input aria-label="搜索今日候选飞书任务" placeholder="搜索任务…" value={query} onChange={event => setQuery(event.target.value)} /><div className="feishu-record-grid">{candidates.map(record => <TaskCard key={record.record_id} snapshot={snapshot} record={record}><Button disabled={!snapshot.ready || ids.length >= 3} onClick={() => save([...ids, record.record_id])}>加入今天</Button></TaskCard>)}</div>{snapshot.ready && !candidates.length && <p>没有匹配的待选任务。</p>}</details>
    <h2>快速新增</h2><TaskComposer snapshot={snapshot} today />
  </div>
}

function TaskBoard({ snapshot, records, onOpen }: { snapshot: WorkspaceSnapshot; records: FeishuRecord[]; onOpen?: (record: FeishuRecord) => void }) {
  const columns = statusOptions(snapshot.fields.tasks || [], snapshot.bindings.tasks || {}, records)
  const [dropTarget, setDropTarget] = useState('')
  async function drop(status: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const recordId = event.dataTransfer.getData('text/plain')
    setDropTarget('')
    const record = records.find(item => item.record_id === recordId)
    if (!record || label(snapshot, 'tasks', record, 'status') === status || snapshot.saving) return
    try { await feishuWorkspace.changeStatus(recordId, status); notify(`已将任务移到「${status}」`) }
    catch (cause) { notify(cause instanceof Error ? cause.message : '拖拽保存未确认', 'error') }
  }
  return <section className="task-board feishu-task-board" aria-label="飞书任务看板">{columns.map(status => {
    const items = records.filter(record => (label(snapshot, 'tasks', record, 'status') || '未设置') === status)
    return <div className={`task-board-column ${dropTarget === status ? 'drop-active' : ''}`} key={status} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(status) }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget('') }} onDrop={event => void drop(status, event)}><div className="task-board-column-head"><div><h2>{status}</h2><small>拖到这里即可更新飞书</small></div><span>{items.length}</span></div><div className="task-board-column-body">{items.map(record => <TaskCard key={record.record_id} snapshot={snapshot} record={record} onOpen={onOpen} />)}{!items.length && <p className="task-board-empty">拖拽任务到这里</p>}</div></div>
  })}{!columns.length && <p>尚无任务或状态选项。</p>}</section>
}

function Projects({ snapshot, query }: { snapshot: WorkspaceSnapshot; query: string }) {
  const [expanded, setExpanded] = useState('')
  const records = snapshot.tables.projects.filter(record => !query || title(snapshot, 'projects', record).toLowerCase().includes(query))
  return <section className="feishu-record-grid" aria-label="飞书项目列表">{records.map(record => {
    const tasks = snapshot.tables.tasks.filter(task => relationIds(value(snapshot, 'tasks', task, 'project')).includes(record.record_id))
    return <article className="beryl-card feishu-record-card" key={record.record_id}><small>{label(snapshot, 'projects', record, 'status') || '未设置状态'}</small><h2>{title(snapshot, 'projects', record)}</h2><p>{label(snapshot, 'projects', record, 'body') || '未填写目标'}</p><small>截止：{dateLabel(value(snapshot, 'projects', record, 'due'))}</small><p>飞书完成度：{label(snapshot, 'projects', record, 'progress') || '—'} · 已读取 {tasks.length} 项关联任务</p><Button aria-expanded={expanded === record.record_id} onClick={() => setExpanded(expanded === record.record_id ? '' : record.record_id)}>查看关联任务</Button>{expanded === record.record_id && <div className="feishu-project-tasks">{tasks.map(task => <TaskCard key={task.record_id} record={task} snapshot={snapshot} />)}{!tasks.length && <p>当前视图没有关联任务。</p>}</div>}</article>
  })}{!records.length && <p>尚无匹配项目。</p>}</section>
}

function TaskTable({ snapshot, records, onOpen }: { snapshot: WorkspaceSnapshot; records: FeishuRecord[]; onOpen: (record: FeishuRecord) => void }) {
  return <div className="feishu-table-wrap"><table className="feishu-table"><thead><tr><th>任务</th><th>状态</th><th>所属项目</th><th>截止时间</th><th>执行人</th></tr></thead><tbody>{records.map(record => <tr key={record.record_id} onClick={() => onOpen(record)}><td><b>{title(snapshot, 'tasks', record)}</b></td><td><span className="feishu-table-status">{label(snapshot, 'tasks', record, 'status') || '未设置'}</span></td><td>{label(snapshot, 'tasks', record, 'project') || '—'}</td><td>{dateLabel(value(snapshot, 'tasks', record, 'due'))}</td><td>{label(snapshot, 'tasks', record, 'owner') || '—'}</td></tr>)}</tbody></table>{!records.length && <p className="task-board-empty">尚无匹配任务。</p>}</div>
}

function TaskDetail({ snapshot, record, onClose }: { snapshot: WorkspaceSnapshot; record: FeishuRecord; onClose: () => void }) {
  const fields = snapshot.fields.tasks || []
  return <aside className="feishu-detail-panel" aria-label="飞书任务详情"><div className="feishu-detail-head"><div><small>任务详情 · 飞书原记录</small><h2>{title(snapshot, 'tasks', record)}</h2></div><button type="button" aria-label="关闭详情" onClick={onClose}>×</button></div><div className="feishu-detail-fields">{fields.map(field => <div key={field.field_id}><small>{field.field_name}</small><p>{valueText(record.fields[field.field_name]) || '未填写'}</p></div>)}</div><small className="feishu-detail-id">record_id：{record.record_id}</small></aside>
}

export function FeishuBoardView({ initialTable = 'tasks', allTables = false }: { initialTable?: FeishuTableKey; allTables?: boolean }) {
  const snapshot = useFeishuWorkspace()
  const [table, setTable] = useState(initialTable)
  const [view, setView] = useState<'board' | 'table'>('board')
  const [selected, setSelected] = useState<FeishuRecord>()
  const [query, setQuery] = useState('')
  const choices: FeishuTableKey[] = allTables ? ['tasks', 'projects', 'reviews', 'members'] : ['tasks', 'projects']
  const labels = { tasks: '任务', projects: '项目', reviews: '周报', members: '成员' }
  const normalized = query.trim().toLowerCase()
  const records = snapshot.tables[table].filter(record => !normalized || Object.values(record.fields).map(valueText).join(' ').toLowerCase().includes(normalized))
  return <div className="feishu-page"><PageHead eyebrow="飞书 · 工作区" title={allTables ? '飞书' : initialTable === 'projects' ? '项目' : '任务'} description="与记录、今天共用飞书数据。项目、周报和成员只读；任务可新增、修改状态。" /><FeishuReadState snapshot={snapshot} />
    <section className="beryl-card feishu-overview"><div className="range-tabs" role="tablist" aria-label="飞书数据表">{choices.map(key => <button type="button" role="tab" aria-selected={key === table} className={key === table ? 'on' : ''} key={key} onClick={() => setTable(key)}>{labels[key]} {snapshot.tables[key].length}</button>)}</div></section>
    <input className="feishu-search" aria-label="搜索飞书数据" placeholder="搜索…" value={query} onChange={event => setQuery(event.target.value)} />
    {snapshot.tableErrors[table] && <p role="alert">{labels[table]}：{snapshot.tableErrors[table]}。已读数据仅供参考。</p>}
    {table === 'tasks' ? <><TaskComposer snapshot={snapshot} /><div className="feishu-view-switch" role="group" aria-label="任务视图"><button type="button" className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>看板</button><button type="button" className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>表格</button></div>{view === 'board' ? <TaskBoard snapshot={snapshot} records={records} onOpen={setSelected} /> : <TaskTable snapshot={snapshot} records={records} onOpen={setSelected} />}</> : table === 'projects' ? <Projects snapshot={snapshot} query={normalized} /> : <section className="feishu-record-grid" aria-label={`飞书${labels[table]}列表`}>{records.map(record => <article className="beryl-card feishu-record-card" key={record.record_id}><h2>{title(snapshot, table, record)}</h2><p>{label(snapshot, table, record, 'body') || '暂无内容'}</p><small>{label(snapshot, table, record, 'owner')}{table === 'reviews' && ` · ${dateLabel(value(snapshot, table, record, 'due'))}`}</small></article>)}{!records.length && <p>尚无匹配记录。</p>}</section>}
    {selected && snapshot.tables.tasks.some(item => item.record_id === selected.record_id) && <TaskDetail snapshot={snapshot} record={snapshot.tables.tasks.find(item => item.record_id === selected.record_id) || selected} onClose={() => setSelected(undefined)} />}
  </div>
}
