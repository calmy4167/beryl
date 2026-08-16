import { describe, expect, it } from 'vitest'
import { entityChangeToRecord, entityChangesToRecords } from '@/core/entity-sync'

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
})
