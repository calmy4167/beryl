import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { todayKey } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import type { ActionItem, ActionStatus } from '@/domain/action/model'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter, MatterStage } from '@/domain/matter/model'
import { todayAsyncRepository } from '@/domain/today/repository'
import type { TodayPlan } from '@/domain/today/model'

interface CycleStageDefinition {
  key: MatterStage
  symbol: string
  label: string
  hint: string
  color: string
}

const cycleStages: CycleStageDefinition[] = [
  { key: 'wood', symbol: '木', label: '生长', hint: '计划', color: '#55ae7d' },
  { key: 'fire', symbol: '火', label: '推进', hint: '行动', color: '#ef746c' },
  { key: 'earth', symbol: '土', label: '沉淀', hint: '积累', color: '#e4a649' },
  { key: 'metal', symbol: '金', label: '收敛', hint: '整理', color: '#9da5a8' },
  { key: 'water', symbol: '水', label: '回看', hint: '蓄力', color: '#73acd8' },
]

const actionStatusLabels: Record<ActionStatus, string> = {
  planned: '待开始',
  in_progress: '进行中',
  done: '已完成',
  skipped: '已跳过',
  cancelled: '已取消',
}

const loadLabels: Record<NonNullable<TodayPlan['load']>, string> = {
  good: '状态很好',
  normal: '状态平稳',
  tired: '有些疲惫',
  bad: '需要休息',
}

function nodeStyle(color: string): CSSProperties {
  return { '--node-color': color } as CSSProperties
}

function stageLabel(stage: MatterStage): string {
  return cycleStages.find(item => item.key === stage)?.label || stage
}

function displayDate(date: string): string {
  const value = new Date(`${date}T00:00:00`)
  if (Number.isNaN(value.getTime())) return date
  return value.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })
}

export function CyclePage() {
  const navigate = useNavigate()
  const [date] = useState(() => todayKey())
  const [matters, setMatters] = useState<Matter[]>([])
  const [actions, setActions] = useState<ActionItem[]>([])
  const [plan, setPlan] = useState<TodayPlan>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadVersion, setReloadVersion] = useState(0)

  useEffect(() => {
    let active = true

    async function loadCycleData(): Promise<void> {
      setLoading(true)
      try {
        const [nextMatters, nextActions, plans] = await Promise.all([
          matterAsyncRepository.list(),
          actionAsyncRepository.listForDate(date),
          todayAsyncRepository.list(),
        ])
        if (!active) return
        setMatters(nextMatters)
        setActions(nextActions)
        setPlan(plans.find(item => item.date === date))
        setError('')
      } catch (cause) {
        if (!active) return
        setError(cause instanceof Error ? cause.message : 'Cycle 数据读取失败')
      } finally {
        if (active) setLoading(false)
      }
    }

    const refresh = () => {
      void loadCycleData()
    }

    void loadCycleData()
    window.addEventListener('beryl-data-synced', refresh)
    return () => {
      active = false
      window.removeEventListener('beryl-data-synced', refresh)
    }
  }, [date, reloadVersion])

  const activeMatters = useMemo(
    () => matters.filter(item => item.status === 'active' || item.status === 'draft'),
    [matters],
  )

  const focusIds = useMemo(() => new Set(plan?.focusActionIds || []), [plan])

  const focusActions = useMemo(
    () => actions.filter(item => focusIds.has(item.calmyId)),
    [actions, focusIds],
  )

  const currentMatter = useMemo(() => {
    const focusedMatterId = focusActions.find(item => item.matterId)?.matterId
    return matters.find(item => item.calmyId === focusedMatterId) || activeMatters[0]
  }, [activeMatters, focusActions, matters])

  const currentStage = currentMatter?.currentStage || 'wood'
  const currentStageDefinition = cycleStages.find(item => item.key === currentStage) || cycleStages[0]

  const stageCounts = useMemo(() => {
    const counts: Record<MatterStage, number> = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 }
    matters.forEach(item => {
      if (item.status !== 'archived') counts[item.currentStage] += 1
    })
    return counts
  }, [matters])

  const countedActions = actions.filter(item => item.status !== 'cancelled')
  const completedActions = countedActions.filter(item => item.status === 'done')
  const completion = countedActions.length
    ? Math.round((completedActions.length / countedActions.length) * 100)
    : 0
  const hasReview = Boolean(plan && Object.values(plan.review).some(value => value.trim()))
  const hasCycleData = matters.length > 0 || actions.length > 0 || Boolean(plan)

  if (loading && !hasCycleData) {
    return (
      <div className="cycle-page">
        <div className="empty-state beryl-card" role="status">正在读取今天的五行流…</div>
      </div>
    )
  }

  if (error && !hasCycleData) {
    return (
      <div className="cycle-page">
        <section className="empty-state beryl-card" role="alert">
          <h1 className="font-title">Cycle 暂时无法加载</h1>
          <p>{error}</p>
          <button className="react-btn primary" type="button" onClick={() => setReloadVersion(value => value + 1)}>
            重新读取
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="cycle-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">CYCLE · FIVE PHASES</p>
          <h1 className="font-title">Cycle 五行流</h1>
          <p>从现有课题、今日行动与复盘中，看见这一轮正在发生什么。</p>
        </div>
        <div>
          <button className="react-btn" type="button" onClick={() => navigate('/app/today')}>回到 Today</button>
          <button className="react-btn" type="button" onClick={() => navigate('/app/matters')}>全部课题</button>
        </div>
      </header>

      {error && (
        <section className="empty-state beryl-card" role="alert">
          最新数据读取失败，当前仍展示上一次结果：{error}
          <button className="react-btn" type="button" onClick={() => setReloadVersion(value => value + 1)}>重试</button>
        </section>
      )}

      <section className="cycle-hero beryl-card" aria-labelledby="cycle-current-title">
        <div className="cycle-orbit" role="group" aria-label="课题五行阶段分布">
          {cycleStages.map((stage, index) => (
            <div
              key={stage.key}
              className={`cycle-node node-${index}${stage.key === currentStage ? ' current' : ''}`}
              style={nodeStyle(stage.color)}
              aria-current={stage.key === currentStage ? 'step' : undefined}
            >
              <span aria-hidden="true">{stage.symbol}</span>
              <b>{stage.label} · {stage.hint}</b>
              <small>{stageCounts[stage.key]} 个课题</small>
            </div>
          ))}
          <div className="cycle-center">
            <strong>{currentStageDefinition.symbol}</strong>
            <b>{currentMatter ? currentMatter.title : '等待起步'}</b>
            <small>{currentMatter ? `当前在${currentStageDefinition.label}阶段` : '尚无进行中的课题'}</small>
          </div>
        </div>

        <div className="cycle-summary">
          <p className="eyebrow">当前阶段 · {displayDate(date)}</p>
          <h2 id="cycle-current-title" className="font-title">
            {currentStageDefinition.symbol} · {currentStageDefinition.label}
          </h2>
          {currentMatter ? (
            <>
              <p><b>{currentMatter.title}</b></p>
              <p>{currentMatter.why || '这个课题还没有写下为什么重要。'}</p>
            </>
          ) : (
            <p>当前没有进行中的课题。创建课题后，它会按真实阶段进入五行流。</p>
          )}
          <div
            className="cycle-progress"
            role="progressbar"
            aria-label="今日行动完成度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completion}
          >
            <span style={{ width: `${completion}%` }} />
          </div>
          <small>
            今日行动 {completedActions.length}/{countedActions.length} · 完成度 {completion}%
            {plan?.load ? ` · ${loadLabels[plan.load]}` : ''}
          </small>
          <button className="react-btn primary" type="button" onClick={() => navigate('/app/review')}>
            {hasReview ? '查看今日复盘' : '开始今日复盘'}
          </button>
        </div>
      </section>

      <div className="cycle-lower">
        <section className="cycle-block beryl-card" aria-labelledby="cycle-matters-title">
          <div className="panel-head">
            <div>
              <p className="eyebrow">CURRENT MATTERS</p>
              <h2 id="cycle-matters-title" className="font-title">这一轮的课题</h2>
            </div>
            <button className="react-btn" type="button" onClick={() => navigate('/app/matters')}>查看全部</button>
          </div>
          {activeMatters.length ? (
            <ul>
              {activeMatters.slice(0, 5).map(item => (
                <li key={item.calmyId}>
                  <button className="react-btn" type="button" onClick={() => navigate(`/app/matters/${item.calmyId}`)}>
                    {item.title} · {stageLabel(item.currentStage)}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">还没有进行中的课题。可以从课题页建立这一轮的现实主体。</p>
          )}
        </section>

        <section className="cycle-block beryl-card" aria-labelledby="cycle-actions-title">
          <div className="panel-head">
            <div>
              <p className="eyebrow">TODAY FLOW</p>
              <h2 id="cycle-actions-title" className="font-title">今日行动</h2>
            </div>
            <button className="react-btn" type="button" onClick={() => navigate('/app/today')}>打开 Today</button>
          </div>
          {actions.length ? (
            <ul>
              {actions.slice(0, 5).map(item => (
                <li key={item.calmyId}>
                  {focusIds.has(item.calmyId) ? '★ ' : ''}{item.title} · {actionStatusLabels[item.status]}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">今天还没有行动。回到 Today 写下下一步，进度会自动出现在这里。</p>
          )}
        </section>
      </div>

      <section className="cycle-block beryl-card" aria-labelledby="cycle-timeline-title">
        <div className="panel-head">
          <div>
            <p className="eyebrow">PHASE DISTRIBUTION</p>
            <h2 id="cycle-timeline-title" className="font-title">阶段分布</h2>
          </div>
          <span>{matters.filter(item => item.status !== 'archived').length} 个未归档课题</span>
        </div>
        <div className="cycle-timeline">
          {cycleStages.map(stage => (
            <span key={stage.key} style={nodeStyle(stage.color)}>
              <b>{stage.symbol}</b>
              <small>{stage.label} · {stageCounts[stage.key]}</small>
            </span>
          ))}
        </div>
        {!plan && (
          <p className="empty-state">今天尚未建立 Today 计划；本页保持只读，不会为了展示而创建新数据。</p>
        )}
      </section>
    </div>
  )
}
