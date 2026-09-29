import { h, nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import { matterRepository } from '@/domain/matter/repository'
import { actionRepository } from '@/domain/action/repository'
import * as graph from '@/domain/graph'
import { unifiedAsyncRepository, unifiedFactories, type Relation } from '@/domain/unified'
import GraphPage from '@/vue/pages/GraphPage.vue'

let wrapper: VueWrapper | undefined

async function openGraph(settle = true) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/app/graph', component: GraphPage },
    { path: '/app/people', component: { template: '<h1>人物目的地</h1>' } },
    { path: '/app/matters/:id', component: { template: '<h1>处境目的地</h1>' } },
  ] })
  await router.push('/app/graph')
  await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  if (settle) { await new Promise(resolve => setTimeout(resolve, 0)); await nextTick() }
  return { page: wrapper, router }
}

async function choose(page: VueWrapper, label: string, value: string) {
  const control = page.get(`[aria-label="${label}"]`)
  if (control.element.tagName === 'SELECT') await control.setValue(value)
  else {
    await control.trigger('click')
    await page.get(`[role="option"][data-value="${value}"]`).trigger('click')
  }
}

describe('Vue GraphPage parity', () => {
  beforeEach(() => { localStorage.clear(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })

  it('shows existing nodes and a generated reference edge, and follows a node into its existing route', async () => {
    const matter = matterRepository.create({ title: '供应商交付' })
    actionRepository.create({ title: '确认时间', date: '2026-08-19', matterId: matter.calmyId })
    const person = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '联系人甲' }))
    const { page, router } = await openGraph()
    await flushPromises()
    expect(page.text()).toContain('供应商交付')
    expect(page.text()).toContain('联系人甲')
    expect(page.get('.edge-list').text()).toContain('确认时间')
    expect(page.get('.edge-list').text()).toContain('属于')
    expect(page.get('[aria-label="图谱统计"]').text()).toContain('节点')
    await page.findAll('.graph-node-list button').find(button => button.text().includes('供应商交付'))!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe(`/app/matters/${matter.calmyId}`)
    expect(person.calmyId).toBeTruthy()
  })

  it('creates a directed relation with the selected type and navigates from its edge', async () => {
    const matter = matterRepository.create({ title: '项目入口' })
    const person = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '协作对象' }))
    const { page, router } = await openGraph()
    await flushPromises()
    const messages: string[] = []
    const listener = (event: Event) => messages.push((event as CustomEvent<{ message: string }>).detail.message)
    window.addEventListener('beryl-toast', listener)
    try {
    await choose(page, '关系起点', matter.calmyId)
    await choose(page, '关系类型', 'supports')
    await choose(page, '关系终点', person.calmyId)
    await page.findAll('button').find(button => button.text() === '建立连接')!.trigger('click')
    await flushPromises()
    expect(await unifiedAsyncRepository.list<Relation>('relation')).toEqual([
      expect.objectContaining({
        from: { entityType: 'matter', calmyId: matter.calmyId },
        to: { entityType: 'person', calmyId: person.calmyId },
        relationType: 'supports', directed: true,
      }),
    ])
    expect(page.get('.edge-list').text()).toContain('支持')
    expect(messages).toContain('关系已加入图谱')
    expect(page.get('[aria-label="关系起点"]').text()).toContain('起点节点')
    expect(page.get('[aria-label="关系终点"]').text()).toContain('终点节点')
    await page.findAll('.edge-list button').find(button => button.text() === '协作对象')!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/app/people')
    } finally { window.removeEventListener('beryl-toast', listener) }
  })

  it('reports a failed relation save without clearing selected endpoints', async () => {
    const matter = matterRepository.create({ title: '保存失败起点' })
    const person = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '保存失败终点' }))
    const messages: string[] = []
    const listener = (event: Event) => messages.push((event as CustomEvent<{ message: string }>).detail.message)
    window.addEventListener('beryl-toast', listener)
    try {
      const { page } = await openGraph()
      await flushPromises()
      await choose(page, '关系起点', matter.calmyId)
      await choose(page, '关系终点', person.calmyId)
      vi.spyOn(unifiedAsyncRepository, 'create').mockRejectedValueOnce(new Error('写入故障'))
      await page.findAll('button').find(button => button.text() === '建立连接')!.trigger('click')
      await flushPromises()
      expect(messages).toContain('写入故障')
      expect(page.get('[aria-label="关系起点"]').text()).toContain('保存失败起点')
      expect(page.get('[aria-label="关系终点"]').text()).toContain('保存失败终点')
      expect(await unifiedAsyncRepository.list<Relation>('relation')).toHaveLength(0)
    } finally { window.removeEventListener('beryl-toast', listener) }
  })

  it('uses native select controls for relation creation and graph filtering', async () => {
    const { page } = await openGraph()
    await flushPromises()
    for (const label of ['关系起点', '关系类型', '关系终点', '筛选节点类型']) {
      expect(page.get(`[aria-label="${label}"]`).element.tagName).toBe('SELECT')
    }
    await page.get('[aria-label="关系类型"]').setValue('supports')
    expect((page.get('[aria-label="关系类型"]').element as HTMLSelectElement).value).toBe('supports')
  })

  it('keeps graph selects on the React reference control surface', () => {
    const controlsCss = readFileSync(resolve(process.cwd(), 'src/styles/controls.css'), 'utf8')
    expect(controlsCss).toMatch(/html\.tactile-ui #app \.page-container \.graph-page select\s*\{[^}]*min-width:\s*auto;[^}]*background:\s*#f8fafc;[^}]*appearance:\s*auto;/s)
  })

  it('keeps native graph select pointer and transition behavior aligned with React', () => {
    const style = document.createElement('style')
    style.textContent = readFileSync(resolve(process.cwd(), 'src/styles/controls.css'), 'utf8')
    document.head.append(style)
    document.documentElement.classList.add('tactile-ui')
    const root = document.createElement('div')
    root.id = 'app'
    root.innerHTML = '<main class="page-container"><section class="graph-page"><select></select></section></main>'
    document.body.append(root)
    try {
      const select = root.querySelector('select')!
      expect(getComputedStyle(select).cursor).toBe('default')
      expect(getComputedStyle(select).transitionDuration).toBe('0s')
    } finally {
      root.remove()
      style.remove()
      document.documentElement.classList.remove('tactile-ui')
    }
  })

  it('shows initial loading followed by the genuinely empty graph state', async () => {
    const { page } = await openGraph(false)
    expect(page.get('[role="status"]').text()).toContain('正在读取图谱')
    await new Promise(resolve => setTimeout(resolve, 0))
    await flushPromises()
    expect(page.get('.graph-node-list').text()).toContain('没有匹配的节点。换一个筛选词试试。')
    expect(page.get('.edge-list').text()).toContain('当前筛选范围内还没有关系。')
    expect(page.get('[aria-label="图谱统计"]').text()).toContain('0')
  })

  it('rejects identical endpoints without writing a relation', async () => {
    const matter = matterRepository.create({ title: '唯一节点' })
    const messages: string[] = []
    const listener = (event: Event) => messages.push((event as CustomEvent<{ message: string }>).detail.message)
    window.addEventListener('beryl-toast', listener)
    try {
      const { page } = await openGraph()
      await flushPromises()
      await choose(page, '关系起点', matter.calmyId)
      await choose(page, '关系终点', matter.calmyId)
      await page.findAll('button').find(button => button.text() === '建立连接')!.trigger('click')
      await flushPromises()
      expect(await unifiedAsyncRepository.list<Relation>('relation')).toHaveLength(0)
      expect(messages).toContain('请选择两个不同的节点')
    } finally { window.removeEventListener('beryl-toast', listener) }
  })

  it('filters by search and type, and shows both no-results states', async () => {
    matterRepository.create({ title: '深度工作' })
    await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '林老师' }))
    const { page } = await openGraph()
    await flushPromises()
    await page.get('[aria-label="筛选图谱"]').setValue('深度工作')
    await flushPromises()
    expect(page.get('.graph-node-list').text()).toContain('深度工作')
    expect(page.get('.graph-node-list').text()).not.toContain('林老师')
    await choose(page, '筛选节点类型', 'person')
    expect(page.text()).toContain('没有匹配的节点。换一个筛选词试试。')
    expect(page.text()).toContain('当前筛选范围内还没有关系。')
  })

  it('offers retry on initial read failure and retains the last snapshot if a refresh fails', async () => {
    matterRepository.create({ title: '保留的节点' })
    const original = graph.buildGraphSnapshot
    const query = vi.spyOn(graph, 'buildGraphSnapshot').mockImplementationOnce(() => { throw new Error('读取故障') }).mockImplementation(original)
    const { page } = await openGraph()
    await flushPromises()
    expect(page.get('[role="alert"]').text()).toContain('读取故障')
    expect(page.text()).toContain('重新读取')
    await page.findAll('button').find(button => button.text() === '重新读取')!.trigger('click')
    await flushPromises()
    expect(page.text()).toContain('保留的节点')
    query.mockImplementationOnce(() => { throw new Error('刷新故障') })
    window.dispatchEvent(new CustomEvent('beryl-data-synced'))
    await flushPromises()
    expect(page.get('[role="alert"]').text()).toContain('刷新故障')
    expect(page.text()).toContain('保留的节点')
    await page.findAll('button').find(button => button.text() === '重试')!.trigger('click')
    await flushPromises()
    expect(page.find('[role="alert"]').exists()).toBe(false)
  })
})
