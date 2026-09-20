import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { readSession } from '@/core/auth'
import { SCENES, currentSceneId } from '@/core/scenes'
import {
  listRealityDocumentsAsync,
  type RealityDocument,
} from '@/domain/reality'

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
  const [documents, setDocuments] = useState<RealityDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refreshDocuments = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setDocuments(await listRealityDocumentsAsync())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '概览数据读取失败')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void refreshDocuments() }, [refreshDocuments])

  const userName = session?.u.trim() || '本地用户'
  const userInitial = Array.from(userName)[0]?.toLocaleUpperCase() || 'C'
  const matterCount = documents.filter(document => document.entityType === 'case' || document.entityType === 'matter').length
  const focusMinutes = documents.reduce(
    (total, document) => total + (document.entityType === 'pomo' ? document.minutes ?? 0 : 0),
    0,
  )
  const focusTime = formatFocusTime(focusMinutes)
  const habitDays = new Set(
    documents.flatMap(document => document.entityType === 'habit' ? document.dates ?? [] : []),
  ).size
  const latestDocument = documents.reduce<RealityDocument | undefined>(
    (latest, document) => !latest || document.updatedAt > latest.updatedAt ? document : latest,
    undefined,
  )

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
            设置
          </button>
        </div>
      </header>

      {error && (
        <section className="beryl-card empty-state" role="alert">
          <b>概览数据暂时无法读取</b>
          <p>{error}</p>
          <button className="react-btn" type="button" onClick={() => void refreshDocuments()}>重试</button>
        </section>
      )}

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
            <b>{loading ? '…' : matterCount}</b>
            <span>个课题</span>
          </article>
          <article className="beryl-card profile-stat-card">
            <small>专注时间</small>
            <b>{loading ? '…' : focusTime.value}</b>
            <span>{focusTime.unit}</span>
          </article>
          <article className="beryl-card profile-stat-card">
            <small>习惯记录</small>
            <b>{loading ? '…' : habitDays}</b>
            <span>天</span>
          </article>
          <article className="beryl-card profile-stat-card">
            <small>本地事实</small>
            <b>{loading ? '…' : documents.length}</b>
            <span>条数据</span>
          </article>
        </div>
      </section>

    </div>
  )
}
