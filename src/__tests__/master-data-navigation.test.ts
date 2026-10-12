import { describe, expect, it } from 'vitest'
import { appPageRegistry } from '../router/route-manifest'

/**
 * 主数据管理仍是「数据」分组里的一级目的地。
 *
 * 迁移说明（第 25 轮）：旧壳的 `src/router/navigation.ts`（`featureNavigationGroups`）已经删除——
 * 它是旧侧边栏的分组表，随旧壳一起作废，除了本文件没有任何产品代码引用它。
 * 页面注册表（`route-manifest`）仍然存活（`src/router/index.ts`、`src/vue/page-registry.ts` 在用），
 * 所以这里保留对注册表那一半的断言，去掉对已删模块的断言。
 */
describe('master data navigation', () => {
  it('exposes the master data manager as a first-level navigation destination', () => {
    const page = appPageRegistry.find(item => item.path === '/app/master-data')
    expect(page?.viewKey).toBe('masterData')
    expect(page?.navigation).toMatchObject({ kind: 'feature', groupId: 'data', label: '主数据管理' })
  })
})
