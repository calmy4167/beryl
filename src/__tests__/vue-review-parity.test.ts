import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { todayKey } from '@/core/storage'
import type { TodayPlan } from '@/domain/today/model'
import type { RealityDocument } from '@/domain/reality'

const harness = vi.hoisted(() => ({
  plan: undefined as TodayPlan | undefined,
  documents: [] as RealityDocument[],
  getError: undefined as Error | undefined,
  listError: undefined as Error | undefined,
  get: vi.fn(),
  update: vi.fn(),
  list: vi.fn(),
}))

vi.mock('@/domain/today/repository', () => ({
  todayAsyncRepository: {
    get: harness.get,
    update: harness.update,
  },
}))

vi.mock('@/domain/reality', () => ({
  listActionRecordDocumentsAsync: harness.list,
}))

import ReviewPage from '@/vue/pages/ReviewPage.vue'

const emptyReview = () => ({ observation: '', analysis: '', adjustment: '', seed: '' })
const makePlan = (date: string): TodayPlan => ({
  date,
  load: null,
  focusActionIds: [],
  why: '',
  mustProtect: [],
  letGo: [],
  review: emptyReview(),
  revision: 1,
  updatedAt: Date.now(),
})
const makeDocument = (id: string, overrides: Partial<RealityDocument> = {}): RealityDocument => ({
  id,
  calmyId: id,
  source: 'legacy',
  entityType: 'action',
  title: id,
  summary: id,
  route: '/app/today',
  updatedAt: Date.now(),
  occurredAt: Date.now(),
  status: 'done',
  searchText: id,
  ...overrides,
})

describe('Vue ReviewPage parity', () => {
  beforeEach(() => {
    harness.plan = makePlan(todayKey())
    harness.documents = []
    harness.getError = undefined
    harness.listError = undefined
    harness.get.mockReset().mockImplementation(async () => {
      if (harness.getError) throw harness.getError
      return structuredClone(harness.plan)
    })
    harness.update.mockReset().mockImplementation(async (_date: string, patch: Partial<TodayPlan>, expectedRevision: number) => {
      if (!harness.plan || harness.plan.revision !== expectedRevision) throw new Error('revision conflict')
      harness.plan = {
        ...harness.plan,
        ...patch,
        review: { ...harness.plan.review, ...(patch.review || {}) },
        revision: harness.plan.revision + 1,
      }
      return structuredClone(harness.plan)
    })
    harness.list.mockReset().mockImplementation(async () => {
      if (harness.listError) throw harness.listError
      return structuredClone(harness.documents)
    })
  })

  it('keeps the dynamic review date as a separate inline text boundary', async () => {
    const wrapper = mount(ReviewPage)
    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(false))

    const date = wrapper.get('.today-review .eyebrow span')
    expect(date.text()).toBe(todayKey())
    expect(date.attributes('style')).toContain('display: contents')
  })

  it('loads the current plan, offers 7/30/90-day evidence ranges, and filters evidence', async () => {
    const today = new Date(`${todayKey()}T12:00:00`).getTime()
    harness.documents = [
      makeDocument('recent-action', { occurredAt: today - 2 * 24 * 60 * 60 * 1000 }),
      makeDocument('old-action', { occurredAt: today - 20 * 24 * 60 * 60 * 1000 }),
      makeDocument('recent-record', { entityType: 'record', occurredAt: today - 1 * 24 * 60 * 60 * 1000 }),
    ]

    const wrapper = mount(ReviewPage)
    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(false))

    expect(wrapper.text()).toContain('复盘，不只看完成率')
    expect(wrapper.findAll('.range-tabs button').map(button => button.text())).toEqual(['近 7 天', '近 30 天', '近 90 天'])
    expect(wrapper.get('.stat-card:nth-child(2) b').text()).toBe('1')
    expect(wrapper.get('.stat-card:nth-child(3) b').text()).toBe('1')
    expect(wrapper.text()).toContain('recent-action')
    expect(wrapper.text()).not.toContain('old-action')

    await wrapper.get('.range-tabs button:nth-child(2)').trigger('click')
    expect(wrapper.get('.stat-card:nth-child(2) b').text()).toBe('2')
    expect(wrapper.text()).toContain('old-action')
    expect(wrapper.get('.range-tabs button:nth-child(2)').attributes('aria-pressed')).toBe('true')
  })

  it('saves all four reflection fields and let-go lines, then reloads the saved values', async () => {
    const wrapper = mount(ReviewPage)
    await vi.waitFor(() => expect(wrapper.get('[aria-label="今日复盘：观，今天实际发生了什么"]').attributes('disabled')).toBeUndefined())

    await wrapper.get('[aria-label="今日复盘：观，今天实际发生了什么"]').setValue('  完成了整理  ')
    await wrapper.get('[aria-label="今日复盘：察，哪些条件影响了今天"]').setValue('提前准备材料')
    await wrapper.get('[aria-label="今日复盘：调，明天如何调整"]').setValue('留出休息时间')
    await wrapper.get('[aria-label="今日复盘：下一轮线索"]').setValue('继续观察节奏')
    await wrapper.get('[aria-label="复盘中无需继续或主动放下的事项"]').setValue('不再追逐无关指标\n暂缓新方向')

    expect(wrapper.text()).toContain('尚未保存')
    const toastMessages: string[] = []
    const onToast = (event: Event) => toastMessages.push((event as CustomEvent<{ message: string }>).detail.message)
    window.addEventListener('beryl-toast', onToast)
    await wrapper.get('button.primary').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).not.toContain('尚未保存'))

    expect(harness.update).toHaveBeenCalledWith(todayKey(), {
      review: {
        observation: '完成了整理',
        analysis: '提前准备材料',
        adjustment: '留出休息时间',
        seed: '继续观察节奏',
      },
      letGo: ['不再追逐无关指标', '暂缓新方向'],
    }, 1)
    expect(toastMessages).toContain('今日复盘已保存')
    window.removeEventListener('beryl-toast', onToast)

    wrapper.unmount()
    const reloaded = mount(ReviewPage)
    await vi.waitFor(() => expect((reloaded.get('[aria-label="今日复盘：观，今天实际发生了什么"]').element as HTMLTextAreaElement).value).toBe('完成了整理'))
    expect((reloaded.get('[aria-label="复盘中无需继续或主动放下的事项"]').element as HTMLTextAreaElement).value).toBe('不再追逐无关指标\n暂缓新方向')
  })

  it('shows read errors and retries loading without losing the page', async () => {
    harness.getError = new Error('暂时不可用')
    const wrapper = mount(ReviewPage)
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))

    expect(wrapper.text()).toContain('复盘数据暂时无法读取')
    expect(wrapper.text()).toContain('暂时不可用')

    harness.getError = undefined
    await wrapper.findAll('button').find(button => button.text().trim() === '重试')!.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(false))
    expect(wrapper.find('.review-page').exists()).toBe(true)
  })
})
