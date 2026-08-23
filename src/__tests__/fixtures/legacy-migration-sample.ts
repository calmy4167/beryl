import type { CaseItem, CaseRelation } from '@/domain/case/model'

export interface LegacyMigrationSample {
  cases: CaseItem[]
  tasks: Array<{ id: string; title: string; priority: string; date: string; done: boolean }>
  inbox: Array<{ id: string; text: string; date: string }>
  relations: CaseRelation[]
}

/** 可重复使用的真实形态样本：一条课题、关联行动和一条原始 Capture。 */
export const legacyMigrationSample: LegacyMigrationSample = {
  cases: [{
    id: 'case-migration-sample',
    title: '建立稳定的工作节奏',
    problem: '任务很多，但每天都无法判断先做什么。',
    desiredOutcome: '形成可持续的每日最小行动。',
    status: 'active',
    currentPhase: 'wood',
    priority: 2,
    createdAt: 1724140800000,
    updatedAt: 1724144400000,
    phaseNotes: { wood: '先梳理限制，再选一个可开始的动作。' },
    wood: { constraints: '下午精力下降', paths: '上午完成最小闭环' },
    decisions: [],
    reviews: []
  }],
  tasks: [{
    id: 'task-migration-sample',
    title: '整理本周最重要的三件事',
    priority: '高',
    date: '2024-08-20 09:00',
    done: false
  }],
  inbox: [{
    id: 'inbox-migration-sample',
    text: '昨天的会议让我意识到，需要先减少并行事项。',
    date: '2024-08-20 10:00'
  }],
  relations: [{
    id: 'relation-migration-sample',
    caseId: 'case-migration-sample',
    targetType: 'task',
    targetId: 'task-migration-sample',
    phase: 'wood',
    createdAt: 1724148000000
  }]
}
