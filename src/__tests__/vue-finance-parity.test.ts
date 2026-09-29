import { h } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import FinancePage from '@/vue/pages/FinancePage.vue'

let wrapper: VueWrapper | undefined
async function openFinance() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app/module/finance', component: FinancePage }] })
  await router.push('/app/module/finance'); await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}
describe('Vue Finance parity', () => {
  beforeEach(() => { localStorage.clear(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })
  it('keeps finance selects on the React reference control surface', () => {
    const controlsCss = readFileSync(resolve(process.cwd(), 'src/styles/controls.css'), 'utf8')
    expect(controlsCss).toMatch(/html\.tactile-ui #app \.page-container \.finance-page select\s*\{[^}]*background:\s*#f8fafc;[^}]*appearance:\s*auto;/s)
  })
  it('validates amounts, creates income and expense records, and filters them', async () => {
    const page = await openFinance()
    expect(page.get('[aria-label="财务记录筛选"]').element.tagName).toBe('SELECT')
    await page.get('[aria-label="金额"]').setValue('0')
    await page.get('form').trigger('submit')
    expect(page.get('[aria-label="收支类型"]').element.tagName).toBe('SELECT')
    await page.get('[aria-label="收支类型"]').setValue('income')
    await page.get('[aria-label="财务分类"]').setValue('工资')
    await page.get('[aria-label="金额"]').setValue('120.50')
    await page.get('form').trigger('submit'); await flushPromises()
    expect(page.text()).toContain('120.50')
    await page.get('[aria-label="财务记录筛选"]').setValue('income')
    expect(page.text()).toContain('工资')
    expect(page.get('.finance-item-actions .case-link').element.tagName).toBe('SELECT')
  })
  it('shows an empty state and removes a confirmed record', async () => {
    const page = await openFinance()
    await page.get('[aria-label="金额"]').setValue('8.80')
    await page.get('[aria-label="财务分类"]').setValue('交通')
    await page.get('form').trigger('submit'); await flushPromises()
    const original = window.confirm; window.confirm = () => true
    try {
      await page.get('[aria-label="删除交通财务记录"]').trigger('click'); await flushPromises()
    } finally { window.confirm = original }
    expect(page.text()).toContain('还没有匹配的财务记录')
  })
})
