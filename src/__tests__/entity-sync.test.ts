import { describe, expect, it } from 'vitest'
import { applyEntityRecords, entityChangeToRecord, entityChangesToRecords } from '@/core/entity-sync'

describe('entity sync compatibility mapping', () => {
  it('maps create/update and delete to a stable tombstone shape', () => {
    const base = { id: 'dev:1:x:0', entity: 'tasks', entityId: 'x', updatedAt: 10, device: 'dev' }
    expect(entityChangeToRecord({ ...base, operation: 'update', value: { id: 'x', title: 'new' } })).toMatchObject({ entity: 'tasks', entityId: 'x', value: { id: 'x', title: 'new' }, deleted: false })
    expect(entityChangeToRecord({ ...base, operation: 'delete' })).toMatchObject({ entity: 'tasks', entityId: 'x', deleted: true })
  })
  it('preserves order from the local entity log', () => {
    const changes = [{ id: 'a', entity: 'tasks', entityId: '1', operation: 'create' as const, updatedAt: 1, device: 'd' }, { id: 'b', entity: 'tasks', entityId: '2', operation: 'delete' as const, updatedAt: 2, device: 'd' }]
    expect(entityChangesToRecords(changes).map(item => item.entityId)).toEqual(['1', '2'])
  })
  it('applies entity records to local collections and tombstones', () => {
    localStorage.setItem('b_tasks', JSON.stringify([{ id: '1', title: '旧' }, { id: '2', title: '删' }]))
    const applied = applyEntityRecords([
      { entity: 'tasks', entityId: '1', value: { id: '1', title: '新' }, updatedAt: 3, device: 'd' },
      { entity: 'tasks', entityId: '2', updatedAt: 4, device: 'd', deleted: true }
    ])
    expect(applied).toBe(2)
    expect(JSON.parse(localStorage.getItem('b_tasks') || '[]')).toEqual([{ id: '1', title: '新' }])
  })
})
