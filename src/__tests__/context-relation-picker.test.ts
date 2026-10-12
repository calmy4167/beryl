import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActiveAccount } from '@/core/account-context'
import { resetStoreCache } from '@/core/storage'
import { unifiedAsyncRepository, unifiedFactories, type Person, type Relation, type Resource } from '@/domain/unified'
import ContextRelationPicker from '@/vue/components/ContextRelationPicker.vue'

describe('ContextRelationPicker semantics', () => {
  beforeEach(() => { setActiveAccount('context-relation-picker-test-user'); localStorage.clear(); resetStoreCache() })
  afterEach(() => setActiveAccount(null))

  it('records an Entity subject with subject_of to a Person instead of mislabeling it as a generic context', async () => {
    const person = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '爸爸' }))
    const resource = await unifiedAsyncRepository.create(unifiedFactories.resource({
      title: 'CT 检查报告', kind: 'reference', status: 'active', assetIds: [], matterIds: [], sourceIds: [], tags: []
    }))
    const page = mount(ContextRelationPicker, { props: { entityRef: { entityType: 'resource', calmyId: resource.calmyId } } })
    await flushPromises()
    await page.get('[aria-label="选择关联的人物、事情、情境或空间"]').setValue(`person:${person.calmyId}`)
    await page.get('button').trigger('click')
    await flushPromises()

    const [relation] = await unifiedAsyncRepository.list<Relation>('relation')
    expect(relation).toMatchObject({
      from: { entityType: 'resource', calmyId: resource.calmyId },
      to: { entityType: 'person', calmyId: person.calmyId }, relationType: 'subject_of', directed: true
    })
    expect((await unifiedAsyncRepository.find<Person>('person', person.calmyId))?.displayName).toBe('爸爸')
    expect((await unifiedAsyncRepository.find<Resource>('resource', resource.calmyId))?.title).toBe('CT 检查报告')
  })
})
