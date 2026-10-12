import { h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache, todayKey } from '@/core/storage'
import { setActiveAccount } from '@/core/account-context'
import { createAsyncCollectionRepository } from '@/core/repository'
import LiubaiHabits from '@/vue/pages/LiubaiHabits.vue'

/**
 * 「习惯」页（v11）的行为覆盖。
 *
 * 迁移说明（第 27 轮）：本文件原来测的是旧页面 `HabitsPage.vue`（已删除）。旧页面还支持就地改名与
 * 删除，v11 的习惯页**不提供**这两项（`useReferenceWorkspace` 没有暴露改名/删除方法，页面注释里写明
 * 不假装提供），所以这里改为断言 v11 真实承担的行为：参考稿风格的 `.add-input` 新建习惯、
 * 点周内圆点打卡、以及**修订历史**（含"给没有历史的旧习惯打卡时不伪造创建事件"这条不变量）。
 * 用到的仓储路径与旧页面完全相同（habitRepository），没有新增存储。
 */

interface StoredHabit {
  id: string
  name: string
  color: string
  days: number
  dates: string[]
  revision?: number
  history?: Array<{
    revision: number
    operation: 'created' | 'updated'
    source: 'user' | 'system'
    occurredAt: number
    actorUserId?: string
    before?: { name: string; color: string; days: number; dates: string[] }
    after: { name: string; color: string; days: number; dates: string[] }
  }>
}

let wrapper: VueWrapper | undefined
async function openHabits() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app/module/habits', component: LiubaiHabits }] })
  await router.push('/app/module/habits'); await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}
const dayButton = (page: VueWrapper, habitName: string, day: string) =>
  page.findAll('.day').find(button => button.attributes('aria-label')?.startsWith(`${habitName} ${day} `))!

describe('Vue LiubaiHabits (v11) parity', () => {
  beforeEach(() => { setActiveAccount('vue-habits-parity-test-user'); localStorage.clear(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks(); setActiveAccount(null) })

  it('creates a habit through the reference-style composer with a stable creation revision', async () => {
    const page = await openHabits()

    await page.get('[aria-label="小行动名称"]').setValue('读书')
    await page.get('[aria-label="小行动名称"]').trigger('keydown.enter')
    await flushPromises()

    expect(page.text()).toContain('读书')
    const repo = createAsyncCollectionRepository<StoredHabit>('habits', item => item.id)
    const created = (await repo.list()).find(item => item.name === '读书')!
    expect(created).toMatchObject({ revision: 1, history: [{ revision: 1, operation: 'created', source: 'user', after: { name: '读书', dates: [] } }] })
  })

  it('records a day on the week dots and appends an updated revision', async () => {
    const page = await openHabits()
    await page.get('[aria-label="小行动名称"]').setValue('读书')
    await page.get('[aria-label="小行动名称"]').trigger('keydown.enter')
    await flushPromises()

    await dayButton(page, '读书', todayKey()).trigger('click')
    await flushPromises()

    const repo = createAsyncCollectionRepository<StoredHabit>('habits', item => item.id)
    const updated = (await repo.list()).find(item => item.name === '读书')!
    expect(updated.revision).toBe(2)
    expect(updated.dates).toEqual([todayKey()])
    expect(updated.history?.map(item => item.operation)).toEqual(['created', 'updated'])
    // 圆点状态跟着仓储走（aria-label 里带"已完成"）
    expect(dayButton(page, '读书', todayKey()).attributes('aria-label')).toContain('已完成')
  })

  it('does not invent a local creation event when ticking a legacy habit without history', async () => {
    const repo = createAsyncCollectionRepository<StoredHabit>('habits', item => item.id)
    await repo.create({ id: 'legacy-habit', name: '旧习惯', color: '#123456', days: 0, dates: [] })
    const page = await openHabits()

    await dayButton(page, '旧习惯', todayKey()).trigger('click')
    await flushPromises()

    const updated = await repo.find('legacy-habit')
    expect(updated).toMatchObject({ id: 'legacy-habit', revision: 1 })
    expect(updated?.history).toHaveLength(1)
    expect(updated?.history?.[0]).toMatchObject({ revision: 1, operation: 'updated', before: { name: '旧习惯' } })
  })
})
