import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { h, nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import { matterAsyncRepository } from '@/domain/matter/repository'
import { todayAsyncRepository } from '@/domain/today/repository'
import TasksPage from '@/vue/pages/TasksPage.vue'

let wrapper: VueWrapper | undefined

async function openTasks(settle = true) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/app/tasks', component: TasksPage },
    { path: '/app/task-board', component: { template: '<h1>看板</h1>' } },
    { path: '/app/matters/:id', component: { template: '<h1>课题详情</h1>' } },
  ] })
  await router.push('/app/tasks'); await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  if (settle) await flushPromises()
  return { page: wrapper, router }
}

async function click(page: VueWrapper, label: string) {
  const button = page.findAll('button').find(item => item.text().trim() === label)
  expect(button, `button ${label}`).toBeDefined()
  await button!.trigger('click'); await flushPromises()
}

describe('Vue TasksPage parity', () => {
  it('matches the React native select treatment for the task matter field', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/controls.css'), 'utf8')
    const match = css.match(/html\.tactile-ui #app \.page-container \.tasks-page select\s*\{([^}]+)\}/)
    expect(match?.[1]).toContain('padding: 9px 11px;')
    expect(match?.[1]).toContain('background-image: none;')
    expect(match?.[1]).toContain('appearance: auto;')
  })
  beforeEach(() => { localStorage.clear(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })

  it('creates a trimmed task on the selected date with an active matter and adds it to that day’s focus', async () => {
    const active = await matterAsyncRepository.create({ title: '准备面试' })
    const archived = await matterAsyncRepository.create({ title: '旧课题' })
    await matterAsyncRepository.archive(archived.calmyId)
    const { page } = await openTasks()
    await page.get('[aria-label="任务日期"]').setValue('2026-10-05')
    await flushPromises()
    const matterSelect = page.get('[aria-label="关联处境"]')
    expect(matterSelect.element.tagName).toBe('SELECT')
    expect(page.find(`option[value="${archived.calmyId}"]`).exists()).toBe(false)
    await matterSelect.setValue(active.calmyId)
    await page.get('[aria-label="任务名称"]').setValue('  整理作品集  ')
    await page.get('form').trigger('submit')
    await flushPromises()
    const actions = await actionAsyncRepository.list()
    expect(actions).toEqual([expect.objectContaining({ title: '整理作品集', date: '2026-10-05', matterId: active.calmyId, status: 'planned' })])
    expect((await todayAsyncRepository.get('2026-10-05')).focusActionIds).toContain(actions[0].calmyId)
    expect(page.get('.action-card').text()).toContain('今日焦点')
    expect((page.get('[aria-label="任务名称"]').element as HTMLInputElement).value).toBe('')
  })

  it('filters statuses, completes and reopens through the real action repository', async () => {
    const planned = await actionAsyncRepository.create({ title: '写总结', date: '2026-10-06' })
    await actionAsyncRepository.create({ title: '做饭', date: '2026-10-04' })
    const { page } = await openTasks()
    expect(page.text()).toContain('2 个待处理 · 0 个已完成')
    expect(Array.from(page.get('.load-pill').element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE && node.textContent !== '').map(node => node.textContent)).toEqual(['2', ' 个待处理 · ', '0', ' 个已完成'])
    await page.findAll('[role="tab"]').find(item => item.text() === '待开始')!.trigger('click')
    expect(page.findAll('.action-card')).toHaveLength(2)
    await page.findAll('.action-card').find(item => item.text().includes('写总结'))!.find('button[aria-label="完成任务"]').trigger('click')
    await flushPromises()
    expect((await actionAsyncRepository.find(planned.calmyId))?.status).toBe('done')
    expect(page.text()).toContain('1 个待处理 · 1 个已完成')
    expect(page.findAll('.action-card')).toHaveLength(1)
    await page.findAll('[role="tab"]').find(item => item.text() === '已完成')!.trigger('click')
    expect(page.get('.action-card h3').classes()).toContain('done')
    await click(page, '重开')
    expect((await actionAsyncRepository.find(planned.calmyId))?.status).toBe('planned')
    expect(page.text()).toContain('2 个待处理 · 0 个已完成')
    expect(page.findAll('.action-card')).toHaveLength(0)
  })

  it('validates blank titles and navigates to the board and linked matter', async () => {
    const matter = await matterAsyncRepository.create({ title: '读书课题' })
    await actionAsyncRepository.create({ title: '读一章', date: '2026-10-06', matterId: matter.calmyId })
    const messages: Array<{ message: string; kind: string }> = []
    const listener = (event: Event) => messages.push((event as CustomEvent<{ message: string; kind: string }>).detail)
    window.addEventListener('beryl-toast', listener)
    try {
      const { page, router } = await openTasks()
      await page.get('form').trigger('submit')
      expect(messages.at(-1)).toEqual({ message: '请先写下任务名称', kind: 'warning' })
      expect(await actionAsyncRepository.list()).toHaveLength(1)
      await page.get('[aria-label="打开课题 读书课题"]').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.path).toBe(`/app/matters/${matter.calmyId}`)
      await router.push('/app/tasks'); await flushPromises()
      await click(page, '打开看板')
      expect(router.currentRoute.value.path).toBe('/app/task-board')
    } finally { window.removeEventListener('beryl-toast', listener) }
  })

  it('shows loading, read failure, and retry without clearing the retained list', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const realList = actionAsyncRepository.list.bind(actionAsyncRepository)
    vi.spyOn(actionAsyncRepository, 'list').mockImplementationOnce(async () => { await gate; throw new Error('读取失败') }).mockImplementation(realList)
    try {
      const { page } = await openTasks(false)
      await nextTick()
      expect(page.get('[role="status"]').text()).toContain('正在读取任务')
      release(); await flushPromises()
      expect(page.get('[role="alert"]').text()).toContain('读取失败')
      await click(page, '重试')
      expect(page.find('[role="alert"]').exists()).toBe(false)
      expect(page.text()).toContain('当前筛选下没有任务')
    } finally { release() }
  })
})
