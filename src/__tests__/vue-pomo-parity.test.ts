import { h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import { readAsyncStorageValue } from '@/core/repository'
import { recordAsyncRepository } from '@/domain/record/repository'
import PomoPage from '@/vue/pages/PomoPage.vue'

let wrapper: VueWrapper | undefined
async function openPomo() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app/module/pomo', component: PomoPage }] })
  await router.push('/app/module/pomo'); await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}
describe('Vue Pomo parity', () => {
  beforeEach(() => { localStorage.clear(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.useRealTimers(); vi.restoreAllMocks(); document.title = 'Calmy — 个人现实行动系统' })
  it('switches modes and keeps independent editable durations', async () => {
    const page = await openPomo()
    expect((page.get('.pomo-duration').element as HTMLElement).style.display).toBe('grid')
    expect((page.get('.pomo-duration').element as HTMLElement).style.textAlign).toBe('left')
    expect(page.text()).toContain('25:00')
    await page.get('[aria-label="休息分钟"]').setValue('8')
    await page.get('[aria-label="切换到休息模式"]').trigger('click')
    expect(page.text()).toContain('08:00')
    await page.get('[aria-label="切换到专注模式"]').trigger('click')
    expect(page.text()).toContain('25:00')
  })
  it('finishes a one minute focus session and persists its stats and record', async () => {
    vi.useFakeTimers()
    const page = await openPomo()
    await page.get('[aria-label="专注分钟"]').setValue('1')
    await page.get('[aria-label="开始专注"]').trigger('click')
    await vi.advanceTimersByTimeAsync(60_000); await flushPromises()
    expect(await readAsyncStorageValue('pomoTotal', 0)).toBe(1)
    expect(await readAsyncStorageValue('pomoCount', 0)).toBe(1)
    expect((await recordAsyncRepository.list()).some(record => record.body.includes('完成专注 1 分钟'))).toBe(true)
    expect(page.text()).toContain('休息')
  })
})
