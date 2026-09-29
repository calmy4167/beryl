import { h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import { unifiedAsyncRepository, unifiedFactories, type Person } from '@/domain/unified'
import PeoplePage from '@/vue/pages/PeoplePage.vue'

let wrapper: VueWrapper | undefined

async function openPeople() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app/people', component: PeoplePage }] })
  await router.push('/app/people'); await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('Vue PeoplePage parity', () => {
  beforeEach(() => { localStorage.clear(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined })

  it('creates a person with normalized fields in the real repository', async () => {
    const page = await openPeople()
    await page.get('[aria-label="人物名称"]').setValue('  林老师 ')
    await page.get('[aria-label="人物角色"]').setValue('朋友，合作者,朋友')
    await page.get('[aria-label="人物领域"]').setValue('设计')
    await page.get('[aria-label="人物标签"]').setValue('重要、长期')
    await page.get('[aria-label="人物备注"]').setValue('合作背景')
    await page.get('form').trigger('submit')
    await flushPromises()
    const people = await unifiedAsyncRepository.list<Person>('person')
    expect(people[0]).toMatchObject({ displayName: '林老师', roles: ['朋友', '合作者'], domain: '设计', tags: ['重要', '长期'], notes: '合作背景', status: 'active' })
    expect(page.text()).toContain('林老师')
  })

  it('hides the standalone header when embedded in Master Data', async () => {
    wrapper = mount(PeoplePage, { props: { embedded: true } })
    await flushPromises()
    expect(wrapper.find('.people-page-embedded').exists()).toBe(true)
    expect(wrapper.find('.page-head').exists()).toBe(false)
    expect(wrapper.find('form').exists()).toBe(true)
  })

  it('filters by query, archives and restores a person from the corresponding tabs', async () => {
    await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '陈老师', roles: ['导师'], domain: '写作', notes: '定期交流' }))
    const page = await openPeople()
    await page.get('[aria-label="搜索人物"]').setValue('定期交流')
    expect(page.text()).toContain('陈老师')
    await page.get('[aria-label="搜索人物"]').setValue('不存在的名字')
    expect(page.text()).toContain('没有匹配的人物。')
    await page.get('[aria-label="搜索人物"]').setValue('')
    await page.findAll('button').find(button => button.text() === '归档人物')!.trigger('click')
    await flushPromises()
    expect((await unifiedAsyncRepository.list<Person>('person'))[0].status).toBe('archived')
    await page.findAll('[role="tab"]').find(tab => tab.text() === '已归档')!.trigger('click')
    expect(page.text()).toContain('陈老师')
    await page.findAll('button').find(button => button.text() === '恢复人物')!.trigger('click')
    await flushPromises()
    await page.findAll('[role="tab"]').find(tab => tab.text() === '活跃')!.trigger('click')
    expect(page.text()).toContain('陈老师')
    expect((await unifiedAsyncRepository.list<Person>('person'))[0].status).toBe('active')
  })
})
