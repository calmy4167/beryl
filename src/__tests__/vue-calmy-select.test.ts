import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CalmySelect, { type CalmySelectOption } from '@/vue/components/CalmySelect.vue'

const options: CalmySelectOption[] = [
  { value: '', label: '不关联处境' },
  { value: 'matter-1', label: '学习计划' },
  { value: 'matter-2', label: '暂停中的事项', disabled: true },
]

describe('Vue CalmySelect parity', () => {
  it('renders the shared combobox shell and current value', () => {
    const wrapper = mount(CalmySelect, {
      props: { id: 'goal-matter-select', ariaLabel: '目标关联处境', modelValue: '', options },
    })

    expect(wrapper.get('[data-calmy-select]').classes()).toContain('calmy-select')
    expect(wrapper.get('[role="combobox"]').attributes()).toMatchObject({
      'aria-label': '目标关联处境',
      'aria-expanded': 'false',
      'aria-controls': 'goal-matter-select-listbox',
    })
    expect(wrapper.get('.calmy-select__value').text()).toBe('不关联处境')
  })

  it('opens at the selected option and emits the chosen value', async () => {
    const wrapper = mount(CalmySelect, {
      props: { id: 'goal-matter-select', ariaLabel: '目标关联处境', modelValue: 'matter-1', options },
    })

    await wrapper.get('[role="combobox"]').trigger('click')
    expect(wrapper.get('[role="combobox"]').attributes('aria-activedescendant')).toContain(encodeURIComponent('matter-1'))
    expect(wrapper.get('[role="option"][aria-selected="true"]').text()).toBe('学习计划')
    expect(wrapper.get('[role="option"][aria-disabled="true"]').text()).toBe('暂停中的事项')

    await wrapper.get('[role="option"][data-value=""]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['']])
    expect(wrapper.emitted('change')).toEqual([['']])
    expect(wrapper.get('[role="combobox"]').attributes('aria-expanded')).toBe('false')
  })

  it('matches keyboard open, skip-disabled, choose, escape, tab and typeahead behavior', async () => {
    vi.useFakeTimers()
    const wrapper = mount(CalmySelect, {
      props: { id: 'goal-matter-select', ariaLabel: '目标关联处境', modelValue: '', options },
    })
    const trigger = wrapper.get('[role="combobox"]')

    await trigger.trigger('keydown', { key: 'ArrowUp' })
    expect(wrapper.get('[role="combobox"]').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('[role="option"].is-active').attributes('data-value')).toBe('matter-1')
    await trigger.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')).toEqual([['matter-1']])

    await trigger.trigger('keydown', { key: 'Enter' })
    await trigger.trigger('keydown', { key: 'Escape' })
    expect(wrapper.get('[role="combobox"]').attributes('aria-expanded')).toBe('false')
    await trigger.trigger('keydown', { key: 'Enter' })
    await trigger.trigger('keydown', { key: 'Tab' })
    expect(wrapper.get('[role="combobox"]').attributes('aria-expanded')).toBe('false')

    await trigger.trigger('keydown', { key: '学' })
    await flushPromises()
    expect(wrapper.get('[role="combobox"]').attributes('aria-expanded')).toBe('false')
    await trigger.trigger('keydown', { key: 'Enter' })
    await trigger.trigger('keydown', { key: '学' })
    expect(wrapper.get('[role="option"].is-active').attributes('data-value')).toBe('matter-1')
    vi.advanceTimersByTime(700)
    vi.useRealTimers()
    wrapper.unmount()
  })

  it('does not open when disabled and does not select disabled options', async () => {
    const wrapper = mount(CalmySelect, {
      props: { id: 'goal-matter-select', ariaLabel: '目标关联处境', modelValue: '', options, disabled: true },
    })
    await wrapper.get('[role="combobox"]').trigger('click')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
