import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import RealityScenesPage from '@/vue/pages/RealityScenesPage.vue'

const harness = vi.hoisted(() => ({
  list: vi.fn(), create: vi.fn(), transitionScene: vi.fn(), transitionSpace: vi.fn(), update: vi.fn(), scene: vi.fn(), sceneParticipant: vi.fn(), space: vi.fn(), documents: vi.fn(), settle: vi.fn()
}))

vi.mock('@/domain/unified', async importOriginal => ({
  ...(await importOriginal<typeof import('@/domain/unified')>()),
  unifiedAsyncRepository: { list: harness.list, create: harness.create, transitionScene: harness.transitionScene, transitionSpace: harness.transitionSpace, update: harness.update },
  unifiedFactories: { scene: harness.scene, sceneParticipant: harness.sceneParticipant, space: harness.space }
}))
vi.mock('@/domain/matter/repository', () => ({ matterAsyncRepository: { list: vi.fn(async () => []) } }))
vi.mock('@/domain/reality', async importOriginal => ({ ...(await importOriginal<typeof import('@/domain/reality')>()), listRealityDocumentsAsync: harness.documents }))
vi.mock('@/application/use-cases/settle-reality-context', () => ({ settleRealityContext: harness.settle }))

describe('reality Scene workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    harness.list.mockImplementation(async (type: string) => type === 'scene' ? [] : type === 'person' ? [] : type === 'space' ? [] : [])
    harness.create.mockImplementation(async entity => entity)
    harness.transitionScene.mockImplementation(async (id, status) => ({ calmyId: id, status }))
    harness.transitionSpace.mockImplementation(async (id, status) => ({ calmyId: id, status }))
    harness.update.mockImplementation(async (_type, id, patch) => ({ calmyId: id, ...patch }))
    harness.scene.mockImplementation(input => ({ calmyId: 'scene-new', entityType: 'scene', status: 'draft', ...input }))
    harness.sceneParticipant.mockImplementation(input => ({ calmyId: 'participant-new', ...input }))
    harness.space.mockImplementation(input => ({ calmyId: 'space-new', entityType: 'space', revision: 1, ...input }))
    harness.documents.mockResolvedValue([])
    harness.settle.mockResolvedValue({})
  })

  async function render(path = '/app/reality-scenes') {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app/reality-scenes', component: RealityScenesPage }] })
    await router.push(path)
    await router.isReady()
    const wrapper = mount(RealityScenesPage, { global: { plugins: [router] } })
    await flushPromises()
    return wrapper
  }

  it('creates a real Scene separately from theme configuration and permits no Space', async () => {
    const wrapper = await render()
    await wrapper.get('input[aria-label="情境名称"]').setValue('爸爸住院治疗')
    await wrapper.get('button[aria-label="创建情境"]').trigger('click')
    await flushPromises()
    expect(harness.scene).toHaveBeenCalledWith(expect.objectContaining({ title: '爸爸住院治疗', spaceId: undefined, order: 0 }))
    expect(harness.create).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'scene' }))
  })

  it('assigns the next stable order when adding a Scene to an existing Thing', async () => {
    harness.list.mockImplementation(async (type: string) => type === 'scene' ? [{ calmyId: 's1', title: '住院', status: 'active', entityType: 'scene', thingId: 'thing-1', order: 0 }] : [])
    const wrapper = await render('/app/reality-scenes?thing=thing-1')
    await wrapper.get('input[aria-label="情境名称"]').setValue('康复')
    await wrapper.get('button[aria-label="创建情境"]').trigger('click')
    await flushPromises()
    expect(harness.scene).toHaveBeenCalledWith(expect.objectContaining({ thingId: 'thing-1', order: 1 }))
  })

  it('allows ordered Scenes within a Thing to be moved', async () => {
    harness.list.mockImplementation(async (type: string) => type === 'scene' ? [
      { calmyId: 's1', title: '住院', status: 'completed', entityType: 'scene', thingId: 'thing-1', order: 0, revision: 2 },
      { calmyId: 's2', title: '康复', status: 'active', entityType: 'scene', thingId: 'thing-1', order: 1, revision: 3 }
    ] : [])
    const wrapper = await render()
    await wrapper.get('[aria-label="下移住院"]').trigger('click')
    expect(harness.update).toHaveBeenNthCalledWith(1, 'scene', 's1', { order: 1 }, expect.objectContaining({
      expectedRevision: 2, commandId: 'scene:order:s1:3', actor: 'user', actorId: 'local-user', sourceIds: ['reality-scenes:scene-order']
    }))
    expect(harness.update).toHaveBeenNthCalledWith(2, 'scene', 's2', { order: 0 }, expect.objectContaining({
      expectedRevision: 3, commandId: 'scene:order:s2:4', actor: 'user', actorId: 'local-user', sourceIds: ['reality-scenes:scene-order']
    }))
  })

  it('reloads persisted Scene order when a two-record reorder is only partly saved', async () => {
    const sceneRows = [
      { calmyId: 's1', title: '住院', status: 'completed', entityType: 'scene', thingId: 'thing-1', order: 0, revision: 2 },
      { calmyId: 's2', title: '康复', status: 'active', entityType: 'scene', thingId: 'thing-1', order: 1, revision: 3 }
    ]
    harness.list.mockImplementation(async (type: string) => type === 'scene' ? sceneRows : [])
    harness.update.mockImplementation(async (_type, id, patch) => {
      if (id !== 's1') throw new Error('revision conflict')
      Object.assign(sceneRows[0], patch, { revision: sceneRows[0].revision + 1 })
      return sceneRows[0]
    })
    const wrapper = await render()

    await wrapper.get('[aria-label="下移住院"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('revision conflict')
    expect(harness.list.mock.calls.filter(([type]) => type === 'scene')).toHaveLength(2)
    expect(harness.update).toHaveBeenCalledTimes(3)
    expect(sceneRows[0]).toMatchObject({ order: 0, revision: 4 })
    expect(wrapper.text()).toContain('住院')
  })

  it('shows lifecycle actions for persisted scenes and explains that ending keeps their data', async () => {
    harness.list.mockImplementation(async (type: string) => type === 'scene' ? [{ calmyId: 's1', title: '住院', status: 'active', entityType: 'scene', revision: 4 }] : [])
    const wrapper = await render()
    expect(wrapper.text()).toContain('结束情境会保留资料和历史')
    await wrapper.get('[aria-label="完成住院"]').trigger('click')
    expect(harness.transitionScene).toHaveBeenCalledWith('s1', 'completed', expect.objectContaining({
      expectedRevision: 4, commandId: 'scene:status:s1:5', sourceIds: ['reality-scenes:scene-status']
    }))
  })

  it('closes a Space without deleting its related Scenes or records', async () => {
    harness.list.mockImplementation(async (type: string) => type === 'space' ? [{ calmyId: 'sp1', title: '家庭照护', status: 'active', entityType: 'space', revision: 3, memberPersonIds: [] }] : [])
    const wrapper = await render()
    expect(wrapper.text()).toContain('关闭空间不会删除其中的情境和资料')
    await wrapper.get('[aria-label="关闭空间家庭照护"]').trigger('click')
    expect(harness.transitionSpace).toHaveBeenCalledWith('sp1', 'closed', expect.objectContaining({ expectedRevision: 3, commandId: 'space:status:sp1:4' }))
  })

  it('creates a durable Space with selected real members and says membership does not grant access', async () => {
    harness.list.mockImplementation(async (type: string) => type === 'person' ? [{ calmyId: 'p1', displayName: '照护者', status: 'active' }] : [])
    const wrapper = await render()
    await wrapper.get('[aria-label="空间名称"]').setValue('家庭照护')
    await wrapper.get('[aria-label="空间用途"]').setValue('共同安排照护')
    await wrapper.get('[aria-label="空间边界说明"]').setValue('仅记录现实关系')
    await wrapper.get('[aria-label="新空间成员"]').setValue(['p1'])
    await wrapper.get('.space-create').trigger('submit')
    await flushPromises()

    expect(harness.space).toHaveBeenCalledWith(expect.objectContaining({
      title: '家庭照护', purpose: '共同安排照护', boundary: '仅记录现实关系',
      memberPersonIds: ['p1'], relationshipIds: [], thingIds: [], sceneIds: [], status: 'active'
    }))
    expect(harness.create).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'space' }), expect.objectContaining({ commandId: 'space:create:space-new' }))
    expect(wrapper.text()).toContain('不会自动获得资料访问权')
  })

  it('updates Space members with a revision check and retains unknown legacy member ids', async () => {
    harness.list.mockImplementation(async (type: string) => type === 'space' ? [{
      calmyId: 'sp1', title: '家庭照护', status: 'active', entityType: 'space', revision: 4,
      memberPersonIds: ['p1', 'legacy-member']
    }] : type === 'person' ? [{ calmyId: 'p1', displayName: '照护者', status: 'active' }, { calmyId: 'p2', displayName: '家人', status: 'active' }] : [])
    const wrapper = await render()
    await wrapper.get('[aria-label="管理空间成员 家庭照护"]').setValue(['p1', 'p2'])
    await flushPromises()

    expect(harness.update).toHaveBeenCalledWith('space', 'sp1', { memberPersonIds: ['p1', 'p2', 'legacy-member'] }, expect.objectContaining({ expectedRevision: 4, commandId: 'space:members:sp1:5' }))
  })

  it('rejects adding an archived Person as a Space member', async () => {
    harness.list.mockImplementation(async (type: string) => type === 'space' ? [{
      calmyId: 'sp1', title: '家庭照护', status: 'active', entityType: 'space', revision: 4, memberPersonIds: []
    }] : type === 'person' ? [{ calmyId: 'p-archived', displayName: '已归档人物', status: 'archived' }] : [])
    const wrapper = await render()
    await wrapper.get('[aria-label="管理空间成员 家庭照护"]').setValue(['p-archived'])
    await flushPromises()

    expect(harness.update).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('只能添加仍有效的人物作为空间成员。')
  })

  it('sets a Scene owner and Private visibility through revision checked Entity update', async () => {
    harness.list.mockImplementation(async (type: string) => type === 'scene' ? [{ calmyId: 's-private', title: '私密陪护情境', status: 'active', entityType: 'scene', revision: 3 }] : type === 'person' ? [{ calmyId: 'p-owner', displayName: '照护者', status: 'active' }] : [])
    const wrapper = await render()
    const editor = wrapper.find('.scene-card .ownership-editor')
    await editor.get('summary').trigger('click')
    await editor.get('input[type="checkbox"]').setValue(true)
    await editor.get('select').setValue('person:p-owner')
    await editor.findAll('select')[4].setValue('private')
    await editor.get('button').trigger('click')
    await flushPromises()
    expect(harness.update).toHaveBeenCalledWith('scene', 's-private', { ownership: expect.objectContaining({ ownerRef: { type: 'person', id: 'p-owner' }, privacy: 'private' }) }, { expectedRevision: 3 })
  })

  it('sets a Space owner and visibility separately from membership', async () => {
    harness.list.mockImplementation(async (type: string) => type === 'space' ? [{ calmyId: 'sp-private', title: '家庭空间', status: 'active', entityType: 'space', revision: 4, memberPersonIds: ['p-member'] }] : type === 'person' ? [{ calmyId: 'p-owner', displayName: '照护者', status: 'active' }, { calmyId: 'p-member', displayName: '家庭成员', status: 'active' }] : [])
    const wrapper = await render()
    const editor = wrapper.find('.space-row .ownership-editor')
    await editor.get('summary').trigger('click')
    await editor.get('input[type="checkbox"]').setValue(true)
    await editor.get('select').setValue('person:p-owner')
    await editor.findAll('select')[4].setValue('space')
    await editor.get('button').trigger('click')
    await flushPromises()
    expect(harness.update).toHaveBeenCalledWith('space', 'sp-private', { ownership: expect.objectContaining({ ownerRef: { type: 'person', id: 'p-owner' }, privacy: 'space' }) }, { expectedRevision: 4 })
  })

  it('lets the user record a settlement choice for an existing linked Entity', async () => {
    harness.list.mockImplementation(async (type: string) => type === 'scene' ? [{ calmyId: 's1', title: '住院', status: 'completed', entityType: 'scene', thingId: 'thing-1', revision: 4 }] : [])
    harness.documents.mockResolvedValue([{ calmyId: 'resource-1', entityType: 'resource', title: '检查报告', summary: '复诊用', matterId: 'thing-1' }])
    const wrapper = await render()
    await wrapper.get('[aria-label="选择检查报告的沉淀方式"]').setValue('keep')
    await wrapper.findAll('button').find(button => button.text().includes('保存选择（1）'))!.trigger('click')
    await flushPromises()
    expect(harness.settle).toHaveBeenCalledWith('s1', [expect.objectContaining({
      entityRef: { entityType: 'resource', calmyId: 'resource-1' }, choice: 'keep'
    })], expect.objectContaining({ commandId: expect.stringContaining('settlement:s1:') }))
  })

  it('shows finance entries as shared expenses and preserves their typed identity in settlement', async () => {
    harness.list.mockImplementation(async (type: string) => type === 'scene' ? [{ calmyId: 's1', title: '住院', status: 'completed', entityType: 'scene', thingId: 'thing-1', revision: 4 }] : [])
    harness.documents.mockResolvedValue([{ calmyId: 'finance-1', entityType: 'transaction', title: '医疗费用', summary: '共同支付', matterId: 'thing-1' }])
    const wrapper = await render()
    expect(wrapper.text()).toContain('财务记录 · 共同支付')
    await wrapper.get('[aria-label="选择医疗费用的沉淀方式"]').setValue('keep')
    await wrapper.findAll('button').find(button => button.text().includes('保存选择（1）') )!.trigger('click')
    await flushPromises()
    expect(harness.settle).toHaveBeenCalledWith('s1', [expect.objectContaining({
      entityRef: { entityType: 'finance_entry', calmyId: 'finance-1' }, choice: 'keep'
    })], expect.objectContaining({ commandId: expect.stringContaining('settlement:s1:') }))
  })

  it('shows linked person relationship changes among Scene settlement candidates', async () => {
    harness.list.mockImplementation(async (type: string) => type === 'scene' ? [{ calmyId: 's1', title: '家庭照护', status: 'completed', entityType: 'scene', thingId: 'thing-1', revision: 4 }]
      : type === 'relation' ? [{ calmyId: 'link-1', relationType: 'used_in', from: { entityType: 'relationship', calmyId: 'rel-1' }, to: { entityType: 'scene', calmyId: 's1' } }] : [])
    harness.documents.mockResolvedValue([{ calmyId: 'rel-1', entityType: 'relationship', title: '照护分工调整', summary: '新增晚间陪护安排' }])
    const wrapper = await render()
    expect(wrapper.text()).toContain('人物关系 · 新增晚间陪护安排')
  })

  it('includes Scene-context links written as context_of in settlement candidates', async () => {
    harness.list.mockImplementation(async (type: string) => type === 'scene' ? [{
      calmyId: 's1', title: '住院', status: 'completed', entityType: 'scene', revision: 4
    }] : type === 'relation' ? [{
      calmyId: 'context-link', relationType: 'context_of', from: { entityType: 'resource', calmyId: 'resource-1' },
      to: { entityType: 'scene', calmyId: 's1' }
    }] : [])
    harness.documents.mockResolvedValue([{ calmyId: 'resource-1', entityType: 'resource', title: '检查报告', summary: '复诊用' }])

    const wrapper = await render()

    expect(wrapper.text()).toContain('资料 · 复诊用')
    expect(wrapper.get('[aria-label="选择检查报告的沉淀方式"]')).toBeTruthy()
  })

  it('reopens the Scene settlement list without erasing earlier decisions', async () => {
    harness.list.mockImplementation(async (type: string) => type === 'scene' ? [{
      calmyId: 's1', title: '住院', status: 'completed', entityType: 'scene', thingId: 'thing-1', revision: 5,
      settlements: [{ commandId: 'previous', settledAt: 4, decisions: [{ entityRef: { entityType: 'resource', calmyId: 'resource-1' }, choice: 'retire', decidedAt: 4 }] }]
    }] : [])
    harness.documents.mockResolvedValue([{ calmyId: 'resource-1', entityType: 'resource', title: '检查报告', summary: '复诊用', matterId: 'thing-1' }])
    const wrapper = await render()
    expect(wrapper.text()).not.toContain('检查报告')
    await wrapper.findAll('button').find(button => button.text() === '重新整理本情境的沉淀')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('检查报告')
    expect(wrapper.text()).toContain('过往沉淀记录（1）')
  })
})
