import { nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAsyncCollectionRepository } from '@/core/repository'
import { resetStoreCache, store } from '@/core/storage'
import { undoLastAsync } from '@/core/undo'
import * as reality from '@/domain/reality'
import * as saveState from '@/core/save-state'
import PostsPage from '@/vue/pages/PostsPage.vue'

interface Post { id: string; title: string; content: string; date: string; archivedAt?: number }
const posts = createAsyncCollectionRepository<Post>('posts')
let page: VueWrapper | undefined
const messages: Array<{ message: string; kind: string }> = []
const onToast = (event: Event) => messages.push((event as CustomEvent<{ message: string; kind: string }>).detail)

async function openPosts(settle = true) {
  page = mount(PostsPage)
  if (settle) await flushPromises()
  return page
}
async function click(label: string) {
  const button = page!.findAll('button').find(item => item.text().trim() === label)
  expect(button, `button ${label}`).toBeDefined()
  if (button!.attributes('type') === 'submit') await page!.get('form').trigger('submit')
  else await button!.trigger('click')
  await flushPromises()
}
async function seed(id: string, title: string, content: string, archivedAt?: number) {
  return posts.create({ id, title, content, date: '2026-09-24', ...(archivedAt ? { archivedAt } : {}) })
}
function failNextPostWrite() {
  const original = store.set.bind(store)
  let failed = false
  return vi.spyOn(store, 'set').mockImplementation((key, value) => {
    if (key === 'posts' && !failed) { failed = true; return false }
    return original(key, value)
  })
}

describe('Vue Posts parity', () => {
  beforeEach(() => {
    localStorage.clear()
    resetStoreCache()
    messages.length = 0
    window.addEventListener('beryl-toast', onToast)
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })
  afterEach(() => {
    page?.unmount()
    page = undefined
    window.removeEventListener('beryl-toast', onToast)
    vi.restoreAllMocks()
  })

  it('keeps the active count separate from its static summary text', async () => {
    await openPosts()
    const count = page!.get('.posts-active-count')
    expect(count.text()).toBe('0')
    expect((count.element as HTMLElement).style.display).toBe('contents')
    expect(page!.get('.load-pill').element.textContent).toBe('0 篇在库')
  })

  it('validates then publishes trimmed title and body to the real repository and survives remount', async () => {
    await openPosts()
    await click('发布文章')
    expect(messages.at(-1)).toEqual({ message: '标题和内容都要填写哦', kind: 'warning' })
    await page!.get('[aria-label="文章标题"]').setValue('  一篇文章  ')
    await page!.get('[aria-label="文章内容"]').setValue('  长期经验  ')
    await click('发布文章')
    expect(await posts.list()).toEqual([expect.objectContaining({ title: '一篇文章', content: '长期经验' })])
    expect(messages.at(-1)).toMatchObject({ message: '文章已发布 ✍️', kind: 'success' })
    expect(page!.text()).toContain('1 篇在库')
    page!.unmount()
    await openPosts()
    expect(page!.get('.history-card').text()).toContain('一篇文章')
  })

  it('searches title and body and switches active, archived and all filters', async () => {
    await seed('active', '在库文章', '特别正文')
    await seed('archived', '归档文章', '另一段', 100)
    await openPosts()
    expect(page!.findAll('.history-card')).toHaveLength(1)
    await page!.get('[aria-label="搜索文章"]').setValue('特别')
    expect(page!.get('.history-card').text()).toContain('在库文章')
    await page!.get('[aria-label="搜索文章"]').setValue('没有')
    expect(page!.text()).toContain('没有匹配的文章。')
    await page!.get('[aria-label="搜索文章"]').setValue('')
    await click('已归档')
    expect(page!.get('.history-card').text()).toContain('归档文章')
    await click('全部')
    expect(page!.findAll('.history-card')).toHaveLength(2)
  })

  it('opens the reader by title and button, closes by backdrop and close control, then edits and cancels', async () => {
    await seed('one', '阅读文章', '完整正文')
    await openPosts()
    await page!.get('.history-card .panel-head button').trigger('click')
    expect(page!.get('[role="dialog"]').text()).toContain('完整正文')
    await page!.get('.el-drawer-overlay').trigger('click')
    expect(page!.find('[role="dialog"]').exists()).toBe(false)
    await click('阅读全文')
    expect(page!.get('[role="dialog"]').text()).toContain('完整正文')
    await page!.get('[aria-label="关闭文章阅读"]').trigger('click')
    expect(page!.find('[role="dialog"]').exists()).toBe(false)
    await click('编辑')
    expect((page!.get('[aria-label="文章标题"]').element as HTMLInputElement).value).toBe('阅读文章')
    await page!.get('[aria-label="文章标题"]').setValue('修改后')
    await click('取消编辑')
    expect((page!.get('[aria-label="文章标题"]').element as HTMLInputElement).value).toBe('')
    await click('编辑')
    await page!.get('[aria-label="文章标题"]').setValue('修改后')
    await click('保存修改')
    expect((await posts.find('one'))?.title).toBe('修改后')
    expect(messages.at(-1)?.message).toBe('文章已更新')
  })

  it('archives and restores a post with durable refreshed views', async () => {
    await seed('one', '可归档', '正文')
    await openPosts()
    await click('归档')
    expect((await posts.find('one'))?.archivedAt).toBeGreaterThan(0)
    expect(page!.text()).toContain('0 篇在库')
    await click('已归档')
    expect(page!.get('.history-card').text()).toContain('可归档')
    await click('恢复')
    expect((await posts.find('one'))?.archivedAt).toBeUndefined()
    expect(page!.text()).toContain('1 篇在库')
  })

  it('requires confirmation for permanent deletion and registers an undo of the removed item', async () => {
    await seed('one', '待删除', '正文')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await openPosts()
    await click('删除')
    expect(confirm).toHaveBeenCalledWith('确认永久删除文章“待删除”吗？归档文章也可以保留在归档列表中。')
    expect(await posts.find('one')).toBeDefined()
    confirm.mockReturnValue(true)
    await click('删除')
    expect(await posts.find('one')).toBeUndefined()
    expect(messages.at(-1)?.message).toBe('文章已删除，可在提示消失前撤销')
    expect(await undoLastAsync()).toBe(true)
    expect((await posts.find('one'))?.title).toBe('待删除')
  })

  it('shows loading, empty states and refetches on data sync', async () => {
    await openPosts(false)
    await nextTick()
    expect(page!.text()).toContain('正在读取文章…')
    await flushPromises()
    expect(page!.text()).toContain('还没有文章，把值得留下的经验写下来。')
    await seed('synced', '同步文章', '正文')
    window.dispatchEvent(new Event('beryl-data-synced'))
    await flushPromises()
    expect(page!.get('.history-card').text()).toContain('同步文章')
  })

  it('retains prior results when a refreshed read fails and recovers on retry', async () => {
    await seed('one', '保留文章', '正文')
    await openPosts()
    const original = reality.listRealityDocumentsAsync
    vi.spyOn(reality, 'listRealityDocumentsAsync').mockRejectedValueOnce(new Error('读取暂不可用')).mockImplementation(original)
    window.dispatchEvent(new Event('beryl-data-synced'))
    await flushPromises()
    expect(page!.get('[role="alert"]').text()).toContain('读取暂不可用')
    expect(page!.get('.history-card').text()).toContain('保留文章')
    await click('重试')
    expect(page!.find('[role="alert"]').exists()).toBe(false)
    expect(page!.get('.history-card').text()).toContain('保留文章')
  })

  it('disables editor and card actions while a post save is pending, then restores them', async () => {
    await seed('one', '原文章', '正文')
    await openPosts()
    await click('编辑')
    await page!.get('[aria-label="文章标题"]').setValue('新标题')
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const original = saveState.withSaveState
    vi.spyOn(saveState, 'withSaveState').mockImplementationOnce(async work => { await gate; return original(work) })
    try {
      await page!.get('form').trigger('submit')
      await nextTick()
      expect(page!.get('[aria-label="文章标题"]').attributes('disabled')).toBeDefined()
      expect(page!.get('[aria-label="文章内容"]').attributes('disabled')).toBeDefined()
      expect(page!.get('button[type="submit"]').text()).toBe('保存中…')
      expect(page!.get('.history-card button.app-button').attributes('disabled')).toBeDefined()
      release()
      await flushPromises()
      expect((await posts.find('one'))?.title).toBe('新标题')
      expect(page!.get('[aria-label="文章标题"]').attributes('disabled')).toBeUndefined()
      expect(page!.get('.history-card button.app-button').attributes('disabled')).toBeUndefined()
    } finally { release() }
  })

  it('reports a failed publish and restores the editor after a rejected repository write', async () => {
    await openPosts()
    await page!.get('[aria-label="文章标题"]').setValue('待发布')
    await page!.get('[aria-label="文章内容"]').setValue('正文')
    failNextPostWrite()
    await click('发布文章')
    expect(await posts.list()).toEqual([])
    expect(messages.at(-1)).toEqual({ message: 'storage-write-failed:posts', kind: 'error' })
    expect((page!.get('[aria-label="文章标题"]').element as HTMLInputElement).value).toBe('待发布')
    expect(page!.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('reports failed archive and delete writes while retaining the article and restoring buttons', async () => {
    await seed('one', '保留文章', '正文')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await openPosts()
    const archiveFailure = failNextPostWrite()
    await click('归档')
    expect((await posts.find('one'))?.archivedAt).toBeUndefined()
    expect(messages.at(-1)).toEqual({ message: '文章不存在，可能已被其他设备删除', kind: 'error' })
    expect(page!.get('.history-card button.app-button').attributes('disabled')).toBeUndefined()
    archiveFailure.mockRestore()
    failNextPostWrite()
    await click('删除')
    expect((await posts.find('one'))?.title).toBe('保留文章')
    expect(messages.at(-1)).toEqual({ message: '文章删除失败', kind: 'error' })
    expect(page!.get('.history-card button.app-button').attributes('disabled')).toBeUndefined()
  })
})
