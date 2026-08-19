import { beforeEach, describe, expect, it } from 'vitest'
import { actionRepository } from '@/domain/action/repository'
import { matterRepository } from '@/domain/matter/repository'
import { recordRepository } from '@/domain/record/repository'
import { inferMatterTrajectory } from '@/domain/trajectory'
import { unifiedRepository } from '@/domain/unified'

describe('Matter trajectory inference', () => {
  beforeEach(() => localStorage.clear())

  it('infers advancing from completed Action and accepted Outcome without changing the declared Matter trajectory', () => {
    const matter = matterRepository.create({ title: '推进验证' })
    const action = actionRepository.create({ title: '完成验证', date: '2026-08-19', matterId: matter.calmyId })
    actionRepository.complete(action.calmyId, '得到反馈')
    unifiedRepository.createOutcomeForAction({ actionId: action.calmyId, matterId: matter.calmyId, summary: '验证完成', status: 'accepted', evidenceRecordIds: [] })

    const insight = inferMatterTrajectory(matter, 30)

    expect(insight).toMatchObject({ matterId: matter.calmyId, declaredTrajectory: 'stable', inferredTrajectory: 'advancing', score: 4 })
    expect(insight.evidence.map(item => item.kind)).toEqual(expect.arrayContaining(['action_done', 'outcome']))
    expect(matterRepository.find(matter.calmyId)?.trajectory).toBe('stable')
  })

  it('infers retreating when negative Record and interrupted Action dominate the window', () => {
    const matter = matterRepository.create({ title: '需要收缩的事项' })
    const action = actionRepository.create({ title: '暂缓推进', date: '2026-08-19', matterId: matter.calmyId })
    actionRepository.skip(action.calmyId, '容量不足')
    recordRepository.createNegative({ body: '今天因为过载逃避了关键步骤', matterId: matter.calmyId, impact: 'escape', occurredAt: Date.now() })

    const insight = inferMatterTrajectory(matter, 30)

    expect(insight.inferredTrajectory).toBe('retreating')
    expect(insight.negativeWeight).toBe(3)
    expect(insight.minimumAdjustment).toContain('恢复容量')
  })

  it('marks mixed positive and negative evidence as diverging instead of forcing a single direction', () => {
    const matter = matterRepository.create({ title: '方向分叉事项' })
    const action = actionRepository.create({ title: '完成一半', date: '2026-08-19', matterId: matter.calmyId })
    actionRepository.complete(action.calmyId)
    recordRepository.createNegative({ body: '同时出现明显退缩', matterId: matter.calmyId, impact: 'retreat', occurredAt: Date.now() })

    expect(inferMatterTrajectory(matter, 30)).toMatchObject({ inferredTrajectory: 'diverging', score: 0 })
  })

  it('keeps an evidence-free Matter stable with low confidence', () => {
    const matter = matterRepository.create({ title: '尚无证据' })

    const insight = inferMatterTrajectory(matter, 30)

    expect(insight).toMatchObject({ inferredTrajectory: 'stable', confidence: 0.2, evidence: [] })
    expect(insight.explanation).toContain('没有足够事实')
  })
})
