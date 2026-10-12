import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetStoreCache, todayKey } from '@/core/storage'
import { setActiveAccount } from '@/core/account-context'
import { captureAsyncRepository } from '@/domain/capture'
import { actionAsyncRepository } from '@/domain/action/repository'
import { matterAsyncRepository } from '@/domain/matter/repository'
import { unifiedAsyncRepository, unifiedFactories } from '@/domain/unified'
import LiubaiCapture from '@/vue/pages/LiubaiCapture.vue'

/**
 * 「记录」页（v11）的行为覆盖。
 *
 * 迁移说明（第 28 轮）：本文件原来测的是旧页面 `CapturePage.vue`（已删除）。旧页面的
 * 「AI 建议标题可编辑后采纳 / 忽略建议 → rejected / 飞书来源切换」在 v11 里没有对应入口
 * （v11 用参考稿的五路「注意门」：现在行动 / 形成事项 / 保留记录 / 稍后再看 / 放下），
 * 所以这里断言 v11 真实承担的行为：回车落库为待处理、常用句按选区插入并恢复光标、
 * 五路决定里的「现在行动」（建今天行动 + 标为已采纳）、「形成事项」（建处境）、「放下」（归档）。
 * 全部走既有仓储与 `decideCapture`，不新增存储。
 */

describe('Vue LiubaiCapture (v11) parity', () => {
  let wrapper: ReturnType<typeof mount> | undefined

  function mountPage() {
    return mount(LiubaiCapture, { attachTo: document.body, global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
  }
  async function seedOriginal(text: string) {
    wrapper = mountPage()
    await flushPromises()
    const editor = wrapper.get<HTMLInputElement>('[aria-label="记录原文"]')
    await editor.setValue(text)
    await editor.trigger('keydown', { key: 'Enter' })
    await flushPromises()
  }
  const gateButton = (page: ReturnType<typeof mount>, label: string) =>
    page.findAll('.inbox-item .act').find(button => button.text() === label)!

  beforeEach(() => {
    setActiveAccount('vue-capture-parity-test-user')
    localStorage.clear()
    resetStoreCache()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    setActiveAccount(null)
  })

  it('saves the original on Enter, clears the editor and lists it as pending', async () => {
    wrapper = mountPage()
    await flushPromises()

    const editor = wrapper.get<HTMLInputElement>('[aria-label="记录原文"]')
    await editor.setValue('联系供应商确认交期')
    await editor.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    // 旧页面保存时会顺带写一条 AI 建议（status: 'suggested' + listSuggestions 有记录）；
    // v11 的记录页只落原文（status: 'inbox'），建议链路目前**没有写入方** —— 这条差异是真实缺口，
    // 见交接文档 §4.2（与 daily_state 同类，需要产品决策），所以这里显式断言"没有建议"而不是假装它还在。
    expect(await captureAsyncRepository.list()).toEqual([
      expect.objectContaining({ body: '联系供应商确认交期', status: 'inbox' })
    ])
    expect(await captureAsyncRepository.listSuggestions()).toEqual([])
    expect((editor.element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).toContain('联系供应商确认交期')
    expect(wrapper.text()).toContain('待处理')
  })

  it('inserts an active sentence at the remembered selection and never shows retired materials', async () => {
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

    const editor = wrapper.get<HTMLInputElement>('[aria-label="记录原文"]')
    await editor.setValue('甲乙丙丁')
    ;(editor.element as HTMLInputElement).setSelectionRange(1, 3)
    await editor.trigger('select')
    await wrapper.get('[aria-label="插入常用句"]').trigger('focus')
    await flushPromises()
    await wrapper.get(`[data-item-id="${sentence.calmyId}"]`).trigger('click')
    await flushPromises()

    expect(wrapper.get<HTMLInputElement>('[aria-label="记录原文"]').element.value).toBe('甲先记录发生的事实。丁')
    expect(wrapper.text()).not.toContain('不应显示。')
  })

  it('turns an original into today’s action through 现在行动 and keeps it in history', async () => {
    await seedOriginal('联系供应商确认交期')

    await gateButton(wrapper!, '现在行动').trigger('click')
    await flushPromises()

    expect(await captureAsyncRepository.list()).toEqual([
      expect.objectContaining({ body: '联系供应商确认交期', status: 'accepted' })
    ])
    expect(await actionAsyncRepository.list()).toEqual([
      expect.objectContaining({ title: '联系供应商确认交期', date: todayKey() })
    ])
    expect(wrapper!.text()).toContain('已处理')
    expect(wrapper!.text()).toContain('已采纳')
  })

  it('creates a matter from an original through 形成事项', async () => {
    await seedOriginal('把阳台收拾出来')

    await gateButton(wrapper!, '形成事项').trigger('click')
    await flushPromises()

    expect(await matterAsyncRepository.list()).toEqual([
      expect.objectContaining({ title: '把阳台收拾出来', why: '把阳台收拾出来' })
    ])
    expect(await captureAsyncRepository.list()).toEqual([
      expect.objectContaining({ status: 'accepted' })
    ])
  })

  it('lets go of an original through 放下 and records it in the handled list', async () => {
    await seedOriginal('暂时不继续这个想法')

    await gateButton(wrapper!, '放下').trigger('click')
    await flushPromises()

    expect(await captureAsyncRepository.list()).toEqual([
      expect.objectContaining({ body: '暂时不继续这个想法', status: 'archived' })
    ])
    expect(wrapper!.text()).toContain('已处理')
    expect(wrapper!.text()).toContain('已归档')
  })
})
