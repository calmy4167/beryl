import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import { setActiveAccount } from '@/core/account-context'
import { matterAsyncRepository } from '@/domain/matter/repository'
import { unifiedAsyncRepository, unifiedFactories, type Scene } from '@/domain/unified'
import RealityScenesPage from '@/vue/pages/RealityScenesPage.vue'

describe('Reality Scene ordering with the durable repository', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    setActiveAccount('reality-scenes-ordering-test-user')
    localStorage.clear()
    resetStoreCache()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    resetStoreCache()
    setActiveAccount(null)
  })

  async function mountPage() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/app/reality-scenes', component: RealityScenesPage }],
    })
    await router.push('/app/reality-scenes')
    await router.isReady()
    wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
    await flushPromises()
    return wrapper
  }

  it('persists a multi-Scene order change across a full page remount', async () => {
    const thing = await matterAsyncRepository.create({ title: '爸爸住院' })
    await unifiedAsyncRepository.create(unifiedFactories.scene({ title: '住院前期', thingId: thing.calmyId, order: 0 }))
    await unifiedAsyncRepository.create(unifiedFactories.scene({ title: '康复阶段', thingId: thing.calmyId, order: 1 }))

    const firstMount = await mountPage()
    await firstMount.get('[aria-label="下移住院前期"]').trigger('click')
    await flushPromises()

    const persisted = (await unifiedAsyncRepository.list<Scene>('scene')).filter(scene => scene.thingId === thing.calmyId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    expect(persisted.map(scene => scene.title)).toEqual(['康复阶段', '住院前期'])

    firstMount.unmount()
    wrapper = undefined
    const secondMount = await mountPage()
    expect(secondMount.findAll('.scene-card h2').map(title => title.text())).toEqual(['康复阶段', '住院前期'])
  })

  it('persists the Scene lifecycle through durable transitions and keeps its mutation history after remount', async () => {
    const scene = await unifiedAsyncRepository.create(unifiedFactories.scene({ title: '住院照护', status: 'draft' }))
    const page = await mountPage()

    const clickSceneAction = async (label: string, expectedStatus: Scene['status']) => {
      const button = page.findAll('.scene-card button').find(candidate => candidate.text().trim() === label)
      expect(button, `missing Scene action: ${label}`).toBeDefined()
      await button!.trigger('click'); await flushPromises()
      expect(await unifiedAsyncRepository.find<Scene>('scene', scene.calmyId)).toMatchObject({ status: expectedStatus })
    }
    await clickSceneAction('开始', 'active')
    await clickSceneAction('暂停', 'paused')
    await clickSceneAction('开始', 'active')
    await page.get('[aria-label="完成住院照护"]').trigger('click'); await flushPromises()
    expect(await unifiedAsyncRepository.find<Scene>('scene', scene.calmyId)).toMatchObject({ status: 'completed' })
    await clickSceneAction('归档', 'archived')

    const persisted = await unifiedAsyncRepository.find<Scene>('scene', scene.calmyId)
    expect(persisted).toMatchObject({ status: 'archived', revision: 6 })
    expect((await unifiedAsyncRepository.mutations()).filter(item => item.entityType === 'scene' && item.entityId === scene.calmyId)
      .map(item => item.toRevision)).toEqual([1, 2, 3, 4, 5, 6])

    page.unmount(); wrapper = undefined
    const remounted = await mountPage()
    expect(remounted.text()).toContain('已归档')
    expect(await unifiedAsyncRepository.find<Scene>('scene', scene.calmyId)).toEqual(persisted)
  })
})
