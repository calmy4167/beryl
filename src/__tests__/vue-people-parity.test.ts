import { h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import { setActiveAccount } from '@/core/account-context'
import { unifiedAsyncRepository, unifiedFactories, type ImportantDate, type Person, type Relation, type Scene } from '@/domain/unified'
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
  beforeEach(() => { setActiveAccount('people-test-user'); localStorage.clear(); sessionStorage.clear(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; sessionStorage.clear(); vi.restoreAllMocks(); setActiveAccount(null) })

  it('creates a person with normalized fields in the real repository', async () => {
    const domain = await unifiedAsyncRepository.create(unifiedFactories.domain({ key: 'design', displayName: '设计' }))
    const page = await openPeople()
    await page.get('[aria-label="人物名称"]').setValue('  林老师 ')
    await page.get('[aria-label="人物角色"]').setValue('朋友，合作者,朋友')
    await page.get('[aria-label="人物标签"]').setValue('重要、长期')
    await page.get('[aria-label="人物备注"]').setValue('合作背景')
    page.findAll('form').find(form => form.find('[aria-label="人物名称"]').exists())!.trigger('submit')
    await flushPromises()
    const people = await unifiedAsyncRepository.list<Person>('person')
    expect(people[0]).toMatchObject({ displayName: '林老师', roles: ['朋友', '合作者'], tags: ['重要', '长期'], notes: '合作背景', status: 'active' })
    expect(people[0].domain).toBeUndefined()
    await page.get('[aria-label="所属领域（可选）"]').setValue(domain.calmyId)
    await flushPromises()
    expect(await unifiedAsyncRepository.list<Relation>('relation')).toEqual([
      expect.objectContaining({ from: { entityType: 'person', calmyId: people[0].calmyId }, to: { entityType: 'domain', calmyId: domain.calmyId }, relationType: 'belongs_to_domain' })
    ])
    expect(page.text()).toContain('林老师')
  })

  it('creates a recurring important date linked to one Person and keeps its original ID on archive', async () => {
    const person = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '爸爸' }))
    const scene = await unifiedAsyncRepository.create(unifiedFactories.scene({ title: '住院照护' }))
    const page = await openPeople()
    await page.get('[aria-label="日期名称"]').setValue('爸爸生日')
    await page.get('[aria-label="重要日期相关人物"]').setValue(person.calmyId)
    await page.get('[aria-label="重要日期"]').setValue('1980-02-29')
    await page.get('[aria-label="重要日期类型"]').setValue('birthday')
    await page.get('[aria-label="重要日期重复方式"]').setValue('yearly')
    const dateForm = page.findAll('form').find(form => form.find('[aria-label="日期名称"]').exists())!
    await dateForm.trigger('submit')
    await flushPromises()

    const [item] = await unifiedAsyncRepository.list<ImportantDate>('important_date')
    expect(item).toMatchObject({ title: '爸爸生日', kind: 'birthday', personId: person.calmyId, monthDay: '02-29', recurrence: 'yearly', ownership: { privacy: 'private', subjectRef: { entityType: 'person', calmyId: person.calmyId } } })
    expect(item.year).toBeUndefined()
    expect(await unifiedAsyncRepository.list<Relation>('relation')).toContainEqual(expect.objectContaining({
      from: { entityType: 'important_date', calmyId: item.calmyId }, to: { entityType: 'person', calmyId: person.calmyId }, relationType: 'subject_of'
    }))

    const dateCard = page.findAll('.matter-card').find(card => card.text().includes('爸爸生日'))!
    const contextPicker = dateCard.get('.context-relation-picker')
    await contextPicker.get('[aria-label="选择关联的人物、事情、情境或空间"]').setValue(`scene:${scene.calmyId}`)
    await contextPicker.get('button').trigger('click')
    await flushPromises()
    expect(await unifiedAsyncRepository.list<Relation>('relation')).toContainEqual(expect.objectContaining({
      from: { entityType: 'important_date', calmyId: item.calmyId }, to: { entityType: 'scene', calmyId: scene.calmyId }, relationType: 'context_of'
    }))

    await page.get(`[aria-label="日期归档 ${item.calmyId}"]`).trigger('click')
    await flushPromises()
    expect((await unifiedAsyncRepository.find<ImportantDate>('important_date', item.calmyId))?.archivedAt).toBeTypeOf('number')
    await page.findAll('button').find(button => button.text().includes('查看已归档日期'))!.trigger('click')
    await flushPromises()
    await page.get(`[aria-label="日期恢复 ${item.calmyId}"]`).trigger('click')
    await flushPromises()
    expect((await unifiedAsyncRepository.find<ImportantDate>('important_date', item.calmyId))?.archivedAt).toBeUndefined()
  })

  it('hides the standalone header when embedded in Master Data', async () => {
    wrapper = mount(PeoplePage, { props: { embedded: true } })
    await flushPromises()
    expect(wrapper.find('.people-page-embedded').exists()).toBe(true)
    expect(wrapper.find('.page-head').exists()).toBe(false)
    expect(wrapper.find('form').exists()).toBe(true)
  })

  it('sets explicit ownership and privacy on a Person without binding that Person to a User', async () => {
    const owner = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '照护者' }))
    const subject = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '爸爸' }))
    const page = await openPeople()
    const card = page.findAll('.matter-card').find(item => item.text().includes('爸爸'))!
    const editor = card.get('.ownership-editor')
    await editor.get('summary').trigger('click')
    await editor.get('input[type="checkbox"]').setValue(true)
    await editor.get('select').setValue(`person:${owner.calmyId}`)
    await editor.findAll('select')[4].setValue('restricted')
    await editor.get('button').trigger('click')
    await flushPromises()

    const saved = await unifiedAsyncRepository.find<Person>('person', subject.calmyId)
    expect(saved).toMatchObject({ displayName: '爸爸', ownership: { ownerRef: { type: 'person', id: owner.calmyId }, privacy: 'restricted' } })
    expect(saved).not.toHaveProperty('linkedUserId')
  })

  it('lets a signed-in User bind only the selected real Person to their own account', async () => {
    sessionStorage.setItem('b_session', JSON.stringify({
      token: 'people-binding-session', apiOrigin: 'https://api.example.test', expiresAt: Date.now() + 60_000,
      user: { id: 'account-self', username: 'self', displayName: '本人', role: 'user' }, mustChangePassword: false
    }))
    const person = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '本人' }))
    const other = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '爸爸' }))
    const page = await openPeople()
    const card = page.findAll('.matter-card').find(item => item.find('h2').text() === '本人')!

    await card.get('[aria-label="绑定此人物到当前账号"]').trigger('click')
    await flushPromises()

    expect(await unifiedAsyncRepository.find<Person>('person', person.calmyId)).toMatchObject({
      linkedUserId: 'account-self', revision: 2
    })
    expect((await unifiedAsyncRepository.mutations('person', person.calmyId)).at(-1)).toMatchObject({
      operation: 'update', actorId: 'account-self', sourceIds: ['people:self-account-binding'], fromRevision: 1, toRevision: 2
    })
    expect(await unifiedAsyncRepository.find<Person>('person', other.calmyId)).not.toHaveProperty('linkedUserId')
    expect(page.findAll('.matter-card').find(item => item.find('h2').text() === '本人')!.text()).toContain('已关联当前账号')
    expect(page.text()).not.toContain('邀请')
  })

  it('does not let one account bind itself to a second Person', async () => {
    sessionStorage.setItem('b_session', JSON.stringify({
      token: 'people-binding-session', apiOrigin: 'https://api.example.test', expiresAt: Date.now() + 60_000,
      user: { id: 'account-self', username: 'self', displayName: '本人', role: 'user' }, mustChangePassword: false
    }))
    const linked = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '已关联人物', linkedUserId: 'account-self' }))
    const unlinked = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '另一个人物' }))
    const page = await openPeople()
    const card = page.findAll('.matter-card').find(item => item.text().includes('另一个人物'))!

    expect(card.text()).toContain(`当前账号已关联「${linked.displayName}」`)
    expect(card.find('[aria-label="绑定此人物到当前账号"]').exists()).toBe(false)
    expect(await unifiedAsyncRepository.find<Person>('person', unlinked.calmyId)).not.toHaveProperty('linkedUserId')
  })

  it('does not expose or overwrite another User binding', async () => {
    sessionStorage.setItem('b_session', JSON.stringify({
      token: 'people-binding-session', apiOrigin: 'https://api.example.test', expiresAt: Date.now() + 60_000,
      user: { id: 'account-self', username: 'self', displayName: '本人', role: 'user' }, mustChangePassword: false
    }))
    const person = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '妹妹', linkedUserId: 'another-private-account-id' }))
    const page = await openPeople()
    const card = page.findAll('.matter-card').find(item => item.find('h2').text() === '妹妹')!

    expect(card.text()).toContain('已关联账号')
    expect(card.text()).not.toContain('another-private-account-id')
    expect(card.find('[aria-label="绑定此人物到当前账号"]').exists()).toBe(false)
    expect((await unifiedAsyncRepository.find<Person>('person', person.calmyId))?.linkedUserId).toBe('another-private-account-id')
  })

  it('keeps account binding controls hidden when there is no Server User session', async () => {
    const person = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '爸爸' }))
    const page = await openPeople()
    const card = page.findAll('.matter-card').find(item => item.find('h2').text() === '爸爸')!

    expect(card.text()).toContain('尚未关联账号')
    expect(card.find('[aria-label="绑定此人物到当前账号"]').exists()).toBe(false)
    expect((await unifiedAsyncRepository.find<Person>('person', person.calmyId))?.linkedUserId).toBeUndefined()
  })

  it('requires confirmation before a User unbinds their own Person', async () => {
    sessionStorage.setItem('b_session', JSON.stringify({
      token: 'people-binding-session', apiOrigin: 'https://api.example.test', expiresAt: Date.now() + 60_000,
      user: { id: 'account-self', username: 'self', displayName: '本人', role: 'user' }, mustChangePassword: false
    }))
    const person = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '本人', linkedUserId: 'account-self' }))
    const page = await openPeople()
    const card = page.findAll('.matter-card').find(item => item.find('h2').text() === '本人')!
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

    await card.get('[aria-label="解除此人物与当前账号的绑定"]').trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalledOnce()
    expect((await unifiedAsyncRepository.find<Person>('person', person.calmyId))?.linkedUserId).toBeUndefined()
    expect((await unifiedAsyncRepository.find<Person>('person', person.calmyId))?.revision).toBe(2)
  })

  it('links a Person to an existing Scene by stable Relation and can remove the link without changing either Entity', async () => {
    const person = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '爸爸', notes: '原始人物事实' }))
    const scene = await unifiedAsyncRepository.create(unifiedFactories.scene({ title: '住院照护' }))
    const page = await openPeople()
    const card = page.findAll('.matter-card').find(item => item.text().includes('爸爸'))!
    const picker = card.get('.context-relation-picker')

    await picker.get('[aria-label="选择关联的人物、事情、情境或空间"]').setValue(`scene:${scene.calmyId}`)
    await picker.get('button').trigger('click')
    await flushPromises()
    let links = await unifiedAsyncRepository.list<Relation>('relation')
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      from: { entityType: 'person', calmyId: person.calmyId }, to: { entityType: 'scene', calmyId: scene.calmyId }, relationType: 'context_of'
    })
    expect((await unifiedAsyncRepository.find<Person>('person', person.calmyId))?.notes).toBe('原始人物事实')
    expect((await unifiedAsyncRepository.find<Scene>('scene', scene.calmyId))?.title).toBe('住院照护')

    await picker.get('[aria-label="移除关联 情境 · 住院照护"]').trigger('click')
    await flushPromises()
    links = await unifiedAsyncRepository.list<Relation>('relation')
    expect(links[0].archivedAt).toEqual(expect.any(Number))
    expect((await unifiedAsyncRepository.find<Person>('person', person.calmyId))?.notes).toBe('原始人物事实')

    await picker.get('[aria-label="选择关联的人物、事情、情境或空间"]').setValue(`scene:${scene.calmyId}`)
    await picker.get('button').trigger('click')
    await flushPromises()
    links = await unifiedAsyncRepository.list<Relation>('relation')
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ calmyId: expect.any(String), revision: 3 })
    expect(links[0].archivedAt).toBeUndefined()

    await unifiedAsyncRepository.transitionScene(scene.calmyId, 'archived', { expectedRevision: scene.revision })
    wrapper?.unmount()
    const reopenedPage = await openPeople()
    const reopenedCard = reopenedPage.findAll('.matter-card').find(item => item.text().includes('爸爸'))!
    const reopenedPicker = reopenedCard.get('.context-relation-picker')
    expect(reopenedPicker.text()).toContain('情境 · 住院照护（已归档）')
    await reopenedPicker.get('[aria-label="移除关联 情境 · 住院照护（已归档）"]').trigger('click')
    await flushPromises()
    expect((await unifiedAsyncRepository.list<Relation>('relation'))[0].archivedAt).toEqual(expect.any(Number))
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
