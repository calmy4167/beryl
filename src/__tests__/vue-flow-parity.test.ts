import { defineComponent, h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import { matterAsyncRepository } from '@/domain/matter/repository'
import { recordAsyncRepository } from '@/domain/record/repository'
import { unifiedAsyncRepository, unifiedFactories, type Resource, type Seed } from '@/domain/unified'
import FlowPage from '@/vue/pages/FlowPage.vue'

let wrapper: VueWrapper | undefined

async function openFlow(path = '/app/flow') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/flow', component: FlowPage },
      { path: '/app/today', component: defineComponent({ render: () => h('h1', '今天') }) },
    ],
  })
  await router.push(path)
  await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

async function addSeed(title: string, targetMatterIds: string[] = [], sourceRecordIds: string[] = []) {
  return unifiedAsyncRepository.create(unifiedFactories.seed({
    title, body: `${title} 的内容`, status: 'open', targetMatterIds, sourceRecordIds, tags: ['测试'],
  }))
}

async function addResource(title: string, matterIds: string[] = [], sourceIds: string[] = []) {
  return unifiedAsyncRepository.create(unifiedFactories.resource({
    title, body: `${title} 的内容`, kind: 'reference', status: 'active', matterIds, sourceIds, assetIds: [], tags: ['资料'],
  }))
}

async function clickButton(page: VueWrapper, label: string) {
  const button = page.findAll('button').find(candidate => candidate.text().trim() === label)
  expect(button, `button ${label}`).toBeDefined()
  await button!.trigger('click')
  await flushPromises()
}

async function startSolve(page: VueWrapper, intent = '确认下一步') {
  await page.get('[aria-label="当前问题或探索意图"]').setValue(intent)
  await page.get('[aria-label="希望得到的证据"]').setValue('有实际反馈')
  await page.get('[aria-label="应用位置"]').setValue('明天的会议')
  await clickButton(page, '开始这一批')
}

describe('Vue Flow page parity', () => {
  beforeEach(() => { localStorage.clear(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })

  it('loads matter query context, excludes archived matters and redacted records, and prefills the solve fields', async () => {
    const matter = await matterAsyncRepository.create({
      title: '跨团队协作', problem: '如何减少需求误解？', progressEvidence: '完成一次用户访谈',
      nextTest: '在评审会上使用', currentGap: '缺乏现场反馈', stopCondition: '两轮都没有反馈',
    })
    const archived = await matterAsyncRepository.create({ title: '归档处境' })
    await matterAsyncRepository.archive(archived.calmyId)
    await recordAsyncRepository.create({ body: '已收到一条现实证据', matterId: matter.calmyId })
    await addSeed('处境线索', [matter.calmyId])
    const { wrapper: page } = await openFlow(`/app/flow?matter=${encodeURIComponent(matter.calmyId)}`)

    expect(page.text()).toContain('当前问题上下文：跨团队协作')
    expect(page.text()).toContain('当前缺口：缺乏现场反馈')
    expect(page.text()).toContain('停止条件：两轮都没有反馈')
    expect(page.text()).toContain('最近现实证据：已收到一条现实证据')
    expect(page.get<HTMLTextAreaElement>('[aria-label="当前问题或探索意图"]').element.value).toBe('如何减少需求误解？')
    expect(page.get<HTMLTextAreaElement>('[aria-label="希望得到的证据"]').element.value).toBe('完成一次用户访谈')
    expect(page.get<HTMLTextAreaElement>('[aria-label="应用位置"]').element.value).toBe('在评审会上使用')
    const matterSelect = page.get<HTMLSelectElement>('[aria-label="探索关联处境"]')
    expect(Array.from(matterSelect.element.options).map(option => option.text)).not.toContain('归档处境')
    await clickButton(page, '开始这一批')
    expect(page.findAll('.flow-card')).toHaveLength(1)
  })

  it('uses the same native matter select as the current page', async () => {
    await matterAsyncRepository.create({ title: '第一处境' })
    const second = await matterAsyncRepository.create({ title: '第二处境' })
    const { wrapper: page } = await openFlow()
    const picker = page.get<HTMLSelectElement>('[aria-label="探索关联处境"]')
    await picker.setValue(second.calmyId)
    expect(picker.element.value).toBe(second.calmyId)
    expect(page.text()).toContain('当前问题上下文：第二处境')
    expect(second.calmyId).toBeTruthy()
    expect(picker.element.tagName).toBe('SELECT')
  })

  it('keeps focus on the native matter select after a pointer selection', async () => {
    const matter = await matterAsyncRepository.create({ title: '点击选择处境' })
    const { wrapper: page } = await openFlow()
    document.body.append(page.element)
    const picker = page.get<HTMLSelectElement>('[aria-label="探索关联处境"]')
    picker.element.focus()
    await picker.setValue(matter.calmyId)
    expect(picker.element.value).toBe(matter.calmyId)
    expect(document.activeElement).toBe(picker.element)
  })

  it('validates intent and mode-specific fields before showing a batch', async () => {
    const messages: string[] = []
    const listener = (event: Event) => messages.push((event as CustomEvent<{ message: string }>).detail.message)
    window.addEventListener('beryl-toast', listener)
    try {
      const { wrapper: page } = await openFlow()
      expect(page.findAll('.flow-mode-picker button').every(button => button.classes().includes('app-button'))).toBe(true)
      await clickButton(page, '开始这一批')
      expect(messages.at(-1)).toBe('先写下当前要解决的问题或探索意图')
      await page.get('[aria-label="当前问题或探索意图"]').setValue('观察反馈')
      await clickButton(page, '开始这一批')
      expect(messages.at(-1)).toBe('解题模式还需要写清希望得到的证据和应用位置')
      expect(page.find('.flow-batch').exists()).toBe(false)
      await page.get('[aria-label="希望得到的证据"]').setValue('访谈记录')
      await page.get('[aria-label="应用位置"]').setValue('下周讨论')
      await clickButton(page, '开始这一批')
      expect(page.find('.flow-batch').exists()).toBe(true)
      expect(page.text()).toContain('证据：访谈记录 · 应用：下周讨论')
      await clickButton(page, '专题混合上下文')
      expect(page.find('.flow-batch').exists()).toBe(false)
      await clickButton(page, '开始这一批')
      expect(messages.at(-1)).toBe('专题模式还需要写清这次要聚焦的范围')
    } finally { window.removeEventListener('beryl-toast', listener) }
  })

  it('orders matter-related seeds first, limits the batch to five, and switches focus, wander, echo and topic modes', async () => {
    const matter = await matterAsyncRepository.create({ title: '目标处境' })
    for (let index = 0; index < 6; index += 1) await addSeed(`普通线索 ${index}`)
    await addSeed('优先线索', [matter.calmyId])
    await addResource('资源 A', [matter.calmyId])
    const { wrapper: page } = await openFlow(`/app/flow?matter=${matter.calmyId}`)
    await startSolve(page)
    expect(page.findAll('.flow-card')).toHaveLength(5)
    expect(page.get('.flow-card h3').text()).toBe('优先线索')

    await clickButton(page, '专注只看一条')
    await clickButton(page, '开始这一批')
    expect(page.findAll('.flow-card')).toHaveLength(1)
    expect(page.find('.focus-batch').exists()).toBe(true)
    await clickButton(page, '漫游有限探索')
    await clickButton(page, '开始这一批')
    expect(page.findAll('.flow-card')).toHaveLength(5)
    await clickButton(page, '回响回看资料')
    await clickButton(page, '开始这一批')
    expect(page.findAll('.flow-card')).toHaveLength(1)
    expect(page.get('.flow-card h3').text()).toBe('资源 A')
    await clickButton(page, '专题混合上下文')
    await page.get('[aria-label="专题范围"]').setValue('资源 A')
    await clickButton(page, '开始这一批')
    expect(page.get('.flow-card h3').text()).toBe('资源 A')
    expect(page.text()).toContain('专题范围：资源 A')
  })

  it('expands the original source and keeps a seed without changing stored data', async () => {
    const record = await recordAsyncRepository.create({ body: '访谈中提到的原话' })
    const seed = await addSeed('来源线索', [], [record.calmyId])
    const { wrapper: page } = await openFlow()
    await startSolve(page)
    await clickButton(page, '展开来源')
    expect(page.get('.flow-source').text()).toContain('访谈中提到的原话')
    expect(page.get('.flow-source').text()).toContain('标签：测试')
    await clickButton(page, '收起来源')
    expect(page.find('.flow-source').exists()).toBe(false)
    await clickButton(page, '收下')
    expect((await unifiedAsyncRepository.find<Seed>('seed', seed.calmyId))?.revision).toBe(seed.revision)
  })

  it('preserves 迁移前界面基线 button styling on echo resource cards and record feedback', async () => {
    await addResource('回响资料')
    await recordAsyncRepository.create({ body: '一条可以回看的记录' })
    const { wrapper: page } = await openFlow()
    await page.get('[aria-label="当前问题或探索意图"]').setValue('回看内容')
    await clickButton(page, '回响回看资料')
    await clickButton(page, '开始这一批')

    expect(page.get('.flow-batch-head button').classes()).toContain('app-button')
    expect(page.get('.flow-card-head button').classes()).toContain('app-button')
    expect(page.findAll('.flow-card-actions > button').every(button => button.classes().includes('app-button'))).toBe(true)
    expect(page.findAll('.echo-actions button').every(button => button.classes().includes('app-button'))).toBe(true)
  })

  it('associates a seed with the selected matter and creates a verification action from it', async () => {
    const matter = await matterAsyncRepository.create({ title: '现实处境' })
    const seed = await addSeed('可验证线索')
    const { wrapper: page } = await openFlow(`/app/flow?matter=${matter.calmyId}`)
    await startSolve(page)
    await clickButton(page, '用于当前问题')
    expect((await unifiedAsyncRepository.find<Seed>('seed', seed.calmyId))?.targetMatterIds).toContain(matter.calmyId)
    expect((await unifiedAsyncRepository.find<Seed>('seed', seed.calmyId))?.status).toBe('cultivating')
    await clickButton(page, '试一下')
    expect(await actionAsyncRepository.list()).toEqual([expect.objectContaining({ title: '验证：可验证线索', matterId: matter.calmyId })])
    expect((await unifiedAsyncRepository.find<Seed>('seed', seed.calmyId))?.status).toBe('promoted')
    expect(page.text()).toContain('这一批已结束')
  })

  it('associates a resource without changing status and retires it with the goodbye action', async () => {
    const matter = await matterAsyncRepository.create({ title: '现实处境' })
    const resource = await addResource('参考资料')
    const { wrapper: page } = await openFlow(`/app/flow?matter=${matter.calmyId}`)
    await page.get('[aria-label="当前问题或探索意图"]').setValue('寻找资料')
    await clickButton(page, '漫游有限探索')
    await clickButton(page, '开始这一批')
    await clickButton(page, '用于当前问题')
    expect(await unifiedAsyncRepository.find<Resource>('resource', resource.calmyId)).toMatchObject({ status: 'active', matterIds: [matter.calmyId] })
    await clickButton(page, '再见')
    expect((await unifiedAsyncRepository.find<Resource>('resource', resource.calmyId))?.status).toBe('retired')
    expect(page.findAll('.flow-card')).toHaveLength(0)
  })

  it('shows recent echo records, records feedback only in page state, and exits to Today', async () => {
    const matter = await matterAsyncRepository.create({ title: '现实处境' })
    const record = await recordAsyncRepository.create({ body: '完成了一次验证', matterId: matter.calmyId })
    await addResource('可回看的资料')
    const { wrapper: page, router } = await openFlow(`/app/flow?matter=${matter.calmyId}`)
    await page.get('[aria-label="当前问题或探索意图"]').setValue('回看')
    await clickButton(page, '回响回看资料')
    await clickButton(page, '开始这一批')
    expect(page.text()).toContain('过去的现实证据')
    expect(page.text()).toContain('完成了一次验证')
    await clickButton(page, '仍重要')
    expect(page.get('.echo-actions button.on').text()).toBe('仍重要')
    expect((await recordAsyncRepository.find(record.calmyId))?.revision).toBe(record.revision)
    await clickButton(page, '已足够，结束探索')
    expect(page.text()).toContain('这一批已结束')
    await clickButton(page, '返回本批')
    expect(page.find('.flow-batch').exists()).toBe(true)
    await clickButton(page, '已足够，结束探索')
    await clickButton(page, '回到今天去做')
    expect(router.currentRoute.value.path).toBe('/app/today')
  })

  it('ends a focused batch on Escape and can return to the same batch', async () => {
    await addSeed('单条线索')
    const { wrapper: page } = await openFlow()
    await page.get('[aria-label="当前问题或探索意图"]').setValue('只看一条')
    await clickButton(page, '专注只看一条')
    await clickButton(page, '开始这一批')
    expect(page.findAll('.flow-card')).toHaveLength(1)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(page.text()).toContain('这一批已结束')
    await clickButton(page, '返回本批')
    expect(page.findAll('.flow-card')).toHaveLength(1)
  })

  it('shows repository read failure and reloads the same batch after retry', async () => {
    await addSeed('重试后可见')
    const list = unifiedAsyncRepository.list.bind(unifiedAsyncRepository)
    vi.spyOn(unifiedAsyncRepository, 'list').mockImplementationOnce(async () => { throw new Error('离线读取失败') }).mockImplementation(list)
    const { wrapper: page } = await openFlow()
    expect(page.get('[role="alert"]').text()).toContain('离线读取失败')
    await clickButton(page, '重试')
    expect(page.find('[role="alert"]').exists()).toBe(false)
    await startSolve(page)
    expect(page.text()).toContain('重试后可见')
  })
})
