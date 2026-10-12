import { h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import { setActiveAccount } from '@/core/account-context'
import { readAsyncStorageValue } from '@/core/repository'
import { recordAsyncRepository } from '@/domain/record/repository'
import LiubaiPomo from '@/vue/pages/LiubaiPomo.vue'

/**
 * 「注意力」页（v11）的行为覆盖。
 *
 * 迁移说明（第 26 轮）：本文件原来测的是旧页面 `PomoPage.vue`（已删除）。旧页面有两套可编辑时长
 * （专注/休息）与模式切换，v11 的注意力页只有"25 分钟一段 + 开始/结束"，那部分能力被简化掉了
 * （见交接文档 §4.2 第 2 项，待产品决策）。**数据链路没有变**：`completeFocus()` 仍然写
 * `pomoTotal` / `pomoCount` 与 `[番茄钟] 完成专注 N 分钟` 记录 —— 所以这里改为断言 v11 页面
 * 真实的可观察行为（计时、开始时切换文案、结束后落库 + 出现在记录列表里）。
 */

let wrapper: VueWrapper | undefined
async function openPomo() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app/module/pomo', component: LiubaiPomo }] })
  await router.push('/app/module/pomo'); await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}
const buttonByText = (page: VueWrapper, text: string) =>
  page.findAll('button').find(button => button.text().includes(text))!

describe('Vue LiubaiPomo (v11) parity', () => {
  beforeEach(() => { setActiveAccount('vue-pomo-parity-test-user'); localStorage.clear(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.useRealTimers(); vi.restoreAllMocks(); setActiveAccount(null) })

  it('renders a 25 minute session and switches the button into the running state', async () => {
    const page = await openPomo()

    expect(page.text()).toContain('25:00')
    expect(page.find('.fc-timer').exists()).toBe(true)
    expect(page.text()).toContain('开始专注')

    await buttonByText(page, '开始专注').trigger('click')
    expect(page.text()).toContain('结束专注')
  })

  it('finishes a one minute session and persists its stats and record', async () => {
    vi.useFakeTimers()
    const page = await openPomo()

    await buttonByText(page, '开始专注').trigger('click')
    await vi.advanceTimersByTimeAsync(60_000)
    await flushPromises()
    await buttonByText(page, '结束专注').trigger('click')
    await flushPromises()

    expect(await readAsyncStorageValue('pomoTotal', 0)).toBe(1)
    expect(await readAsyncStorageValue('pomoCount', 0)).toBe(1)
    const records = await recordAsyncRepository.list()
    expect(records.some(record => record.body.includes('完成专注 1 分钟'))).toBe(true)
  })

  it('lists the finished session in the focus record panel with its minutes', async () => {
    vi.useFakeTimers()
    const page = await openPomo()

    await buttonByText(page, '开始专注').trigger('click')
    await vi.advanceTimersByTimeAsync(60_000)
    await flushPromises()
    await buttonByText(page, '结束专注').trigger('click')
    await flushPromises()

    const list = page.get('.ov-list')
    expect(list.text()).toContain('1 分钟')
    expect(list.text()).toContain('未关联行动')
  })
})
