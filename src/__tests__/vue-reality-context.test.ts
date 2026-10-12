import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { unifiedFactories } from '@/domain/unified'
import RealityContextPage from '@/vue/pages/RealityContextPage.vue'

const harness = vi.hoisted(() => ({ docs: vi.fn(), list: vi.fn(), matters: vi.fn(), session: vi.fn(), activity: vi.fn() }))

vi.mock('@/domain/reality', async importOriginal => ({
  ...(await importOriginal<typeof import('@/domain/reality')>()),
  listRealityDocumentsAsync: harness.docs
}))
vi.mock('@/domain/unified', async importOriginal => ({
  ...(await importOriginal<typeof import('@/domain/unified')>()),
  unifiedAsyncRepository: { list: harness.list }
}))
vi.mock('@/domain/matter/repository', () => ({ matterAsyncRepository: { list: harness.matters } }))
vi.mock('@/core/auth', () => ({ readServerSession: harness.session }))
vi.mock('@/domain/social/collaboration', async importOriginal => ({
  ...(await importOriginal<typeof import('@/domain/social/collaboration')>()),
  listRealityActivityAsync: harness.activity
}))

describe('RealityContextPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    harness.docs.mockResolvedValue([{ id: 'doc-1', calmyId: 'doc-1', entityType: 'record', source: 'unified', title: '复诊资料', summary: '下周一', route: '/app/library', updatedAt: 1, searchText: '', ownership: { ownerRef: { type: 'user', id: 'user-1' }, stewardRefs: [], privacy: 'private' } }])
    harness.session.mockReturnValue({ user: { id: 'user-1' } })
    harness.list.mockResolvedValue([])
    harness.matters.mockResolvedValue([])
    harness.activity.mockResolvedValue([
      { source: 'core_entity_mutation', originalId: 'audit-1', entityRef: { entityType: 'record', calmyId: 'doc-1' }, operation: 'update', actor: 'user', actorUserId: 'user-1', sourceIds: [], fromRevision: 1, toRevision: 2, occurredAt: 2, patch: { title: '复诊资料' }, previousSnapshot: { title: '旧复诊资料' }, snapshot: { title: '复诊资料' } },
      { source: 'record_revision', originalId: 'record-revision-1', entityRef: { entityType: 'record', calmyId: 'doc-1' }, operation: 'revised', sourceIds: [], occurredAt: 3, recordRevision: 2, reason: '医院来电修正', actor: 'user', actorUserId: 'user-1', body: '复诊时间更新' },
    ])
  })

  async function render(path = '/app/reality-context') {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/app/reality-context', component: RealityContextPage },
      { path: '/app/module/posts', component: { template: '<div>文章</div>' } },
      { path: '/app/people', component: { template: '<div>人物</div>' } }
    ] })
    await router.push(path)
    await router.isReady()
    const wrapper = mount(RealityContextPage, { global: { plugins: [router] } })
    await flushPromises()
    return wrapper
  }

  it('shows only records allowed for the current Server User', async () => {
    const wrapper = await render()
    expect(wrapper.text()).toContain('复诊资料')
    expect(wrapper.text()).toContain('所有者视图')
    expect(wrapper.text()).toContain('当前账号是这份资料的所有者')
  })

  it('explains an explicit permission and the action it allows', async () => {
    harness.docs.mockResolvedValue([{ id: 'doc-1', calmyId: 'doc-1', entityType: 'record', source: 'unified', title: '获准查看的复诊资料', summary: '下周一', route: '/app/library', updatedAt: 1, searchText: '', ownership: { ownerRef: { type: 'user', id: 'owner-1' }, stewardRefs: [], privacy: 'private' } }])
    harness.list.mockImplementation(async (type: string) => type === 'permission'
      ? [unifiedFactories.permission({ principalUserId: 'user-1', entityRef: { entityType: 'record', calmyId: 'doc-1' }, effect: 'allow', actions: ['view'] })]
      : [])
    const wrapper = await render()
    expect(wrapper.text()).toContain('已明确授予当前账号查看权限')
  })

  it('hides records when there is no matching Permission', async () => {
    harness.session.mockReturnValue({ user: { id: 'unrelated-user' } })
    const wrapper = await render()
    expect(wrapper.text()).not.toContain('复诊资料')
    expect(wrapper.text()).toContain('当前情境没有已授权的资料')
  })

  it('labels an explicitly permitted active Scene participant without implying an unverified invitation', async () => {
    harness.docs.mockResolvedValue([{ id: 'doc-1', calmyId: 'doc-1', entityType: 'record', source: 'unified', title: '照护记录', summary: '今日情况', route: '/app/library', updatedAt: 1, searchText: '', ownership: { ownerRef: { type: 'user', id: 'owner-1' }, stewardRefs: [], privacy: 'scene' } }])
    harness.list.mockImplementation(async (type: string) => {
      if (type === 'permission') return [unifiedFactories.permission({ principalUserId: 'user-1', entityRef: { entityType: 'record', calmyId: 'doc-1' }, effect: 'allow', actions: ['view'] })]
      if (type === 'scene_participant') return [unifiedFactories.sceneParticipant({ sceneId: 'scene-1', personId: 'person-1', joinedAt: 1 })]
      if (type === 'person') return [{ calmyId: 'person-1', displayName: '照护者', status: 'active', linkedUserId: 'user-1' }]
      if (type === 'scene') return [{ calmyId: 'scene-1', title: '照护中', status: 'active', thingId: 'thing-1' }]
      if (type === 'relation') return [unifiedFactories.relation({ from: { entityType: 'record', calmyId: 'doc-1' }, to: { entityType: 'scene', calmyId: 'scene-1' }, relationType: 'context_of', directed: true, sourceIds: [] })]
      return []
    })

    const wrapper = await render('/app/reality-context?scene=scene-1')

    expect(wrapper.text()).toContain('照护记录')
    expect(wrapper.text()).toContain('场景参与者视图')
    expect(wrapper.text()).not.toContain('受邀参与视图')
  })

  it('loads read-only history only after opening an allowed record history panel', async () => {
    const wrapper = await render()
    expect(harness.activity).not.toHaveBeenCalled()
    await wrapper.get('[aria-label="查看复诊资料的历史"]').trigger('click')
    await flushPromises()
    expect(harness.activity).toHaveBeenCalledWith({ entityType: 'record', calmyId: 'doc-1' })
    expect(wrapper.text()).toContain('版本 1 → 2')
    expect(wrapper.text()).toContain('对象变更')
    expect(wrapper.text()).toContain('来源：用户')
    expect(wrapper.text()).toContain('操作人：user-1')
    expect(wrapper.text()).toContain('修改前：标题「旧复诊资料」')
    expect(wrapper.text()).toContain('修改后：标题「复诊资料」')
    expect(wrapper.text()).toContain('记录修订')
    expect(wrapper.text()).toContain('医院来电修正')
  })

  it('shows localized DailyState snapshots only when the state is visible to the current user', async () => {
    harness.docs.mockResolvedValue([{ id: 'daily-2026-10-02', calmyId: 'daily-2026-10-02', entityType: 'daily_state', source: 'unified', title: '10月2日日常状态', summary: '身体疲惫', route: '/app/calendar?date=2026-10-02', updatedAt: 2, searchText: '', ownership: { ownerRef: { type: 'user', id: 'user-1' }, stewardRefs: [], privacy: 'private' } }])
    harness.activity.mockResolvedValue([{ source: 'daily_state_revision', originalId: 'daily-2026-10-02#2', entityRef: { entityType: 'daily_state', calmyId: 'daily-2026-10-02' }, operation: 'updated', actorUserId: 'user-1', sourceIds: [], fromRevision: 1, toRevision: 2, occurredAt: 3, patch: { revision: 2, operation: 'updated', occurredAt: 3, actorUserId: 'user-1', date: '2026-10-02', bodyState: 'tired', mentalState: 'heavy', load: 70, trajectory: 'recovering', protectedItems: [] } }])

    const ownerView = await render()
    await ownerView.get('[aria-label="查看10月2日日常状态的历史"]').trigger('click')
    await flushPromises()
    expect(harness.activity).toHaveBeenCalledWith({ entityType: 'daily_state', calmyId: 'daily-2026-10-02' })
    expect(ownerView.text()).toContain('日常状态修订')
    expect(ownerView.text()).toContain('版本 1 → 2 · 身体 疲惫 · 心理 沉重 · 负荷 70% · 趋势 恢复中')

    harness.activity.mockClear()
    harness.session.mockReturnValue({ user: { id: 'unrelated-user' } })
    const deniedView = await render()
    expect(deniedView.text()).not.toContain('10月2日日常状态')
    expect(harness.activity).not.toHaveBeenCalled()
  })

  it('opens Diary history through the canonical diary_entry reference and renders snapshots read-only', async () => {
    harness.docs.mockResolvedValue([{ id: '2026-09-23', calmyId: '2026-09-23', entityType: 'diary', source: 'legacy', title: '复诊日记', summary: '复诊之后。', route: '/app/diary?date=2026-09-23', updatedAt: 3, searchText: '', ownership: { ownerRef: { type: 'user', id: 'user-1' }, stewardRefs: [], privacy: 'private' } }])
    harness.activity.mockResolvedValue([{ source: 'diary_revision', originalId: '2026-09-23#2', entityRef: { entityType: 'diary_entry', calmyId: '2026-09-23' }, operation: 'content_updated', actorUserId: 'user-1', sourceIds: [], fromRevision: 1, toRevision: 2, occurredAt: 3, patch: { content: '复诊之后。' } }])
    const wrapper = await render()
    await wrapper.get('[aria-label="查看复诊日记的历史"]').trigger('click')
    await flushPromises()
    expect(harness.activity).toHaveBeenCalledWith({ entityType: 'diary_entry', calmyId: '2026-09-23' })
    expect(wrapper.text()).toContain('日记修订')
    expect(wrapper.text()).toContain('复诊之后。')
  })

  it('opens ImportantDate history through its canonical Core Entity reference', async () => {
    harness.docs.mockResolvedValue([{ id: 'important-date-1', calmyId: 'important-date-1', entityType: 'important_date', source: 'unified', title: '爸爸生日', summary: '02-18 · 每年', route: '/app/people', updatedAt: 3, searchText: '', ownership: { ownerRef: { type: 'user', id: 'user-1' }, stewardRefs: [], privacy: 'private' } }])
    harness.activity.mockResolvedValue([{ source: 'core_entity_mutation', originalId: 'mutation-2', entityRef: { entityType: 'important_date', calmyId: 'important-date-1' }, operation: 'update', actor: 'user', actorUserId: 'user-1', sourceIds: [], fromRevision: 1, toRevision: 2, occurredAt: 3, patch: { notes: '提前准备礼物' } }])

    const ownerView = await render()
    await ownerView.get('[aria-label="查看爸爸生日的历史"]').trigger('click')
    await flushPromises()

    expect(harness.activity).toHaveBeenCalledWith({ entityType: 'important_date', calmyId: 'important-date-1' })
    expect(ownerView.text()).toContain('对象变更')
    expect(ownerView.text()).toContain('版本 1 → 2')

    harness.activity.mockClear()
    harness.session.mockReturnValue({ user: { id: 'unrelated-user' } })
    const deniedView = await render()
    expect(deniedView.text()).not.toContain('爸爸生日')
    expect(harness.activity).not.toHaveBeenCalled()
  })

  it('opens authorized legacy Post history through its original posts ID', async () => {
    harness.docs.mockResolvedValue([{ id: 'post-1', calmyId: 'post-1', entityType: 'post', source: 'legacy', title: '复诊经验', summary: '家属沟通', route: '/app/module/posts', updatedAt: 3, searchText: '', ownership: { ownerRef: { type: 'user', id: 'user-1' }, stewardRefs: [], privacy: 'private' } }])
    harness.activity.mockResolvedValue([{ source: 'post_revision', originalId: 'post-1#2', entityRef: { entityType: 'post', calmyId: 'post-1' }, operation: 'updated', actorUserId: 'user-1', sourceIds: [], fromRevision: 1, toRevision: 2, occurredAt: 3, patch: { title: '复诊经验', content: '已确认家属沟通安排。' } }])
    const wrapper = await render()

    await wrapper.get('[aria-label="查看复诊经验的历史"]').trigger('click')
    await flushPromises()

    expect(harness.activity).toHaveBeenCalledWith({ entityType: 'post', calmyId: 'post-1' })
    expect(wrapper.text()).toContain('文章修订')
    expect(wrapper.text()).toContain('版本 1 → 2 · 复诊经验')
    expect(wrapper.text()).toContain('已确认家属沟通安排。')
  })

  it('uses an explicitly owned legacy Goal as a permission-checked RealityDocument', async () => {
    harness.docs.mockResolvedValue([{ id: 'goal-1', calmyId: 'goal-1', entityType: 'goal', source: 'legacy', title: '复诊准备', summary: 'open · 目标', route: '/app/module/goals', updatedAt: 1, searchText: '', ownership: { ownerRef: { type: 'user', id: 'user-1' }, stewardRefs: [], privacy: 'private' } }])

    const ownerView = await render()
    expect(ownerView.text()).toContain('复诊准备')
    await ownerView.get('[aria-label="查看复诊准备的历史"]').trigger('click')
    await flushPromises()
    expect(harness.activity).toHaveBeenCalledWith({ entityType: 'goal', calmyId: 'goal-1' })

    harness.session.mockReturnValue({ user: { id: 'unrelated-user' } })
    const deniedView = await render()
    expect(deniedView.text()).not.toContain('复诊准备')
  })

  it('filters by a linked Time value without granting access to the record', async () => {
    harness.list.mockImplementation(async (type: string) => type === 'relation' ? [unifiedFactories.relation({
      from: { entityType: 'record', calmyId: 'doc-1' }, to: { entityType: 'time', calmyId: '2026-09' },
      relationType: 'context_of', directed: true, sourceIds: []
    })] : [])
    const matching = await render('/app/reality-context?time=2026-09')
    expect(matching.text()).toContain('时间：2026-09')
    expect(matching.text()).toContain('复诊资料')
    const nonmatching = await render('/app/reality-context?time=2026-10')
    expect(nonmatching.text()).not.toContain('复诊资料')
    expect(nonmatching.text()).toContain('当前情境没有已授权的资料')
  })

  it('lets users combine Person, Domain, Thing, Scene, Space and Time in a real context view', async () => {
    harness.docs.mockResolvedValue([{ id: 'doc-1', calmyId: 'doc-1', entityType: 'record', source: 'unified', title: '复诊资料', summary: '下周一', route: '/app/library', updatedAt: 1, searchText: '', ownership: { ownerRef: { type: 'user', id: 'user-1' }, stewardRefs: [], privacy: 'private' } }])
    harness.matters.mockResolvedValue([{ calmyId: 'thing-1', title: '爸爸住院', status: 'active' }])
    harness.list.mockImplementation(async (type: string) => {
      if (type === 'person') return [{ calmyId: 'person-1', displayName: '爸爸', status: 'active' }]
      if (type === 'domain') return [{ calmyId: 'domain-1', displayName: '健康', status: 'active' }]
      if (type === 'scene') return [{ calmyId: 'scene-1', title: '9月住院', status: 'active' }]
      if (type === 'space') return [{ calmyId: 'space-1', title: '我的家庭', status: 'active', memberPersonIds: [] }]
      if (type === 'relation') return [
        unifiedFactories.relation({ from: { entityType: 'record', calmyId: 'doc-1' }, to: { entityType: 'person', calmyId: 'person-1' }, relationType: 'subject_of', directed: true, sourceIds: [] }),
        unifiedFactories.relation({ from: { entityType: 'record', calmyId: 'doc-1' }, to: { entityType: 'domain', calmyId: 'domain-1' }, relationType: 'belongs_to_domain', directed: true, sourceIds: [] }),
        unifiedFactories.relation({ from: { entityType: 'record', calmyId: 'doc-1' }, to: { entityType: 'thing', calmyId: 'thing-1' }, relationType: 'context_of', directed: true, sourceIds: [] }),
        unifiedFactories.relation({ from: { entityType: 'record', calmyId: 'doc-1' }, to: { entityType: 'scene', calmyId: 'scene-1' }, relationType: 'context_of', directed: true, sourceIds: [] }),
        unifiedFactories.relation({ from: { entityType: 'record', calmyId: 'doc-1' }, to: { entityType: 'space', calmyId: 'space-1' }, relationType: 'context_of', directed: true, sourceIds: [] }),
        unifiedFactories.relation({ from: { entityType: 'record', calmyId: 'doc-1' }, to: { entityType: 'time', calmyId: '2026-09' }, relationType: 'context_of', directed: true, sourceIds: [] })
      ]
      return []
    })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app/reality-context', component: RealityContextPage }] })
    await router.push('/app/reality-context')
    await router.isReady()
    const wrapper = mount(RealityContextPage, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.get('[aria-label="选择人物上下文"]').setValue('person-1')
    await wrapper.get('[aria-label="选择领域上下文"]').setValue('domain-1')
    await wrapper.get('[aria-label="选择事情上下文"]').setValue('thing-1')
    await wrapper.get('[aria-label="选择情境上下文"]').setValue('scene-1')
    await wrapper.get('[aria-label="选择空间上下文"]').setValue('space-1')
    await wrapper.get('[aria-label="选择时间上下文"]').setValue('2026-09')
    await wrapper.get('.context-filters').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.query).toMatchObject({ person: 'person-1', domain: 'domain-1', thing: 'thing-1', scene: 'scene-1', space: 'space-1', time: '2026-09' })
    expect(wrapper.text()).toContain('复诊资料')
  })

  it('shows a Thing overview using its canonical ordered Scenes, participants and only visible linked records', async () => {
    harness.docs.mockResolvedValue([
      { id: 'task-1', calmyId: 'task-1', entityType: 'action', source: 'unified', title: '联系医生', summary: '确认复诊时间', route: '/app/tasks', updatedAt: 1, searchText: '', matterId: 'thing-1', ownership: { ownerRef: { type: 'user', id: 'user-1' }, stewardRefs: [], privacy: 'private' } },
      { id: 'note-1', calmyId: 'note-1', entityType: 'record', source: 'unified', title: '我的情绪记录', summary: '只允许我查看', route: '/app/library', updatedAt: 1, searchText: '', matterId: 'thing-1', ownership: { ownerRef: { type: 'user', id: 'user-2' }, stewardRefs: [], privacy: 'private' } }
    ])
    harness.matters.mockResolvedValue([{ calmyId: 'thing-1', title: '爸爸住院', status: 'active' }])
    harness.list.mockImplementation(async (type: string) => {
      if (type === 'scene') return [
        { calmyId: 'scene-2', title: '复诊', thingId: 'thing-1', status: 'active', order: 2 },
        { calmyId: 'scene-1', title: '住院', thingId: 'thing-1', status: 'completed', order: 1 }
      ]
      if (type === 'person') return [{ calmyId: 'person-1', displayName: '爸爸', status: 'active' }]
      if (type === 'scene_participant') return [unifiedFactories.sceneParticipant({ sceneId: 'scene-2', personId: 'person-1', joinedAt: 1 })]
      if (type === 'relation') return []
      return []
    })

    const wrapper = await render('/app/reality-context?thing=thing-1')

    expect(wrapper.text()).toContain('爸爸住院概览')
    expect(wrapper.text()).toContain('住院')
    expect(wrapper.text().indexOf('住院')).toBeLessThan(wrapper.text().indexOf('复诊'))
    expect(wrapper.text()).toContain('参与的人')
    expect(wrapper.text()).toContain('爸爸')
    expect(wrapper.text()).toContain('联系医生')
    expect(wrapper.text()).not.toContain('我的情绪记录')
  })
})
