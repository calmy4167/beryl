import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionItem } from '@/domain/action/model'
import type { RealityRecord } from '@/domain/record/model'

const repositories = vi.hoisted(() => ({
  actionFind: vi.fn(),
  actionComplete: vi.fn(),
  recordCreate: vi.fn()
}))

vi.mock('@/domain/action/repository', () => ({ actionAsyncRepository: { find: repositories.actionFind, complete: repositories.actionComplete } }))
vi.mock('@/domain/record/repository', () => ({ recordAsyncRepository: { create: repositories.recordCreate } }))

import { recordActionResult } from '@/application/use-cases/record-action-result'

const action = { calmyId: 'a1', title: '完成最小闭环', date: '2026-08-22', status: 'planned', matterId: 'm1', cycleId: 'c1', revision: 1 } as ActionItem
const completedAction = { ...action, status: 'done', revision: 2 } as ActionItem
const record = { calmyId: 'r1', type: 'fact', body: '完成了最小闭环', occurredAt: 1, createdAt: 1, updatedAt: 1, matterId: 'm1', actionId: 'a1', source: 'user', evidenceIds: [], revision: 1 } as RealityRecord

describe('RecordActionResult application use case', () => {
  beforeEach(() => {
    repositories.actionFind.mockReset().mockResolvedValue(action)
    repositories.actionComplete.mockReset().mockResolvedValue(completedAction)
    repositories.recordCreate.mockReset().mockResolvedValue(record)
  })

  it('completes the action and creates evidence with the action context', async () => {
    const result = await recordActionResult({ actionId: 'a1', recordBody: '完成了最小闭环', resultNote: '跑通测试', expectedActionRevision: 1, commandId: 'result-command-1' })

    expect(repositories.actionComplete).toHaveBeenCalledWith('a1', '跑通测试', 1, { commandId: 'result-command-1' })
    expect(repositories.recordCreate).toHaveBeenCalledWith({ body: '完成了最小闭环', type: 'fact', impact: undefined, occurredAt: undefined, actionId: 'a1', matterId: 'm1', cycleId: 'c1' }, { commandId: 'result-command-1' })
    expect(result).toEqual({ action: completedAction, record })
  })

  it('rejects empty evidence before any write', async () => {
    await expect(recordActionResult({ actionId: 'a1', recordBody: '   ' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })

    expect(repositories.actionComplete).not.toHaveBeenCalled()
    expect(repositories.recordCreate).not.toHaveBeenCalled()
  })

  it('returns partial success when the action is done but evidence recording fails', async () => {
    const error = new Error('record write failed')
    repositories.recordCreate.mockRejectedValue(error)

    const result = await recordActionResult({ actionId: 'a1', recordBody: '稍后补充' })

    expect(result.action).toBe(completedAction)
    expect(result.record).toBeUndefined()
    expect(result.recordError).toBe(error)
  })

  it('does not attempt evidence recording when action completion fails', async () => {
    const error = new Error('action write failed')
    repositories.actionComplete.mockRejectedValue(error)

    await expect(recordActionResult({ actionId: 'a1', recordBody: '不会保存' })).rejects.toBe(error)
    expect(repositories.recordCreate).not.toHaveBeenCalled()
  })

  it('rejects a missing action before attempting either write', async () => {
    repositories.actionFind.mockResolvedValue(undefined)

    await expect(recordActionResult({ actionId: 'missing', recordBody: '不会保存' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(repositories.actionComplete).not.toHaveBeenCalled()
    expect(repositories.recordCreate).not.toHaveBeenCalled()
  })
})
