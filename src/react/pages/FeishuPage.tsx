import { useEffect, useMemo, useState } from 'react'
import { createFeishuRecord, listAllFeishuRecords, updateFeishuRecord, type FeishuRecordResponse, type FeishuTableKey } from '@/core/api/feishu'
import { sync } from '@/core/sync'
import { Button, PageHead } from '../ui'

type FeishuRecord = NonNullable<FeishuRecordResponse['items']>[number]
type TaskStatus = '未开始' | '进行中' | '已完成' | '已停滞'
type ProjectStatus = '未启动' | '推进中' | '已完成'

const tableKeys: FeishuTableKey[] = ['tasks', 'projects', 'reviews', 'members']
const tableLabels: Record<FeishuTableKey, string> = { tasks: '任务', projects: '项目', reviews: '周报', members: '成员' }
const taskColumns: Array<{ status: TaskStatus; label: string; hint: string }> = [
  { status: '未开始', label: '未开始', hint: '还没有开始处理' },
  { status: '进行中', label: '进行中', hint: '正在推进' },
  { status: '已完成', label: '已完成', hint: '已经完成' },
  { status: '已停滞', label: '已停滞', hint: '需要重新判断下一步' },
]
const projectColumns: Array<{ status: ProjectStatus; hint: string }> = [
  { status: '推进中', hint: '正在推进的长期事项' },
  { status: '未启动', hint: '尚未开始的计划' },
  { status: '已完成', hint: '已经收尾的项目' },
]

function text(value: unknown): string {
  if (value == null || value === '') return ''
  if (Array.isArray(value)) return value.map(item => text(item)).filter(Boolean).join('、')
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>
    return text(item.text ?? item.name ?? item.value ?? item.display_name ?? item.title) || JSON.stringify(value)
  }
  return String(value)
}

function field(record: FeishuRecord, name: string): string { return text(record.fields?.[name]) }

function firstField(record: FeishuRecord, ...names: string[]): string {
  for (const name of names) {
    const result = field(record, name)
    if (result) return result
  }
  return ''
}

function dateLabel(value: string): string {
  if (!value) return '未设置日期'
  const timestamp = Number(value)
  const date = Number.isFinite(timestamp) ? new Date(timestamp) : new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function projectStatusClass(status: ProjectStatus): string {
  if (status === '已完成') return 'done'
  return status === '推进中' ? 'in_progress' : 'planned'
}

function clientConfig() {
  const cloud = sync.saved.cloud
  return cloud?.url && cloud.key ? { baseUrl: cloud.url, syncKey: cloud.key } : null
}

export function FeishuPage() {
  const [tables, setTables] = useState<Record<FeishuTableKey, FeishuRecord[]>>({ tasks: [], projects: [], reviews: [], members: [] })
  const [activeTable, setActiveTable] = useState<FeishuTableKey>('tasks')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [query, setQuery] = useState('')

  async function refresh() {
    const config = clientConfig()
    if (!config) {
      setLoading(false)
      setError('请先在“设置与同步”中连接 Calmy Worker，并完成飞书配置。')
      return
    }
    setLoading(true)
    setError('')
    try {
      const results = await Promise.all(tableKeys.map(async table => ({ table, result: await listAllFeishuRecords(config, table) })))
      const next = {} as Record<FeishuTableKey, FeishuRecord[]>
      for (const { table, result } of results) next[table] = result.items || []
      setTables(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '飞书数据读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleTasks = useMemo(() => tables.tasks.filter(record => !normalizedQuery || `${firstField(record, '任务', '任务名称')} ${field(record, '所属项目')} ${field(record, '解决方案')}`.toLocaleLowerCase().includes(normalizedQuery)), [normalizedQuery, tables.tasks])
  const visibleProjects = useMemo(() => tables.projects.filter(record => !normalizedQuery || `${firstField(record, '项目名称', '项目')} ${field(record, '目标')} ${field(record, '成员')}`.toLocaleLowerCase().includes(normalizedQuery)), [normalizedQuery, tables.projects])
  const visibleReviews = useMemo(() => tables.reviews.filter(record => !normalizedQuery || `${firstField(record, '汇报标题', '周报')} ${field(record, '所属项目')} ${field(record, '进度内容')}`.toLocaleLowerCase().includes(normalizedQuery)), [normalizedQuery, tables.reviews])
  const visibleMembers = useMemo(() => tables.members.filter(record => !normalizedQuery || `${firstField(record, '成员名', '成员')} ${field(record, '部门')} ${field(record, '任务')}`.toLocaleLowerCase().includes(normalizedQuery)), [normalizedQuery, tables.members])

  async function addTask() {
    const config = clientConfig()
    const normalized = title.trim()
    if (!config || !normalized || saving) return
    setSaving(true)
    try {
      await createFeishuRecord(config, 'tasks', { 任务: normalized, 状态: '未开始' })
      setTitle('')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '飞书任务创建失败')
    } finally { setSaving(false) }
  }

  async function changeTaskStatus(record: FeishuRecord, status: TaskStatus) {
    const config = clientConfig()
    if (!config || saving || field(record, '状态') === status) return
    setSaving(true)
    try {
      await updateFeishuRecord(config, 'tasks', record.record_id, { 状态: status })
      setTables(current => ({ ...current, tasks: current.tasks.map(item => item.record_id === record.record_id ? { ...item, fields: { ...item.fields, 状态: status } } : item) }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '飞书任务状态更新失败')
      await refresh()
    } finally { setSaving(false) }
  }

  const activeCount = activeTable === 'tasks' ? visibleTasks.length : activeTable === 'projects' ? visibleProjects.length : activeTable === 'reviews' ? visibleReviews.length : visibleMembers.length

  return <div className="feishu-page">
    <PageHead eyebrow="FEISHU · PROJECT WORKSPACE" title="飞书工作台" description="数据保存在飞书；Calmy 只提供更轻、更适合行动的项目、任务与复盘界面。">
      <Button onClick={() => void refresh()} disabled={loading}>重新读取</Button>
    </PageHead>
    <section className="beryl-card feishu-overview" aria-label="飞书工作台概览">
      <div className="range-tabs" role="tablist" aria-label="飞书数据表">
        {tableKeys.map(table => <button type="button" role="tab" aria-selected={activeTable === table} className={activeTable === table ? 'on' : ''} key={table} onClick={() => setActiveTable(table)}>{tableLabels[table]} <small>{tables[table].length}</small></button>)}
      </div>
      <span>{loading ? '正在同步飞书数据…' : `当前显示 ${activeCount} 条${tableLabels[activeTable]}`}</span>
    </section>
    <section className="beryl-card task-board-toolbar" aria-label="飞书工作台工具栏">
      <input aria-label="搜索飞书数据" value={query} onChange={event => setQuery(event.target.value)} placeholder={`搜索${tableLabels[activeTable]}…`} />
      {activeTable === 'tasks' && <><input aria-label="新增飞书任务" value={title} onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void addTask() }} placeholder="新增任务" /><Button className="primary" disabled={!title.trim() || saving} onClick={() => void addTask()}>新增任务</Button></>}
      {activeTable !== 'tasks' && <span className="feishu-read-hint">当前先以浏览为主，避免意外修改飞书主数据。</span>}
    </section>
    {error && <section className="beryl-card empty-state" role="alert"><b>飞书数据暂时无法读取</b><p>{error}</p><small>需要配置 Worker 的飞书 App ID、App Secret、Base Token 和对应表 ID。</small></section>}
    {loading ? <div className="empty-state" role="status">正在读取飞书数据…</div> : activeTable === 'tasks' ? <section className="task-board feishu-task-board" aria-label="飞书任务看板">
      {taskColumns.map(column => {
        const items = visibleTasks.filter(record => (field(record, '状态') || '未开始') === column.status)
        return <div className="task-board-column" key={column.status}>
          <div className="task-board-column-head"><div><h2>{column.label}</h2><small>{column.hint}</small></div><span>{items.length}</span></div>
          <div className="task-board-column-body">
            {items.map(record => <article className="task-board-card beryl-card" key={record.record_id}>
              <div className="task-board-card-top"><span className={`action-status ${column.status === '已完成' ? 'done' : column.status === '进行中' ? 'in_progress' : column.status === '已停滞' ? 'skipped' : 'planned'}`}>{column.label}</span><span className="task-drag-hint" aria-hidden="true">飞书</span></div>
              <h3>{firstField(record, '任务', '任务名称') || '未命名任务'}</h3>
              <small>{dateLabel(field(record, '截止时间'))} · {field(record, '所属项目') || '未关联项目'}</small>
              {field(record, '任务执行人') && <small>执行人：{field(record, '任务执行人')}</small>}
              <div className="task-board-card-footer"><label>状态<select aria-label={`${firstField(record, '任务', '任务名称') || '任务'}状态`} value={field(record, '状态') || '未开始'} disabled={saving} onChange={event => void changeTaskStatus(record, event.target.value as TaskStatus)}>{taskColumns.map(option => <option key={option.status} value={option.status}>{option.label}</option>)}</select></label></div>
            </article>)}
            {!items.length && <div className="task-board-empty">这里暂时没有任务</div>}
          </div>
        </div>
      })}
    </section> : activeTable === 'projects' ? <section className="task-board feishu-project-board" aria-label="飞书项目看板">
      {projectColumns.map(column => {
        const items = visibleProjects.filter(record => (field(record, '状态') || '未启动') === column.status)
        return <div className="task-board-column" key={column.status}>
          <div className="task-board-column-head"><div><h2>{column.status}</h2><small>{column.hint}</small></div><span>{items.length}</span></div>
          <div className="task-board-column-body">
            {items.map(record => <article className="task-board-card beryl-card" key={record.record_id}>
              <div className="task-board-card-top"><span className={`action-status ${projectStatusClass(column.status)}`}>{column.status}</span><span className="task-drag-hint" aria-hidden="true">项目</span></div>
              <h3>{firstField(record, '项目名称', '项目') || '未命名项目'}</h3>
              {field(record, '目标') && <small>{field(record, '目标')}</small>}
              <small>截止：{dateLabel(field(record, '项目截止时间'))}</small>
              <div className="task-board-card-footer"><span>完成度 {field(record, '任务完成度') || '—'}</span><span>{field(record, '任务数量') || '0'} 项任务</span></div>
            </article>)}
            {!items.length && <div className="task-board-empty">这里暂时没有项目</div>}
          </div>
        </div>
      })}
    </section> : activeTable === 'reviews' ? <section className="feishu-record-grid" aria-label="飞书周报列表">
      {visibleReviews.map(record => <article className="beryl-card feishu-record-card" key={record.record_id}><small>{dateLabel(field(record, '日期'))} · {field(record, '所属项目') || '未关联项目'}</small><h2>{firstField(record, '汇报标题', '周报') || '未命名周报'}</h2><p>{field(record, '进度内容') || '尚未填写进度内容。'}</p><footer>{field(record, '汇报人') || '未填写汇报人'}</footer></article>)}
      {!visibleReviews.length && <div className="task-board-empty">这里暂时没有周报</div>}
    </section> : <section className="feishu-record-grid" aria-label="飞书成员列表">
      {visibleMembers.map(record => <article className="beryl-card feishu-record-card" key={record.record_id}><small>{field(record, '部门') || '未设置部门'}</small><h2>{firstField(record, '成员名', '成员') || '未命名成员'}</h2><p>{field(record, '任务') ? `关联任务：${field(record, '任务')}` : '暂未关联任务。'}</p><footer>{field(record, '账号') || '未关联账号'}</footer></article>)}
      {!visibleMembers.length && <div className="task-board-empty">这里暂时没有成员</div>}
    </section>}
  </div>
}
