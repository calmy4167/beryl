import { defineComponent, h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import { matterAsyncRepository } from '@/domain/matter/repository'
import { recordAsyncRepository } from '@/domain/record/repository'
import { unifiedAsyncRepository, unifiedFactories } from '@/domain/unified'
import CalendarPage from '@/vue/pages/CalendarPage.vue'

let wrapper: VueWrapper | undefined

async function openCalendar(date = '2026-09-14') {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/app/calendar', component: CalendarPage },
    { path: '/app/today', component: defineComponent({ render: () => h('h1', '今天页面') }) },
    { path: '/app/matters/:id', component: defineComponent({ render: () => h('h1', '处境详情') }) },
  ] })
  await router.push(`/app/calendar?date=${date}`)
  await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await flushPromises()
  return { page: wrapper, router }
}

describe('Vue CalendarPage parity', () => {
  beforeEach(() => { localStorage.clear(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })

  it('preserves the separate completed and total count text boundaries', async () => {
    const { page } = await openCalendar()
    const count = page.get('.day-metrics b:first-child')

    expect(Array.from(count.element.childNodes, node => node.textContent)).toEqual(['0', '/', '0'])
    expect(Array.from(count.element.childNodes, node => node.nodeType)).toEqual([Node.TEXT_NODE, Node.TEXT_NODE, Node.TEXT_NODE])
  })

  it('shows 42 days, shifts month without changing selection, and syncs selected day to the query', async () => {
    const { page, router } = await openCalendar()
    expect(page.findAll('.calendar-cell')).toHaveLength(42)
    expect(page.get('.calendar-cell[aria-label="2026-09-14，已选中"]').attributes('aria-pressed')).toBe('true')
    await page.get('[aria-label="下一个月"]').trigger('click')
    expect(page.get('.month-panel').attributes('aria-label')).toContain('10月')
    expect(router.currentRoute.value.query.date).toBe('2026-09-14')
    await page.get('.calendar-cell[aria-label="2026-10-12"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.date).toBe('2026-10-12')
    expect(page.get('.selected-day h2').text()).toBe('2026-10-12')
    await router.replace('/app/calendar?date=2026-11-03')
    await flushPromises()
    expect(page.get('.selected-day h2').text()).toBe('2026-11-03')
    expect(page.get('.month-panel').attributes('aria-label')).toContain('11月')
  })

  it('reads real action, record, matter and daily state evidence and navigates from it', async () => {
    const matter = await matterAsyncRepository.create({ title: '现实处境' })
    const action = await actionAsyncRepository.create({ title: '今天的行动', date: '2026-09-14', matterId: matter.calmyId })
    await actionAsyncRepository.complete(action.calmyId)
    await recordAsyncRepository.create({ type: 'fact', body: '今天的记录', occurredAt: new Date(2026, 8, 14, 12).getTime(), matterId: matter.calmyId })
    await unifiedAsyncRepository.create(unifiedFactories.dailyState({ date: '2026-09-14', bodyState: 'tired', mentalState: 'heavy', load: 70, trajectory: 'recovering', protectedItems: [] }))
    const { page, router } = await openCalendar()
    expect(page.get('.calendar-cell[aria-label="2026-09-14，已选中"] .cell-dots').findAll('i')).toHaveLength(3)
    expect(page.get('.day-metrics').text()).toContain('1/1')
    expect(page.get('.day-metrics').text()).toContain('70%')
    expect(page.get('.state-line').text()).toContain('恢复')
    expect(page.get('.evidence-panel').text()).toContain('今天的行动')
    expect(page.get('.evidence-panel').text()).toContain('今天的记录')
    await page.get('.evidence-panel .evidence-actions button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe(`/app/matters/${matter.calmyId}`)
  })

  it('shows empty evidence and opens today for the selected date', async () => {
    const { page, router } = await openCalendar()
    expect(page.text()).toContain('当天没有行动证据。')
    expect(page.text()).toContain('当天没有现实记录。')
    expect(page.text()).toContain('本月还没有关联课题的证据。')
    await page.get('.selected-day .quiet').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/app/today?date=2026-09-14')
  })

  it('refreshes after data sync and allows retry after repository read failure', async () => {
    const list = vi.spyOn(actionAsyncRepository, 'list').mockRejectedValueOnce(new Error('读取失败'))
    const { page } = await openCalendar()
    expect(page.get('[role="alert"]').text()).toContain('读取失败')
    expect(page.get('.evidence-panel .panel-head').text()).toContain('0 条证据')
    list.mockRestore()
    await actionAsyncRepository.create({ title: '同步后行动', date: '2026-09-14' })
    await page.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(page.get('.evidence-panel').text()).toContain('同步后行动')
  })
})
