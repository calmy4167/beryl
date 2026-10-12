import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setActiveAccount } from '@/core/account-context'
import { resetStoreCache } from '@/core/storage'
import { unifiedAsyncRepository, unifiedFactories, type Domain, type Relation } from '@/domain/unified'
import DomainManagerPanel from '@/vue/components/DomainManagerPanel.vue'

describe('DomainManagerPanel', () => {
  beforeEach(() => { setActiveAccount('domain-manager-test-user'); localStorage.clear(); resetStoreCache() })
  afterEach(() => setActiveAccount(null))

  it('creates, renames, retires and restores Domains while preserving stable relations', async () => {
    const person = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '领域关联人物' }))
    const domain = await unifiedAsyncRepository.create(unifiedFactories.domain({ key: 'health', displayName: '健康' }))
    await unifiedAsyncRepository.create(unifiedFactories.relation({
      from: { entityType: 'person', calmyId: person.calmyId },
      to: { entityType: 'domain', calmyId: domain.calmyId },
      relationType: 'belongs_to_domain', directed: true, sourceIds: []
    }))

    const page = mount(DomainManagerPanel)
    await flushPromises()
    await page.findAll('button').find(button => button.text() === '编辑')!.trigger('click')
    await page.get('[aria-label="领域名称"]').setValue('健康与照护')
    await page.get('[aria-label="领域稳定标识"]').setValue('care')
    await page.get('form').trigger('submit')
    await flushPromises()

    const renamed = await unifiedAsyncRepository.find<Domain>('domain', domain.calmyId)
    expect(renamed).toMatchObject({ calmyId: domain.calmyId, key: 'care', displayName: '健康与照护', revision: 2 })
    let relations = await unifiedAsyncRepository.list<Relation>('relation')
    expect(relations).toHaveLength(1)
    expect(relations[0].to.calmyId).toBe(domain.calmyId)

    await page.findAll('button').find(button => button.text() === '停用')!.trigger('click')
    await flushPromises()
    expect((await unifiedAsyncRepository.find<Domain>('domain', domain.calmyId))?.status).toBe('retired')
    expect(await unifiedAsyncRepository.list<Relation>('relation')).toHaveLength(1)
    await page.get('input[type="checkbox"]').setValue(true)
    await flushPromises()
    await page.findAll('button').find(button => button.text() === '恢复')!.trigger('click')
    await flushPromises()
    expect((await unifiedAsyncRepository.find<Domain>('domain', domain.calmyId))?.status).toBe('active')
    relations = await unifiedAsyncRepository.list<Relation>('relation')
    expect(relations[0].to.calmyId).toBe(domain.calmyId)
  })

  it('rejects duplicate keys and lets users create a Domain without touching other entities', async () => {
    const existing = await unifiedAsyncRepository.create(unifiedFactories.domain({ key: 'health', displayName: '健康' }))
    const page = mount(DomainManagerPanel)
    await flushPromises()
    await page.get('[aria-label="领域稳定标识"]').setValue('HEALTH')
    await page.get('[aria-label="领域名称"]').setValue('另一个健康')
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(page.get('[role="alert"]').text()).toContain('这个领域标识已经使用')
    expect(await unifiedAsyncRepository.list('domain')).toHaveLength(1)
    expect((await unifiedAsyncRepository.find<Domain>('domain', existing.calmyId))?.displayName).toBe('健康')

    await page.get('[aria-label="领域稳定标识"]').setValue('work')
    await page.get('[aria-label="领域名称"]').setValue('工作')
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(await unifiedAsyncRepository.list<Domain>('domain')).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'work', displayName: '工作', status: 'active' })
    ]))
  })
})
