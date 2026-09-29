import { defineComponent, h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import { todayKey } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import { matterAsyncRepository } from '@/domain/matter/repository'
import { todayAsyncRepository } from '@/domain/today/repository'
import CyclePage from '@/vue/pages/CyclePage.vue'

let wrapper: VueWrapper | undefined

describe('Vue CyclePage real repository fixture', () => {
  beforeEach(() => {
    localStorage.clear()
    resetStoreCache()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('renders a matter and today action loaded through the real async repositories without writing on mount', async () => {
    const date = todayKey()
    const matter = await matterAsyncRepository.create({ title: '真实仓储处境', currentStage: 'fire' })
    await actionAsyncRepository.create({ title: '真实仓储行动', date, matterId: matter.calmyId })
    await todayAsyncRepository.get(date)
    const before = {
      matters: await matterAsyncRepository.list(),
      actions: await actionAsyncRepository.listForDate(date),
      plans: await todayAsyncRepository.list(),
    }

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/app/cycle', component: CyclePage }, { path: '/app/today', component: defineComponent({ render: () => h('h1', '今天') }) }],
    })
    await router.push('/app/cycle')
    await router.isReady()
    wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('真实仓储处境')
    expect(wrapper.text()).toContain('真实仓储行动')
    expect(wrapper.find('.cycle-node.current').text()).toContain('推进')
    expect(await matterAsyncRepository.list()).toEqual(before.matters)
    expect(await actionAsyncRepository.listForDate(date)).toEqual(before.actions)
    expect(await todayAsyncRepository.list()).toEqual(before.plans)
  })
})
