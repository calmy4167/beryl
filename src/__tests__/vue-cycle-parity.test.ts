import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { todayKey } from '@/core/storage'
import type { ActionItem } from '@/domain/action/model'
import type { Matter } from '@/domain/matter/model'
import type { TodayPlan } from '@/domain/today/model'

const harness = vi.hoisted(() => ({
  matters: [] as Matter[],
  actions: [] as ActionItem[],
  plans: [] as TodayPlan[],
  error: undefined as Error | undefined,
  matterList: vi.fn(),
  actionListForDate: vi.fn(),
  todayList: vi.fn(),
}))

vi.mock('@/domain/matter/repository', () => ({ matterAsyncRepository: { list: harness.matterList } }))
vi.mock('@/domain/action/repository', () => ({ actionAsyncRepository: { listForDate: harness.actionListForDate } }))
vi.mock('@/domain/today/repository', () => ({ todayAsyncRepository: { list: harness.todayList } }))

import CyclePage from '@/vue/pages/CyclePage.vue'

const mountedWrappers: ReturnType<typeof mount>[] = []

const matter = (id: string, overrides: Partial<Matter> = {}): Matter => ({
  calmyId: id,
  title: id,
  why: `${id} 的原因`,
  primaryContradiction: '',
  status: 'active',
  currentStage: 'wood',
  trajectory: 'stable',
  evidenceIds: [],
  createdAt: 1,
  updatedAt: 1,
  revision: 1,
  ...overrides,
})

const action = (id: string, overrides: Partial<ActionItem> = {}): ActionItem => ({
  calmyId: id,
  title: id,
  date: todayKey(),
  status: 'planned',
  createdAt: 1,
  updatedAt: 1,
  revision: 1,
  ...overrides,
})

const plan = (overrides: Partial<TodayPlan> = {}): TodayPlan => ({
  date: todayKey(),
  load: 'normal',
  focusActionIds: [],
  why: '',
  mustProtect: [],
  letGo: [],
  review: { observation: '', analysis: '', adjustment: '', seed: '' },
  revision: 1,
  updatedAt: 1,
  ...overrides,
})

async function mountedPage() {
  const routes = ['/app/cycle', '/app/today', '/app/review', '/app/matters', '/app/matters/:id'].map(path => ({
    path,
    component: { template: '<div />' },
  }))
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push('/app/cycle')
  await router.isReady()
  const wrapper = mount(CyclePage, { global: { plugins: [router] } })
  mountedWrappers.push(wrapper)
  return { wrapper, router }
}

describe('Vue CyclePage parity', () => {
  afterEach(() => {
    mountedWrappers.splice(0).forEach(wrapper => wrapper.unmount())
  })
  beforeEach(() => {
    harness.matters = []
    harness.actions = []
    harness.plans = []
    harness.error = undefined
    harness.matterList.mockReset().mockImplementation(async () => {
      if (harness.error) throw harness.error
      return structuredClone(harness.matters)
    })
    harness.actionListForDate.mockReset().mockImplementation(async () => {
      if (harness.error) throw harness.error
      return structuredClone(harness.actions)
    })
    harness.todayList.mockReset().mockImplementation(async () => {
      if (harness.error) throw harness.error
      return structuredClone(harness.plans)
    })
  })

  it('shows the five-stage distribution and chooses the focused action’s matter', async () => {
    harness.matters = [
      matter('普通课题', { currentStage: 'wood' }),
      matter('重点课题', { currentStage: 'fire' }),
      matter('已归档课题', { status: 'archived', currentStage: 'earth' }),
      matter('暂停课题', { status: 'paused', currentStage: 'water' }),
    ]
    harness.actions = [action('重点行动', { matterId: '重点课题' })]
    harness.plans = [plan({ focusActionIds: ['重点行动'] })]
    const { wrapper } = await mountedPage()
    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(false))

    expect(wrapper.get('[aria-label="课题五行阶段分布"]').findAll('.cycle-node')).toHaveLength(5)
    expect(wrapper.findAll('.cycle-node small').map(node => node.text())).toEqual([
      '1 个课题', '1 个课题', '0 个课题', '0 个课题', '1 个课题',
    ])
    expect(wrapper.get('.cycle-node.current').attributes('aria-current')).toBe('step')
    expect(wrapper.get('.cycle-center').text()).toContain('重点课题')
    expect(wrapper.get('#cycle-current-title').text()).toBe('火 · 推进')
    expect(wrapper.text()).toContain('3 个未归档课题')
    expect(wrapper.get('#cycle-matters-title').text()).toBe('这一轮的课题')
    expect(wrapper.get('#cycle-matters-title').element.closest('section')?.textContent).not.toContain('暂停课题')
  })

  it('excludes cancelled actions from completion but keeps them in the action list', async () => {
    harness.actions = [
      action('完成', { status: 'done' }),
      action('待办'),
      action('取消', { status: 'cancelled' }),
    ]
    harness.plans = [plan({ focusActionIds: ['完成'], load: 'tired' })]
    const { wrapper } = await mountedPage()
    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(false))

    expect(wrapper.get('[aria-label="今日行动完成度"]').attributes('aria-valuenow')).toBe('50')
    expect(wrapper.text()).toContain('今日行动 1/2 · 完成度 50% · 有些疲惫')
    expect(wrapper.get('.cycle-completed-count').text()).toBe('1')
    expect(wrapper.get('.cycle-total-count').text()).toBe('2')
    expect(wrapper.get('.cycle-completion-count').text()).toBe('50')
    expect((wrapper.get('.cycle-completed-count').element as HTMLElement).style.display).toBe('contents')
    expect(wrapper.get('#cycle-actions-title').element.closest('section')?.textContent).toContain('取消 · 已取消')
    expect(wrapper.get('#cycle-actions-title').element.closest('section')?.textContent).toContain('★ 完成 · 已完成')
    expect(wrapper.text()).not.toContain('今天尚未建立计划')
  })

  it('keeps the page read-only and shows empty guidance without creating a plan', async () => {
    const { wrapper } = await mountedPage()
    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(false))

    expect(wrapper.text()).toContain('等待起步')
    expect(wrapper.text()).toContain('尚无进行中的课题')
    expect(wrapper.text()).toContain('今天尚未建立计划；本页保持只读，不会为了展示而创建新数据。')
    expect(wrapper.get('[aria-label="今日行动完成度"]').attributes('aria-valuenow')).toBe('0')
    expect(wrapper.findAll('input, textarea, select')).toHaveLength(0)
    expect(wrapper.text()).toContain('开始今日复盘')
  })

  it('navigates to Today, Review, Matters and a Matter detail', async () => {
    harness.matters = [matter('matter-1', { title: '重新安排作息' })]
    harness.plans = [plan({ review: { observation: '实际休息了', analysis: '', adjustment: '', seed: '' } })]
    const { wrapper, router } = await mountedPage()
    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(false))

    expect(wrapper.text()).toContain('查看今日复盘')
    await wrapper.findAll('button').find(button => button.text() === '查看今日复盘')!.trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/app/review'))
    await wrapper.findAll('button').find(button => button.text() === '回到今天')!.trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/app/today'))
    await wrapper.findAll('button').find(button => button.text() === '全部处境')!.trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/app/matters'))
    await wrapper.findAll('button').find(button => button.text().includes('重新安排作息'))!.trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/app/matters/matter-1'))
  })

  it('shows an initial read error, retries, and refreshes on data sync', async () => {
    harness.error = new Error('存储暂时不可用')
    const { wrapper } = await mountedPage()
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
    expect(wrapper.text()).toContain('周期暂时无法加载')
    expect(wrapper.text()).toContain('存储暂时不可用')

    harness.error = undefined
    harness.matters = [matter('恢复后的课题')]
    await wrapper.findAll('button').find(button => button.text() === '重新读取')!.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('恢复后的课题'))

    harness.matters = [matter('同步后的课题', { currentStage: 'metal' })]
    window.dispatchEvent(new Event('beryl-data-synced'))
    await vi.waitFor(() => expect(wrapper.get('.cycle-center').text()).toContain('同步后的课题'))
    expect(wrapper.get('#cycle-current-title').text()).toBe('金 · 收敛')
  })

  it('retains prior data while reporting a later read failure', async () => {
    harness.matters = [matter('已加载课题')]
    const { wrapper } = await mountedPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('已加载课题'))

    harness.error = new Error('同步读取失败')
    window.dispatchEvent(new Event('beryl-data-synced'))
    await vi.waitFor(() => expect(wrapper.text()).toContain('最新数据读取失败，当前仍展示上一次结果：同步读取失败'))
    expect(wrapper.text()).toContain('已加载课题')
    harness.error = undefined
    await wrapper.findAll('button').find(button => button.text() === '重试')!.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(false))
  })
})
