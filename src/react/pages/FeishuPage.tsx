import { useEffect, useMemo, useState } from 'react'
import { createFeishuRecord, listFeishuRecords, updateFeishuRecord, type FeishuRecordResponse } from '@/core/api/feishu'
import { sync } from '@/core/sync'
import { Button, PageHead } from '../ui'

type FeishuRecord = NonNullable<FeishuRecordResponse['items']>[number]
type FeishuStatus = '未开始' | '进行中' | '已完成' | '已停滞'

const columns: Array<{ status: FeishuStatus; label: string; hint: string }> = [
  { status: '未开始', label: '未开始', hint: '还没有开始处理' },
  { status: '进行中', label: '进行中', hint: '正在推进' },
  { status: '已完成', label: '已完成', hint: '已经完成' },
  { status: '已停滞', label: '已停滞', hint: '需要重新判断下一步' },
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

function field(record: FeishuRecord, name: string): string {
  return text(record.fields?.[name])
}

function firstField(record: FeishuRecord, ...names: string[]): string {
  for (const name of names) {
    const value = field(record, name)
    if (value) return value
  }
  return ''
}

function dateLabel(value: string): string {
  if (!value) return '未设置日期'
  const timestamp = Number(value)
  const date = Number.isFinite(timestamp) ? new Date(timestamp) : new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function clientConfig() {
  const cloud = sync.saved.cloud
  return cloud?.url && cloud.key ? { baseUrl: cloud.url, syncKey: cloud.key } : null
}

export function FeishuPage() {
  const [records, setRecords] = useState<FeishuRecord[]>([])
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
      const result = await listFeishuRecords(config, 'tasks', 'page_size=500')
      setRecords(result.items || [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '飞书任务读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return records.filter(record => !normalized || `${firstField(record, '任务', '任务名称')} ${field(record, '所属项目')} ${field(record, '解决方案')}`.toLocaleLowerCase().includes(normalized))
  }, [query, records])

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

  async function changeStatus(record: FeishuRecord, status: FeishuStatus) {
    const config = clientConfig()
    if (!config || saving || field(record, '状态') === status) return
    setSaving(true)
    try {
      await updateFeishuRecord(config, 'tasks', record.record_id, { 状态: status })
      setRecords(current => current.map(item => item.record_id === record.record_id ? { ...item, fields: { ...item.fields, 状态: status } } : item))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '飞书任务状态更新失败')
      await refresh()
    } finally { setSaving(false) }
  }

  return <div className="feishu-page">
    <PageHead eyebrow="FEISHU · PROJECT WORKSPACE" title="飞书任务工作台" description="数据保存在飞书，这里只提供更轻、更适合行动的表格和看板界面。">
      <Button onClick={() => void refresh()}>重新读取</Button>
    </PageHead>
    <section className="beryl-card task-board-toolbar" aria-label="飞书任务工具栏">
      <input aria-label="搜索飞书任务" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索任务、项目或解决方案…" />
      <input aria-label="新增飞书任务" value={title} onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void addTask() }} placeholder="新增任务名称" />
      <Button className="primary" disabled={!title.trim() || saving} onClick={() => void addTask()}>新增任务</Button>
      <span className="task-board-count">{loading ? '正在读取…' : `${visible.length} 条任务`}</span>
    </section>
    {error && <section className="beryl-card empty-state" role="alert"><b>飞书数据暂时无法读取</b><p>{error}</p><small>需要配置 Worker 的飞书 App ID、App Secret、Base Token 和任务表 ID。</small></section>}
    {loading ? <div className="empty-state" role="status">正在读取飞书任务…</div> : <section className="task-board" aria-label="飞书任务看板">
      {columns.map(column => {
        const items = visible.filter(record => (field(record, '状态') || '未开始') === column.status)
        return <div className="task-board-column" key={column.status}>
          <div className="task-board-column-head"><div><h2>{column.label}</h2><small>{column.hint}</small></div><span>{items.length}</span></div>
          <div className="task-board-column-body">
            {items.map(record => <article className="task-board-card beryl-card" key={record.record_id}>
              <div className="task-board-card-top"><span className={`action-status ${column.status === '已完成' ? 'done' : column.status === '进行中' ? 'in_progress' : column.status === '已停滞' ? 'skipped' : 'planned'}`}>{column.label}</span><span className="task-drag-hint" aria-hidden="true">飞书</span></div>
              <h3>{firstField(record, '任务', '任务名称') || '未命名任务'}</h3>
              <small>{dateLabel(field(record, '截止时间'))} · {field(record, '所属项目') || '未关联项目'}</small>
              {field(record, '任务执行人') && <small>执行人：{field(record, '任务执行人')}</small>}
              <div className="task-board-card-footer"><label>状态<select aria-label={`${firstField(record, '任务', '任务名称') || '任务'}状态`} value={field(record, '状态') || '未开始'} disabled={saving} onChange={event => void changeStatus(record, event.target.value as FeishuStatus)}>{columns.map(option => <option key={option.status} value={option.status}>{option.label}</option>)}</select></label></div>
            </article>)}
            {!items.length && <div className="task-board-empty">这里暂时没有任务</div>}
          </div>
        </div>
      })}
    </section>}
  </div>
}
