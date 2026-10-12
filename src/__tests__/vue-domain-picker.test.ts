import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setActiveAccount } from '@/core/account-context'
import { accountStorageKey } from '@/core/account-context'
import { resetStoreCache } from '@/core/storage'
import { unifiedAsyncRepository, unifiedFactories, type Relation } from '@/domain/unified'
import { matterRepository } from '@/domain/matter/repository'
import { recordRepository } from '@/domain/record/repository'
import { financeAsyncRepository } from '@/domain/finance/repository'
import DomainPicker from '@/vue/components/DomainPicker.vue'

describe('DomainPicker', () => {
  beforeEach(() => { setActiveAccount('domain-picker-test-user'); localStorage.clear(); resetStoreCache() })
  afterEach(() => setActiveAccount(null))

  it('assigns and clears a Domain through a stable Relation without requiring a Domain', async () => {
    const person = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '可选领域人物' }))
    const health = await unifiedAsyncRepository.create(unifiedFactories.domain({ key: 'health', displayName: '健康' }))
    const finance = await unifiedAsyncRepository.create(unifiedFactories.domain({ key: 'finance', displayName: '财务' }))
    const page = mount(DomainPicker, { props: { entityRef: { entityType: 'person', calmyId: person.calmyId } } })
    await flushPromises()

    const picker = page.get<HTMLSelectElement>('[aria-label="所属领域（可选）"]')
    expect(picker.element.value).toBe('')
    expect([...picker.element.options].map(option => option.textContent)).toContain('未设置领域')
    await picker.setValue(health.calmyId)
    await flushPromises()
    expect(await unifiedAsyncRepository.list<Relation>('relation')).toEqual([
      expect.objectContaining({
        from: { entityType: 'person', calmyId: person.calmyId },
        to: { entityType: 'domain', calmyId: health.calmyId },
        relationType: 'belongs_to_domain', directed: true
      })
    ])

    await page.get<HTMLSelectElement>('[aria-label="所属领域（可选）"]').setValue(finance.calmyId)
    await flushPromises()
    const changed = await unifiedAsyncRepository.list<Relation>('relation')
    expect(changed).toHaveLength(1)
    expect(changed[0].to.calmyId).toBe(finance.calmyId)

    await page.get<HTMLSelectElement>('[aria-label="所属领域（可选）"]').setValue('')
    await flushPromises()
    const archived = await unifiedAsyncRepository.list<Relation>('relation')
    expect(archived).toHaveLength(1)
    expect(archived[0].archivedAt).toEqual(expect.any(Number))
    const commands = (JSON.parse(localStorage.getItem(accountStorageKey('b_coreEntityCommands')) || '[]') as Array<{ id: string }>).map(command => command.id).filter(id => id.startsWith('domain-assignment:'))
    expect(commands).toHaveLength(3)
    expect(commands).toEqual(expect.arrayContaining([
      `domain-assignment:create:person:${person.calmyId}:${health.calmyId}`,
      `domain-assignment:update:${archived[0].calmyId}:1:${finance.calmyId}`,
      `domain-assignment:archive:${archived[0].calmyId}:2`,
    ]))
  })

  it('keeps a linked retired Domain visible and never treats an unsupported endpoint as assignable', async () => {
    const person = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '历史领域人物' }))
    const retired = await unifiedAsyncRepository.create(unifiedFactories.domain({ key: 'retired', displayName: '旧领域', status: 'retired' }))
    await unifiedAsyncRepository.create(unifiedFactories.relation({
      from: { entityType: 'person', calmyId: person.calmyId },
      to: { entityType: 'domain', calmyId: retired.calmyId },
      relationType: 'belongs_to_domain', directed: true, sourceIds: []
    }))
    const unsupported = mount(DomainPicker, { props: { entityRef: { entityType: 'today', calmyId: '2026-10-01' } } })
    await flushPromises()
    expect(unsupported.find('[aria-label="所属领域（可选）"]').exists()).toBe(false)
    unsupported.unmount()

    const page = mount(DomainPicker, { props: { entityRef: { entityType: 'person', calmyId: person.calmyId } } })
    await flushPromises()
    const picker = page.get<HTMLSelectElement>('[aria-label="所属领域（可选）"]')
    expect(picker.element.value).toBe(retired.calmyId)
    expect([...picker.element.options].map(option => option.textContent)).toContain('旧领域（已停用）')
  })

  it('restores the stable Domain Relation when an assignment is removed and then reselected', async () => {
    const person = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '领域关系恢复人物' }))
    const domain = await unifiedAsyncRepository.create(unifiedFactories.domain({ key: 'restore-domain', displayName: '恢复领域' }))
    const page = mount(DomainPicker, { props: { entityRef: { entityType: 'person', calmyId: person.calmyId } } })
    await flushPromises()
    const picker = page.get<HTMLSelectElement>('[aria-label="所属领域（可选）"]')
    await picker.setValue(domain.calmyId)
    await flushPromises()
    await page.get<HTMLSelectElement>('[aria-label="所属领域（可选）"]').setValue('')
    await flushPromises()
    await page.get<HTMLSelectElement>('[aria-label="所属领域（可选）"]').setValue(domain.calmyId)
    await flushPromises()

    const relations = await unifiedAsyncRepository.list<Relation>('relation')
    expect(relations).toHaveLength(1)
    expect(relations[0]).toMatchObject({ revision: 3 })
    expect(relations[0].archivedAt).toBeUndefined()
  })

  it('links the canonical Matter/Thing fact through its existing stable id', async () => {
    const matter = matterRepository.create({ title: '长期事实' })
    const domain = await unifiedAsyncRepository.create(unifiedFactories.domain({ key: 'work', displayName: '工作' }))
    const page = mount(DomainPicker, { props: { entityRef: { entityType: 'thing', calmyId: matter.calmyId } } })
    await flushPromises()
    await page.get<HTMLSelectElement>('[aria-label="所属领域（可选）"]').setValue(domain.calmyId)
    await flushPromises()
    expect(await unifiedAsyncRepository.list<Relation>('relation')).toEqual([
      expect.objectContaining({
        from: { entityType: 'thing', calmyId: matter.calmyId },
        to: { entityType: 'domain', calmyId: domain.calmyId },
        relationType: 'belongs_to_domain'
      })
    ])
    expect(matterRepository.find(matter.calmyId)?.title).toBe('长期事实')
  })

  it('links a canonical Reality Record without copying its content', async () => {
    const record = recordRepository.create({ type: 'fact', body: '复诊时间已确认' })
    const domain = await unifiedAsyncRepository.create(unifiedFactories.domain({ key: 'care', displayName: '照护' }))
    const page = mount(DomainPicker, { props: { entityRef: { entityType: 'record', calmyId: record.calmyId } } })
    await flushPromises()
    await page.get<HTMLSelectElement>('[aria-label="所属领域（可选）"]').setValue(domain.calmyId)
    await flushPromises()
    const [relation] = await unifiedAsyncRepository.list<Relation>('relation')
    expect(relation).toMatchObject({
      from: { entityType: 'record', calmyId: record.calmyId },
      to: { entityType: 'domain', calmyId: domain.calmyId }, relationType: 'belongs_to_domain'
    })
    expect(recordRepository.find(record.calmyId)?.body).toBe('复诊时间已确认')
  })

  it('links an existing Finance entry through its legacy stable ID without copying the entry', async () => {
    const entry = await financeAsyncRepository.create({ id: 'finance-domain-picker-1', type: 'expense', amountCents: 3200, category: '交通', note: '前往医院', date: '2026-10-01' })
    const domain = await unifiedAsyncRepository.create(unifiedFactories.domain({ key: 'finance-picker-test', displayName: '财务' }))
    const page = mount(DomainPicker, { props: { entityRef: { entityType: 'finance_entry', calmyId: entry.id } } })
    await flushPromises()

    expect(page.find('[aria-label="所属领域（可选）"]').exists()).toBe(true)
    await page.get<HTMLSelectElement>('[aria-label="所属领域（可选）"]').setValue(domain.calmyId)
    await flushPromises()
    expect(await unifiedAsyncRepository.list<Relation>('relation')).toEqual([
      expect.objectContaining({
        from: { entityType: 'finance_entry', calmyId: entry.id },
        to: { entityType: 'domain', calmyId: domain.calmyId }, relationType: 'belongs_to_domain'
      })
    ])
    expect(await financeAsyncRepository.find(entry.id)).toEqual(entry)
  })

  it('adds and removes month and date context Relations while preserving the Finance entry', async () => {
    const entry = await financeAsyncRepository.create({ id: 'finance-time-picker-1', type: 'expense', amountCents: 3200, category: '医疗', note: '复诊费用', date: '2026-10-01' })
    const page = mount(DomainPicker, { props: { entityRef: { entityType: 'finance_entry', calmyId: entry.id } } })
    await flushPromises()
    await page.get<HTMLInputElement>('[aria-label="添加月份时间关系"]').setValue('2026-09')
    await flushPromises()
    await page.get<HTMLInputElement>('[aria-label="添加日期时间关系"]').setValue('2026-09-03')
    await flushPromises()
    let relations = await unifiedAsyncRepository.list<Relation>('relation')
    expect(relations).toHaveLength(2)
    expect(relations).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: { entityType: 'finance_entry', calmyId: entry.id }, to: { entityType: 'time', calmyId: '2026-09' }, relationType: 'context_of' }),
      expect.objectContaining({ from: { entityType: 'finance_entry', calmyId: entry.id }, to: { entityType: 'time', calmyId: '2026-09-03' }, relationType: 'context_of' })
    ]))
    await page.get('[aria-label="移除时间关系 2026-09"]').trigger('click')
    await flushPromises()
    relations = await unifiedAsyncRepository.list<Relation>('relation')
    expect(relations).toHaveLength(2)
    expect(relations.find(relation => relation.to.entityType === 'time' && relation.to.calmyId === '2026-09')?.archivedAt).toEqual(expect.any(Number))
    expect(relations.find(relation => relation.to.entityType === 'time' && relation.to.calmyId === '2026-09-03')?.archivedAt).toBeUndefined()

    await page.get<HTMLInputElement>('[aria-label="添加月份时间关系"]').setValue('2026-09')
    await flushPromises()
    relations = await unifiedAsyncRepository.list<Relation>('relation')
    expect(relations).toHaveLength(2)
    const restored = relations.find(relation => relation.to.entityType === 'time' && relation.to.calmyId === '2026-09')!
    expect(restored).toMatchObject({ revision: 3 })
    expect(restored.archivedAt).toBeUndefined()
    expect(await financeAsyncRepository.find(entry.id)).toEqual(entry)
  })
})
