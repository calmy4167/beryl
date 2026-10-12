import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Matter } from '@/domain/matter/model'

const harness = vi.hoisted(() => ({
  matter: undefined as Matter | undefined,
  error: undefined as Error | undefined,
  scenes: [] as { calmyId: string; title: string; status: string; thingId: string; order?: number }[],
  find: vi.fn(),
  listMatters: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
}))

vi.mock('@/domain/matter/repository', () => ({
  matterAsyncRepository: {
    find: harness.find,
    list: harness.listMatters,
    update: harness.update,
  },
}))

vi.mock('@/domain/unified', async importOriginal => ({
  ...(await importOriginal<typeof import('@/domain/unified')>()),
  unifiedAsyncRepository: { list: harness.list },
  supportsDomainAssignment: () => true,
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
      { path: '/app/reality-scenes', component: FlowPage },
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
    harness.scenes = []
    harness.error = undefined
    harness.list.mockImplementation(async (type: string) => type === 'scene' ? structuredClone(harness.scenes) : [])
    harness.listMatters.mockImplementation(async () => [structuredClone(harness.matter!)])
    harness.update.mockImplementation(async (_id: string, patch: Partial<Matter>) => {
      harness.matter = { ...harness.matter!, ...patch, revision: harness.matter!.revision + 1 }
      return structuredClone(harness.matter)
    })
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

  it('offers Person and Space context links without duplicating the canonical Scene-to-Thing link', async () => {
    harness.scenes = [{ calmyId: 'scene-1', title: '住院阶段', status: 'active', thingId: 'mat-42' }]
    harness.list.mockImplementation(async (type: string) => {
      if (type === 'scene') return structuredClone(harness.scenes)
      if (type === 'person') return [{ calmyId: 'person-1', displayName: '爸爸', status: 'active' }]
      if (type === 'space') return [{ calmyId: 'space-1', title: '家庭照护', status: 'active' }]
      return []
    })
    const { wrapper } = await mountDetail()
    const picker = wrapper.get('.context-relation-picker')
    await vi.waitFor(() => expect(picker.find('option[value="person:person-1"]').exists()).toBe(true))
    expect(picker.find('option[value="space:space-1"]').exists()).toBe(true)
    expect(picker.find('option[value="scene:scene-1"]').exists()).toBe(false)
    expect(wrapper.get('.thing-scenes').text()).toContain('住院阶段')
  })

  it('offers Thing settlement after archival and keeps the reusable context panel on the canonical Matter page', async () => {
    harness.matter = makeMatter({ title: '爸爸住院', status: 'archived' })
    const { wrapper } = await mountDetail('/app/matter/mat-42')
    await vi.waitFor(() => expect(wrapper.text()).not.toContain('正在查找本情境关联的资料'))
    expect(wrapper.get('[aria-label="沉淀这件事 爸爸住院"]')).toBeTruthy()
    expect(wrapper.text()).toContain('当前没有关联的行动、记录、资料、文件、费用、人物关系、重要日期或经验需要整理。')
  })

  it('offers optional Domain assignment using the stable Matter/Thing id', async () => {
    const { wrapper } = await mountDetail()
    const picker = wrapper.find('[aria-label="所属领域（可选）"]')
    expect(picker.exists()).toBe(true)
    expect((picker.element as HTMLSelectElement).value).toBe('')
  })

  it('lets the Thing owner set explicit ownership and private visibility', async () => {
    const dad = { calmyId: 'person-dad', entityType: 'person', displayName: '爸爸', status: 'active', roles: [], tags: [], createdAt: 1, updatedAt: 1, revision: 1, source: 'user' }
    harness.list.mockImplementation(async (type: string) => type === 'person' ? [dad] : [])
    const { wrapper } = await mountDetail()
    const editor = wrapper.find('.ownership-editor')
    await editor.get('summary').trigger('click')
    await editor.get('input[type="checkbox"]').setValue(true)
    await editor.get('select').setValue(`person:${dad.calmyId}`)
    await editor.findAll('select')[4].setValue('private')
    await editor.findAll('button').find(button => button.text() === '保存归属设置')!.trigger('click')
    await vi.waitFor(() => expect(harness.update).toHaveBeenCalled())
    expect(harness.update).toHaveBeenCalledWith('mat-42', expect.objectContaining({ ownership: expect.objectContaining({
      ownerRef: { type: 'person', id: dad.calmyId }, privacy: 'private'
    }) }), { expectedRevision: 3 })
  })

  it('shows the existing Scenes for the stable Thing id without copying the Matter', async () => {
    harness.scenes = [{ calmyId: 'scene-hospital', title: '爸爸住院', status: 'active', thingId: 'mat-42' }]
    const { wrapper } = await mountDetail()
    expect(harness.list).toHaveBeenCalledWith('scene')
    expect(wrapper.text()).toContain('爸爸住院')
    expect(wrapper.get('a[href*="reality-scenes"]').attributes('href')).toContain('thing=mat-42')
  })

  it('aggregates multiple Scenes for one Thing in their durable user-defined order', async () => {
    harness.scenes = [
      { calmyId: 'scene-rehab', title: '康复阶段', status: 'active', thingId: 'mat-42', order: 1 },
      { calmyId: 'scene-hospital', title: '住院阶段', status: 'completed', thingId: 'mat-42', order: 0 },
    ]
    const { wrapper } = await mountDetail()
    expect(wrapper.findAll('.thing-scenes li span').map(item => item.text())).toEqual(['住院阶段', '康复阶段'])
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

    await wrapper.findAll('button').find(button => button.text().includes('围绕这个处境进入探索'))!.trigger('click')
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
