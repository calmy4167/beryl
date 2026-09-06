import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { actionAsyncRepository } from '@/domain/action/repository'
import { matterAsyncRepository } from '@/domain/matter/repository'
import { recordAsyncRepository } from '@/domain/record/repository'
import type { RealityRecord } from '@/domain/record/model'
import { unifiedAsyncRepository, type Resource, type Seed } from '@/domain/unified'
import { todayKey } from '@/core/storage'
import { withSaveState } from '@/core/save-state'
import { Button, PageHead } from '../ui'
import '../flow.css'

type FlowItem = { entity: Seed | Resource; kind: 'seed' | 'resource' }
type FlowMode = 'focus' | 'wander' | 'solve' | 'echo' | 'topic'
const flowModes: Array<{ value: FlowMode; label: string; hint: string }> = [
  { value: 'focus', label: 'Focus', hint: '只看一条' },
  { value: 'wander', label: '漫游', hint: '有限探索' },
  { value: 'solve', label: '解题', hint: '优先 Seed' },
  { value: 'echo', label: '回响', hint: '回看资料' },
  { value: 'topic', label: '专题', hint: '混合上下文' }
]
const toast = (message: string, kind: 'success' | 'warning' | 'error' = 'success') => window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))

export function FlowPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [seeds, setSeeds] = useState<Seed[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [matters, setMatters] = useState<Awaited<ReturnType<typeof matterAsyncRepository.list>>>([])
  const [records, setRecords] = useState<RealityRecord[]>([])
  const [intent, setIntent] = useState('')
  const [desiredEvidence, setDesiredEvidence] = useState('')
  const [application, setApplication] = useState('')
  const [topicScope, setTopicScope] = useState('')
  const [mode, setMode] = useState<FlowMode>('solve')
  const [matterId, setMatterId] = useState(() => searchParams.get('matter') || '')
  const [started, setStarted] = useState(false)
  const [ended, setEnded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [echoFeedback, setEchoFeedback] = useState<Record<string, '仍重要' | '已完成' | '需要更新'>>({})

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const [nextSeeds, nextResources, nextMatters, nextRecords] = await Promise.all([
        unifiedAsyncRepository.list<Seed>('seed'), unifiedAsyncRepository.list<Resource>('resource'), matterAsyncRepository.list(), recordAsyncRepository.list()
      ])
      setSeeds(nextSeeds.filter(item => item.status !== 'retired'))
      setResources(nextResources.filter(item => item.status === 'active'))
      setMatters(nextMatters.filter(item => item.status !== 'archived'))
      setRecords(nextRecords.filter(item => !item.redactedAt))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Flow 内容读取失败')
    } finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [])
  useEffect(() => {
    const matter = matters.find(item => item.calmyId === matterId)
    if (!matter) return
    if (!intent.trim() && (matter.problem || matter.why)) setIntent(matter.problem || matter.why || '')
    if (!desiredEvidence.trim() && matter.progressEvidence) setDesiredEvidence(matter.progressEvidence)
    if (!application.trim() && matter.nextTest) setApplication(matter.nextTest)
  }, [application, desiredEvidence, intent, matterId, matters])
  useEffect(() => {
    if (!started || mode !== 'focus') return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setEnded(true) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, started])

  const candidates = useMemo<FlowItem[]>(() => {
    const all: FlowItem[] = [
    ...seeds.map(entity => ({ entity, kind: 'seed' as const })),
    ...resources.map(entity => ({ entity, kind: 'resource' as const }))
    ]
    const related = matterId ? all.filter(item => item.kind === 'seed' ? item.entity.targetMatterIds.includes(matterId) || item.entity.sourceRecordIds.some(id => records.some(record => record.calmyId === id && record.matterId === matterId)) : item.entity.matterIds.includes(matterId)) : all
    const matterScoped = matterId && related.length ? [...related, ...all.filter(item => !related.includes(item))] : all
    const normalizedTopic = topicScope.trim().toLocaleLowerCase()
    const topicRelated = mode === 'topic' && normalizedTopic
      ? matterScoped.filter(item => [item.entity.title, item.entity.body, ...item.entity.tags].join(' ').toLocaleLowerCase().includes(normalizedTopic))
      : []
    const scoped = topicRelated.length ? [...topicRelated, ...matterScoped.filter(item => !topicRelated.includes(item))] : matterScoped
    const ordered = mode === 'echo' ? scoped.filter(item => item.kind === 'resource') : mode === 'solve' ? scoped.filter(item => item.kind === 'seed') : mode === 'topic' ? scoped : mode === 'focus' ? scoped.slice(0, 1) : scoped
    return ordered.slice(0, mode === 'focus' ? 1 : 5)
  }, [matterId, mode, records, resources, seeds, topicScope])

  const selectedMatter = matters.find(item => item.calmyId === matterId)
  const recentRecords = records.filter(item => item.matterId === matterId).slice(0, 3)
  const echoRecords = records.filter(item => !matterId || item.matterId === matterId).slice(0, 5)
  function sourceLabel(item: FlowItem): string {
    const ids = 'sourceRecordIds' in item.entity ? item.entity.sourceRecordIds : item.entity.sourceIds
    if (!ids.length) return '未绑定来源'
    const recordBodies = records.filter(record => ids.includes(record.calmyId)).map(record => record.body).slice(0, 2)
    return recordBodies.length ? recordBodies.join(' · ') : `来源 ID：${ids.join('、')}`
  }

  function giveEchoFeedback(record: RealityRecord, feedback: '仍重要' | '已完成' | '需要更新') {
    setEchoFeedback(current => ({ ...current, [record.calmyId]: feedback }))
    toast(feedback === '仍重要' ? '已保留为当前语境的重要证据' : feedback === '已完成' ? '已标记为过去的完成证据' : '已标记为需要更新，下一步可重新验证')
  }

  function start() {
    const effectiveIntent = intent.trim() || selectedMatter?.problem?.trim() || selectedMatter?.why?.trim() || ''
    const effectiveEvidence = desiredEvidence.trim() || selectedMatter?.progressEvidence?.trim() || ''
    const effectiveApplication = application.trim() || selectedMatter?.nextTest?.trim() || ''
    if (!effectiveIntent) { toast('先写下当前要解决的问题或探索意图', 'warning'); return }
    if (mode === 'solve' && (!effectiveEvidence || !effectiveApplication)) { toast('解题模式还需要写清希望得到的证据和应用位置', 'warning'); return }
    if (mode === 'topic' && !topicScope.trim()) { toast('专题模式还需要写清这次要聚焦的范围', 'warning'); return }
    if (!intent.trim()) setIntent(effectiveIntent)
    if (!desiredEvidence.trim() && effectiveEvidence) setDesiredEvidence(effectiveEvidence)
    if (!application.trim() && effectiveApplication) setApplication(effectiveApplication)
    setStarted(true)
    setEnded(false)
  }

  async function useForProblem(item: FlowItem) {
    if (!matterId) { toast('选择一个要服务的 Matter，或先回到事项创建问题', 'warning'); return }
    try {
      await withSaveState(async () => {
        if (item.kind === 'seed') {
          const seed = item.entity as Seed
          await unifiedAsyncRepository.update<Seed>('seed', seed.calmyId, { status: 'cultivating', targetMatterIds: [...new Set([...seed.targetMatterIds, matterId])] }, { expectedRevision: seed.revision })
        } else {
          const resource = item.entity as Resource
          await unifiedAsyncRepository.update<Resource>('resource', resource.calmyId, { matterIds: [...new Set([...resource.matterIds, matterId])] }, { expectedRevision: resource.revision })
        }
      })
      await refresh()
      toast('已关联当前问题，可以继续验证')
    } catch (cause) { toast(cause instanceof Error ? cause.message : '关联当前问题失败', 'error') }
  }

  async function tryIt(item: FlowItem) {
    try {
      await withSaveState(async () => {
        await actionAsyncRepository.create({ title: `验证：${item.entity.title}`, date: todayKey(), matterId: matterId || undefined })
        if (item.kind === 'seed') {
          const seed = item.entity as Seed
          await unifiedAsyncRepository.update<Seed>('seed', seed.calmyId, { status: 'promoted', targetMatterIds: matterId ? [...new Set([...seed.targetMatterIds, matterId])] : seed.targetMatterIds }, { expectedRevision: seed.revision })
        }
      })
      await refresh()
      setEnded(true)
      toast(matterId ? '已创建现实验证行动；现在可以退出 Flow 去做' : '已创建现实验证行动；之后可再关联 Matter')
    } catch (cause) { toast(cause instanceof Error ? cause.message : '创建验证行动失败', 'error') }
  }

  async function sayGoodbye(item: FlowItem) {
    try {
      if (item.kind === 'seed') await withSaveState(() => unifiedAsyncRepository.update<Seed>('seed', item.entity.calmyId, { status: 'retired', archivedAt: Date.now() }, { expectedRevision: item.entity.revision }))
      else await withSaveState(() => unifiedAsyncRepository.update<Resource>('resource', item.entity.calmyId, { status: 'retired', archivedAt: Date.now() }, { expectedRevision: item.entity.revision }))
      await refresh()
      toast('已从本次 Flow 移除，不代表失败')
    } catch (cause) { toast(cause instanceof Error ? cause.message : '结束内容失败', 'error') }
  }

  function keep(item: FlowItem) {
    toast(item.kind === 'seed' ? '已收下这条 Seed，之后仍可关联问题' : '已保留这份资料，不会强制继续浏览')
  }

  return <div className="flow-page">
    <PageHead eyebrow="FLOW · ATTENTION GATE" title="有限地重新激活内容" description="先写问题，再看最多 5 条相关内容；Flow 有明确边界，也有现实出口。" />
    {error && <section className="beryl-card empty-state" role="alert"><b>Flow 内容暂时无法读取</b><p>{error}</p><Button onClick={() => void refresh()}>重试</Button></section>}
    <section className="beryl-card flow-intent">
      <div><p className="eyebrow">CURRENT INTENT</p><h2 className="font-title">这次为什么打开 Flow？</h2><p>可以是一个现实问题，也可以是明确的探索意图；不是为了打卡或延长停留。</p></div>
      <textarea aria-label="当前问题或探索意图" value={intent} onChange={event => setIntent(event.target.value)} placeholder="例如：我需要找到一个办法，减少跨团队需求误解。" />
      {mode === 'solve' && <div className="flow-solve-fields"><textarea aria-label="希望得到的证据" value={desiredEvidence} onChange={event => setDesiredEvidence(event.target.value)} placeholder="什么证据能说明这次学习够用了？" /><textarea aria-label="应用位置" value={application} onChange={event => setApplication(event.target.value)} placeholder="准备在哪里、对谁、何时马上应用？" /></div>}
      {mode === 'topic' && <textarea className="flow-topic-field" aria-label="专题范围" value={topicScope} onChange={event => setTopicScope(event.target.value)} placeholder="这次只聚焦什么范围？例如：面向新手的 onboarding 误解" />}
      <div className="flow-mode-picker" role="group" aria-label="Flow 模式"><span>选择这次的方式</span>{flowModes.map(item => <Button key={item.value} className={mode === item.value ? 'on' : ''} aria-pressed={mode === item.value} onClick={() => { setMode(item.value); setStarted(false); setEnded(false) }}><b>{item.label}</b><small>{item.hint}</small></Button>)}</div>
      <div className="flow-intent-controls"><label>服务于 Matter（可选）<select aria-label="Flow 关联 Matter" value={matterId} onChange={event => setMatterId(event.target.value)}><option value="">先不关联</option>{matters.map(item => <option key={item.calmyId} value={item.calmyId}>{item.title}</option>)}</select></label><Button className="primary" onClick={start}>{started ? '重新开始本批' : '开始这一批'}</Button></div>
      {selectedMatter && <div className="flow-context"><b>当前问题上下文：{selectedMatter.title}</b><p>{selectedMatter.problem || selectedMatter.why || '这个 Matter 还没有写下具体问题。'}</p>{selectedMatter.currentGap && <small>当前缺口：{selectedMatter.currentGap}</small>}{selectedMatter.stopCondition && <small>停止条件：{selectedMatter.stopCondition}</small>}{recentRecords.length > 0 && <small>最近现实证据：{recentRecords.map(record => record.body).join(' · ')}</small>}</div>}
    </section>
    {ended ? <section className="beryl-card flow-ended" role="status"><h2 className="font-title">这一批已结束</h2><p>你可以回到现实去验证，或稍后带着新的问题再来。不需要继续浏览。</p><div className="flow-exit-actions"><Button className="primary" onClick={() => navigate('/app/today')}>回到 Today 去做</Button><Button onClick={() => setEnded(false)}>返回本批</Button></div></section> : !started ? <div className="empty-state">写下问题并选择方式后，Flow 才会开始显示有限内容。</div> : loading ? <div className="empty-state" role="status">正在准备这一批内容…</div> : <section className={`flow-batch ${mode === 'focus' ? 'focus-batch' : ''}`}><div className="flow-batch-head"><div><p className="eyebrow">{flowModes.find(item => item.value === mode)?.label.toUpperCase()} · BATCH · {candidates.length + (mode === 'echo' ? echoRecords.length : 0)} ITEMS</p><h2 className="font-title">围绕“{intent.trim()}”</h2>{mode === 'solve' && <small className="flow-solve-summary">证据：{desiredEvidence} · 应用：{application}</small>}{mode === 'topic' && <small className="flow-topic-summary">专题范围：{topicScope.trim()}</small>}</div><Button onClick={() => setEnded(true)}>已足够，结束 Flow</Button></div>{!candidates.length && mode !== 'echo' ? <div className="empty-state beryl-card">Library 里还没有符合本模式的内容；可以回到 Capture 先保存一条 Seed。</div> : candidates.map(item => <article className={`beryl-card flow-card ${mode === 'focus' ? 'focus-card' : ''}`} key={`${item.kind}-${item.entity.calmyId}`}><div className="flow-card-head"><span className="flow-kind">{item.kind === 'seed' ? 'Seed · 未成熟线索' : 'Resource · 可复用资料'}</span><Button onClick={() => setExpanded(expanded === item.entity.calmyId ? null : item.entity.calmyId)}>{expanded === item.entity.calmyId ? '收起来源' : '展开来源'}</Button></div><h3>{item.entity.title}</h3><p>{item.entity.body}</p><small className="flow-meta">{new Date(item.entity.createdAt).toLocaleDateString('zh-CN')} · {item.kind === 'seed' ? (item.entity as Seed).status : (item.entity as Resource).kind}</small>{expanded === item.entity.calmyId && <small className="flow-source">来源：{sourceLabel(item)}{item.entity.tags.length ? ` · 标签：${item.entity.tags.join('、')}` : ''}</small>}<div className="flow-card-actions"><Button onClick={() => keep(item)}>收下</Button><Button onClick={() => void useForProblem(item)}>用于当前问题</Button><Button className="primary" onClick={() => void tryIt(item)}>试一下</Button><Button onClick={() => void sayGoodbye(item)}>再见</Button></div></article>)}{mode === 'echo' && <section className="echo-records"><div className="echo-records-head"><h3 className="font-title">过去的现实证据</h3><small>{matterId ? '当前 Matter · 最近 5 条' : '最近 5 条'}</small></div>{!echoRecords.length ? <div className="empty-state beryl-card">还没有可回响的 Reality Record。</div> : echoRecords.map(record => <article className="beryl-card echo-record" key={record.calmyId}><time>{new Date(record.occurredAt).toLocaleString('zh-CN')} · {record.source}</time><p>{record.body}</p>{record.matterId && <small>关联 Matter：{matters.find(item => item.calmyId === record.matterId)?.title || record.matterId}</small>}<div className="echo-actions"><Button className={echoFeedback[record.calmyId] === '仍重要' ? 'on' : ''} onClick={() => giveEchoFeedback(record, '仍重要')}>仍重要</Button><Button className={echoFeedback[record.calmyId] === '已完成' ? 'on' : ''} onClick={() => giveEchoFeedback(record, '已完成')}>已完成</Button><Button className={echoFeedback[record.calmyId] === '需要更新' ? 'on' : ''} onClick={() => giveEchoFeedback(record, '需要更新')}>需要更新</Button></div></article>)}</section>}</section>}
  </div>
}
