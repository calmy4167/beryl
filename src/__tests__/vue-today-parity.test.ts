import { h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache, todayKey } from '@/core/storage'
import { setActiveAccount } from '@/core/account-context'
import { actionAsyncRepository } from '@/domain/action/repository'
import { matterAsyncRepository } from '@/domain/matter/repository'
import { recordAsyncRepository } from '@/domain/record/repository'
import { todayAsyncRepository } from '@/domain/today/repository'
import LiubaiToday from '@/vue/pages/LiubaiToday.vue'

/**
 * 「总览」页（v11）的行为覆盖。
 *
 * 迁移说明（第 26 轮）：本文件原来测的是旧页面 `TodayPage.vue`（已删除）。旧页面把"今天"做成了
 * 全能工作台（就地新建行动、写日记记录、勾身体状态、切飞书来源）；v11 的总览按参考稿把信息架构
 * 拆开了（记录 → 记录页/日记页，来源切换 → 看板页），所以这里断言总览**真实承担的**行为：
 * 读取并展示当日重点/统计/记录、**快速新增行动（含关联处境）**、完成行动、点标题设为当日重点。
 * 新增行动走的就是旧页面的同一条仓储路径（useReferenceWorkspace.addTask），没有新存储。
 *
 * 第 38 轮把页面改成参考稿布局（顶部指标条 + 双列：今日计划/今日时间线 + 当日数据/习惯打卡/收集箱），
 * 行为与数据来源完全不变，仅同步了本文件的文案与选择器钩子（当日重点→今日计划、aria-label 与行内元素改名）。
 */

let wrapper: VueWrapper | undefined
async function openToday() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/app/today', component: LiubaiToday },
  ] })
  await router.push('/app/today'); await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}
describe('Vue LiubaiToday (v11) parity', () => {
  beforeEach(() => { setActiveAccount('vue-today-parity-user'); localStorage.clear(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks(); setActiveAccount(null) })

  it('renders the day focus list, stats and records from the repositories', async () => {
    await actionAsyncRepository.create({ title: '准备面试', date: todayKey() })
    await recordAsyncRepository.create({ type: 'fact', body: '今天把边界说清楚了', occurredAt: Date.now(), source: 'user' })
    const page = await openToday()

    expect(page.text()).toContain('准备面试')
    expect(page.text()).toContain('今日计划')
    expect(page.text()).toContain('当日数据')
    // 记录块（HUD rank 3）在 DOM 里始终存在，内容来自 Repository
    expect(page.text()).toContain('今天把边界说清楚了')
  })

  it('adds an action to today with its matter through the reference-style composer', async () => {
    const matter = await matterAsyncRepository.create({ title: '准备面试' })
    const page = await openToday()

    await page.get('[aria-label="行动关联处境"]').setValue(matter.calmyId)
    await page.get('[aria-label="添加今天要做的事"]').setValue('发送项目提案')
    await page.get('[aria-label="添加今天要做的事"]').trigger('keydown.enter')
    await flushPromises()

    const created = (await actionAsyncRepository.list()).find(item => item.title === '发送项目提案')
    expect(created?.matterId).toBe(matter.calmyId)
    expect(created?.date).toBe(todayKey())
    // 提交成功后输入框清空
    expect((page.get('[aria-label="添加今天要做的事"]').element as HTMLInputElement).value).toBe('')
  })

  it('completes an action and records it as done', async () => {
    await actionAsyncRepository.create({ title: '发送项目提案', date: todayKey() })
    const page = await openToday()

    const done = page.findAll('.today-list button').find(node => node.text() === '完成')!
    await done.trigger('click')
    await flushPromises()

    expect((await actionAsyncRepository.list()).find(item => item.title === '发送项目提案')?.status).toBe('done')
  })

  it('sets the clicked action as the day focus', async () => {
    const action = await actionAsyncRepository.create({ title: '陪爸爸复诊', date: todayKey() })
    await todayAsyncRepository.get(todayKey())
    const page = await openToday()

    await page.get('.today-title').trigger('click')
    await flushPromises()

    const plan = await todayAsyncRepository.get(todayKey())
    expect(plan.focusActionIds).toContain(action.calmyId)
  })
})
