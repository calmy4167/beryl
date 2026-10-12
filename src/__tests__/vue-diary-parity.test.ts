import { h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAsyncCollectionRepository } from '@/core/repository'
import { resetStoreCache, todayKey } from '@/core/storage'
import { setActiveAccount } from '@/core/account-context'
import type { DiaryEntry } from '@/domain/diary/model'
import { unifiedAsyncRepository, unifiedFactories } from '@/domain/unified'
import { resetAllToToday } from '@/vue/liubai/date-state'
import LiubaiDiary from '@/vue/pages/LiubaiDiary.vue'

/**
 * 「笔记/日记」页（v11）的行为覆盖。
 *
 * 迁移说明（第 29 轮）：本文件原来测的是旧页面 `DiaryPage.vue`（已删除）。旧页面是"手写 + 显式保存"
 * （form 提交、保存 toast、日期前后按钮、历史搜索框、`.load-pill` 计数、常用句抽屉与
 * `aria-activedescendant` 级键盘协议）；v11 的笔记页改成**停笔约 1 秒自动保存**（LbDateNav 选日期、
 * 「最近」只读回看），并补回了常用句插入。所以这里断言 v11 真实承担的行为：
 * 当天正文渲染与日期切换、自动保存的修订历史、空白内容不落库、常用句按选区插入并恢复光标、历史列表。
 * 全部走既有 Repository（`saveNote` → `diaryRepository` 的版本化写入），不新增存储。
 */

const diaryRepository = createAsyncCollectionRepository<DiaryEntry>('diary', item => item.date)
const yesterdayKey = (() => {
  const d = new Date(`${todayKey()}T00:00:00`)
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

let wrapper: VueWrapper | undefined
async function openDiary() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app/module/diary', component: LiubaiDiary }] })
  await router.push('/app/module/diary'); await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}
const editorOf = (page: VueWrapper) => page.get<HTMLTextAreaElement>('[aria-label$="日记内容"]')

describe('Vue LiubaiDiary (v11) parity', () => {
  // 模块日期是模块级单例（localStorage 之外还有内存态），不清会让「切到昨天」渗到下一个用例
  beforeEach(() => { setActiveAccount('vue-diary-parity-user'); localStorage.clear(); resetAllToToday(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.useRealTimers(); vi.restoreAllMocks(); setActiveAccount(null) })

  it('renders the selected day note and switches day through the date nav', async () => {
    await diaryRepository.create({ date: todayKey(), content: '今日记录' })
    await diaryRepository.create({ date: yesterdayKey, content: '昨日记录' })
    const page = await openDiary()

    expect(editorOf(page).element.value).toBe('今日记录')

    // LbDateNav 的菜单是 Teleport 到 body 的，取不到 wrapper 里，得从真实 DOM 找
    await page.get('.dn-trigger').trigger('click')
    await flushPromises()
    const yesterday = Array.from(document.body.querySelectorAll<HTMLElement>('.dm-item'))
      .find(item => item.textContent?.includes('昨天'))!
    yesterday.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(editorOf(page).element.value).toBe('昨日记录')
  })

  it('auto-saves the draft after the debounce and appends revision history', async () => {
    vi.useFakeTimers()
    const page = await openDiary()

    await editorOf(page).setValue('第一次记录')
    await vi.advanceTimersByTimeAsync(1300)
    await flushPromises()

    let saved = await diaryRepository.list()
    expect(saved).toEqual([expect.objectContaining({ date: todayKey(), content: '第一次记录', revision: 1 })])
    expect(saved[0].history?.map(item => item.operation)).toEqual(['created'])

    await editorOf(page).setValue('第二次记录')
    await vi.advanceTimersByTimeAsync(1300)
    await flushPromises()

    saved = await diaryRepository.list()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ date: todayKey(), content: '第二次记录', revision: 2 })
    expect(saved[0].history?.map(item => item.operation)).toEqual(['created', 'content_updated'])
  })

  it('does not create a note for blank content', async () => {
    vi.useFakeTimers()
    const page = await openDiary()

    await editorOf(page).setValue('   ')
    await vi.advanceTimersByTimeAsync(1300)
    await flushPromises()

    expect(await diaryRepository.list()).toEqual([])
  })

  it('inserts a sentence saved in Vue Master Data into a selected range and restores caret/focus', async () => {
    const sentence = await unifiedAsyncRepository.create(unifiedFactories.resource({
      title: '常用提醒', kind: 'template', status: 'active', body: '先写下事实。',
      assetIds: [], matterIds: [], sourceIds: [], tags: []
    }))
    const page = await openDiary()

    const editor = editorOf(page)
    await editor.setValue('开头旧句结尾')
    ;(editor.element as HTMLTextAreaElement).setSelectionRange(2, 4)
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
  })

  it('lists earlier notes in the recent panel', async () => {
    await diaryRepository.create({ date: yesterdayKey, content: '更早的一条' })
    const page = await openDiary()

    expect(page.text()).toContain('更早的一条')
    expect(page.text()).toContain('最近')
  })
})
