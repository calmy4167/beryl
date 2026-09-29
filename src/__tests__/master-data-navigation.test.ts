import { describe, expect, it } from 'vitest'
import { featureNavigationGroups } from '../router/navigation'
import { appPageRegistry } from '../router/route-manifest'

describe('master data navigation', () => {
  it('exposes the master data manager as a first-level navigation destination', () => {
    const page = appPageRegistry.find(item => item.path === '/app/master-data')
    expect(page?.viewKey).toBe('masterData')
    expect(page?.navigation).toMatchObject({ kind: 'feature', groupId: 'data', label: '主数据管理' })

    const group = featureNavigationGroups.find(item => item.id === 'data')
    expect(group?.items).toContainEqual(expect.objectContaining({ label: '主数据管理', path: '/app/master-data' }))
  })
})
