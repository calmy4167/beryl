import { h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import HabitsPage from '@/vue/pages/HabitsPage.vue'

let wrapper: VueWrapper | undefined
async function openHabits() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app/module/habits', component: HabitsPage }] })
  await router.push('/app/module/habits'); await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}
describe('Vue Habits parity', () => {
  beforeEach(() => { localStorage.clear(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })
  it('seeds the default habits and creates a new habit', async () => {
    const page = await openHabits()
    const createCard = page.get('.habits-page > .beryl-card')
    expect(createCard.classes()).not.toContain('matter-create')
    expect((createCard.element as HTMLElement).style.padding).toBe('16px')
    expect((createCard.element as HTMLElement).style.marginBottom).toBe('16px')
    expect(page.find('.habit-heading').exists()).toBe(true)
    expect(page.find('.list').exists()).toBe(true)
    expect(page.get('.list').classes()).toEqual(['list'])
    expect((page.get('.habit-meta').element as HTMLElement).style.marginLeft).toBe('auto')
    expect(Array.from(page.get('.habit-meta').element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE && node.textContent !== '').map(node => node.textContent)).toEqual(['历史记录 ', ' 天 · 连续最长 ', '0', ' 天（回看）'])
    expect(Array.from(page.get('.habit-week button span').element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent)).toEqual(['周', '一'])
    expect(page.get('.habit-week button span + span').element.tagName).toBe('SPAN')
    expect((page.find('.habit-week button').element as HTMLElement).style.color).toBe('var(--c-text-2)')
    expect((page.get('.habit-week button.today').element as HTMLElement).style.border).toContain('var(--scene-border-strong)')
    expect(page.text()).toContain('晨间准备')
    await page.get('[aria-label="小行动名称"]').setValue('读书')
    await page.get('form').trigger('submit'); await flushPromises()
    expect(page.text()).toContain('读书')
  })
  it('records a day and edits the habit name', async () => {
    const page = await openHabits()
    const day = page.findAll('button').find(button => button.attributes('aria-label')?.startsWith('晨间准备 '))!
    await day.trigger('click'); await flushPromises()
    const completedDay = page.findAll('button').find(button => button.attributes('aria-label')?.startsWith('晨间准备 '))!
    expect(completedDay.attributes('aria-pressed')).toBe('true')
    expect((completedDay.element as HTMLElement).style.color).toBe('rgb(255, 255, 255)')
    await page.findAll('button').find(button => button.text() === '编辑')!.trigger('click')
    await page.get('[aria-label="小行动名称"]').setValue('晨间整理')
    await page.get('form').trigger('submit'); await flushPromises()
    expect(page.text()).toContain('晨间整理')
  })
})
