import { defineComponent, h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import { todayKey } from '@/core/storage'
import { setActiveAccount } from '@/core/account-context'
import { actionAsyncRepository } from '@/domain/action/repository'
import { matterAsyncRepository } from '@/domain/matter/repository'
import { todayAsyncRepository } from '@/domain/today/repository'
import { unifiedAsyncRepository, unifiedFactories, type Relation } from '@/domain/unified'
import CyclePage from '@/vue/pages/CyclePage.vue'

let wrapper: VueWrapper | undefined

describe('Vue CyclePage real repository fixture', () => {
  beforeEach(() => {
    setActiveAccount('vue-cycle-real-repository-test-user')
    localStorage.clear()
    resetStoreCache()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    setActiveAccount(null)
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

  it('lets a cycle action link to an existing Scene without copying the action', async () => {
    const date = todayKey()
    const action = await actionAsyncRepository.create({ title: '陪爸爸复诊', date })
    const scene = await unifiedAsyncRepository.create(unifiedFactories.scene({ title: '复诊日' }))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/app/cycle', component: CyclePage }],
    })
    await router.push('/app/cycle')
    await router.isReady()
    wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.findAll('.context-relation-picker')).toHaveLength(1)
    await wrapper.get('[aria-label="选择关联的人物、事情、情境或空间"]').setValue(`scene:${scene.calmyId}`)
    await wrapper.find('.context-relation-picker button').trigger('click')
    await flushPromises()

    const relations = await unifiedAsyncRepository.list<Relation>('relation')
    expect(relations).toHaveLength(1)
    expect(relations[0]).toMatchObject({
      from: { entityType: 'action', calmyId: action.calmyId },
      to: { entityType: 'scene', calmyId: scene.calmyId },
      relationType: 'context_of',
    })
    expect((await actionAsyncRepository.find(action.calmyId))?.title).toBe('陪爸爸复诊')
  })
})
