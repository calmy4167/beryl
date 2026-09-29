import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import { createAsyncCollectionRepository } from '@/core/repository'
import { actionAsyncRepository } from '@/domain/action/repository'
import GoalsPage from '@/vue/pages/GoalsPage.vue'

let wrapper: VueWrapper | undefined
async function openGoals() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/app/module/goals', component: GoalsPage },
    { path: '/app/flow', component: { template: '<h1>探索</h1>' } },
  ] })
  await router.push('/app/module/goals'); await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await flushPromises()
  return { page: wrapper, router }
}
describe('Vue Goals parity', () => {
  it('lets the goal matter select stretch across the narrow mobile grid', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/controls.css'), 'utf8')
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.goal-context-fields select[\s\S]*?width: 100%;/)
  })
  beforeEach(() => { localStorage.clear(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })
  it('creates a goal with context and a next action, then persists it', async () => {
    const { page } = await openGoals()
    expect(page.find('.goals-toolbar').exists()).toBe(true)
    expect((page.get('.goals-toolbar').element as HTMLElement).style.display).toBe('flex')
    expect(page.get('[aria-label="搜索目标"]').attributes('placeholder')).toBe('搜索目标')
    expect(page.find('.panel-head').text()).toContain('0 个目标')
    expect(page.text()).toContain('还没有目标，把一个想完成的结果写下来。')
    const matter = page.get('[aria-label="目标关联处境"]')
    expect(matter.element.tagName).toBe('SELECT')
    expect(matter.find('option').text()).toBe('不关联处境')
    await page.get('[aria-label="目标名称"]').setValue('完成作品集')
    await page.get('[aria-label="目标对应问题"]').setValue('缺少展示案例')
    await page.get('[aria-label="目标证据"]').setValue('发布页面')
    await page.get('[aria-label="目标下一步行动"]').setValue('整理项目截图')
    await page.get('form').trigger('submit'); await flushPromises()
    expect(page.text()).toContain('完成作品集')
    expect(page.find('.goal-item').exists()).toBe(true)
    expect(page.get('.goal-context-summary').text()).toContain('问题：缺少展示案例')
    expect(page.get('.goal-context-summary').text()).toContain('证据：发布页面')
    expect(page.get('.goal-context-summary').text()).toContain('下一步：整理项目截图')
    expect(page.find('.goal-item [aria-label="标记目标为已完成"]').exists()).toBe(true)
    expect((await actionAsyncRepository.list()).some(item => item.title === '整理项目截图')).toBe(true)
  })
  it('filters goals, saves progress and reopens a completed goal', async () => {
    const messages: Array<{ message: string; kind: string }> = []
    const listener = (event: Event) => messages.push((event as CustomEvent<{ message: string; kind: string }>).detail)
    window.addEventListener('beryl-toast', listener)
    try {
      const { page } = await openGoals()
      await page.get('[aria-label="目标名称"]').setValue('阅读计划'); await page.get('form').trigger('submit'); await flushPromises()
      const card = page.find('.goal-item')
      const progress = card.get('[aria-label="阅读计划 进度百分比"]')
      await progress.setValue('65'); await progress.trigger('blur'); await flushPromises()
      expect((progress.element as HTMLInputElement).value).toBe('65')
      const stored = await createAsyncCollectionRepository<{ id: string; title: string; progress: number }>('goals', item => item.id).list()
      expect(stored.find(item => item.title === '阅读计划')?.progress).toBe(65)
      await card.get('[aria-label="标记目标为已完成"]').trigger('click'); await flushPromises()
      expect(messages.at(-1)).toEqual({ message: '目标已完成', kind: 'success' })
      await page.findAll('[aria-label="目标状态筛选"] [role="tab"]').find(item => item.text() === '已完成')!.trigger('click')
      expect(page.text()).toContain('阅读计划')
      await page.get('.goal-item [aria-label="标记目标为进行中"]').trigger('click'); await flushPromises()
      expect(messages.at(-1)).toEqual({ message: '目标已重新打开', kind: 'success' })
      expect(page.find('.goal-item').exists()).toBe(false)
      await page.findAll('[aria-label="目标状态筛选"] [role="tab"]').find(item => item.text() === '全部')!.trigger('click')
      expect(page.get('.goal-item').text()).toContain('进行中')
    } finally { window.removeEventListener('beryl-toast', listener) }
  })
  it('warns on a blank goal and shows load retry state', async () => {
    const messages: Array<{ message: string; kind: string }> = []
    const listener = (event: Event) => messages.push((event as CustomEvent<{ message: string; kind: string }>).detail)
    window.addEventListener('beryl-toast', listener)
    try {
      const original = window.confirm; window.confirm = () => true
      const { page } = await openGoals()
      await page.get('form').trigger('submit')
      expect(messages.at(-1)).toEqual({ message: '请先写下目标名称', kind: 'warning' })
      window.confirm = original
    } finally { window.removeEventListener('beryl-toast', listener) }
  })
})
