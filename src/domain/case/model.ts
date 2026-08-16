export const CASE_PHASES = ['wood', 'fire', 'earth', 'metal', 'water'] as const
export type CasePhase = typeof CASE_PHASES[number]
export type CaseStatus = 'inbox' | 'active' | 'paused' | 'resolved' | 'archived'

export interface CaseItem {
  id: string
  title: string
  problem: string
  desiredOutcome: string
  status: CaseStatus
  currentPhase: CasePhase
  priority: number
  deadline?: number
  createdAt: number
  updatedAt: number
  phaseNotes: Partial<Record<CasePhase, string>>
}

export interface CaseRelation {
  id: string
  caseId: string
  targetType: 'task' | 'note' | 'person' | 'diary' | 'transaction' | 'post'
  targetId: string
  phase?: CasePhase
  createdAt: number
}

export const PHASE_META: Record<CasePhase, { label: string; icon: string; summary: string }> = {
  wood: { label: '木 · 定义', icon: '🌱', summary: '问题、结果、限制与方向' },
  fire: { label: '火 · 行动', icon: '🔥', summary: '现在要做什么' },
  earth: { label: '土 · 沉淀', icon: '⛰️', summary: '资料、事实与中间成果' },
  metal: { label: '金 · 判断', icon: '⚖️', summary: '比较、取舍与结论' },
  water: { label: '水 · 复盘', icon: '💧', summary: '经验、反馈与下一轮' }
}

export const STATUS_LABEL: Record<CaseStatus, string> = {
  inbox: '待梳理', active: '进行中', paused: '已暂停', resolved: '已解决', archived: '已归档'
}
