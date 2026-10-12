import { h } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveAccount } from '@/core/account-context'
import { clearSession, writeServerSession } from '@/core/auth'
import { financeAsyncRepository } from '@/domain/finance/repository'
import { unifiedAsyncRepository, unifiedFactories, type Person, type Relation } from '@/domain/unified'
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
  beforeEach(() => { setActiveAccount('vue-finance-parity-user'); localStorage.clear(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks(); clearSession(); setActiveAccount(null) })
  it('keeps finance selects on the React reference control surface', () => {
    const controlsCss = readFileSync(resolve(process.cwd(), 'src/styles/controls.css'), 'utf8')
    // 原来断言的是 `html.tactile-ui … .finance-page select { background:#f8fafc; appearance:auto }`——
    // 那个作用域运行期从不添加，且写死了旧浅色（第 32 轮删除）。现在唯一生效的是全局 select 规则。
    expect(controlsCss).toMatch(/html :where\(select:not\(\[multiple\]\):not\(\[size\]\):not\(\.matter-trajectory-select\)\)\s*\{[^}]*background-image:\s*url\("data:image\/svg\+xml/s)
    expect(controlsCss).toMatch(/html :where\(select:not\(\[multiple\]\):not\(\[size\]\):not\(\.matter-trajectory-select\)\)\s*\{([^}]*)\}/s)
    expect(controlsCss.match(/html :where\(select:not\(\[multiple\]\):not\(\[size\]\):not\(\.matter-trajectory-select\)\)\s*\{([^}]*)\}/s)?.[1]).toContain('appearance: none;')
    expect(controlsCss).not.toMatch(/html\.tactile-ui[^{]*\{/)
  })
  it('validates amounts, creates income and expense records, and filters them', async () => {
    writeServerSession({ token: 'finance-parity-token', apiOrigin: 'https://api.example.test', expiresAt: Date.now() + 60_000, user: { id: 'vue-finance-parity-user', username: 'finance-parity', displayName: 'Finance parity', role: 'user' }, mustChangePassword: false })
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
    await page.get('summary').trigger('click')
    await page.get('.ownership-toggle input').setValue(true)
    await page.get('.ownership-fields select').setValue('user:vue-finance-parity-user')
    await page.get('.ownership-fields button').trigger('click')
    await flushPromises()
    const [entry] = await financeAsyncRepository.list()
    expect(entry).toMatchObject({ revision: 2, ownership: { ownerRef: { type: 'user', id: 'vue-finance-parity-user' } } })
  })
  it('connects one Finance record to a Person through a typed Relation without copying the record', async () => {
    const person = await unifiedAsyncRepository.create<Person>(unifiedFactories.person({ displayName: '爸爸' }))
    const page = await openFinance()
    await page.get('[aria-label="金额"]').setValue('89.00')
    await page.get('[aria-label="财务分类"]').setValue('医疗')
    await page.get('form').trigger('submit'); await flushPromises()

    await page.get('[aria-label="选择关联的人物、事情、情境或空间"]').setValue(`person:${person.calmyId}`)
    await page.get('.context-relation-add button').trigger('click')
    await flushPromises()

    const [entry] = await financeAsyncRepository.list()
    const relations = await unifiedAsyncRepository.list<Relation>('relation')
    expect(relations).toContainEqual(expect.objectContaining({ from: { entityType: 'finance_entry', calmyId: entry.id }, to: { entityType: 'person', calmyId: person.calmyId }, relationType: 'subject_of' }))
    expect(await financeAsyncRepository.list()).toHaveLength(1)
  })
  it('creates a signed-in Finance record as Private and records its original version', async () => {
    writeServerSession({ token: 'finance-owner-token', apiOrigin: 'https://api.example.test', expiresAt: Date.now() + 60_000, user: { id: 'finance-server-owner', username: 'finance-owner', displayName: 'Finance owner', role: 'user' }, mustChangePassword: false })
    const page = await openFinance()
    await page.get('[aria-label="金额"]').setValue('128.50')
    await page.get('[aria-label="财务分类"]').setValue('医疗')
    await page.get('[aria-label="财务备注"]').setValue('复诊费用')
    await page.get('form').trigger('submit'); await flushPromises()

    const [entry] = await financeAsyncRepository.list()
    expect(entry).toMatchObject({
      createdAt: expect.any(Number), createdByUserId: 'finance-server-owner', updatedAt: expect.any(Number), updatedByUserId: 'finance-server-owner', source: 'finance-page',
      ownership: { createdByUserId: 'finance-server-owner', ownerRef: { type: 'user', id: 'finance-server-owner' }, privacy: 'private' }
    })
    expect(await financeAsyncRepository.history(entry.id)).toEqual([expect.objectContaining({ operation: 'created', actorId: 'finance-server-owner', fromRevision: 0, toRevision: 1, snapshot: expect.objectContaining({ id: entry.id, amountCents: 12850, category: '医疗', note: '复诊费用', ownership: entry.ownership }) })])
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
