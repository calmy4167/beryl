import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import { captureAsyncRepository } from '@/domain/capture'
import { actionAsyncRepository } from '@/domain/action/repository'
import { unifiedAsyncRepository, unifiedFactories } from '@/domain/unified'
import CapturePage from '@/vue/pages/CapturePage.vue'

describe('Vue Capture page parity', () => {
  let wrapper: ReturnType<typeof mount> | undefined

  function mountPage() {
    return mount(CapturePage, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
  }

  beforeEach(() => {
    localStorage.clear()
    resetStoreCache()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('saves the original on Ctrl+Enter, clears the editor and shows its review suggestion', async () => {
    wrapper = mountPage()
    await flushPromises()

    const editor = wrapper.get<HTMLTextAreaElement>('[aria-label="记录原文"]')
    await editor.setValue('联系供应商确认交期')
    await editor.trigger('keydown', { key: 'Enter', ctrlKey: true })
    await flushPromises()

    expect(await captureAsyncRepository.list()).toEqual([
      expect.objectContaining({ body: '联系供应商确认交期', status: 'suggested' })
    ])
    expect(await captureAsyncRepository.listSuggestions()).toEqual([
      expect.objectContaining({ status: 'suggested', sourceText: '联系供应商确认交期' })
    ])
    expect(editor.element.value).toBe('')
    expect(wrapper.text()).toContain('它值得我现在注意吗？')
    expect(wrapper.text()).toContain('AI 建议')
  })

  it('loads active sentence materials and inserts text at the saved selection', async () => {
    const sentence = await unifiedAsyncRepository.create(unifiedFactories.resource({
      title: '事实句', kind: 'template', status: 'active', body: '先记录发生的事实。',
      assetIds: [], matterIds: [], sourceIds: [], tags: []
    }))
    await unifiedAsyncRepository.create(unifiedFactories.resource({
      title: '已归档句', kind: 'template', status: 'retired', body: '不应显示。',
      assetIds: [], matterIds: [], sourceIds: [], tags: []
    }))
    wrapper = mountPage()
    await flushPromises()

    const editor = wrapper.get<HTMLTextAreaElement>('[aria-label="记录原文"]')
    await editor.setValue('甲乙丙丁')
    ;(editor.element as HTMLTextAreaElement).setSelectionRange(1, 3)
    await editor.trigger('select')
    const picker = wrapper.get<HTMLInputElement>('[aria-label="插入常用句"]')
    await picker.trigger('focus')
    await flushPromises()
    await wrapper.get(`[data-item-id="${sentence.calmyId}"]`).trigger('click')
    await flushPromises()

    expect(wrapper.get<HTMLTextAreaElement>('[aria-label="记录原文"]').element.value).toBe('甲先记录发生的事实。丁')
    expect(wrapper.text()).not.toContain('不应显示。')
  })

  it('accepts a reviewed suggestion using the edited title and keeps its original in history', async () => {
    wrapper = mountPage()
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('[aria-label="记录原文"]').setValue('联系供应商确认交期')
    await wrapper.get('button.primary').trigger('click')
    await flushPromises()

    await wrapper.get<HTMLInputElement>('[aria-label="AI 建议内容"]').setValue('周五前联系供应商')
    const accept = wrapper.findAll('button').find(button => button.text().includes('采纳建议'))
    expect(accept).toBeDefined()
    await accept!.trigger('click')
    await flushPromises()

    expect(await captureAsyncRepository.list()).toEqual([
      expect.objectContaining({ body: '联系供应商确认交期', status: 'accepted' })
    ])
    expect(await captureAsyncRepository.listSuggestions()).toEqual([
      expect.objectContaining({ status: 'modified', acceptedEntityType: 'action' })
    ])
    expect(await actionAsyncRepository.list()).toEqual([expect.objectContaining({ title: '周五前联系供应商' })])
    expect(wrapper.text()).toContain('联系供应商确认交期')
    expect(wrapper.text()).toContain('已进入系统')
  })

  it('lets go of an original through the attention decision and records it in history', async () => {
    wrapper = mountPage()
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('[aria-label="记录原文"]').setValue('暂时不继续这个想法')
    await wrapper.get('button.primary').trigger('click')
    await flushPromises()

    const decision = wrapper.findAll('button').find(button => button.text().includes('放下'))
    expect(decision).toBeDefined()
    await decision!.trigger('click')
    await flushPromises()

    expect(await captureAsyncRepository.list()).toEqual([
      expect.objectContaining({ body: '暂时不继续这个想法', status: 'archived' })
    ])
    expect(wrapper.text()).toContain('已放下')
  })

  it('rejects an AI suggestion while retaining the original for history', async () => {
    wrapper = mountPage()
    await flushPromises()
    await wrapper.get<HTMLTextAreaElement>('[aria-label="记录原文"]').setValue('也许下周再看看这个想法')
    await wrapper.get('button.primary').trigger('click')
    await flushPromises()

    const reject = wrapper.findAll('button').find(button => button.text().includes('忽略建议'))
    expect(reject).toBeDefined()
    await reject!.trigger('click')
    await flushPromises()

    expect(await captureAsyncRepository.list()).toEqual([
      expect.objectContaining({ body: '也许下周再看看这个想法', status: 'rejected' })
    ])
    expect(await captureAsyncRepository.listSuggestions()).toEqual([
      expect.objectContaining({ status: 'rejected' })
    ])
    expect(wrapper.text()).toContain('也许下周再看看这个想法')
    expect(wrapper.text()).toContain('已放下')
  })

  it('switches between local originals and the Feishu task composer', async () => {
    wrapper = mountPage()
    await flushPromises()

    await wrapper.get('[aria-label="选择数据来源"] button:nth-child(2)').trigger('click')
    await flushPromises()
    expect(localStorage.getItem('calmy:workspace:source')).toBe('feishu')
    expect(wrapper.text()).toContain('快速记下一项任务')
    expect(wrapper.get('[aria-label="创建飞书任务"]')).toBeTruthy()
    expect(wrapper.get('.calmy-select__trigger[role="combobox"][aria-label="飞书任务关联项目"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[aria-label="选择数据来源"] button:nth-child(1)').trigger('click')
    await flushPromises()
    expect(localStorage.getItem('calmy:workspace:source')).toBe('local')
    expect(wrapper.text()).toContain('先收下来，再决定它是什么')
  })
})
