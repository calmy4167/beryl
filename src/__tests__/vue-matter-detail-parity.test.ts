import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Matter } from '@/domain/matter/model'

const harness = vi.hoisted(() => ({
  matter: undefined as Matter | undefined,
  error: undefined as Error | undefined,
  find: vi.fn(),
}))

vi.mock('@/domain/matter/repository', () => ({
  matterAsyncRepository: {
    find: harness.find,
  },
}))

import MatterDetailPage from '@/vue/pages/MatterDetailPage.vue'

const makeMatter = (overrides: Partial<Matter> = {}): Matter => ({
  calmyId: 'mat-42',
  title: '转向产品设计',
  why: '希望做更有价值的产品',
  primaryContradiction: '想转型但缺少真实项目经验',
  status: 'active',
  currentStage: 'fire',
  trajectory: 'advancing',
  evidenceIds: [],
  createdAt: 1,
  updatedAt: 2,
  revision: 3,
  problem: '如何获得真实的产品实践？',
  desiredChange: '完成一个可验证的作品',
  progressEvidence: '访谈了两位用户',
  currentGap: '还没有可用原型',
  nextTest: '本周让一位用户试用',
  stopCondition: '连续两轮都没有用户需求证据',
  ...overrides,
})

async function mountDetail(path = '/app/matter/mat-42') {
  const FlowPage = defineComponent({
    setup: () => () => h('h1', { 'data-testid': 'flow-route' }, '探索页'),
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/matter/:id', component: MatterDetailPage },
      { path: '/app/flow', component: FlowPage },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await vi.waitFor(() => expect(wrapper.text()).not.toContain('正在读取处境…'))
  return { wrapper, router }
}

describe('Vue MatterDetailPage parity', () => {
  beforeEach(() => {
    harness.matter = makeMatter()
    harness.error = undefined
    harness.find.mockReset().mockImplementation(async (id: string) => {
      if (harness.error) throw harness.error
      return id === harness.matter?.calmyId ? structuredClone(harness.matter) : undefined
    })
  })

  it('loads the route matter and renders status, trajectory, contradiction, and problem-driven context', async () => {
    const { wrapper } = await mountDetail()

    expect(harness.find).toHaveBeenCalledWith('mat-42')
    expect(wrapper.get('h1').text()).toBe('转向产品设计')
    expect(wrapper.text()).toContain('处境 · 详情')
    expect(wrapper.text()).toContain('状态：进行中 · 阶段：fire · 趋势：推进')
    expect(wrapper.text()).toContain('主矛盾：想转型但缺少真实项目经验')
    expect(wrapper.text()).toContain('如何获得真实的产品实践？')
    expect(wrapper.text()).toContain('本周让一位用户试用')
    expect(wrapper.text()).toContain('连续两轮都没有用户需求证据')
  })

  it('preserves the legacy text-node boundaries in the status and contradiction summaries', async () => {
    const { wrapper } = await mountDetail()
    const summaryRows = wrapper.findAll('.admin-block .info')
    const textNodes = (element: Element) => [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent)
      .map((node) => node.textContent)

    expect(textNodes(summaryRows[0].element)).toEqual(['状态：', '进行中', ' · 阶段：', 'fire', ' · 趋势：', '推进'])
    expect(textNodes(summaryRows[1].element)).toEqual(['主矛盾：', '想转型但缺少真实项目经验'])
  })

  it('navigates into exploration with the current stable matter id', async () => {
    const { wrapper, router } = await mountDetail()

    await wrapper.get('button').trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/app/flow?matter=mat-42'))
    expect(wrapper.get('[data-testid="flow-route"]').text()).toBe('探索页')
  })

  it('omits problem-driven section when the legacy matter has no problem context', async () => {
    harness.matter = makeMatter({ why: '', problem: undefined, desiredChange: undefined, progressEvidence: undefined, currentGap: undefined, nextTest: undefined, stopCondition: undefined })
    const { wrapper } = await mountDetail()

    expect(wrapper.find('.problem-driven-detail').exists()).toBe(false)
    expect(wrapper.text()).toContain('这个处境还没有写下为什么重要。')
  })

  it('shows not-found and read-error states, with a retry that reloads the same id', async () => {
    harness.matter = undefined
    const missing = await mountDetail()
    expect(missing.wrapper.text()).toContain('找不到这个处境')
    missing.wrapper.unmount()

    harness.error = new Error('暂时不可用')
    const failed = await mountDetail()
    expect(failed.wrapper.find('[role="alert"]').text()).toContain('暂时不可用')
    harness.error = undefined
    harness.matter = makeMatter()
    await failed.wrapper.get('button').trigger('click')
    await vi.waitFor(() => expect(failed.wrapper.find('[role="alert"]').exists()).toBe(false))
    expect(failed.wrapper.text()).toContain('转向产品设计')
  })
})
