import { nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAsyncCollectionRepository } from '@/core/repository'
import { resetStoreCache, todayKey } from '@/core/storage'
import * as reality from '@/domain/reality'
import { unifiedAsyncRepository, unifiedFactories, type Resource } from '@/domain/unified'
import MasterDataPage from '@/vue/pages/MasterDataPage.vue'
import DiaryPage from '@/vue/pages/DiaryPage.vue'

interface DiaryEntry { date: string; content: string }
const diaryRepository = createAsyncCollectionRepository<DiaryEntry>('diary', item => item.date)
let page: VueWrapper | undefined
const messages: Array<{ message: string; kind: string }> = []
const onToast = (event: Event) => messages.push((event as CustomEvent<{ message: string; kind: string }>).detail)
const button = (label: string) => page!.findAll('button').find(item => item.text() === label)!

describe('Vue Diary parity', () => {
  beforeEach(() => { localStorage.clear(); resetStoreCache(); messages.length = 0; window.addEventListener('beryl-toast', onToast) })
  afterEach(() => { page?.unmount(); page = undefined; window.removeEventListener('beryl-toast', onToast); vi.restoreAllMocks() })

  it('loads selected dates, navigates days and selects a searched history entry', async () => {
    await diaryRepository.create({ date: '2026-09-22', content: '甲日记录' })
    await diaryRepository.create({ date: '2026-09-23', content: '乙日记录' })
    page = mount(DiaryPage)
    await flushPromises()
    await page.get('[aria-label="选择日记日期"]').setValue('2026-09-23')
    await flushPromises()
    expect(page.get<HTMLTextAreaElement>('[aria-label$="日记内容"]').element.value).toBe('乙日记录')
    await page.get('[aria-label="前一天"]').trigger('click')
    await flushPromises()
    expect(page.get<HTMLInputElement>('[aria-label="选择日记日期"]').element.value).toBe('2026-09-22')
    expect(page.get<HTMLTextAreaElement>('[aria-label$="日记内容"]').element.value).toBe('甲日记录')
    await page.get('[aria-label="后一天"]').trigger('click')
    await flushPromises()
    expect(page.get<HTMLInputElement>('[aria-label="选择日记日期"]').element.value).toBe('2026-09-23')
    await page.get('[aria-label="搜索日记"]').setValue('甲日')
    expect(page.findAll('.list button')).toHaveLength(1)
    await page.get('.list button').trigger('click')
    await flushPromises()
    expect(page.get<HTMLTextAreaElement>('[aria-label$="日记内容"]').element.value).toBe('甲日记录')
    await button('今天').trigger('click')
    await flushPromises()
    expect(page.get<HTMLInputElement>('[aria-label="选择日记日期"]').element.value).toBe(todayKey())
  })

  it('keeps the record count and suffix in the same text-node boundary as 迁移前界面基线', async () => {
    await diaryRepository.create({ date: todayKey(), content: '今日记录' })
    page = mount(DiaryPage)
    await flushPromises()
    expect(Array.from(page.get('.load-pill').element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE && node.textContent !== '').map(node => node.textContent)).toEqual(['1', ' 篇记录'])
  })

  it('creates and updates one date in the real diary repository with save feedback', async () => {
    page = mount(DiaryPage)
    await flushPromises()
    await page.get('[aria-label="选择日记日期"]').setValue('2026-09-20')
    await flushPromises()
    await page.get('[aria-label$="日记内容"]').setValue('  第一次记录  ')
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(await diaryRepository.list()).toEqual([{ date: '2026-09-20', content: '第一次记录' }])
    expect(messages.at(-1)?.message).toContain('日记已保存 · 2026-09-20')
    await page.get('[aria-label$="日记内容"]').setValue('第二次记录')
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(await diaryRepository.list()).toEqual([{ date: '2026-09-20', content: '第二次记录' }])
    page.unmount(); page = mount(DiaryPage)
    await flushPromises()
    await page.get('[aria-label="选择日记日期"]').setValue('2026-09-20')
    await flushPromises()
    expect(page.get<HTMLTextAreaElement>('[aria-label$="日记内容"]').element.value).toBe('第二次记录')
  })

  it('rejects blank content and shows the no-match history state', async () => {
    page = mount(DiaryPage)
    await flushPromises()
    await page.get('form').trigger('submit')
    expect(messages.at(-1)).toMatchObject({ message: '写点什么再保存吧', kind: 'warning' })
    expect(await diaryRepository.list()).toEqual([])
    expect(page.text()).toContain('还没有日记，写下第一篇吧。')
    await page.get('[aria-label="搜索日记"]').setValue('没有')
    expect(page.text()).toContain('没有匹配的日记。')
  })

  it('shows a delayed read, retains history on a failed refresh and retries', async () => {
    await diaryRepository.create({ date: '2026-09-20', content: '保留的记录' })
    const realList = reality.listRealityDocumentsAsync
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    vi.spyOn(reality, 'listRealityDocumentsAsync').mockImplementationOnce(async query => { await gate; return realList(query) })
    try {
      page = mount(DiaryPage)
      await nextTick()
      expect(page!.get('[role="status"]').text()).toContain('正在读取日记…')
      release()
      await flushPromises()
      expect(page!.text()).toContain('保留的记录')
      vi.spyOn(reality, 'listRealityDocumentsAsync').mockRejectedValueOnce(new Error('读取失败')).mockImplementation(realList)
      window.dispatchEvent(new Event('beryl-data-synced'))
      await flushPromises()
      expect(page!.get('[role="alert"]').text()).toContain('读取失败')
      expect(page!.text()).toContain('保留的记录')
      await button('重试').trigger('click')
      await flushPromises()
      expect(page!.find('[role="alert"]').exists()).toBe(false)
      expect(page!.text()).toContain('保留的记录')
    } finally { release() }
  })

  it('inserts a sentence saved in Vue Master Data into a selected range and restores caret/focus', async () => {
    page = mount(MasterDataPage)
    await flushPromises()
    await page.get('[aria-label="句子素材名称"]').setValue('常用提醒')
    await page.get('[aria-label="句子素材内容"]').setValue('先写下事实。')
    await page.get('form').trigger('submit')
    await flushPromises()
    const [sentence] = await unifiedAsyncRepository.list<Resource>('resource')
    expect(sentence).toMatchObject({ title: '常用提醒', body: '先写下事实。', kind: 'template', status: 'active' })
    page.unmount()
    page = mount(DiaryPage, { attachTo: document.body })
    await flushPromises()
    const editor = page.get<HTMLTextAreaElement>('[aria-label$="日记内容"]')
    await editor.setValue('开头旧句结尾')
    editor.element.setSelectionRange(2, 4)
    await editor.trigger('select')
    await page.get('[aria-label="插入常用句"]').trigger('focus')
    await flushPromises()
    await page.get(`[data-item-id="${sentence.calmyId}"]`).trigger('click')
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    await flushPromises()
    expect(editor.element.value).toBe('开头先写下事实。结尾')
    expect(editor.element.selectionStart).toBe(8)
    expect(editor.element.selectionEnd).toBe(8)
    expect(document.activeElement).toBe(editor.element)
    await unifiedAsyncRepository.update<Resource>('resource', sentence.calmyId, { body: '后来改了。' }, { expectedRevision: sentence.revision })
    window.dispatchEvent(new Event('beryl-data-synced'))
    await flushPromises()
    expect(editor.element.value).toBe('开头先写下事实。结尾')
  })

  it('exposes the active sentence to keyboard navigation and focuses the full-list search', async () => {
    for (const [title, body] of [['第一句', '第一条内容'], ['第二句', '第二条内容']]) {
      await unifiedAsyncRepository.create(unifiedFactories.resource({ title, body, kind: 'template', status: 'active', assetIds: [], matterIds: [], sourceIds: [], tags: [] }))
    }
    page = mount(DiaryPage, { attachTo: document.body })
    await flushPromises()
    const picker = page.get<HTMLInputElement>('[aria-label="插入常用句"]')
    await picker.trigger('focus')
    expect(picker.attributes('aria-controls')).toBeTruthy()
    expect(page.get('[role="listbox"]').attributes('id')).toBe(picker.attributes('aria-controls'))
    await picker.trigger('keydown', { key: 'End' })
    expect(picker.attributes('aria-activedescendant')).toBe(page.get('[role="option"][aria-current="true"]').attributes('id'))
    await button('浏览全部 →').trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(page.get('[role="dialog"]').attributes('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(page.get('[aria-label="搜索全部常用句"]').element)
  })

  it('lets the picker footer open the drawer by Enter without inserting and leaves drawer search keys untouched', async () => {
    await unifiedAsyncRepository.create(unifiedFactories.resource({ title: '一句话', body: '不能误插入', kind: 'template', status: 'active', assetIds: [], matterIds: [], sourceIds: [], tags: [] }))
    page = mount(DiaryPage, { attachTo: document.body })
    await flushPromises()
    const editor = page.get<HTMLTextAreaElement>('[aria-label$="日记内容"]')
    await editor.setValue('原有草稿')
    await page.get('[aria-label="插入常用句"]').trigger('focus')
    const browse = button('浏览全部 →').element as HTMLButtonElement
    browse.focus()
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    browse.dispatchEvent(enter)
    expect(enter.defaultPrevented).toBe(false)
    browse.click()
    await flushPromises()
    expect(page.find('[role="dialog"]').exists()).toBe(true)
    expect(editor.element.value).toBe('原有草稿')
    const search = page.get<HTMLInputElement>('[aria-label="搜索全部常用句"]')
    await search.setValue('一句话')
    for (const key of ['ArrowDown', 'Home', 'End']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      search.element.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
      expect(search.element.value).toBe('一句话')
    }
    expect(editor.element.value).toBe('原有草稿')
  })

  it('hides the previous date draft in a disabled editor while the next date is loading', async () => {
    await diaryRepository.create({ date: todayKey(), content: '前一日的草稿' })
    page = mount(DiaryPage)
    await flushPromises()
    const editor = page.get<HTMLTextAreaElement>('[aria-label$="日记内容"]')
    expect(editor.element.value).toBe('前一日的草稿')
    const realList = reality.listRealityDocumentsAsync
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    vi.spyOn(reality, 'listRealityDocumentsAsync').mockImplementationOnce(async query => { await gate; return realList(query) })
    try {
      await page.get('[aria-label="选择日记日期"]').setValue('2026-09-19')
      await nextTick()
      expect(editor.element.disabled).toBe(true)
      expect(editor.element.value).toBe('')
      expect(page.text()).toContain('正在读取当前日期…')
      release()
      await flushPromises()
      expect(editor.element.disabled).toBe(false)
      expect(editor.element.value).toBe('')
    } finally { release() }
  })
})
