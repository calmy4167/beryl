import { describe, expect, it } from 'vitest'
import { evaluateConstraints } from '@/domain/constraints'

describe('constraint engine', () => {
  it('protects the body and chooses a minimum action when capacity is low', () => {
    const result = evaluateConstraints({
      bodyState: 'bad', mentalState: 'heavy', load: 85, availableMinutes: 45, protectedMinutes: 15,
      actionCandidates: [
        { actionId: 'a-long', title: '长时行动', estimatedMinutes: 60, intensity: 'high' },
        { actionId: 'a-small', title: '最小行动', estimatedMinutes: 5, intensity: 'minimum' }
      ]
    })

    expect(result.reducedIntensity).toBe(true)
    expect(result.suggestedActionIds).toEqual(['a-small'])
    expect(result.findings.map(item => item.kind)).toEqual(expect.arrayContaining(['body_capacity', 'mental_load', 'time_window']))
    expect(result.findings.every(item => item.minimumActionId === 'a-small')).toBe(true)
  })

  it('does not classify ordinary entertainment or normal workload as a conflict', () => {
    const result = evaluateConstraints({
      bodyState: 'normal', mentalState: 'normal', load: 30, availableMinutes: 120,
      actionCandidates: [{ actionId: 'a', title: '散步', estimatedMinutes: 20, intensity: 'normal' }]
    })

    expect(result.findings).toEqual([])
    expect(result.suggestedActionIds).toEqual(['a'])
  })

  it('reports unavailable resources without mutating the action context', () => {
    const context = {
      bodyState: 'normal' as const, mentalState: 'normal' as const, load: 30, availableMinutes: 120,
      resources: [{ resourceId: 'room', label: '会议室', available: false }],
      actionCandidates: [{ actionId: 'meeting', title: '开会', estimatedMinutes: 30, intensity: 'normal' as const, requiredResourceIds: ['room'] }]
    }

    const snapshot = structuredClone(context)
    const result = evaluateConstraints(context)

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'resource_availability', actionIds: ['meeting'], evidence: ['resource_unavailable:room'] })
    ]))
    expect(context).toEqual(snapshot)
  })

  it('does not report available or unknown resources as unavailable', () => {
    const result = evaluateConstraints({
      bodyState: 'normal', mentalState: 'normal', load: 30, availableMinutes: 120,
      resources: [{ resourceId: 'desk', label: '桌面', available: true }],
      actionCandidates: [{ actionId: 'write', title: '写作', estimatedMinutes: 20, intensity: 'normal', requiredResourceIds: ['desk', 'unknown'] }]
    })

    expect(result.findings.some(item => item.kind === 'resource_availability')).toBe(false)
  })

  it('flags direction conflicts while preserving the preferred direction as evidence', () => {
    const result = evaluateConstraints({
      bodyState: 'normal', mentalState: 'normal', load: 30, availableMinutes: 120,
      preferredTrajectory: 'advancing',
      actionCandidates: [{ actionId: 'retreat', title: '回撤行动', estimatedMinutes: 15, intensity: 'minimum', trajectory: 'retreating' }]
    })

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'trajectory_conflict', evidence: expect.arrayContaining(['preferred_trajectory:advancing', 'action_trajectory:retreating']) })
    ]))
  })

  it('flags blocked relationship and shared-space boundaries but allows an explicitly allowed Matter', () => {
    const result = evaluateConstraints({
      bodyState: 'normal', mentalState: 'normal', load: 30, availableMinutes: 120,
      relationshipBoundaries: [{ boundaryId: 'rel', label: '伙伴节律', blockedMatterIds: ['m1'] }],
      sharedSpaceBoundaries: [{ boundaryId: 'space', label: '家庭空间', blockedMatterIds: ['m1'], allowedMatterIds: ['m2'] }],
      actionCandidates: [
        { actionId: 'blocked', title: '触及边界', estimatedMinutes: 20, intensity: 'normal', matterId: 'm1', relationshipIds: ['rel'], sharedSpaceIds: ['space'] },
        { actionId: 'allowed', title: '允许行动', estimatedMinutes: 20, intensity: 'normal', matterId: 'm2', relationshipIds: [], sharedSpaceIds: ['space'] }
      ]
    })

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'relationship_boundary', actionIds: ['blocked'], evidence: ['relationship_boundary:rel'] }),
      expect.objectContaining({ kind: 'shared_space_conflict', actionIds: ['blocked'], evidence: ['shared_space_boundary:space'] })
    ]))
    expect(result.findings.find(item => item.kind === 'relationship_boundary')?.actionIds).not.toContain('allowed')
    expect(result.findings.find(item => item.kind === 'shared_space_conflict')?.actionIds).not.toContain('allowed')
  })
})
