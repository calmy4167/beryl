import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import { setActiveAccount } from '@/core/account-context'
import { clearSession, writeServerSession } from '@/core/auth'
import { createAsyncCollectionRepository } from '@/core/repository'
import { actionAsyncRepository } from '@/domain/action/repository'
import { matterAsyncRepository } from '@/domain/matter/repository'
import { unifiedAsyncRepository, unifiedFactories, type Relation } from '@/domain/unified'
import { listRealityActivityAsync } from '@/domain/social/collaboration'
import { exportCurrentOpenWorkspace } from '@/core/content/open-workspace'
import { importOpenWorkspace } from '@/core/content/open-format'
import GoalsPage from '@/vue/pages/GoalsPage.vue'

let wrapper: VueWrapper | undefined
async function openGoals() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/app/module/goals', component: GoalsPage },
    { path: '/app/flow', component: { template: '<h1>探索</h1>' } },
  ] })
  await router.push('/app/module/goals'); await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await flushPromises()
  return { page: wrapper, router }
}
describe('Vue Goals parity', () => {
  it('lets the goal matter select stretch across the narrow mobile grid', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/controls.css'), 'utf8')
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.goal-context-fields select[\s\S]*?width: 100%;/)
  })
  beforeEach(() => { setActiveAccount('goal-owner-user'); localStorage.clear(); resetStoreCache(); writeServerSession({ token: 'goal-fixture-token', apiOrigin: 'https://api.example.test', expiresAt: Date.now() + 60_000, user: { id: 'goal-owner-user', username: 'goal-owner', displayName: 'Goal owner', role: 'user' }, mustChangePassword: false }) })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks(); clearSession(); setActiveAccount(null) })
  it('creates a goal with context and a next action, then persists it', async () => {
    const { page } = await openGoals()
    expect(page.find('.goals-toolbar').exists()).toBe(true)
    // v11：工具行的排版改由设计层承担（scoped .goals-toolbar + .seg），不再靠内联 display
    expect(page.get('.goals-toolbar').find('[role="tablist"]').exists()).toBe(true)
    expect(page.get('[aria-label="搜索目标"]').attributes('placeholder')).toBe('搜索目标')
    // 条目数在「目标列表」面板的 panel-note 上（「添加目标」面板排在它前面，所以不能再取第一个 .panel-head）
    const listPanel = page.findAll('.panel').find(panel => panel.find('.goals-toolbar').exists())!
    expect(listPanel.get('.panel-note').text()).toContain('0 个目标')
    expect(page.text()).toContain('还没有目标，把一个想完成的结果写下来。')
    const matter = page.get('[aria-label="目标关联处境"]')
    expect(matter.element.tagName).toBe('SELECT')
    expect(matter.find('option').text()).toBe('不关联处境')
    await page.get('[aria-label="目标名称"]').setValue('完成作品集')
    await page.get('[aria-label="目标对应问题"]').setValue('缺少展示案例')
    await page.get('[aria-label="目标证据"]').setValue('发布页面')
    await page.get('[aria-label="目标下一步行动"]').setValue('整理项目截图')
    await page.get('form').trigger('submit'); await flushPromises()
    expect(page.text()).toContain('完成作品集')
    expect(page.find('.goal-item').exists()).toBe(true)
    const storedGoal = await createAsyncCollectionRepository<{ id: string; title: string; ownership?: { ownerRef: { type: string; id: string }; privacy?: string } }>('goals', item => item.id).list()
    expect(storedGoal.find(item => item.title === '完成作品集')?.ownership).toMatchObject({ ownerRef: { type: 'user', id: 'goal-owner-user' }, privacy: 'private' })
    expect(page.get('.goal-context-summary').text()).toContain('问题：缺少展示案例')
    expect(page.get('.goal-context-summary').text()).toContain('证据：发布页面')
    expect(page.get('.goal-context-summary').text()).toContain('下一步：整理项目截图')
    expect(page.find('.goal-item [aria-label="标记目标为已完成"]').exists()).toBe(true)
    expect((await actionAsyncRepository.list()).some(item => item.title === '整理项目截图')).toBe(true)
  })
  it('links a Goal from its existing stable ID to Domain, Thing and Time through typed Relations without copying the Goal', async () => {
    const thing = await matterAsyncRepository.create({ title: '建立健康习惯' })
    const domain = await unifiedAsyncRepository.create(unifiedFactories.domain({ key: 'goal-health-domain', displayName: '健康' }))
    const { page } = await openGoals()
    await page.get('[aria-label="目标名称"]').setValue('每周运动')
    await page.get('form').trigger('submit'); await flushPromises()
    const goals = await createAsyncCollectionRepository<{ id: string; title: string }>('goals', item => item.id).list()
    const goal = goals.find(item => item.title === '每周运动')!
    const domainPicker = page.get('.goal-item .domain-picker select')
    await domainPicker.setValue(domain.calmyId); await domainPicker.trigger('change'); await flushPromises()
    const timeInput = page.get('.goal-item [aria-label="添加月份时间关系"]')
    await timeInput.setValue('2026-10'); await timeInput.trigger('change'); await flushPromises()
    const picker = page.get('.goal-item .context-relation-picker')
    const choice = picker.get('[aria-label="选择关联的人物、事情、情境或空间"]')
    await choice.setValue(`thing:${thing.calmyId}`)
    await picker.get('button').trigger('click'); await flushPromises()

    expect((await createAsyncCollectionRepository<{ id: string; title: string }>('goals', item => item.id).find(goal.id))?.title).toBe('每周运动')
    expect(await unifiedAsyncRepository.list<Relation>('relation')).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: { entityType: 'goal', calmyId: goal.id }, to: { entityType: 'domain', calmyId: domain.calmyId }, relationType: 'belongs_to_domain' }),
      expect.objectContaining({ from: { entityType: 'goal', calmyId: goal.id }, to: { entityType: 'time', calmyId: '2026-10' }, relationType: 'context_of' }),
      expect.objectContaining({ from: { entityType: 'goal', calmyId: goal.id }, to: { entityType: 'thing', calmyId: thing.calmyId }, relationType: 'context_of' })
    ]))
  })
  it('filters goals, saves progress and reopens a completed goal', async () => {
    const messages: Array<{ message: string; kind: string }> = []
    const listener = (event: Event) => messages.push((event as CustomEvent<{ message: string; kind: string }>).detail)
    window.addEventListener('beryl-toast', listener)
    try {
      const { page } = await openGoals()
      await page.get('[aria-label="目标名称"]').setValue('阅读计划'); await page.get('form').trigger('submit'); await flushPromises()
      const card = page.find('.goal-item')
      const progress = card.get('[aria-label="阅读计划 进度百分比"]')
      await progress.setValue('65'); await progress.trigger('blur'); await flushPromises()
      expect((progress.element as HTMLInputElement).value).toBe('65')
      const stored = await createAsyncCollectionRepository<{ id: string; title: string; progress: number }>('goals', item => item.id).list()
      expect(stored.find(item => item.title === '阅读计划')?.progress).toBe(65)
      await card.get('[aria-label="标记目标为已完成"]').trigger('click'); await flushPromises()
      expect(messages.at(-1)).toEqual({ message: '目标已设为已完成', kind: 'success' })
      await page.findAll('[aria-label="目标状态筛选"] [role="tab"]').find(item => item.text() === '已完成')!.trigger('click')
      expect(page.text()).toContain('阅读计划')
      await page.get('.goal-item [aria-label="标记目标为进行中"]').trigger('click'); await flushPromises()
      expect(messages.at(-1)).toEqual({ message: '目标已恢复为进行中', kind: 'success' })
      expect(page.find('.goal-item').exists()).toBe(false)
      await page.findAll('[aria-label="目标状态筛选"] [role="tab"]').find(item => item.text() === '全部')!.trigger('click')
      expect(page.get('.goal-item').text()).toContain('进行中')
    } finally { window.removeEventListener('beryl-toast', listener) }
  })
  it('records Goal revisions in the canonical record and preserves them in history and Open Format', async () => {
    const { page } = await openGoals()
    await page.get('[aria-label="目标名称"]').setValue('备份目标历史'); await page.get('form').trigger('submit'); await flushPromises()
    const stored = await createAsyncCollectionRepository<{ id: string; title: string; progress: number; revision: number; history: unknown[] }>('goals', item => item.id).list()
    const goal = stored.find(item => item.title === '备份目标历史')!
    await page.get('.goal-item [aria-label="备份目标历史 进度百分比"]').setValue('40')
    await page.get('.goal-item [aria-label="备份目标历史 进度百分比"]').trigger('blur'); await flushPromises()

    const updated = await createAsyncCollectionRepository<typeof goal>('goals', item => item.id).find(goal.id)
    expect(updated?.history).toHaveLength(2)
    expect(updated?.revision).toBe(2)
    expect((await listRealityActivityAsync({ entityType: 'goal', calmyId: goal.id })).map(item => item.source)).toEqual(['goal_revision', 'goal_revision'])
    const imported = importOpenWorkspace(exportCurrentOpenWorkspace().files)
    expect(imported.entities.find(item => 'id' in item && item.id === goal.id)).toMatchObject({ revision: 2, history: updated?.history })
  })
  it('warns on a blank goal and shows load retry state', async () => {
    const messages: Array<{ message: string; kind: string }> = []
    const listener = (event: Event) => messages.push((event as CustomEvent<{ message: string; kind: string }>).detail)
    window.addEventListener('beryl-toast', listener)
    try {
      const original = window.confirm; window.confirm = () => true
      const { page } = await openGoals()
      await page.get('form').trigger('submit')
      expect(messages.at(-1)).toEqual({ message: '请先写下目标名称', kind: 'warning' })
      window.confirm = original
    } finally { window.removeEventListener('beryl-toast', listener) }
  })
})
