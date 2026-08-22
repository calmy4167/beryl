import { beforeEach, describe, expect, it, vi } from 'vitest'

const repository = vi.hoisted(() => ({
  create: vi.fn(),
  suggest: vi.fn()
}))

vi.mock('@/domain/capture', () => ({ captureAsyncRepository: repository }))

import { captureText } from '@/application/use-cases/capture-text'

describe('CaptureText application use case', () => {
  beforeEach(() => {
    repository.create.mockReset()
    repository.suggest.mockReset()
  })

  it('saves the original before returning a local suggestion', async () => {
    const capture = { calmyId: 'capture-1', body: '完成供应商确认' }
    const suggestion = { calmyId: 'suggestion-1', captureId: 'capture-1', status: 'suggested' }
    repository.create.mockResolvedValue(capture)
    repository.suggest.mockResolvedValue(suggestion)

    await expect(captureText('完成供应商确认')).resolves.toEqual({ capture, suggestion })
    expect(repository.create).toHaveBeenCalledWith('完成供应商确认')
    expect(repository.suggest).toHaveBeenCalledWith('capture-1')
    expect(repository.create.mock.invocationCallOrder[0]).toBeLessThan(repository.suggest.mock.invocationCallOrder[0])
  })

  it('returns the saved original when suggestion generation fails', async () => {
    const capture = { calmyId: 'capture-2', body: '只记录这件事' }
    const error = new Error('suggestion unavailable')
    repository.create.mockResolvedValue(capture)
    repository.suggest.mockRejectedValue(error)

    await expect(captureText('只记录这件事')).resolves.toEqual({ capture, suggestionError: error })
  })

  it('keeps create errors visible to the caller', async () => {
    const error = new Error('capture write failed')
    repository.create.mockRejectedValue(error)

    await expect(captureText('无法保存')).rejects.toBe(error)
    expect(repository.suggest).not.toHaveBeenCalled()
  })
})
