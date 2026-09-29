import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache, store } from '@/core/storage'
import { undoLastAsync } from '@/core/undo'
import { captureAsyncRepository } from '@/domain/capture'
import { actionAsyncRepository } from '@/domain/action/repository'
import { caseAsyncRepository } from '@/domain/case/repository'
import { legacyInboxRepositories } from '@/application/use-cases/legacy-inbox'
import InboxPage from '@/vue/pages/InboxPage.vue'

let page: VueWrapper | undefined
const messages: Array<{ message: string; kind: string }> = []
const onToast = (event: Event) => messages.push((event as CustomEvent<{ message: string; kind: string }>).detail)

async function openInbox(settle = true) {
  page = mount(InboxPage)
  if (settle) await flushPromises()
  return page
}

async function click(label: string) {
  const button = page!.findAll('button').find(item => item.text().trim() === label)
  expect(button, `button ${label}`).toBeDefined()
  await button!.trigger('click')
  await flushPromises()
}

async function chooseFilter(value: string) {
  const picker = page!.get('[aria-label="收集筛选"]')
  if (picker.element.tagName === 'SELECT') await picker.setValue(value)
  else { await picker.trigger('click'); await page!.get(`[role="option"][data-value="${value}"]`).trigger('click') }
  await flushPromises()
}

describe('Vue Inbox parity', () => {
  beforeEach(() => {
    localStorage.clear()
    resetStoreCache()
    messages.length = 0
    window.addEventListener('beryl-toast', onToast)
  })
  afterEach(() => {
    page?.unmount()
    page = undefined
    window.removeEventListener('beryl-toast', onToast)
    vi.restoreAllMocks()
  })

  it('saves an original on Ctrl+Enter and shows its suggested action with feedback', async () => {
    await openInbox()
    const editor = page!.get<HTMLTextAreaElement>('[aria-label="新增收件内容"]')
    await editor.setValue('联系供应商确认交期')
    await editor.trigger('keydown', { key: 'Enter', ctrlKey: true })
    await flushPromises()
    expect(await captureAsyncRepository.list()).toEqual([expect.objectContaining({ body: '联系供应商确认交期', status: 'suggested' })])
    expect(editor.element.value).toBe('')
    expect(page!.text()).toContain('Action 行动')
    expect(messages.at(-1)).toMatchObject({ message: '已收入收集', kind: 'success' })
  })

  it('searches originals and filters inbox, suggested, rejected, accepted and archived statuses', async () => {
    await captureAsyncRepository.create('待处理原文')
    const suggested = await captureAsyncRepository.create('建议原文')
    await captureAsyncRepository.suggest(suggested.calmyId)
    const rejected = await captureAsyncRepository.create('拒绝原文')
    const rejection = await captureAsyncRepository.suggest(rejected.calmyId)
    await captureAsyncRepository.rejectSuggestion(rejection.calmyId)
    const accepted = await captureAsyncRepository.create('已处理原文')
    const acceptance = await captureAsyncRepository.suggest(accepted.calmyId)
    await captureAsyncRepository.acceptSuggestion(acceptance.calmyId)
    const archived = await captureAsyncRepository.create('归档原文')
    await captureAsyncRepository.resolve(archived.calmyId, 'archived')
    await openInbox()
    for (const [filter, expected] of [
      ['open', '待处理原文'], ['suggested', '建议原文'], ['rejected', '拒绝原文'],
      ['accepted', '已处理原文'], ['archived', '归档原文'],
    ]) {
      await chooseFilter(filter)
      expect(page!.findAll('.history-card')).toHaveLength(1)
      expect(page!.get('.history-card').text()).toContain(expected)
    }
    await chooseFilter('all')
    await page!.get('[aria-label="搜索收集"]').setValue('建议原文')
    expect(page!.findAll('.history-card')).toHaveLength(1)
    expect(page!.get('.history-card').text()).toContain('建议原文')
  })

  it('uses the native filter control from the React reference', async () => {
    await openInbox()
    expect(page!.get('[aria-label="收集筛选"]').element.tagName).toBe('SELECT')
    const controlsCss = readFileSync(resolve(process.cwd(), 'src/styles/controls.css'), 'utf8')
    expect(controlsCss).toContain('html.tactile-ui #app .page-container .inbox-page select')
  })
  it('lists all filter states in the native select', async () => {
    await openInbox()
    const options = page!.get('[aria-label="收集筛选"]').findAll('option').map(option => (option.element as HTMLOptionElement).value)
    expect(options).toEqual(['all', 'open', 'suggested', 'accepted', 'rejected', 'archived'])
  })

  it('shows the empty state and expands then collapses a captured original with its stable ID', async () => {
    await openInbox()
    expect(page!.text()).toContain('没有匹配的收件内容。')
    expect(page!.findAll('.history-card')).toHaveLength(0)
    const capture = await captureAsyncRepository.create('第一行原文\n第二行详情')
    window.dispatchEvent(new Event('beryl-data-synced'))
    await flushPromises()
    expect(page!.get('.history-card').text()).not.toContain('第二行详情')
    await click('查看原文')
    expect(page!.get('.opening-details').text()).toContain('第二行详情')
    expect(page!.get('.opening-details').text()).toContain(`Capture ID：${capture.calmyId} · revision ${capture.revision}`)
    expect(Array.from(page!.get('.opening-details small').element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE && node.textContent !== '').map(node => node.textContent)).toEqual(['Capture ID：', capture.calmyId, ' · revision ', String(capture.revision)])
    await click('收起原文')
    expect(page!.find('.opening-details').exists()).toBe(false)
  })

  it('accepts an edited suggestion into the real action repository, then rejects another', async () => {
    const first = await captureAsyncRepository.create('联系供应商确认交期')
    await captureAsyncRepository.suggest(first.calmyId)
    await openInbox()
    await page!.get('[aria-label="联系供应商确认交期处理内容"]').setValue('周五联系供应商')
    await click('采纳并处理')
    expect(await actionAsyncRepository.list()).toEqual([expect.objectContaining({ title: '周五联系供应商' })])
    expect((await captureAsyncRepository.find(first.calmyId))?.status).toBe('accepted')
    const second = await captureAsyncRepository.create('也许下周再看看')
    await captureAsyncRepository.suggest(second.calmyId)
    window.dispatchEvent(new Event('beryl-data-synced'))
    await flushPromises()
    await click('拒绝建议')
    expect((await captureAsyncRepository.find(second.calmyId))?.status).toBe('rejected')
    expect((await captureAsyncRepository.find(second.calmyId))?.body).toBe('也许下周再看看')
  })

  it('keeps capture data when archive is unavailable or deletion is cancelled, then deletes on confirmation', async () => {
    const capture = await captureAsyncRepository.create('重要原文')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await openInbox()
    await click('归档')
    expect(page!.get('[role="status"]').text()).toContain('没有 archive 操作')
    expect((await captureAsyncRepository.find(capture.calmyId))?.body).toBe('重要原文')
    await click('删除')
    expect(confirm).toHaveBeenCalledWith('删除后原文将从收集记录中移除，确定继续吗？')
    expect(await captureAsyncRepository.find(capture.calmyId)).toBeDefined()
    confirm.mockReturnValue(true)
    await click('删除')
    expect(await captureAsyncRepository.find(capture.calmyId)).toBeUndefined()
    expect(messages.at(-1)?.message).toBe('原文已删除')
  })

  it('converts legacy inbox entries into tasks and cases and removes a third with undo registration', async () => {
    store.set('inbox', [
      { id: 'old-task', text: '整理合同', date: '2026-09-24' },
      { id: 'old-case', text: '处理租房问题', date: '2026-09-24' },
      { id: 'old-remove', text: '不再需要', date: '2026-09-24' },
    ])
    await openInbox()
    const card = (text: string) => page!.findAll('.history-card').find(item => item.text().includes(text))!
    await card('整理合同').findAll('button').find(item => item.text() === '→ 行动')!.trigger('click')
    await flushPromises()
    expect(await legacyInboxRepositories.tasks.list()).toEqual([expect.objectContaining({ title: '整理合同', priority: '中' })])
    await card('处理租房问题').findAll('button').find(item => item.text() === '→ 课题')!.trigger('click')
    await flushPromises()
    expect(await caseAsyncRepository.list()).toEqual([expect.objectContaining({ title: '处理租房问题' })])
    await card('不再需要').findAll('button').find(item => item.text() === '移除')!.trigger('click')
    await flushPromises()
    expect(await legacyInboxRepositories.inbox.list()).toEqual([])
    expect(await undoLastAsync()).toBe(true)
    expect(await legacyInboxRepositories.inbox.list()).toEqual([expect.objectContaining({ id: 'old-remove', text: '不再需要' })])
  })

  it('shows loading, retains previously loaded data after a failed refresh, and retries', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const list = captureAsyncRepository.list.bind(captureAsyncRepository)
    vi.spyOn(captureAsyncRepository, 'list').mockImplementationOnce(async () => { await gate; return list() })
    try {
      await openInbox(false)
      await nextTick()
      expect(page!.text()).toContain('正在读取收件内容…')
      release()
      await flushPromises()
      await captureAsyncRepository.create('留在页面上的原文')
      window.dispatchEvent(new Event('beryl-data-synced'))
      await flushPromises()
      expect(page!.text()).toContain('留在页面上的原文')
      vi.spyOn(captureAsyncRepository, 'list').mockRejectedValueOnce(new Error('读取失败')).mockImplementation(list)
      window.dispatchEvent(new Event('beryl-data-synced'))
      await flushPromises()
      expect(page!.get('[role="alert"]').text()).toContain('读取失败')
      expect(page!.text()).toContain('留在页面上的原文')
      await click('重试')
      expect(page!.find('[role="alert"]').exists()).toBe(false)
      expect(page!.text()).toContain('留在页面上的原文')
    } finally { release() }
  })
})
