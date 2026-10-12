import { h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache, todayKey } from '@/core/storage'
import { setActiveAccount } from '@/core/account-context'
import { actionAsyncRepository } from '@/domain/action/repository'
import { matterAsyncRepository } from '@/domain/matter/repository'
import LiubaiMatters from '@/vue/pages/LiubaiMatters.vue'

/**
 * 「处境」页（v11）的行为覆盖。
 *
 * 迁移说明（第 31 轮）：本文件原来测的是旧页面 `MattersPage.vue`（已删除，315 行）。核对发现迁移
 * 漏掉了这个模块的核心输入面：**「问题驱动」六字段（Matter 自己的字段）与「趋势」选择器**，
 * 以及生命周期筛选；第 31 轮已按旧页面语义补回（仍走 `matterAsyncRepository` 的 create/update/transition，
 * 不新增存储）。旧页面还有「飞书项目视图」（只读项目列表 + 搜索 + 展开关联任务），
 * v11 的处境页没有搬，见交接文档 §4.2。
 */

let wrapper: VueWrapper | undefined
async function openMatters() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app/module/matters', component: LiubaiMatters }] })
  await router.push('/app/module/matters'); await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}
const submitButton = (page: VueWrapper) => page.findAll('button').find(button => button.text() === '新增处境')!
const rowOf = (page: VueWrapper, title: string) => page.findAll('.task').find(row => row.text().includes(title))!

describe('Vue LiubaiMatters (v11) parity', () => {
  beforeEach(() => { setActiveAccount('vue-matters-parity-user'); localStorage.clear(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks(); setActiveAccount(null) })

  it('lists active matters and filters them by lifecycle', async () => {
    await matterAsyncRepository.create({ title: '建立工作节奏' })
    const paused = await matterAsyncRepository.create({ title: '暂缓的计划' })
    await matterAsyncRepository.transition(paused.calmyId, 'paused')
    const page = await openMatters()

    expect(page.text()).toContain('建立工作节奏')
    expect(page.text()).not.toContain('暂缓的计划')
    expect(page.get('[aria-label="处境筛选"]').element.tagName).toBe('SELECT')

    await page.get('[aria-label="处境筛选"]').setValue('paused')
    await flushPromises()
    expect(page.text()).toContain('暂缓的计划')
    expect(page.text()).not.toContain('建立工作节奏')

    await page.get('[aria-label="处境筛选"]').setValue('archived')
    await flushPromises()
    expect(page.text()).toContain('还没有匹配的处境。')
  })

  it('validates the title and creates a matter with the optional problem-driven fields', async () => {
    const messages: string[] = []
    const onToast = (event: Event) => messages.push((event as CustomEvent<{ message: string }>).detail.message)
    window.addEventListener('beryl-toast', onToast)
    try {
      const page = await openMatters()

      await page.find('form').trigger('submit')
      await flushPromises()
      expect(messages).toContain('先写下处境名称')
      expect(await matterAsyncRepository.list()).toEqual([])

      await page.get('[aria-label="新处境名称"]').setValue('  改善睡眠  ')
      await page.get('[aria-label="处境为什么重要"]').setValue('恢复白天精力')
      await page.get('summary').trigger('click')
      await page.get('[aria-label="现实问题"]').setValue('连续熬夜')
      await page.get('[aria-label="期望变化"]').setValue('稳定在零点前入睡')
      await page.get('[aria-label="进展证据"]').setValue('一周有五天准时休息')
      await page.get('[aria-label="当前缺口"]').setValue('睡前刷手机')
      await page.get('[aria-label="下一次验证"]').setValue('手机放到房间外')
      await page.get('[aria-label="停止条件"]').setValue('连续两周稳定后复盘')
      await submitButton(page).trigger('click')
      await page.find('form').trigger('submit')
      await flushPromises()

      expect(await matterAsyncRepository.list()).toEqual([expect.objectContaining({
        title: '改善睡眠',
        why: '恢复白天精力',
        problem: '连续熬夜',
        desiredChange: '稳定在零点前入睡',
        progressEvidence: '一周有五天准时休息',
        currentGap: '睡前刷手机',
        nextTest: '手机放到房间外',
        stopCondition: '连续两周稳定后复盘'
      })])
      expect(messages).toContain('处境已创建')
      expect((page.get('[aria-label="新处境名称"]').element as HTMLInputElement).value).toBe('')
      expect(page.text()).toContain('改善睡眠')
    } finally { window.removeEventListener('beryl-toast', onToast) }
  })

  it('pauses and resumes a matter, then archives it without deleting', async () => {
    const matter = await matterAsyncRepository.create({ title: '建立工作节奏' })
    const page = await openMatters()

    await rowOf(page, '建立工作节奏').findAll('button').find(button => button.text() === '暂停')!.trigger('click')
    await flushPromises()
    expect((await matterAsyncRepository.find(matter.calmyId))?.status).toBe('paused')

    await page.get('[aria-label="处境筛选"]').setValue('paused')
    await flushPromises()
    await rowOf(page, '建立工作节奏').findAll('button').find(button => button.text() === '恢复')!.trigger('click')
    await flushPromises()
    expect((await matterAsyncRepository.find(matter.calmyId))?.status).toBe('active')

    await page.get('[aria-label="处境筛选"]').setValue('active')
    await flushPromises()
    await rowOf(page, '建立工作节奏').find('button[aria-label="归档"]').trigger('click')
    await flushPromises()
    const archived = await matterAsyncRepository.find(matter.calmyId)
    expect(archived?.status).toBe('archived')
    expect(archived?.title).toBe('建立工作节奏')
  })

  it('updates the trajectory independently from the lifecycle status', async () => {
    const matter = await matterAsyncRepository.create({ title: '建立工作节奏' })
    const page = await openMatters()

    await rowOf(page, '建立工作节奏').get('[aria-label="建立工作节奏趋势"]').setValue('stalled')
    await flushPromises()

    const updated = await matterAsyncRepository.find(matter.calmyId)
    expect(updated?.trajectory).toBe('stalled')
    expect(updated?.status).toBe('active')
  })

  it('puts the next test into today as an action linked to the matter', async () => {
    const matter = await matterAsyncRepository.create({ title: '建立工作节奏', nextTest: '手机放到房间外' })
    const page = await openMatters()

    await rowOf(page, '建立工作节奏').findAll('button').find(button => button.text() === '今天')!.trigger('click')
    await flushPromises()

    expect(await actionAsyncRepository.list()).toEqual([
      expect.objectContaining({ title: '手机放到房间外', date: todayKey(), matterId: matter.calmyId })
    ])
  })
})
