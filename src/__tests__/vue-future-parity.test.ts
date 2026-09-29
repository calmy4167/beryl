import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const saves = vi.hoisted(() => ({ reflection: vi.fn(), feedback: vi.fn() }))
vi.mock('@/application', () => ({ saveFutureReflection: saves.reflection, saveFutureFeedback: saves.feedback }))

import FuturePage from '@/vue/pages/FuturePage.vue'

const futureSource = readFileSync('src/vue/pages/FuturePage.vue', 'utf8')

const mountFuturePage = () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/future', component: FuturePage },
      { path: '/app/today', component: { template: '<div />' } },
      { path: '/app/capture', component: { template: '<div />' } },
    ],
  })
  return mount(FuturePage, { global: { plugins: [router] } })
}

describe('Vue FuturePage parity', () => {
  beforeEach(() => {
    saves.reflection.mockReset().mockResolvedValue({ calmyId: 'cap-future' })
    saves.feedback.mockReset().mockResolvedValue({ calmyId: 'cap-feedback' })
  })

  it('renders the return-to-today control as the same compact route link as 迁移前界面基线', () => {
    const wrapper = mountFuturePage()
    const link = wrapper.get('.future-page-head .future-text-link')
    expect(link.element.tagName).toBe('A')
    expect(link.attributes('href')).toBe('/app/today')
    expect(link.text()).toBe('回到今天')
  })

  it('keeps the native keyboard focus ring visible on a focused stage heading', () => {
    expect(futureSource).toContain('@media (max-width: 620px)')
    expect(futureSource).toContain('.future-page h2[tabindex="-1"]:focus-visible')
    expect(futureSource).toContain('outline: 1px auto -webkit-focus-ring-color')
    expect(futureSource).toContain('outline-color: #e59700')
  })

  it('moves from choice through scenarios and reflection validation to saved feedback', async () => {
    const wrapper = mountFuturePage()
    document.body.appendChild(wrapper.element)
    await wrapper.get('[aria-label="选择一个想回头看的事情"] button').trigger('click')
    expect(wrapper.get('[aria-label="选择一个想回头看的事情"] button').attributes('aria-pressed')).toBe('true')
    await wrapper.get('textarea[placeholder="写下一件你正在考虑的事"]').setValue('学习 Python')
    await wrapper.get('button.future-primary').trigger('click')
    expect(wrapper.text()).toContain('影响推演')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('.future-section-head h2').element)
    await wrapper.get('button.future-primary').trigger('click')
    expect(wrapper.text()).toContain('看过可能的收获和代价')
    await wrapper.get('textarea[placeholder*="试一小步"]').setValue('先试一次')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(saves.reflection).toHaveBeenCalledWith(expect.objectContaining({ choice: '学习 Python', reflection: '先试一次' }))
    expect(wrapper.text()).toContain('选择和反思已保存')
    expect(wrapper.get('.future-saved .future-actions a.future-secondary').attributes('href')).toBe('/app/capture')
    expect(wrapper.get('.future-saved .future-actions a.future-primary').attributes('href')).toBe('/app/today')
    await wrapper.get('button.future-secondary').trigger('click')
    await wrapper.get('textarea[placeholder*="查看了岗位要求"]').setValue('发现需要补基础')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(saves.feedback).toHaveBeenCalledWith({ reflectionCaptureId: 'cap-future', feedback: '发现需要补基础' })
    expect(wrapper.text()).toContain('现实反馈已另存')
  })

  it('treats edited preset text as a custom choice, matching 迁移前界面基线', async () => {
    const wrapper = mountFuturePage()
    const workPreset = wrapper.get('[aria-label="选择一个想回头看的事情"] button:first-child')
    await workPreset.trigger('click')
    await wrapper.get('textarea[placeholder="写下一件你正在考虑的事"]').setValue('了解一个新的工作机会')

    expect(workPreset.attributes('aria-pressed')).toBe('false')
    await wrapper.get('button.future-primary').trigger('click')
    expect(wrapper.text()).toContain('这条自定义内容没有可用事实依据')
    expect(wrapper.text()).not.toContain('职业路径可能被重新打开')
  })

  it('requires a choice and reflection before progression and saving', async () => {
    const wrapper = mountFuturePage()
    expect(wrapper.get('button.future-primary').attributes('disabled')).toBeDefined()
    await wrapper.get('textarea[placeholder="写下一件你正在考虑的事"]').setValue('一个自定义选择')
    await wrapper.get('button.future-primary').trigger('click')
    await wrapper.get('button.future-primary').trigger('click')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('先写下看过这些可能后的想法')
    expect(saves.reflection).not.toHaveBeenCalled()
  })
})
