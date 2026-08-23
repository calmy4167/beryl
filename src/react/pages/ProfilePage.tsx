import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { readSession } from '@/core/auth'
import { SCENES, currentSceneId } from '@/core/scenes'
import {
  listRealityDocuments,
  type RealityDocument,
  type RealityEntityType,
} from '@/domain/reality'

type ModuleCountMode = 'types' | 'all' | 'dated' | 'none'

interface ProfileModule {
  id: string
  icon: string
  label: string
  description: string
  route: string
  countMode: ModuleCountMode
  types?: readonly RealityEntityType[]
}

const PROFILE_MODULES: readonly ProfileModule[] = [
  {
    id: 'today',
    icon: '⌂',
    label: 'Today',
    description: '今日方向、行动与状态',
    route: '/app/today',
    countMode: 'types',
    types: ['today', 'daily_state'],
  },
  {
    id: 'cycle',
    icon: '◌',
    label: 'Cycle',
    description: '查看周期与阶段流转',
    route: '/app/cycle',
    countMode: 'types',
    types: ['cycle', 'stage'],
  },
  {
    id: 'capture',
    icon: '↓',
    label: 'Capture',
    description: '保存原文与待整理线索',
    route: '/app/capture',
    countMode: 'types',
    types: ['capture', 'seed'],
  },
  {
    id: 'matters',
    icon: '◎',
    label: '事项',
    description: '持续面对的现实课题',
    route: '/app/matters',
    countMode: 'types',
    types: ['case', 'matter'],
  },
  {
    id: 'inbox',
    icon: '⌄',
    label: '收件箱',
    description: '尚未处理的临时收集',
    route: '/app/module/inbox',
    countMode: 'types',
    types: ['inbox'],
  },
  {
    id: 'tasks',
    icon: '✓',
    label: '任务与行动',
    description: '任务清单与现实行动',
    route: '/app/module/tasks',
    countMode: 'types',
    types: ['task', 'action'],
  },
  {
    id: 'review',
    icon: '↺',
    label: '复盘',
    description: '事实、结果与洞察',
    route: '/app/review',
    countMode: 'types',
    types: ['record', 'insight', 'outcome'],
  },
  {
    id: 'habits',
    icon: '♧',
    label: '习惯',
    description: '持续练习与打卡记录',
    route: '/app/module/habits',
    countMode: 'types',
    types: ['habit', 'practice'],
  },
  {
    id: 'goals',
    icon: '◇',
    label: '目标',
    description: '方向与目标进展',
    route: '/app/module/goals',
    countMode: 'types',
    types: ['goal'],
  },
  {
    id: 'finance',
    icon: '¥',
    label: '财务',
    description: '收入与支出记录',
    route: '/app/module/finance',
    countMode: 'types',
    types: ['transaction'],
  },
  {
    id: 'pomo',
    icon: '◷',
    label: '番茄钟',
    description: '专注时长与次数',
    route: '/app/module/pomo',
    countMode: 'types',
    types: ['pomo'],
  },
  {
    id: 'diary',
    icon: '▤',
    label: '日记',
    description: '按日期保存生活记录',
    route: '/app/module/diary',
    countMode: 'types',
    types: ['diary'],
  },
  {
    id: 'posts',
    icon: '✎',
    label: '文章与动态',
    description: '文章和已有动态内容',
    route: '/app/module/posts',
    countMode: 'types',
    types: ['post', 'moment'],
  },
  {
    id: 'library',
    icon: '▧',
    label: '资料',
    description: '资源、附件与知识素材',
    route: '/app/library',
    countMode: 'types',
    types: ['resource', 'asset'],
  },
  {
    id: 'calendar',
    icon: '□',
    label: '日历',
    description: '按时间查看已有事实',
    route: '/app/calendar',
    countMode: 'dated',
  },
  {
    id: 'people',
    icon: '♙',
    label: '人脉',
    description: '人物、关系与共享空间',
    route: '/app/people',
    countMode: 'types',
    types: ['person', 'relationship', 'shared_space', 'char'],
  },
  {
    id: 'graph',
    icon: '⌁',
    label: '统计与图谱',
    description: '从全部事实中查看连接',
    route: '/app/graph',
    countMode: 'all',
  },
  {
    id: 'settings',
    icon: '⚙',
    label: '设置与同步',
    description: '本地数据、同步与外观',
    route: '/app/admin',
    countMode: 'none',
  },
]

function countByTypes(
  documents: readonly RealityDocument[],
  types: readonly RealityEntityType[],
): number {
  const acceptedTypes = new Set<RealityEntityType>(types)
  return documents.reduce(
    (total, document) => total + (acceptedTypes.has(document.entityType) ? 1 : 0),
    0,
  )
}

function moduleCount(module: ProfileModule, documents: readonly RealityDocument[]): number | null {
  if (module.countMode === 'none') return null
  if (module.countMode === 'all') return documents.length
  if (module.countMode === 'dated') {
    return documents.filter(document => Boolean(document.date || document.occurredAt)).length
  }
  return countByTypes(documents, module.types ?? [])
}

function moduleCountLabel(module: ProfileModule, documents: readonly RealityDocument[]): string {
  const count = moduleCount(module, documents)
  if (count === null) return '管理'
  return `${count} 条`
}

function formatTimestamp(timestamp: number | undefined): string {
  if (!timestamp || timestamp <= 0) return '暂无记录'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

function formatFocusTime(minutes: number): { value: string; unit: string } {
  if (minutes < 60) return { value: String(minutes), unit: '分钟' }
  const hours = minutes / 60
  return { value: Number.isInteger(hours) ? String(hours) : hours.toFixed(1), unit: '小时' }
}

export function ProfilePage() {
  const navigate = useNavigate()
  const session = readSession()
  const sceneId = currentSceneId()
  const scene = SCENES[sceneId] ?? SCENES.personal
  const documents = useMemo(() => listRealityDocuments(), [])

  const userName = session?.u.trim() || '本地用户'
  const userInitial = Array.from(userName)[0]?.toLocaleUpperCase() || 'C'
  const matterCount = countByTypes(documents, ['case', 'matter'])
  const focusMinutes = documents.reduce(
    (total, document) => total + (document.entityType === 'pomo' ? document.minutes ?? 0 : 0),
    0,
  )
  const focusTime = formatFocusTime(focusMinutes)
  const habitDays = new Set(
    documents.flatMap(document => document.entityType === 'habit' ? document.dates ?? [] : []),
  ).size
  const latestDocument = documents.find(document => document.updatedAt > 0)

  return (
    <div className="profile-page">
      <header className="page-head profile-page-head">
        <div>
          <p className="eyebrow">MY · LOCAL PROFILE</p>
          <h1 className="font-title">我的</h1>
          <p>聚合当前设备上的会话、场景和已有模块数据，不创建额外账户资料。</p>
        </div>
        <div className="profile-head-actions">
          <button className="react-btn" type="button" onClick={() => navigate('/scene')}>
            切换场景
          </button>
          <button className="react-btn primary" type="button" onClick={() => navigate('/app/admin')}>
            设置与同步
          </button>
        </div>
      </header>

      <section className="profile-hero" aria-label="本地用户与当前场景">
        <article className="beryl-card profile-identity-card">
          <div className="profile-avatar" aria-hidden="true">{userInitial}</div>
          <div className="profile-identity-copy">
            <p className="eyebrow">LOCAL USER</p>
            <h2 className="font-title">{userName}</h2>
            <p>本地会话 · 数据保存在当前设备并沿用现有同步设置</p>
          </div>
          <dl className="profile-identity-meta">
            <div>
              <dt>会话更新</dt>
              <dd>{formatTimestamp(session?.ts)}</dd>
            </div>
            <div>
              <dt>最近数据</dt>
              <dd>{formatTimestamp(latestDocument?.updatedAt)}</dd>
            </div>
          </dl>
          <div className="profile-identity-actions">
            <button
              className="react-btn"
              type="button"
              onClick={() => navigate('/pass?mode=change')}
            >
              修改访问密码
            </button>
          </div>
        </article>

        <article className="beryl-card profile-scene-card">
          <div
            className="profile-scene-icon"
            aria-hidden="true"
            style={{ backgroundColor: scene.color }}
          >
            {scene.icon}
          </div>
          <div className="profile-scene-copy">
            <p className="eyebrow">CURRENT SCENE</p>
            <h2 className="font-title">{scene.name}</h2>
            <p>{scene.desc} · {scene.tagline}</p>
          </div>
          <div className="profile-scene-summary" aria-label="当前场景模块数量">
            <b>{scene.mods.length}</b>
            <span>个原有模块</span>
          </div>
          <button className="react-btn" type="button" onClick={() => navigate('/scene')}>
            管理场景 →
          </button>
        </article>
      </section>

      <section className="profile-overview" aria-labelledby="profile-overview-title">
        <div className="profile-section-head">
          <div>
            <p className="eyebrow">OVERVIEW</p>
            <h2 id="profile-overview-title" className="font-title">现有数据概览</h2>
          </div>
          <span>统计来自 Reality 文档视图</span>
        </div>
        <div className="profile-stats-grid">
          <article className="beryl-card profile-stat-card">
            <small>事项</small>
            <b>{matterCount}</b>
            <span>个课题</span>
          </article>
          <article className="beryl-card profile-stat-card">
            <small>专注时间</small>
            <b>{focusTime.value}</b>
            <span>{focusTime.unit}</span>
          </article>
          <article className="beryl-card profile-stat-card">
            <small>习惯记录</small>
            <b>{habitDays}</b>
            <span>天</span>
          </article>
          <article className="beryl-card profile-stat-card">
            <small>本地事实</small>
            <b>{documents.length}</b>
            <span>条数据</span>
          </article>
        </div>
      </section>

      <section className="profile-modules" aria-labelledby="profile-modules-title">
        <div className="profile-section-head">
          <div>
            <p className="eyebrow">ALL MODULES</p>
            <h2 id="profile-modules-title" className="font-title">全部模块入口</h2>
          </div>
          <span>保留原模块，并加入新的概览页面</span>
        </div>
        <nav className="profile-module-grid" aria-label="全部模块入口">
          {PROFILE_MODULES.map(module => {
            const countLabel = moduleCountLabel(module, documents)
            return (
              <button
                key={module.id}
                className="react-btn beryl-card profile-module-card"
                type="button"
                aria-label={`打开${module.label}，${countLabel}`}
                onClick={() => navigate(module.route)}
              >
                <span className="profile-module-icon" aria-hidden="true">{module.icon}</span>
                <span className="profile-module-copy">
                  <b>{module.label}</b>
                  <small>{module.description}</small>
                </span>
                <span className="profile-module-count">{countLabel}</span>
                <span className="profile-module-arrow" aria-hidden="true">→</span>
              </button>
            )
          })}
        </nav>
      </section>

      <section className="beryl-card profile-system-card" aria-labelledby="profile-system-title">
        <div className="profile-section-head">
          <div>
            <p className="eyebrow">SYSTEM</p>
            <h2 id="profile-system-title" className="font-title">系统与数据</h2>
          </div>
          <span>沿用当前本地优先架构</span>
        </div>
        <div className="profile-system-list">
          <button className="react-btn profile-system-entry" type="button" onClick={() => navigate('/app/admin')}>
            <span aria-hidden="true">⚙</span><b>数据、同步与外观</b><span>→</span>
          </button>
          <button className="react-btn profile-system-entry" type="button" onClick={() => navigate('/app/library')}>
            <span aria-hidden="true">▧</span><b>资料与附件管理</b><span>→</span>
          </button>
          <button className="react-btn profile-system-entry" type="button" onClick={() => navigate('/app/people')}>
            <span aria-hidden="true">♙</span><b>人物与关系管理</b><span>→</span>
          </button>
          <button className="react-btn profile-system-entry" type="button" onClick={() => navigate('/app/graph')}>
            <span aria-hidden="true">⌁</span><b>统计与关系图谱</b><span>→</span>
          </button>
        </div>
      </section>
    </div>
  )
}
