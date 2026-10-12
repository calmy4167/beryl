import { h, nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import { setActiveAccount } from '@/core/account-context'
import { accountStorageKey } from '@/core/account-context'
import { matterRepository } from '@/domain/matter/repository'
import { unifiedAsyncRepository, unifiedFactories } from '@/domain/unified'
import GraphPage from '@/vue/pages/GraphPage.vue'

let wrapper: VueWrapper | undefined

async function openGraph() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/app/graph', component: GraphPage },
    { path: '/app/people', component: { template: '<h1>人物</h1>' } },
    { path: '/app/matters/:id', component: { template: '<h1>事项</h1>' } },
  ] })
  await router.push('/app/graph')
  await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
  return wrapper
}

describe('GraphPage typed relation creation', () => {
  beforeEach(() => { setActiveAccount('graph-test-user'); localStorage.clear(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; setActiveAccount(null) })

  it('offers only current relation definitions and filters endpoints by the selected semantic', async () => {
    const matter = matterRepository.create({ title: '处境节点' })
    const person = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '人物节点' }))
    const scene = await unifiedAsyncRepository.create(unifiedFactories.scene({ title: '场景节点', thingId: matter.calmyId }))
    const resource = await unifiedAsyncRepository.create(unifiedFactories.resource({ title: '资料节点', kind: 'other', status: 'active', assetIds: [], matterIds: [], sourceIds: [], tags: [] }))
    const page = await openGraph()
    await flushPromises()

    const type = page.get<HTMLSelectElement>('[aria-label="关系类型"]')
    const offeredTypes = [...type.element.options].map(option => option.value)
    expect(offeredTypes).toContain('related_to')
    expect(offeredTypes).not.toContain('supports')
    expect(offeredTypes).not.toContain('part_of')

    await type.setValue('subject_of')
    const from = page.get<HTMLSelectElement>('[aria-label="关系起点"]')
    const to = page.get<HTMLSelectElement>('[aria-label="关系终点"]')
    expect([...from.element.options].map(option => option.value)).toContain(scene.calmyId)
    expect([...from.element.options].map(option => option.value)).toContain(matter.calmyId)
    expect([...from.element.options].map(option => option.value)).not.toContain(person.calmyId)
    expect([...to.element.options].map(option => option.value)).toContain(person.calmyId)

    await type.setValue('used_in')
    expect([...from.element.options].map(option => option.value)).toContain(resource.calmyId)
    expect([...from.element.options].map(option => option.value)).not.toContain(person.calmyId)
    expect([...to.element.options].map(option => option.value)).toContain(matter.calmyId)
  })

  it('disables creation until the selected definition has a valid endpoint pair', async () => {
    const page = await openGraph()
    await flushPromises()
    expect(page.findAll('button').find(button => button.text() === '建立连接')!.attributes('disabled')).toBeDefined()
    expect(page.text()).toContain('当前关系类型没有可用的对应节点')
  })

  it('removes endpoints already at the selected relation cardinality limit', async () => {
    const person = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '已有领域归属的人物' }))
    const domain = await unifiedAsyncRepository.create(unifiedFactories.domain({ key: 'existing-domain', displayName: '既有领域' }))
    await unifiedAsyncRepository.create(unifiedFactories.relation({
      from: { entityType: 'person', calmyId: person.calmyId },
      to: { entityType: 'domain', calmyId: domain.calmyId },
      relationType: 'belongs_to_domain', directed: true, sourceIds: []
    }))
    const page = await openGraph()
    await flushPromises()
    await page.get('[aria-label="关系类型"]').setValue('belongs_to_domain')

    expect([...page.get<HTMLSelectElement>('[aria-label="关系起点"]').element.options].map(option => option.value)).not.toContain(person.calmyId)
    expect(page.findAll('button').find(button => button.text() === '建立连接')!.attributes('disabled')).toBeDefined()
    expect(page.text()).toContain('此关系已达到一端的关联数量限制')
  })

  it('creates a typed relation with one stable retry command ID', async () => {
    const person = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '照护者' }))
    const domain = await unifiedAsyncRepository.create(unifiedFactories.domain({ key: 'care', displayName: '照护' }))
    const page = await openGraph()
    await flushPromises()
    await page.get('[aria-label="关系类型"]').setValue('belongs_to_domain')
    await page.get('[aria-label="关系起点"]').setValue(person.calmyId)
    await page.get('[aria-label="关系终点"]').setValue(domain.calmyId)
    await page.findAll('button').find(button => button.text() === '建立连接')!.trigger('click')
    await flushPromises()

    const relations = await unifiedAsyncRepository.list('relation')
    expect(relations).toHaveLength(1)
    const commands = JSON.parse(localStorage.getItem(accountStorageKey('b_coreEntityCommands')) || '[]') as Array<{ id: string }>
    expect(commands.map(command => command.id)).toContain(`graph-relation:${relations[0].calmyId}`)
  })
})
