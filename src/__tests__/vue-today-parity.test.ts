import { h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import { matterAsyncRepository } from '@/domain/matter/repository'
import { recordAsyncRepository } from '@/domain/record/repository'
import { todayAsyncRepository } from '@/domain/today/repository'
import TodayPage from '@/vue/pages/TodayPage.vue'

let wrapper: VueWrapper | undefined
async function openTodayPage() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/app/today', component: TodayPage },
    { path: '/app/review', component: { template: '<h1>回顾</h1>' } },
    { path: '/app/flow', component: { template: '<h1>探索</h1>' } },
    { path: '/app/matters/:id', component: { template: '<h1>处境</h1>' } },
  ] })
  await router.push('/app/today'); await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}
describe('Vue Today parity', () => {
  beforeEach(() => { localStorage.clear(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })
  it('loads the record-first workspace and adds an action to today', async () => {
    const matter = await matterAsyncRepository.create({ title: '准备面试' })
    const page = await openTodayPage()
    expect(page.find('[aria-label="今天的记录"]').exists()).toBe(true)
    expect(page.find('.recent-records-heading button.quiet-link').exists()).toBe(true)
    expect(page.get('[aria-label="行动关联事项"]').attributes('role')).toBe('combobox')
    await page.get('[aria-label="行动关联事项"]').trigger('click')
    await page.get(`[role="option"][data-value="${matter.calmyId}"]`).trigger('click')
    await page.get('[aria-label="新增现实行动"]').setValue('发送项目提案')
    await page.get('[aria-label="新增现实行动"]').trigger('keydown.enter')
    await flushPromises()
    expect((await actionAsyncRepository.list()).some(item => item.title === '发送项目提案' && item.matterId === matter.calmyId)).toBe(true)
  })
  it('saves a journal record with the selected 心/事实 category and persists body state', async () => {
    const page = await openTodayPage()
    await page.get('[aria-label="记录原文"]').setValue('今天把边界说清楚了')
    await page.get('[aria-label="记录类别"] button').trigger('click')
    await page.get('[aria-label="记录"]',).trigger('click')
    await flushPromises()
    expect((await recordAsyncRepository.list()).some(item => item.body === '今天把边界说清楚了' && item.journalCategory === 'mind')).toBe(true)
    await page.findAll('[aria-label="身体状态"] button').find(item => item.text() === '疲惫')!.trigger('click')
    await flushPromises()
    const plan = await todayAsyncRepository.get((await import('@/core/storage')).todayKey())
    expect(plan?.load).toBe('tired')
  })
  it('switches between local Today and the Feishu task-selection view', async () => {
    const page = await openTodayPage()
    expect(page.find('[aria-label="选择数据来源"]').exists()).toBe(true)
    await page.get('[aria-label="选择数据来源"] button:nth-child(2)').trigger('click')
    await flushPromises()
    expect(localStorage.getItem('calmy:workspace:source')).toBe('feishu')
    expect(page.text()).toContain('今天，先做一件事')
    expect(page.get('[aria-label="飞书任务关联项目"]').attributes('role')).toBe('combobox')
    await page.get('[aria-label="选择数据来源"] button:nth-child(1)').trigger('click')
    await flushPromises()
    expect(page.find('[aria-label="记录原文"]').exists()).toBe(true)
  })
})
