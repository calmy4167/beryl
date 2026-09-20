import { describe, expect, it, vi } from 'vitest'
import { FeishuWorkspace } from '@/core/feishu/workspace'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

describe('Feishu workspace write boundary', () => {
  it('rejects writes while a refresh is in flight after a ready snapshot', async () => {
    const status = {
      configured: true,
      workspaceId: 'workspace-1',
      tables: { projects: false, tasks: true, reviews: false, members: false },
    }
    const pendingStatus = deferred<typeof status>()
    const remote = {
      status: vi.fn().mockResolvedValue(status),
      schema: vi.fn().mockResolvedValue({ tables: { tasks: { items: [
        { field_id: 'status', field_name: '状态', type: 3, property: { options: [{ name: '未开始' }, { name: '进行中' }] } },
      ] } } }),
      list: vi.fn(async (_config: unknown, table: string) => ({ items: table === 'tasks' ? [{ record_id: 'task-1', fields: { 状态: '未开始' } }] : [] })),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    }
    const workspace = new FeishuWorkspace(() => ({ baseUrl: 'https://worker.example', syncKey: 'secret' }), remote as never)

    await workspace.refresh()
    expect(workspace.getSnapshot().ready).toBe(true)

    remote.status.mockReturnValueOnce(pendingStatus.promise)
    const refreshing = workspace.refresh()
    expect(workspace.getSnapshot().loading).toBe(true)

    await expect(workspace.changeStatus('task-1', '进行中')).rejects.toThrow()
    expect(remote.update).not.toHaveBeenCalled()

    pendingStatus.resolve(status)
    await refreshing
  })
})
