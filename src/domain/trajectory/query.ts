import { actionRepository } from '@/domain/action/repository'
import type { ActionItem } from '@/domain/action/model'
import { matterRepository } from '@/domain/matter/repository'
import type { Matter, MatterTrajectory } from '@/domain/matter/model'
import { recordRepository } from '@/domain/record/repository'
import type { RealityRecord } from '@/domain/record/model'
import { unifiedRepository, type Cycle, type Outcome } from '@/domain/unified'

export type TrajectoryEvidenceKind = 'action_done' | 'action_active' | 'action_skipped' | 'negative_record' | 'outcome' | 'cycle'

export interface TrajectoryEvidence {
  id: string
  kind: TrajectoryEvidenceKind
  label: string
  weight: number
  occurredAt: number
}

export interface MatterTrajectoryInsight {
  matterId: string
  declaredTrajectory: MatterTrajectory
  inferredTrajectory: MatterTrajectory
  confidence: number
  score: number
  positiveWeight: number
  negativeWeight: number
  evidence: TrajectoryEvidence[]
  explanation: string
  minimumAdjustment: string
  updatedAt: number
}

function startOfWindow(windowDays: number, now = Date.now()): number {
  return now - Math.max(1, windowDays) * 24 * 60 * 60 * 1000
}

function actionTime(action: ActionItem): number {
  const parsed = Date.parse(`${action.date}T12:00:00`)
  return Number.isFinite(parsed) ? parsed : action.updatedAt
}

function recent<T extends { updatedAt: number }>(items: T[], since: number): T[] {
  return items.filter(item => item.updatedAt >= since)
}

function recentRecord(record: RealityRecord, since: number): boolean {
  return record.occurredAt >= since || record.updatedAt >= since
}

function inferDirection(score: number, positiveWeight: number, negativeWeight: number, evidenceCount: number): MatterTrajectory {
  if (!evidenceCount) return 'stable'
  if (positiveWeight > 0 && negativeWeight > 0 && Math.abs(score) <= 1) return 'diverging'
  if (score >= 3) return negativeWeight > 0 ? 'recovering' : 'advancing'
  if (score <= -3) return 'retreating'
  return 'stalled'
}

function explanationFor(direction: MatterTrajectory, evidence: TrajectoryEvidence[]): string {
  if (!evidence.length) return '当前窗口没有足够事实，保持手动轨迹，不从空白推断。'
  if (direction === 'advancing') return '近期行动和结果证据一致指向推进。'
  if (direction === 'recovering') return '近期有推进证据，但仍夹杂负向变化，先保持低强度连续性。'
  if (direction === 'retreating') return '负向记录或中断行动占主导，需要先缩小承载和暴露面。'
  if (direction === 'diverging') return '推进和退缩证据同时出现，先复盘矛盾，不急着提高目标强度。'
  if (direction === 'lost') return '原先的目标或连接暂时失去，需要先确认还要不要继续。'
  if (direction === 'restarting') return '这一轮正在重新开始，先选择一个足够小的现实动作。'
  if (direction === 'unknown') return '当前无法确认方向，不用急着给它贴上结论。'
  return '有事实发生，但方向信号不足以支持明显推进或退行。'
}

function adjustmentFor(direction: MatterTrajectory): string {
  if (direction === 'advancing') return '保留当前最小验证，避免额外扩张。'
  if (direction === 'recovering') return '只保留一个可重复的最低强度行动。'
  if (direction === 'retreating') return '先停止堆叠，恢复容量后再重开行动。'
  if (direction === 'diverging') return '回到最近一条关键证据，明确当前真正的矛盾。'
  if (direction === 'lost') return '先确认是否仍然值得面对，再决定保留、改写或结束。'
  if (direction === 'restarting') return '只承诺一个今天能完成的重新开始。'
  if (direction === 'unknown') return '保留未知，不用用更多任务强行制造确定感。'
  return '继续观察，不因为单日完成率改变方向判断。'
}

function collectEvidence(matter: Matter, windowDays: number, now = Date.now()): TrajectoryEvidence[] {
  const since = startOfWindow(windowDays, now)
  const evidence: TrajectoryEvidence[] = []
  for (const action of actionRepository.list().filter(item => item.matterId === matter.calmyId && actionTime(item) >= since)) {
    if (action.status === 'done') evidence.push({ id: action.calmyId, kind: 'action_done', label: `完成 Action：${action.title}`, weight: 2, occurredAt: actionTime(action) })
    else if (action.status === 'in_progress') evidence.push({ id: action.calmyId, kind: 'action_active', label: `进行中 Action：${action.title}`, weight: 1, occurredAt: actionTime(action) })
    else if (action.status === 'skipped' || action.status === 'cancelled') evidence.push({ id: action.calmyId, kind: 'action_skipped', label: `中断 Action：${action.title}`, weight: -1, occurredAt: action.updatedAt })
  }
  for (const record of recordRepository.list().filter(item => item.matterId === matter.calmyId && recentRecord(item, since) && item.type === 'negative')) {
    evidence.push({ id: record.calmyId, kind: 'negative_record', label: `负向 Record：${record.impact || 'other'}`, weight: -2, occurredAt: record.occurredAt })
  }
  const actions = new Map(actionRepository.list().map(action => [action.calmyId, action]))
  for (const outcome of recent(unifiedRepository.list<Outcome>('outcome').filter(item => item.matterId === matter.calmyId || actions.get(item.actionId)?.matterId === matter.calmyId), since)) {
    const action = actions.get(outcome.actionId)
    evidence.push({ id: outcome.calmyId, kind: 'outcome', label: `Outcome：${outcome.summary}`, weight: outcome.status === 'observed' ? 1 : 2, occurredAt: outcome.updatedAt || action?.updatedAt || now })
  }
  for (const cycle of recent(unifiedRepository.list<Cycle>('cycle').filter(item => item.matterId === matter.calmyId), since)) {
    const positive = cycle.status === 'completed' || cycle.trajectory === 'advancing' || cycle.trajectory === 'recovering'
    const negative = cycle.status === 'paused' || cycle.trajectory === 'stalled' || cycle.trajectory === 'retreating'
    if (positive || negative) evidence.push({ id: cycle.calmyId, kind: 'cycle', label: `Cycle：${cycle.title}`, weight: positive ? 1 : -1, occurredAt: cycle.updatedAt })
  }
  return evidence.sort((a, b) => b.occurredAt - a.occurredAt)
}

export function inferMatterTrajectory(matter: Matter, windowDays = 30, now = Date.now()): MatterTrajectoryInsight {
  const evidence = collectEvidence(matter, windowDays, now)
  const positiveWeight = evidence.filter(item => item.weight > 0).reduce((sum, item) => sum + item.weight, 0)
  const negativeWeight = evidence.filter(item => item.weight < 0).reduce((sum, item) => sum + Math.abs(item.weight), 0)
  const score = positiveWeight - negativeWeight
  const inferredTrajectory = inferDirection(score, positiveWeight, negativeWeight, evidence.length)
  const confidence = evidence.length ? Math.min(0.95, 0.45 + Math.min(0.3, evidence.length * 0.05) + Math.min(0.2, Math.abs(score) * 0.05)) : 0.2
  return {
    matterId: matter.calmyId,
    declaredTrajectory: matter.trajectory,
    inferredTrajectory,
    confidence,
    score,
    positiveWeight,
    negativeWeight,
    evidence,
    explanation: explanationFor(inferredTrajectory, evidence),
    minimumAdjustment: adjustmentFor(inferredTrajectory),
    updatedAt: evidence[0]?.occurredAt || matter.updatedAt
  }
}

export function listMatterTrajectoryInsights(windowDays = 30, now = Date.now()): MatterTrajectoryInsight[] {
  return matterRepository.list().map(matter => inferMatterTrajectory(matter, windowDays, now))
}
