import { h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache, todayKey } from '@/core/storage'
import { setActiveAccount } from '@/core/account-context'
import { actionAsyncRepository } from '@/domain/action/repository'
import { matterAsyncRepository } from '@/domain/matter/repository'
import { todayAsyncRepository } from '@/domain/today/repository'
import { unifiedAsyncRepository, unifiedFactories, type Relation } from '@/domain/unified'
import LiubaiTasks from '@/vue/pages/LiubaiTasks.vue'

/**
 * 「任务」页（v11）的行为覆盖。
 *
 * 迁移说明（第 27 轮）：本文件原来测的是旧页面 `TasksPage.vue`（已删除）。迁移时这一页漏掉了
 * 行动卡片上的「所属领域 / 上下文关联 / 归属与可见范围」三块编辑能力与「创建时选日期 / 关联处境」，
 * 第 27 轮已补齐（直接复用 DomainPicker / ContextRelationPicker / OwnershipEditor 与既有仓储路径），
 * 本文件因此覆盖：带日期与处境的新建（进当日重点）、完成/重开、设为当日重点、取消、
 * 以及三块编辑能力。旧页面还有「状态筛选 tab / load-pill / 空标题警告 toast / 打开看板」，
 * v11 页按参考稿没有这些，已记入交接文档 §4.2。
 */

let wrapper: VueWrapper | undefined
async function openTasks() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/app/module/tasks', component: LiubaiTasks },
  ] })
  await router.push('/app/module/tasks'); await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}
const buttonByLabel = (page: VueWrapper, label: string) =>
  page.findAll('button').find(button => button.attributes('aria-label') === label)!

describe('Vue LiubaiTasks (v11) parity', () => {
  beforeEach(() => { setActiveAccount('tasks-test-user'); localStorage.clear(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks(); setActiveAccount(null) })

  it('creates a trimmed task on the chosen date with an active matter and adds it to that day’s focus', async () => {
    const active = await matterAsyncRepository.create({ title: '准备面试' })
    const archived = await matterAsyncRepository.create({ title: '旧课题' })
    await matterAsyncRepository.archive(archived.calmyId)
    const page = await openTasks()

    const matterSelect = page.get('[aria-label="关联处境"]')
    expect(matterSelect.element.tagName).toBe('SELECT')
    expect(page.find(`option[value="${archived.calmyId}"]`).exists()).toBe(false)

    await page.get('[aria-label="任务日期"]').setValue('2026-10-05')
    await matterSelect.setValue(active.calmyId)
    await page.get('[aria-label="任务名称"]').setValue('  整理作品集  ')
    await page.get('[aria-label="任务名称"]').trigger('keydown.enter')
    await flushPromises()

    const actions = await actionAsyncRepository.list()
    expect(actions).toEqual([expect.objectContaining({ title: '整理作品集', date: '2026-10-05', matterId: active.calmyId, status: 'planned' })])
    expect((await todayAsyncRepository.get('2026-10-05')).focusActionIds).toContain(actions[0].calmyId)
    expect((page.get('[aria-label="任务名称"]').element as HTMLInputElement).value).toBe('')
  })

  it('completes and reopens a task through the real action repository', async () => {
    const planned = await actionAsyncRepository.create({ title: '写总结', date: todayKey() })
    const page = await openTasks()

    await buttonByLabel(page, '标记完成').trigger('click')
    await flushPromises()
    expect((await actionAsyncRepository.find(planned.calmyId))?.status).toBe('done')

    await buttonByLabel(page, '标记未完成').trigger('click')
    await flushPromises()
    expect((await actionAsyncRepository.find(planned.calmyId))?.status).toBe('planned')
  })

  it('sets the day focus by clicking the title and cancels a task from its row', async () => {
    const action = await actionAsyncRepository.create({ title: '读一章', date: todayKey() })
    await todayAsyncRepository.get(todayKey())
    const page = await openTasks()

    await page.get('.task .text').trigger('click')
    await flushPromises()
    expect((await todayAsyncRepository.get(todayKey())).focusActionIds).toContain(action.calmyId)
    expect(page.get('.task').classes()).toContain('is-focus')

    await buttonByLabel(page, '取消').trigger('click')
    await flushPromises()
    expect((await actionAsyncRepository.find(action.calmyId))?.status).toBe('cancelled')
  })

  it('assigns a Domain to an Action through the stable Action repository id', async () => {
    const domain = await unifiedAsyncRepository.create(unifiedFactories.domain({ key: 'work', displayName: '工作' }))
    const action = await actionAsyncRepository.create({ title: '校准需求', date: todayKey() })
    const page = await openTasks()

    await page.get('.task-detail [aria-label="所属领域（可选）"]').setValue(domain.calmyId)
    await flushPromises()

    expect(await unifiedAsyncRepository.list<Relation>('relation')).toEqual([
      expect.objectContaining({
        from: { entityType: 'action', calmyId: action.calmyId },
        to: { entityType: 'domain', calmyId: domain.calmyId },
        relationType: 'belongs_to_domain'
      })
    ])
  })

  it('links an Action to its Space context through a typed Relation and keeps one Action record', async () => {
    const space = await unifiedAsyncRepository.create(unifiedFactories.space({ title: '家庭照护', memberPersonIds: [], relationshipIds: [], thingIds: [], sceneIds: [], status: 'active' }))
    const action = await actionAsyncRepository.create({ title: '联系医院', date: todayKey() })
    const page = await openTasks()

    const picker = page.get('.task-detail .context-relation-picker')
    await picker.get('select').setValue(`space:${space.calmyId}`)
    await picker.get('.context-relation-add button').trigger('click')
    await flushPromises()

    expect(await unifiedAsyncRepository.list<Relation>('relation')).toContainEqual(expect.objectContaining({
      from: { entityType: 'action', calmyId: action.calmyId }, to: { entityType: 'space', calmyId: space.calmyId }, relationType: 'context_of'
    }))
    expect(await actionAsyncRepository.list()).toHaveLength(1)
  })

  it('edits Action Owner, Subject, Steward, and Private visibility independently', async () => {
    const dad = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '爸爸' }))
    const mom = await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '妈妈' }))
    const action = await actionAsyncRepository.create({ title: '联系医院', date: todayKey() })
    const page = await openTasks()

    const editor = page.get('.task-detail .ownership-editor')
    await editor.find('summary').trigger('click')
    await editor.get('input[type="checkbox"]').setValue(true)
    await editor.get('select').setValue(`person:${dad.calmyId}`)
    await editor.get('[aria-label="共同所有者"]').setValue([`person:${mom.calmyId}`])
    await editor.findAll('select')[2].setValue(dad.calmyId)
    await editor.get('[aria-label="管理者"]').setValue([`person:${mom.calmyId}`])
    await editor.findAll('select')[4].setValue('private')
    await editor.findAll('button').find(button => button.text() === '保存归属设置')!.trigger('click')
    await flushPromises()

    expect((await actionAsyncRepository.find(action.calmyId))?.ownership).toMatchObject({
      ownerRef: { type: 'person', id: dad.calmyId }, coOwnerRefs: [{ type: 'person', id: mom.calmyId }],
      subjectRef: { entityType: 'person', calmyId: dad.calmyId }, stewardRefs: [{ type: 'person', id: mom.calmyId }], privacy: 'private'
    })
  })
})
