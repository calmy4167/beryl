import { useEffect, useMemo, useState } from 'react'
import { withSaveState } from '@/core/save-state'
import { recordAsyncRepository } from '@/domain/record/repository'
import type { RealityRecord } from '@/domain/record/model'
import { unifiedAsyncRepository, unifiedFactories } from '@/domain/unified'
import type { Insight } from '@/domain/unified'

type MemoryLayer = 'fact' | 'reflection' | 'ai_inference' | 'preference' | 'principle'

const layers: Array<{ value: MemoryLayer; label: string; hint: string }> = [
  { value: 'fact', label: '事实', hint: '你记录过的发生' },
  { value: 'reflection', label: '反思', hint: '复盘后留下的理解' },
  { value: 'ai_inference', label: 'AI 推断', hint: '可确认、修改或否认' },
  { value: 'preference', label: '偏好', hint: '只在你确认后保留' },
  { value: 'principle', label: '原则', hint: '只在你确认后保留' },
]

const toast = (message: string, kind: 'success' | 'warning' | 'error' = 'success') => {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

function dateLabel(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(timestamp)
}

function recordKind(record: RealityRecord): string {
  if (record.type === 'negative') return '负面事实'
  if (record.type === 'observation') return '观察'
  if (record.type === 'review') return '复盘'
  if (record.type === 'insight') return '洞察'
  if (record.type === 'seed') return '种子'
  return '事实'
}

function insightStatus(item: Insight): string {
  if (item.status === 'confirmed') return '已确认'
  if (item.status === 'retired') return '已否认 / 已移除'
  return '待确认'
}

export function MemoryPage() {
  const [layer, setLayer] = useState<MemoryLayer>('ai_inference')
  const [records, setRecords] = useState<RealityRecord[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string>()
  const [editingId, setEditingId] = useState<string>()
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerBody, setComposerBody] = useState('')

  async function refresh(): Promise<void> {
    setLoading(true)
    try {
      const [nextRecords, nextInsights] = await Promise.all([
        recordAsyncRepository.list(),
        unifiedAsyncRepository.list<Insight>('insight'),
      ])
      setRecords(nextRecords)
      setInsights(nextInsights)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '记忆读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    const onSynced = () => { void refresh() }
    window.addEventListener('beryl-data-synced', onSynced)
    return () => window.removeEventListener('beryl-data-synced', onSynced)
  }, [])

  const activeInsights = useMemo(
    () => insights.filter(item => item.status !== 'retired'),
    [insights],
  )
  const factRecords = useMemo(
    () => records.filter(item => item.type === 'fact' || item.type === 'observation' || item.type === 'negative'),
    [records],
  )
  const reflectionRecords = useMemo(
    () => records.filter(item => item.type === 'review' || (item.type === 'insight' && item.source !== 'ai')),
    [records],
  )
  const aiInsights = useMemo(
    () => activeInsights.filter(item => item.memoryLayer === 'ai_inference' || item.source === 'ai_assisted' || item.status === 'draft'),
    [activeInsights],
  )
  const userMemory = useMemo(
    () => activeInsights.filter(item => item.memoryLayer === layer),
    [activeInsights, layer],
  )
  const currentLayer = layers.find(item => item.value === layer) ?? layers[0]
  const recordById = useMemo(() => new Map(records.map(item => [item.calmyId, item])), [records])

  async function updateInsight(item: Insight, patch: Partial<Insight>, successMessage: string): Promise<void> {
    setBusyId(item.calmyId)
    try {
      await withSaveState(() => unifiedAsyncRepository.update<Insight>('insight', item.calmyId, patch, {
        expectedRevision: item.revision,
        actor: 'user',
        sourceIds: item.sourceRecordIds,
      }))
      setEditingId(undefined)
      await refresh()
      toast(successMessage)
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '记忆更新失败', 'error')
      await refresh()
    } finally {
      setBusyId(undefined)
    }
  }

  function startEditing(item: Insight): void {
    setEditingId(item.calmyId)
    setEditTitle(item.title)
    setEditBody(item.body)
  }

  async function saveEdit(item: Insight): Promise<void> {
    if (!editTitle.trim() || !editBody.trim()) {
      toast('标题和内容都需要保留', 'warning')
      return
    }
    await updateInsight(item, {
      title: editTitle.trim(),
      body: editBody.trim(),
      status: 'confirmed',
      memoryLayer: 'ai_inference',
      confirmedAt: Date.now(),
      deniedAt: undefined,
    }, '已修改并确认这条 AI 理解')
  }

  async function confirm(item: Insight): Promise<void> {
    await updateInsight(item, {
      status: 'confirmed',
      memoryLayer: 'ai_inference',
      confirmedAt: Date.now(),
      deniedAt: undefined,
    }, '已确认，仍会作为 AI 理解单独保存')
  }

  async function deny(item: Insight): Promise<void> {
    await updateInsight(item, { status: 'retired', archivedAt: Date.now(), deniedAt: Date.now() }, '已否认，不再作为 AI 建议')
  }

  async function remove(item: Insight): Promise<void> {
    if (!window.confirm('移除后这条 AI 理解将不再出现在当前列表，是否继续？')) return
    await updateInsight(item, { status: 'retired', archivedAt: Date.now(), deniedAt: Date.now() }, '已移除这条 AI 理解')
  }

  async function addUserMemory(): Promise<void> {
    const body = composerBody.trim()
    if (!body || (layer !== 'preference' && layer !== 'principle')) {
      toast('请先选择偏好或原则，并写下内容', 'warning')
      return
    }
    const title = body.length > 28 ? `${body.slice(0, 28)}…` : body
    setBusyId('new-memory')
    try {
      await withSaveState(() => unifiedAsyncRepository.create(unifiedFactories.insight({
        title,
        body,
        status: 'confirmed',
        memoryLayer: layer,
        sourceRecordIds: [],
        matterIds: [],
        resourceIds: [],
      }), { actor: 'user' }))
      setComposerBody('')
      setComposerOpen(false)
      await refresh()
      toast(`已保存这条${currentLayer.label}`)
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '保存失败', 'error')
    } finally {
      setBusyId(undefined)
    }
  }

  function renderRecord(item: RealityRecord) {
    return <article className="beryl-card memory-card" key={item.calmyId}>
      <div className="memory-card-head"><span className="memory-kind">{recordKind(item)}</span><time>{dateLabel(item.occurredAt)}</time></div>
      <p className="memory-card-body">{item.body}</p>
      <div className="memory-card-foot"><span>{item.source === 'ai' ? 'AI 辅助记录' : '你记录的内容'}</span><span>{item.evidenceIds.length ? `证据 ${item.evidenceIds.length} 条` : '无额外证据'}</span></div>
    </article>
  }

  function renderInsight(item: Insight) {
    const evidence = item.sourceRecordIds.map(id => recordById.get(id)).filter((record): record is RealityRecord => Boolean(record))
    const isEditing = editingId === item.calmyId
    return <article className={`beryl-card memory-card memory-insight-card ${item.status === 'confirmed' ? 'is-confirmed' : ''}`} key={item.calmyId}>
      <div className="memory-card-head"><span className={`memory-kind ${item.status === 'confirmed' ? 'confirmed' : 'pending'}`}>{insightStatus(item)}</span><time>{dateLabel(item.updatedAt)}</time></div>
      {isEditing ? <div className="memory-edit-form"><input aria-label="记忆标题" value={editTitle} onChange={event => setEditTitle(event.target.value)} /><textarea aria-label="记忆内容" value={editBody} onChange={event => setEditBody(event.target.value)} /><div className="memory-actions"><button className="primary" disabled={busyId === item.calmyId} onClick={() => void saveEdit(item)}>保存修改</button><button onClick={() => setEditingId(undefined)}>取消</button></div></div> : <><h3>{item.title}</h3><p className="memory-card-body">{item.body}</p></>}
      {!isEditing && <>
        <div className="memory-insight-meta"><span>{item.confidence === undefined ? '未设置置信度' : `置信度 ${Math.round(item.confidence * 100)}%`}</span><span>{evidence.length ? `来自 ${evidence.length} 条记录` : '暂无已关联记录'}</span></div>
        {evidence.length > 0 && <details className="memory-evidence"><summary>查看依据</summary>{evidence.slice(0, 3).map(record => <p key={record.calmyId}>“{record.body}”</p>)}</details>}
        <div className="memory-actions"><button disabled={busyId === item.calmyId} onClick={() => void confirm(item)}>确认</button><button disabled={busyId === item.calmyId} onClick={() => startEditing(item)}>修改</button><button disabled={busyId === item.calmyId} onClick={() => void deny(item)}>否认</button><button className="danger" disabled={busyId === item.calmyId} onClick={() => void remove(item)}>删除</button></div>
      </>}
    </article>
  }

  const emptyCopy = layer === 'ai_inference'
    ? '当前没有待你确认的 AI 理解。系统不会因为你记录了几条内容，就擅自替你下结论。'
    : layer === 'preference' || layer === 'principle'
      ? `还没有${currentLayer.label}。只有你主动写下并确认的内容，才会出现在这里。`
      : layer === 'fact' ? '还没有可展示的事实记录。' : '还没有可展示的反思记录。'

  return <div className="memory-page">
    <header className="page-head memory-page-head"><div><p className="eyebrow">AI · MEMORY & AGENCY</p><h1 className="font-title">AI 对我的理解</h1><p>把发生过的事、你的反思和 AI 的推断分开。你始终拥有确认、修改、否认和删除的权利。</p></div><div className="memory-head-note"><b>不替你下结论</b><small>AI 推断不会自动变成事实</small></div></header>
    <section className="memory-layer-tabs" aria-label="记忆层级">
      {layers.map(item => <button key={item.value} className={layer === item.value ? 'on' : ''} onClick={() => { setLayer(item.value); setComposerOpen(false); setEditingId(undefined) }}><b>{item.label}</b><small>{item.hint}</small></button>)}
    </section>
    {error && <section className="beryl-card empty-state memory-error" role="alert"><b>记忆数据暂时无法读取</b><p>{error}</p><button className="react-btn" type="button" onClick={() => window.dispatchEvent(new CustomEvent('beryl-data-synced'))}>重试</button></section>}
    {(layer === 'preference' || layer === 'principle') && <section className="beryl-card memory-compose-card"><div><p className="eyebrow">USER CONTROLLED</p><h2 className="font-title">写下一条{currentLayer.label}</h2><p>这是你的明确表达，不是系统从行为中猜出来的。</p></div><button className="primary" onClick={() => setComposerOpen(value => !value)}>{composerOpen ? '收起' : `添加${currentLayer.label}`}</button>{composerOpen && <div className="memory-composer"><textarea aria-label={`${currentLayer.label}内容`} value={composerBody} onChange={event => setComposerBody(event.target.value)} placeholder={`例如：我希望${currentLayer.label === '偏好' ? '先看到今天真正要做的一件事' : '每次只承诺自己能在现实中完成的一步'}`} /><div><button className="primary" disabled={busyId === 'new-memory'} onClick={() => void addUserMemory()}>保存并确认</button><button onClick={() => setComposerOpen(false)}>取消</button></div></div>}</section>}
    <section className="memory-list-section"><div className="section-title"><div><p className="eyebrow">{currentLayer.label.toUpperCase()}</p><h2 className="font-title">{currentLayer.label}</h2></div><span>{loading ? '读取中…' : layer === 'fact' ? `${factRecords.length} 条` : layer === 'reflection' ? `${reflectionRecords.length} 条` : layer === 'ai_inference' ? `${aiInsights.length} 条` : `${userMemory.length} 条`}</span></div>{loading ? <div className="empty-state" role="status">正在读取你的记录…</div> : layer === 'fact' ? factRecords.length ? factRecords.map(renderRecord) : <div className="empty-state">{emptyCopy}</div> : layer === 'reflection' ? reflectionRecords.length ? reflectionRecords.map(renderRecord) : <div className="empty-state">{emptyCopy}</div> : layer === 'ai_inference' ? aiInsights.length ? aiInsights.map(renderInsight) : <div className="beryl-card memory-empty"><span>✦</span><p>{emptyCopy}</p><small>当未来有 AI 辅助洞察时，它会先以“待确认”状态出现在这里。</small></div> : userMemory.length ? userMemory.map(renderInsight) : <div className="beryl-card memory-empty"><span>◌</span><p>{emptyCopy}</p><small>偏好和原则只来自你的主动确认。</small></div>}</section>
    <footer className="memory-boundary-note"><span>边界</span><p>事实来自记录；反思来自复盘；AI 推断保留来源和状态。确认 AI 推断，也不会改写原始记录。</p></footer>
  </div>
}
