import { readFileSync } from 'node:fs'
import { nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import { unifiedAsyncRepository, unifiedFactories, type Resource } from '@/domain/unified'
import MasterDataPage from '@/vue/pages/MasterDataPage.vue'
import CapturePage from '@/vue/pages/CapturePage.vue'

let page: VueWrapper | undefined
const masterDataStyles = readFileSync('src/styles/modules/master-data.css', 'utf8')
const resource = (title: string, body: string, status: Resource['status'] = 'active') =>
  unifiedFactories.resource({ title, kind: 'template', status, body, assetIds: [], matterIds: [], sourceIds: [], tags: [] })
const button = (label: string) => page!.findAll('button').find(item => item.text() === label)!

describe('Vue Master Data parity', () => {
  beforeEach(() => { localStorage.clear(); resetStoreCache() })
  afterEach(() => { page?.unmount(); page = undefined; vi.restoreAllMocks() })

  it('keeps resource actions on the React native button baseline', () => {
    expect(masterDataStyles).toMatch(/\.master-data-item-actions \.app-button\s*\{[^}]*all:\s*revert;[^}]*font:\s*inherit;[^}]*cursor:\s*pointer;[^}]*min-height:\s*32px/s)
  })

  it('shows loading until the real resource read finishes', async () => {
    await unifiedAsyncRepository.create(resource('等待读取', '读取完成后显示。'))
    let releaseRead!: () => void
    const readGate = new Promise<void>(resolve => { releaseRead = resolve })
    const realList = unifiedAsyncRepository.list.bind(unifiedAsyncRepository)
    vi.spyOn(unifiedAsyncRepository, 'list').mockImplementation(async entityType => { await readGate; return realList(entityType) })
    try {
      page = mount(MasterDataPage)
      await nextTick()
      expect(page.get('[role="status"]').text()).toBe('正在读取素材…')
      expect(page.text()).not.toContain('读取完成后显示。')
      releaseRead()
      await flushPromises()
      expect(page.find('[role="status"]').exists()).toBe(false)
      expect(page.text()).toContain('读取完成后显示。')
    } finally { releaseRead() }
  })

  it('keeps the list beside a read error and retries the real repository', async () => {
    const sentence = await unifiedAsyncRepository.create(resource('待归档', '刷新失败时仍显示。'))
    page = mount(MasterDataPage)
    await flushPromises()
    const realList = unifiedAsyncRepository.list.bind(unifiedAsyncRepository)
    vi.spyOn(unifiedAsyncRepository, 'list')
      .mockImplementationOnce(async () => { throw new Error('离线读取失败') })
      .mockImplementation(realList)

    await button('归档').trigger('click')
    await flushPromises()
    expect((await unifiedAsyncRepository.find<Resource>('resource', sentence.calmyId))?.status).toBe('retired')
    expect(page.get('[role="alert"]').text()).toContain('离线读取失败')
    expect(page.get('.master-data-list').text()).toContain('刷新失败时仍显示。')
    await button('重试').trigger('click')
    await flushPromises()
    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(page.text()).not.toContain('刷新失败时仍显示。')
    expect(page.text()).toContain('这里会显示你保存的句子。')
  })

  it('shows only active sentence resources by default and embeds the real People page', async () => {
    await unifiedAsyncRepository.create(resource('常用句', '先写下事实。'))
    await unifiedAsyncRepository.create(resource('归档句', '旧内容。', 'retired'))
    await unifiedAsyncRepository.create(unifiedFactories.person({ displayName: '林老师' }))
    page = mount(MasterDataPage)
    await flushPromises()

    expect(page.text()).toContain('主数据管理')
    expect(page.text()).toContain('先写下事实。')
    expect(page.text()).not.toContain('旧内容。')
    await button('人物').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('林老师')
    expect(page.find('.people-page-embedded').exists()).toBe(true)
    expect(page.text()).not.toContain('关系 · 人物')
  })

  it('creates, searches, edits, archives and restores a sentence in the real repository', async () => {
    page = mount(MasterDataPage)
    await flushPromises()
    await page.get('[aria-label="句子素材名称"]').setValue('  先写事实  ')
    await page.get('[aria-label="句子素材内容"]').setValue('  先把事实写清楚。  ')
    await page.get('form').trigger('submit')
    await flushPromises()
    let items = await unifiedAsyncRepository.list<Resource>('resource')
    expect(items).toEqual([expect.objectContaining({ title: '先写事实', body: '先把事实写清楚。', kind: 'template', status: 'active' })])

    await page.get('[aria-label="搜索句子素材"]').setValue('不存在')
    expect(page.text()).toContain('没有匹配的句子素材。')
    await page.get('[aria-label="搜索句子素材"]').setValue('事实')
    await button('编辑').trigger('click')
    expect(page.get<HTMLInputElement>('[aria-label="句子素材名称"]').element.value).toBe('先写事实')
    await page.get('[aria-label="句子素材内容"]').setValue('修改后的句子。')
    await page.get('form').trigger('submit')
    await flushPromises()
    items = await unifiedAsyncRepository.list<Resource>('resource')
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ body: '修改后的句子。', revision: 2 })

    await page.get('[aria-label="搜索句子素材"]').setValue('')
    await button('归档').trigger('click')
    await flushPromises()
    expect((await unifiedAsyncRepository.list<Resource>('resource'))[0].status).toBe('retired')
    expect(page.text()).not.toContain('修改后的句子。')
    await page.get('[type="checkbox"]').setValue(true)
    expect(page.text()).toContain('修改后的句子。')
    await button('恢复').trigger('click')
    await flushPromises()
    expect((await unifiedAsyncRepository.list<Resource>('resource'))[0].status).toBe('active')
  })

  it('rejects blank sentence fields and keeps the library empty', async () => {
    const messages: string[] = []
    const onToast = (event: Event) => messages.push((event as CustomEvent<{ message: string }>).detail.message)
    window.addEventListener('beryl-toast', onToast)
    try {
      page = mount(MasterDataPage)
      await flushPromises()
      await page.get('[aria-label="句子素材内容"]').setValue('只有内容')
      await page.get('form').trigger('submit')
      await flushPromises()
      expect(await unifiedAsyncRepository.list<Resource>('resource')).toHaveLength(0)
      expect(messages).toContain('请填写素材名称和内容')
    } finally { window.removeEventListener('beryl-toast', onToast) }
  })

  it('inserts a saved sentence snapshot into Capture and restores the caret', async () => {
    page = mount(MasterDataPage)
    await flushPromises()
    await page.get('[aria-label="句子素材名称"]').setValue('常用句')
    await page.get('[aria-label="句子素材内容"]').setValue('插入内容')
    await page.get('form').trigger('submit')
    await flushPromises()
    const [sentence] = await unifiedAsyncRepository.list<Resource>('resource')
    expect(sentence).toMatchObject({ title: '常用句', body: '插入内容', kind: 'template', status: 'active' })
    page.unmount()
    page = undefined
    page = mount(CapturePage, { attachTo: document.body, global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    await flushPromises()
    const editor = page.get<HTMLTextAreaElement>('[aria-label="记录原文"]')
    await editor.setValue('前面后面')
    editor.element.setSelectionRange(2, 2)
    await editor.trigger('select')
    await page.get('[aria-label="插入常用句"]').trigger('focus')
    await flushPromises()
    await page.get(`[data-item-id="${sentence.calmyId}"]`).trigger('click')
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    await flushPromises()
    expect(editor.element.value).toBe('前面插入内容后面')
    expect(editor.element.selectionStart).toBe(6)
    expect(document.activeElement).toBe(editor.element)
  })
})
