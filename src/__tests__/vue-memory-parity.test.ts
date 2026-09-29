import { defineComponent, h } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import { recordAsyncRepository } from '@/domain/record/repository'
import { unifiedAsyncRepository, unifiedFactories, type Insight } from '@/domain/unified'
import MemoryPage from '@/vue/pages/MemoryPage.vue'

let wrapper: VueWrapper | undefined

async function openMemory() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/app/memory', component: MemoryPage }, { path: '/app/flow', component: defineComponent({ render: () => h('h1', '探索') }) },
  ] })
  await router.push('/app/memory'); await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await flushPromises()
  return { page: wrapper, router }
}

describe('Vue MemoryPage parity', () => {
  beforeEach(() => { localStorage.clear(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })

  it('lets the memory page fill the React reference content width', () => {
    const componentSource = readFileSync(resolve(process.cwd(), 'src/vue/pages/MemoryPage.vue'), 'utf8')
    expect(componentSource).toMatch(/\.memory-page\s*\{[^}]*max-width:\s*none;/s)
  })
  it('switches fact/reflection layers and displays the real record content', async () => {
    await recordAsyncRepository.create({ type: 'fact', body: '记录过的事实' })
    await recordAsyncRepository.create({ type: 'review', body: '复盘后的理解' })
    const { page } = await openMemory()
    await page.get('[aria-label="记忆层级"] button').trigger('click')
    expect(page.text()).toContain('记录过的事实')
    expect(page.text()).not.toContain('复盘后的理解')
    await page.get('[aria-label="记忆层级"] button:nth-child(2)').trigger('click')
    expect(page.text()).toContain('复盘后的理解')
  })

  it('confirms, edits and denies an AI insight through the real repository', async () => {
    const insight = await unifiedAsyncRepository.create(unifiedFactories.insight({ title: '待确认理解', body: '原始内容', status: 'draft', memoryLayer: 'ai_inference', sourceRecordIds: [], matterIds: [], resourceIds: [] }))
    const { page } = await openMemory()
    await page.get('.memory-insight-card button').trigger('click')
    await flushPromises()
    expect((await unifiedAsyncRepository.find<Insight>('insight', insight.calmyId))?.status).toBe('confirmed')
    await page.get('.memory-insight-card button:nth-child(2)').trigger('click')
    await page.get('[aria-label="记忆标题"]').setValue('修改后的理解')
    await page.get('[aria-label="记忆内容"]').setValue('修改后的内容')
    await page.findAll('button').find(button => button.text() === '保存修改')!.trigger('click')
    await flushPromises()
    expect((await unifiedAsyncRepository.find<Insight>('insight', insight.calmyId))).toMatchObject({ title: '修改后的理解', body: '修改后的内容' })
    await page.get('.memory-insight-card button:nth-child(3)').trigger('click')
    await flushPromises()
    expect((await unifiedAsyncRepository.find<Insight>('insight', insight.calmyId))?.status).toBe('retired')
    expect(page.find('.memory-insight-card').exists()).toBe(false)
  })

  it('creates a user-controlled preference and confirms navigation to exploration', async () => {
    const { page, router } = await openMemory()
    await page.get('[aria-label="记忆层级"] button:nth-child(4)').trigger('click')
    await page.get('.memory-compose-card > button').trigger('click')
    await page.get('[aria-label="偏好内容"]').setValue('先展示最重要的一件事')
    await page.get('.memory-composer button.primary').trigger('click')
    await flushPromises()
    expect((await unifiedAsyncRepository.list<Insight>('insight'))[0]).toMatchObject({ body: '先展示最重要的一件事', status: 'confirmed', memoryLayer: 'preference' })
    await page.get('.memory-head-note button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/app/flow')
  })

  it('requires confirmation before removing an AI insight', async () => {
    const insight = await unifiedAsyncRepository.create(unifiedFactories.insight({ title: '移除确认', body: '内容', status: 'draft', memoryLayer: 'ai_inference', sourceRecordIds: [], matterIds: [], resourceIds: [] }))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { page } = await openMemory()
    await page.get('.memory-insight-card button.danger').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalled()
    expect(await unifiedAsyncRepository.find<Insight>('insight', insight.calmyId)).toBeTruthy()
  })
})
