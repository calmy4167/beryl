import { useEffect, useMemo, useRef, useState } from 'react'
import { readAsyncStorageValue, writeAsyncStorageValue } from '@/core/repository'
import { recordAsyncRepository } from '@/domain/record/repository'
import type { RealityRecord } from '@/domain/record/model'
import { fmtDate } from '@/core/storage'
import { withSaveState } from '@/core/save-state'

type PomoMode = 'focus' | 'rest'

const DEFAULT_MINUTES: Record<PomoMode, number> = { focus: 25, rest: 5 }
const POMO_RECORD_PREFIX = '[番茄钟] 完成专注'
const RING_CIRCUMFERENCE = 2 * Math.PI * 88

const toast = (message: string, kind: 'success' | 'warning' | 'error' = 'success') => {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

interface PomoStats {
  minutes: number
  count: number
}

async function readStats(): Promise<PomoStats> {
  const [minutes, count] = await Promise.all([
    readAsyncStorageValue('pomoTotal', 0),
    readAsyncStorageValue('pomoCount', 0),
  ])
  return {
    minutes: Number(minutes) || 0,
    count: Number(count) || 0,
  }
}

function readHistory(records: RealityRecord[]): RealityRecord[] {
  return records
    .filter(record => record.body.startsWith(POMO_RECORD_PREFIX))
    .sort((a, b) => b.occurredAt - a.occurredAt)
}

function timeText(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function modeLabel(mode: PomoMode): string {
  return mode === 'focus' ? '专注' : '休息'
}

export function PomoPage() {
  const [mode, setMode] = useState<PomoMode>('focus')
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES)
  const [remainingSeconds, setRemainingSeconds] = useState(DEFAULT_MINUTES.focus * 60)
  const [running, setRunning] = useState(false)
  const [stats, setStats] = useState<PomoStats>({ minutes: 0, count: 0 })
  const [history, setHistory] = useState<RealityRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const timerRef = useRef<number | undefined>(undefined)
  const completingRef = useRef(false)

  const totalSeconds = minutes[mode] * 60
  const progress = totalSeconds > 0 ? (totalSeconds - remainingSeconds) / totalSeconds : 0
  const ringOffset = RING_CIRCUMFERENCE * Math.min(1, Math.max(0, progress))

  async function refreshHistory(): Promise<void> {
    try {
      setHistoryLoading(true)
      setHistory(readHistory(await recordAsyncRepository.list()))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '完成记录读取失败')
    } finally {
      setHistoryLoading(false)
    }
  }

  async function refreshStats(): Promise<void> {
    try {
      setStats(await readStats())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '番茄钟统计读取失败')
    }
  }

  useEffect(() => {
    void Promise.all([refreshHistory(), refreshStats()])
    const onDataSynced = () => {
      void refreshStats()
      void refreshHistory()
    }
    window.addEventListener('beryl-data-synced', onDataSynced)
    return () => window.removeEventListener('beryl-data-synced', onDataSynced)
  }, [])

  useEffect(() => {
    if (!running) return undefined
    timerRef.current = window.setInterval(() => {
      setRemainingSeconds(current => {
        if (current <= 1) {
          if (!completingRef.current) {
            completingRef.current = true
            setRunning(false)
            void finishSession()
          }
          return 0
        }
        return current - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current !== undefined) window.clearInterval(timerRef.current)
      timerRef.current = undefined
    }
  }, [running])

  useEffect(() => {
    document.title = running
      ? `${timeText(remainingSeconds)} ${modeLabel(mode)} — Calmy`
      : 'Calmy — 番茄钟'
    return () => {
      document.title = 'Calmy — 个人现实行动系统'
    }
  }, [mode, remainingSeconds, running])

  async function finishSession(): Promise<void> {
    const completedMode = mode
    const completedMinutes = minutes[completedMode]
    if (completedMode === 'focus') {
      setSaving(true)
      try {
        await withSaveState(async () => {
          const current = await readStats()
          const nextMinutes = current.minutes + completedMinutes
          const nextCount = current.count + 1
          if (!await writeAsyncStorageValue('pomoTotal', nextMinutes) || !await writeAsyncStorageValue('pomoCount', nextCount)) {
            throw new Error('番茄钟累计数据保存失败，请检查本地存储状态')
          }
          await recordAsyncRepository.create({
            type: 'fact',
            body: `${POMO_RECORD_PREFIX} ${completedMinutes} 分钟`,
            occurredAt: Date.now(),
            source: 'user',
          })
        })
        setStats(await readStats())
        await refreshHistory()
        toast(`专注完成，已记录 ${completedMinutes} 分钟`)
      } catch (cause) {
        toast(cause instanceof Error ? cause.message : '番茄钟完成记录保存失败', 'error')
      } finally {
        setSaving(false)
      }
    } else {
      toast('休息完成，准备开始下一轮专注')
    }

    setMode('rest')
    setRemainingSeconds(minutes.rest * 60)
    completingRef.current = false
  }

  function clearTimer(): void {
    if (timerRef.current !== undefined) window.clearInterval(timerRef.current)
    timerRef.current = undefined
  }

  function toggleTimer(): void {
    if (running) {
      clearTimer()
      setRunning(false)
      toast('计时已暂停', 'warning')
      return
    }
    if (remainingSeconds <= 0) setRemainingSeconds(totalSeconds)
    completingRef.current = false
    setRunning(true)
  }

  function resetTimer(): void {
    clearTimer()
    completingRef.current = false
    setRunning(false)
    setRemainingSeconds(totalSeconds)
  }

  function changeMode(nextMode: PomoMode): void {
    clearTimer()
    completingRef.current = false
    setRunning(false)
    setMode(nextMode)
    setRemainingSeconds(minutes[nextMode] * 60)
  }

  function changeMinutes(nextValue: string): void {
    const nextMinutes = Math.min(120, Math.max(1, Number(nextValue) || 1))
    setMinutes(current => ({ ...current, [mode]: nextMinutes }))
    if (!running) setRemainingSeconds(nextMinutes * 60)
  }

  const recentHistory = useMemo(() => history.slice(0, 8), [history])

  return (
    <div className="pomo-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">POMO · FOCUSED RHYTHM</p>
          <h1 className="font-title">番茄钟</h1>
          <p>用可调整的专注与休息节奏，把一轮时间落成可追溯的完成记录。</p>
        </div>
        <span className="load-pill">累计 {stats.minutes} 分钟 · {stats.count} 个</span>
      </header>

      <section className="beryl-card" style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          <button className={`react-btn ${mode === 'focus' ? 'primary' : ''}`} type="button" aria-label="切换到专注模式" aria-pressed={mode === 'focus'} onClick={() => changeMode('focus')} disabled={saving}>🍅 专注</button>
          <button className={`react-btn ${mode === 'rest' ? 'primary' : ''}`} type="button" aria-label="切换到休息模式" aria-pressed={mode === 'rest'} onClick={() => changeMode('rest')} disabled={saving}>☕ 休息</button>
        </div>

        <div style={{ position: 'relative', display: 'inline-block' }}>
          <svg viewBox="0 0 200 200" width="min(70vw, 256px)" height="min(70vw, 256px)" role="img" aria-label={`${modeLabel(mode)}剩余 ${timeText(remainingSeconds)}`}>
            <circle cx="100" cy="100" r="88" stroke="var(--c-border-soft)" strokeWidth="9" fill="none" />
            <circle
              cx="100"
              cy="100"
              r="88"
              stroke={mode === 'focus' ? 'var(--scene)' : 'var(--c-success)'}
              strokeWidth="9"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={ringOffset}
              transform="rotate(-90 100 100)"
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span className="eyebrow" style={{ color: mode === 'focus' ? 'var(--scene)' : 'var(--c-success)' }}>{modeLabel(mode)}</span>
            <strong className="font-title" style={{ fontSize: 'clamp(2.25rem, 8vw, 3.25rem)', lineHeight: 1.1 }}>{timeText(remainingSeconds)}</strong>
            <span className="muted">{running ? '进行中' : remainingSeconds === totalSeconds ? '准备开始' : '已暂停'}</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginTop: 20 }}>
          <button className="react-btn primary" type="button" aria-label={running ? '暂停番茄钟' : '开始番茄钟'} onClick={toggleTimer} disabled={saving}>{running ? '暂停' : remainingSeconds === totalSeconds ? '开始' : '继续'}</button>
          <button className="react-btn" type="button" aria-label="重置番茄钟" onClick={resetTimer} disabled={saving}>重置</button>
        </div>

        <div className="create-row" style={{ maxWidth: 520, margin: '22px auto 0', gridTemplateColumns: '1fr 1fr' }}>
          <label style={{ display: 'grid', gap: 6, textAlign: 'left', fontSize: 11, color: 'var(--c-text-2)' }}>
            专注分钟
            <input type="number" min="1" max="120" value={minutes.focus} onChange={event => { if (mode === 'focus') changeMinutes(event.target.value); else setMinutes(current => ({ ...current, focus: Math.min(120, Math.max(1, Number(event.target.value) || 1)) })) }} disabled={running || saving} />
          </label>
          <label style={{ display: 'grid', gap: 6, textAlign: 'left', fontSize: 11, color: 'var(--c-text-2)' }}>
            休息分钟
            <input type="number" min="1" max="120" value={minutes.rest} onChange={event => { if (mode === 'rest') changeMinutes(event.target.value); else setMinutes(current => ({ ...current, rest: Math.min(120, Math.max(1, Number(event.target.value) || 1)) })) }} disabled={running || saving} />
          </label>
        </div>

        <div className="stat-line" style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap', marginTop: 20, color: 'var(--c-text-2)', fontSize: 12 }}>
          <span>总专注 <b style={{ color: 'var(--amber)' }}>{stats.minutes}</b> 分钟</span>
          <span>完成番茄 <b style={{ color: 'var(--amber)' }}>{stats.count}</b> 个</span>
        </div>
      </section>

      <section className="beryl-card history-list" aria-labelledby="pomo-history-title" style={{ padding: 18 }}>
        <div className="section-title">
          <div>
            <p className="eyebrow">COMPLETION LOG</p>
            <h2 id="pomo-history-title" className="font-title">完成记录</h2>
          </div>
          <span className="muted">最近 {recentHistory.length} 条</span>
        </div>
        {error && <p className="form-error" role="alert" style={{ marginTop: 12 }}>{error}</p>}
        {historyLoading ? <div className="empty-state">正在读取完成记录…</div> : recentHistory.length ? (
          <div aria-live="polite">
            {recentHistory.map(record => (
              <article className="history-card" key={record.calmyId}>
                <p>{record.body}</p>
                <small>{fmtDate(record.occurredAt)} · 已保存到记录库</small>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">完成一轮专注后，历史记录会显示在这里。</div>
        )}
      </section>
    </div>
  )
}
