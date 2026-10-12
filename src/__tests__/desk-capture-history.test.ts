import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DeskCaptureHistory from '@/vue/pages/desk/DeskCaptureHistory.vue'

const now = Date.now()
const items = Array.from({ length: 6 }, (_, index) => ({
  capture: {
    calmyId: `capture-${index}`,
    body: `完整记录内容 ${index}`,
    status: 'accepted' as const,
    suggestionIds: [],
    createdAt: now - index * 60_000,
    updatedAt: now - index * 60_000,
    revision: 1,
  },
  decision: 'record' as const,
}))

describe('首页打开的完整记录页', () => {
  it('renders every record and does not stop at a recent-items preview', () => {
    const wrapper = mount(DeskCaptureHistory, {
      props: {
        items,
        hiddenIds: [],
        showHidden: false,
        loading: false,
        error: '',
        actionError: '',
        busyId: '',
        selectedId: 'capture-0',
      },
    })

    expect(wrapper.find('.desk-record-history').classes()).toContain('grow')
    expect(wrapper.findAll('.desk-history-row')).toHaveLength(6)
    expect(wrapper.find('.desk-history-view-all').exists()).toBe(false)
    expect(wrapper.find('.desk-history-detail').text()).toContain('完整记录内容 0')
  })
})
