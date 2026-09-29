import { h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import { matterAsyncRepository } from '@/domain/matter/repository'
import TaskBoardPage from '@/vue/pages/TaskBoardPage.vue'

let wrapper: VueWrapper | undefined
async function openBoard() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/app/task-board', component: TaskBoardPage },
    { path: '/app/module/tasks', component: { template: '<h1>任务</h1>' } },
    { path: '/app/matters/:id', component: { template: '<h1>处境</h1>' } },
  ] })
  await router.push('/app/task-board'); await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await flushPromises()
  return { page: wrapper, router }
}
describe('Vue TaskBoard parity', () => {
  beforeEach(() => { localStorage.clear(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })
  it('uses native selects for the matter filter and each card status, matching the React route', async () => {
    const matter = await matterAsyncRepository.create({ title: '选择器事项' })
    const item = await actionAsyncRepository.create({ title: '选择器任务', date: '2026-10-01', matterId: matter.calmyId })
    const { page } = await openBoard()
    expect(page.get('[aria-label="按事项筛选"]').element.tagName).toBe('SELECT')
    expect(page.get(`[aria-label="${item.title}状态"]`).element.tagName).toBe('SELECT')
  })
  it('loads columns, filters active/today and searches by title or matter', async () => {
    const matter = await matterAsyncRepository.create({ title: '面试准备' })
    await actionAsyncRepository.create({ title: '整理简历', date: '2026-10-01', matterId: matter.calmyId })
    const old = await actionAsyncRepository.create({ title: '旧任务', date: '2020-01-01' })
    await actionAsyncRepository.complete(old.calmyId)
    const { page } = await openBoard()
    expect(page.get('[aria-label="可拖动任务看板"]').text()).toContain('整理简历')
    expect(page.get('.task-board-toolbar > .task-board-count').text()).toBe('2 条任务')
    await page.get('[aria-label="按事项筛选"]').setValue(matter.calmyId)
    expect(page.get('[aria-label="可拖动任务看板"]').text()).toContain('整理简历')
    await page.findAll('[aria-label="任务范围"] [role="tab"]').find(item => item.text() === '未结束')!.trigger('click')
    expect(page.get('[aria-label="可拖动任务看板"]').text()).not.toContain('旧任务')
    await page.get('[aria-label="搜索任务"]').setValue('面试准备')
    expect(page.text()).toContain('整理简历')
  })
  it('moves a terminal card through the existing transition flow and emits feedback', async () => {
    const item = await actionAsyncRepository.create({ title: '已完成事项', date: '2026-10-01' })
    await actionAsyncRepository.complete(item.calmyId)
    const messages: Array<{ message: string }> = []
    const onToast = (event: Event) => messages.push((event as CustomEvent<{ message: string }>).detail)
    window.addEventListener('beryl-toast', onToast)
    try {
      const { page } = await openBoard()
      const select = page.get(`[aria-label="${item.title}状态"]`)
      expect(select.element.tagName).toBe('SELECT')
      expect(page.get('.task-board-card .action-status').classes()).toContain('done')
      expect(page.get('.task-board-card-top .task-drag-hint').attributes('aria-hidden')).toBe('true')
      await select.setValue('in_progress')
      await flushPromises()
      expect((await actionAsyncRepository.find(item.calmyId))?.status).toBe('in_progress')
      expect(messages.at(-1)?.message).toContain('进行中')
    } finally { window.removeEventListener('beryl-toast', onToast) }
  })
  it('persists a dropped card in the destination status column', async () => {
    const item = await actionAsyncRepository.create({ title: '拖放到进行中', date: '2026-10-01' })
    const { page } = await openBoard()
    const card = page.get('.task-board-card')
    const target = page.get('.task-board-column:nth-child(2)')
    const values = new Map<string, string>()
    const dataTransfer = {
      setData: (type: string, value: string) => values.set(type, value),
      getData: (type: string) => values.get(type) || '',
      effectAllowed: 'all',
      dropEffect: 'move',
    }

    await card.trigger('dragstart', { dataTransfer })
    await target.trigger('dragover', { dataTransfer })
    await target.trigger('drop', { dataTransfer })
    await flushPromises()

    expect((await actionAsyncRepository.find(item.calmyId))?.status).toBe('in_progress')
    expect(page.get('.task-board-column:nth-child(2) .task-board-card h3').text()).toBe('拖放到进行中')
    expect(page.find('.task-board-column:first-child .task-board-card').exists()).toBe(false)
  })
  it('matches 迁移前界面基线 sizing for the card status selector', async () => {
    const item = await actionAsyncRepository.create({ title: '状态控件尺寸检查', date: '2026-10-01' })
    const { page } = await openBoard()
    expect(page.get(`[aria-label="${item.title}状态"]`).element.tagName).toBe('SELECT')
  })
  it('shows read errors while retaining the board and supports retry', async () => {
    await actionAsyncRepository.create({ title: '保留任务', date: '2026-10-01' })
    const original = actionAsyncRepository.list.bind(actionAsyncRepository)
    vi.spyOn(actionAsyncRepository, 'list').mockRejectedValueOnce(new Error('看板读取失败')).mockImplementation(original)
    const { page } = await openBoard()
    expect(page.get('[role="alert"]').text()).toContain('看板读取失败')
    await page.get('[role="alert"] button').trigger('click'); await flushPromises()
    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(page.text()).toContain('保留任务')
  })
  it('switches the board workspace to the Feishu task board', async () => {
    const { page } = await openBoard()
    expect(page.find('[aria-label="选择数据来源"]').exists()).toBe(true)
    await page.get('[aria-label="选择数据来源"] button:nth-child(2)').trigger('click')
    await flushPromises()
    expect(localStorage.getItem('calmy:workspace:source')).toBe('feishu')
    expect(page.find('[aria-label="飞书任务看板"]').exists()).toBe(true)
    expect(page.find('[aria-label="创建飞书任务"]').exists()).toBe(true)
    expect(page.get('[aria-label="飞书任务关联项目"]').element.tagName).toBe('SELECT')
    expect(page.find('[aria-label="任务视图"]').exists()).toBe(true)
  })
})
