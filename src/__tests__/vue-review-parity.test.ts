import { h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache, todayKey } from '@/core/storage'
import { setActiveAccount } from '@/core/account-context'
import { recordAsyncRepository } from '@/domain/record/repository'
import { todayAsyncRepository } from '@/domain/today/repository'
import { resetAllToToday } from '@/vue/liubai/date-state'
import LiubaiReview from '@/vue/pages/LiubaiReview.vue'

/**
 * 「复盘」页（v11）的行为覆盖。
 *
 * 迁移说明（第 30 轮）：本文件原来测的是旧页面 `ReviewPage.vue`（已删除）。核对时发现迁移把
 * **唯一的复盘写入路径 `completeReview` 漏掉了**（全仓库只有旧页面调用它），于是 `TodayPlan.review`
 * 变成"读得到、写不进"；v11 页面当时只有"专注分布 / 过程指标 / 注意力流向"这些只读聚合。
 * 第 30 轮按旧页面语义把「今日复盘」表单补回来（四段反思 + 主动放下清单，走的仍是
 * `completeReview → todayAsyncRepository.update({review, letGo}, revision)`，不新增存储）。
 *
 * 旧页面还有「近 7/30/90 天证据区间 + 每条证据的领域/关联/归属编辑」，v11 的复盘页按参考稿
 * 改成了"按周聚合专注记录"，没有搬那套证据浏览器（见交接文档 §4.2）。
 */

let wrapper: VueWrapper | undefined
async function openReview() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app/module/review', component: LiubaiReview }] })
  await router.push('/app/module/review'); await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}
const field = (page: VueWrapper, label: string) => page.get<HTMLTextAreaElement>(`[aria-label="${label}"]`)

describe('Vue LiubaiReview (v11) parity', () => {
  beforeEach(() => { setActiveAccount('review-test-user'); localStorage.clear(); resetAllToToday(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks(); setActiveAccount(null) })

  it('renders the saved reflection and let-go lines for the selected day', async () => {
    const plan = await todayAsyncRepository.get(todayKey())
    await todayAsyncRepository.update(todayKey(), {
      review: { observation: '完成了整理', analysis: '提前准备材料', adjustment: '留出休息时间', seed: '继续观察节奏' },
      letGo: ['不再追逐无关指标', '暂缓新方向']
    }, plan.revision)

    const page = await openReview()
    await flushPromises()

    expect(field(page, '今日复盘：观，今天实际发生了什么').element.value).toBe('完成了整理')
    expect(field(page, '今日复盘：察，哪些条件影响了今天').element.value).toBe('提前准备材料')
    expect(field(page, '今日复盘：调，明天如何调整').element.value).toBe('留出休息时间')
    expect(field(page, '今日复盘：下一轮线索').element.value).toBe('继续观察节奏')
    expect(field(page, '复盘中无需继续或主动放下的事项').element.value).toBe('不再追逐无关指标\n暂缓新方向')
  })

  it('saves all four reflection fields and let-go lines through completeReview', async () => {
    const before = await todayAsyncRepository.get(todayKey())
    const page = await openReview()
    await flushPromises()

    await field(page, '今日复盘：观，今天实际发生了什么').setValue('  完成了整理  ')
    await field(page, '今日复盘：察，哪些条件影响了今天').setValue('提前准备材料')
    await field(page, '今日复盘：调，明天如何调整').setValue('留出休息时间')
    await field(page, '今日复盘：下一轮线索').setValue('继续观察节奏')
    await field(page, '复盘中无需继续或主动放下的事项').setValue('不再追逐无关指标\n暂缓新方向')
    expect(page.text()).toContain('尚未保存')

    const messages: string[] = []
    const onToast = (event: Event) => messages.push((event as CustomEvent<{ message: string }>).detail.message)
    window.addEventListener('beryl-toast', onToast)
    try {
      await page.findAll('button').find(button => button.text() === '保存复盘')!.trigger('click')
      await flushPromises()
    } finally { window.removeEventListener('beryl-toast', onToast) }

    const saved = await todayAsyncRepository.get(todayKey())
    expect(saved.review).toMatchObject({
      observation: '完成了整理', analysis: '提前准备材料', adjustment: '留出休息时间', seed: '继续观察节奏'
    })
    expect(saved.letGo).toEqual(['不再追逐无关指标', '暂缓新方向'])
    expect(saved.revision).toBe(before.revision + 1)
    expect(messages).toContain('今日复盘已保存')
    expect(page.text()).not.toContain('尚未保存')
  })

  it('aggregates the week focus bars from the real focus records', async () => {
    await recordAsyncRepository.create({ type: 'fact', body: '[番茄钟] 完成专注 30 分钟', occurredAt: Date.now(), source: 'user' })
    const page = await openReview()
    await flushPromises()

    expect(page.find('.bars').exists()).toBe(true)
    const todayBar = page.findAll('.bar').find(bar => bar.attributes('aria-label')?.startsWith(todayKey()))!
    expect(todayBar.attributes('aria-label')).toContain('0.5')
  })

  it('keeps the read-only process metrics and attention flow panels', async () => {
    const page = await openReview()
    await flushPromises()

    expect(page.text()).toContain('过程指标')
    expect(page.text()).toContain('注意力流向')
    expect(page.text()).toContain('专注分布')
  })
})
