import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActiveAccount } from '@/core/account-context'
import { resetStoreCache } from '@/core/storage'
import { matterAsyncRepository } from '@/domain/matter/repository'
import { unifiedAsyncRepository, unifiedFactories, type Relation, type Resource, type Scene } from '@/domain/unified'
import RealitySettlementPanel from '@/vue/components/RealitySettlementPanel.vue'

describe('RealitySettlementPanel archived context reuse', () => {
  beforeEach(() => { setActiveAccount('reality-settlement-panel-test-user'); localStorage.clear(); resetStoreCache() })
  afterEach(() => setActiveAccount(null))

  it('finds a record linked to an archived Thing and reuses the same record in a later Scene', async () => {
    const oldThing = await matterAsyncRepository.create({ title: '爸爸住院' })
    const file = await unifiedAsyncRepository.create(unifiedFactories.resource({
      title: '出院指导', kind: 'reference', status: 'active', assetIds: [], matterIds: [], sourceIds: [], tags: []
    }))
    const oldLink = await unifiedAsyncRepository.create(unifiedFactories.relation({
      from: { entityType: 'resource', calmyId: file.calmyId }, to: { entityType: 'thing', calmyId: oldThing.calmyId },
      relationType: 'used_in', directed: true, sourceIds: ['reality:settlement']
    }))
    const archivedThing = await matterAsyncRepository.archive(oldThing.calmyId, { expectedRevision: oldThing.revision })
    const laterScene = await unifiedAsyncRepository.create(unifiedFactories.scene({ title: '居家康复', status: 'active' }))

    const page = mount(RealitySettlementPanel, { props: { thing: archivedThing, scenes: [laterScene], things: [archivedThing] } })
    await flushPromises()

    expect(page.text()).toContain('出院指导')
    await page.get('[aria-label="选择出院指导的沉淀方式"]').setValue('reassociate')
    await page.get('[aria-label="选择出院指导的关联目标"]').setValue(`scene:${laterScene.calmyId}`)
    await page.get('button:last-of-type').trigger('click')
    await flushPromises()

    const links = await unifiedAsyncRepository.list<Relation>('relation')
    expect((await unifiedAsyncRepository.find<Relation>('relation', oldLink.calmyId))?.archivedAt).toBeTypeOf('number')
    expect(links).toContainEqual(expect.objectContaining({
      from: { entityType: 'resource', calmyId: file.calmyId }, to: { entityType: 'scene', calmyId: laterScene.calmyId }, relationType: 'used_in'
    }))
    expect(await matterAsyncRepository.find(oldThing.calmyId)).toMatchObject({ status: 'archived' })
    expect(await unifiedAsyncRepository.find<Resource>('resource', file.calmyId)).toMatchObject({ title: '出院指导', calmyId: file.calmyId })
    expect((await matterAsyncRepository.find(oldThing.calmyId))?.settlements?.[0].decisions[0]).toMatchObject({
      entityRef: { entityType: 'resource', calmyId: file.calmyId }, targetRef: { entityType: 'scene', calmyId: laterScene.calmyId }
    })
    expect(await unifiedAsyncRepository.find<Scene>('scene', laterScene.calmyId)).toBeDefined()
  })
})
