import { useEffect, useState } from 'react'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
import { withSaveState } from '@/core/save-state'
import { Button, PageHead } from '../ui'

const matterStatusLabels: Record<Matter['status'], string> = { draft: '草稿', active: '进行中', paused: '已暂停', archived: '已结束' }
const trajectoryLabels: Record<Matter['trajectory'], string> = { advancing: '推进', stable: '稳定', stalled: '停滞', retreating: '回退', diverging: '绕路', lost: '失去连接', recovering: '恢复', restarting: '重启', unknown: '未知' }
const toast = (message: string, kind: 'success' | 'warning' | 'error' = 'success') => window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))

type ProblemDrivenFields = Pick<Matter, 'problem' | 'desiredChange' | 'progressEvidence' | 'currentGap' | 'nextTest' | 'stopCondition'>
const emptyProblemDrivenFields: ProblemDrivenFields = { problem: '', desiredChange: '', progressEvidence: '', currentGap: '', nextTest: '', stopCondition: '' }

export function MattersPage() {
  const [items, setItems] = useState<Matter[]>([])
  const [title, setTitle] = useState('')
  const [why, setWhy] = useState('')
  const [problemFields, setProblemFields] = useState<ProblemDrivenFields>(emptyProblemDrivenFields)
  const [showProblemFields, setShowProblemFields] = useState(false)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function refresh() {
    setLoading(true)
    try {
      setItems(await matterAsyncRepository.list())
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '课题列表读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  async function create() {
    if (!title.trim()) {
      toast('先写下课题名称', 'warning')
      return
    }
    try {
      await withSaveState(() => matterAsyncRepository.create({ title, why, ...problemFields }))
      setTitle('')
      setWhy('')
      setProblemFields(emptyProblemDrivenFields)
      setShowProblemFields(false)
      await refresh()
      toast('课题已创建')
    } catch (error) {
      toast(error instanceof Error ? error.message : '创建课题失败', 'error')
    }
  }

  async function toggle(item: Matter) {
    const next = item.status === 'active' ? 'paused' : item.status === 'paused' ? 'active' : item.status === 'archived' ? 'paused' : 'active'
    try {
      await withSaveState(() => matterAsyncRepository.transition(item.calmyId, next, { expectedRevision: item.revision }))
      await refresh()
      toast(next === 'active' ? '课题已恢复' : '课题已暂停')
    } catch (error) {
      toast(error instanceof Error ? error.message : '状态更新失败', 'error')
      await refresh()
    }
  }

  async function archive(item: Matter) {
    try {
      await withSaveState(() => matterAsyncRepository.archive(item.calmyId, { expectedRevision: item.revision }))
      await refresh()
      toast('课题已结束并归档，不代表失败')
    } catch (error) {
      toast(error instanceof Error ? error.message : '结束课题失败', 'error')
      await refresh()
    }
  }

  async function changeTrajectory(item: Matter, trajectory: Matter['trajectory']) {
    if (trajectory === item.trajectory) return
    try {
      await withSaveState(() => matterAsyncRepository.update(item.calmyId, { trajectory }, { expectedRevision: item.revision }))
      await refresh()
      toast('趋势判断已更新')
    } catch (error) {
      toast(error instanceof Error ? error.message : '趋势更新失败', 'error')
      await refresh()
    }
  }

  const setProblemField = (key: keyof ProblemDrivenFields, value: string) => setProblemFields(current => ({ ...current, [key]: value }))
  const visible = items.filter(item => filter === 'all' || item.status === filter)

  return (
    <div className="matters-page">
      <PageHead eyebrow="MATTERS · 现实主体" title="课题，不是任务清单" description="从正在面对的现实问题出发，学习只服务于下一次解决与验证。">
        <select aria-label="课题筛选" value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="all">全部</option><option value="active">进行中</option><option value="paused">已暂停</option><option value="archived">已结束</option>
        </select>
      </PageHead>

      {error && <section className="beryl-card empty-state" role="alert"><b>课题列表暂时无法读取</b><p>{error}</p><Button onClick={() => void refresh()}>重试</Button></section>}

      <section className="matter-create beryl-card">
        <input aria-label="新课题名称" value={title} onChange={event => setTitle(event.target.value)} placeholder="例如：建立稳定的工作节奏" />
        <textarea aria-label="课题为什么重要" value={why} onChange={event => setWhy(event.target.value)} placeholder="它为什么值得被持续面对？" />
        <details open={showProblemFields} onToggle={event => setShowProblemFields(event.currentTarget.open)}>
          <summary>如果这是一个学习问题，补充解决闭环（可选）</summary>
          <p className="field-hint">先写问题，再决定最小必要的学习；没有现实问题时，不需要为了“自律”制造学习。</p>
          <div className="problem-driven-fields">
            <textarea aria-label="现实问题" value={problemFields.problem} onChange={event => setProblemField('problem', event.target.value)} placeholder="我正在解决什么现实问题？" />
            <textarea aria-label="期望变化" value={problemFields.desiredChange} onChange={event => setProblemField('desiredChange', event.target.value)} placeholder="我希望现实发生什么变化？" />
            <textarea aria-label="进展证据" value={problemFields.progressEvidence} onChange={event => setProblemField('progressEvidence', event.target.value)} placeholder="什么证据说明正在变好？" />
            <textarea aria-label="当前缺口" value={problemFields.currentGap} onChange={event => setProblemField('currentGap', event.target.value)} placeholder="现在卡在哪里？" />
            <textarea aria-label="下一次验证" value={problemFields.nextTest} onChange={event => setProblemField('nextTest', event.target.value)} placeholder="学完或想明白后，下一次要马上试什么？" />
            <textarea aria-label="停止条件" value={problemFields.stopCondition} onChange={event => setProblemField('stopCondition', event.target.value)} placeholder="什么情况下可以停止、换方法或停止学习？" />
          </div>
        </details>
        <Button className="primary" disabled={loading} onClick={() => void create()}>创建课题</Button>
      </section>

      <div className="matter-grid">
        {loading ? <div className="empty-state" role="status">正在读取课题…</div> : visible.map(item => (
          <article className="matter-card beryl-card" key={item.calmyId}>
            <div className="matter-card-head"><span className={`matter-status ${item.status}`}>{matterStatusLabels[item.status]}</span><div className="matter-card-actions"><Button aria-label={`${item.title}状态切换`} onClick={() => void toggle(item)}>{item.status === 'active' ? '暂停' : '恢复'}</Button>{item.status !== 'archived' && <Button onClick={() => void archive(item)}>结束</Button>}</div></div>
            <h2 className="font-title">{item.title}</h2><p>{item.why || '还没有写下为什么重要。'}</p>
            {item.problem && <section className="problem-driven-summary"><b>当前要解决的问题</b><p>{item.problem}</p>{item.desiredChange && <><b>期望变化</b><p>{item.desiredChange}</p></>}{item.currentGap && <><b>当前缺口</b><p>{item.currentGap}</p></>}{item.nextTest && <><b>下一次验证</b><p>{item.nextTest}</p></>}{item.stopCondition && <><b>停止条件</b><p>{item.stopCondition}</p></>}</section>}
            <div className="matter-card-trend"><span>阶段：{item.currentStage}</span><label>趋势<select aria-label={`${item.title}趋势`} value={item.trajectory} onChange={event => void changeTrajectory(item, event.target.value as Matter['trajectory'])}>{Object.entries(trajectoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
          </article>
        ))}
        {!loading && !visible.length && <div className="empty-state">还没有匹配的课题。</div>}
      </div>
    </div>
  )
}
