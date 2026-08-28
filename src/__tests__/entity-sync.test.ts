import { describe, expect, it, vi } from 'vitest'
import { nextEntityVersion } from '@/core/db'
import { applyEntityRecords, entityChangeToRecord, entityChangesToRecords, isRemoteEntityRecordNewer } from '@/core/entity-sync'

describe('entity sync compatibility mapping', () => {
  it('keeps entity versions monotonic when the clock does not advance', () => {
    localStorage.removeItem('beryl_entity_version')
    const now = vi.spyOn(Date, 'now').mockReturnValue(100)
    try {
      expect(nextEntityVersion()).toBe(100)
      expect(nextEntityVersion()).toBe(101)
      expect(nextEntityVersion()).toBe(102)
    } finally {
      now.mockRestore()
    }
  })

  it('maps create/update and delete to a stable tombstone shape', () => {
    const base = { id: 'dev:1:x:0', entity: 'tasks', entityId: 'x', updatedAt: 10, device: 'dev' }
    expect(entityChangeToRecord({ ...base, operation: 'update', value: { id: 'x', title: 'new' } })).toMatchObject({ entity: 'tasks', entityId: 'x', value: { id: 'x', title: 'new' }, deleted: false })
    expect(entityChangeToRecord({ ...base, operation: 'delete' })).toMatchObject({ entity: 'tasks', entityId: 'x', deleted: true })
  })
  it('preserves order from the local entity log', () => {
    const changes = [{ id: 'a', entity: 'tasks', entityId: '1', operation: 'create' as const, updatedAt: 1, device: 'd' }, { id: 'b', entity: 'tasks', entityId: '2', operation: 'delete' as const, updatedAt: 2, device: 'd' }]
    expect(entityChangesToRecords(changes).map(item => item.entityId)).toEqual(['1', '2'])
  })
  it('keeps a newer local unsent version and resolves equal timestamps by device id', () => {
    const local = { updatedAt: 10, device: 'device-b' }
    expect(isRemoteEntityRecordNewer({ entity: 'tasks', entityId: '1', updatedAt: 9, device: 'device-z' }, local)).toBe(false)
    expect(isRemoteEntityRecordNewer({ entity: 'tasks', entityId: '1', updatedAt: 10, device: 'device-a' }, local)).toBe(false)
    expect(isRemoteEntityRecordNewer({ entity: 'tasks', entityId: '1', updatedAt: 10, device: 'device-c' }, local)).toBe(true)
    expect(isRemoteEntityRecordNewer({ entity: 'tasks', entityId: '1', updatedAt: 11, device: 'device-a' }, local)).toBe(true)
  })
  it('applies entity records to local collections and tombstones through the durable boundary', async () => {
    localStorage.setItem('b_tasks', JSON.stringify([{ id: '1', title: '旧' }, { id: '2', title: '删' }]))
    const applied = await applyEntityRecords([
      { entity: 'tasks', entityId: '1', value: { id: '1', title: '新' }, updatedAt: 3, device: 'd' },
      { entity: 'tasks', entityId: '2', updatedAt: 4, device: 'd', deleted: true }
    ])
    expect(applied).toBe(2)
    expect(JSON.parse(localStorage.getItem('b_tasks') || '[]')).toEqual([{ id: '1', title: '新' }])
  })
  it('does not overwrite a newer local value while applying a pull batch', async () => {
    localStorage.setItem('b_tasks', JSON.stringify([{ id: '1', title: '本地新值' }]))
    const applied = await applyEntityRecords([
      { entity: 'tasks', entityId: '1', value: { id: '1', title: '远端旧值' }, updatedAt: 3, device: 'remote' }
    ], [{ id: 'local-change', entity: 'tasks', entityId: '1', operation: 'update', updatedAt: 4, device: 'local', value: { id: '1', title: '本地新值' } }])
    expect(applied).toBe(0)
    expect(JSON.parse(localStorage.getItem('b_tasks') || '[]')).toEqual([{ id: '1', title: '本地新值' }])
  })
  it('fails before a caller can advance its cursor when local apply cannot be written', async () => {
    localStorage.setItem('b_tasks', JSON.stringify([{ id: '1', title: '旧' }]))
    const originalSetItem = Storage.prototype.setItem
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === 'b_tasks') throw new Error('quota')
      return originalSetItem.call(this, key, value)
    })
    try {
      await expect(applyEntityRecords([
        { entity: 'tasks', entityId: '1', value: { id: '1', title: '远端新值' }, updatedAt: 3, device: 'remote' }
      ])).rejects.toThrow('entity-apply-failed:tasks')
    } finally {
      setItem.mockRestore()
    }
  })
})
