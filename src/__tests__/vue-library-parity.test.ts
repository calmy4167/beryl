import { h, nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStoreCache } from '@/core/storage'
import { unifiedAsyncRepository, unifiedFactories, type Asset, type Insight, type Resource, type Seed } from '@/domain/unified'
import LibraryPage from '@/vue/pages/LibraryPage.vue'

let wrapper: VueWrapper | undefined

async function openLibrary(settle = true) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/app/library', component: LibraryPage },
    { path: '/app/flow', component: { template: '<h1>探索</h1>' } },
  ] })
  await router.push('/app/library')
  await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  if (settle) await flushPromises()
  return { page: wrapper, router }
}

async function click(page: VueWrapper, label: string) {
  const button = page.findAll('button').find(item => item.text().trim() === label)
  expect(button, `button ${label}`).toBeDefined()
  await button!.trigger('click')
  await flushPromises()
}

describe('Vue Library parity', () => {
  beforeEach(() => { localStorage.clear(); resetStoreCache() })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })

  it('uses native selects with the React reference field styling', async () => {
    const { page } = await openLibrary()
    expect(page.get('[aria-label="资源类型"]').element.tagName).toBe('SELECT')
    const controlsCss = readFileSync(resolve(process.cwd(), 'src/styles/controls.css'), 'utf8')
    expect(controlsCss).toContain('html.tactile-ui #app .page-container .library-page select')
  })

  it('creates a trimmed resource and seed using the real repository', async () => {
    const { page } = await openLibrary()
    await page.get('[aria-label="资源标题"]').setValue('  参考卡片  ')
    await page.get('[aria-label="资源内容"]').setValue('  可复用做法  ')
    await page.get('[aria-label="外部 URI"]').setValue('  https://example.com  ')
    await click(page, '保存')
    expect(await unifiedAsyncRepository.list<Resource>('resource')).toEqual([
      expect.objectContaining({ title: '参考卡片', body: '可复用做法', uri: 'https://example.com', kind: 'knowledge', status: 'active' }),
    ])
    expect(page.text()).toContain('参考卡片')

    const picker = page.get('[aria-label="资源类型"]')
    await picker.setValue('seed')
    await page.get('[aria-label="资源标题"]').setValue('  待验证线索  ')
    await page.get('[aria-label="资源内容"]').setValue('  下周去试  ')
    await click(page, '保存')
    expect(await unifiedAsyncRepository.list<Seed>('seed')).toEqual([
      expect.objectContaining({ title: '待验证线索', body: '下周去试', status: 'open' }),
    ])
    expect(page.text()).toContain('待验证线索')
    expect(page.get('[role="status"]').text()).toContain('2 项开放资产')
  })

  it('keeps resource metadata text nodes split like the React reference', async () => {
    await unifiedAsyncRepository.create(unifiedFactories.resource({ title: '节点形状资源', body: '正文', kind: 'knowledge', status: 'active', assetIds: [], matterIds: [], sourceIds: [], tags: [] }))
    const { page } = await openLibrary()
    const metadata = page.find('.library-card small').element
    expect(Array.from(metadata.childNodes, node => node.textContent)).toEqual(['knowledge', ' · ', 'active'])
  })

  it('keeps the toast tied to the entity selected when saving began', async () => {
    const messages: string[] = []
    const listener = (event: Event) => messages.push((event as CustomEvent<{ message: string }>).detail.message)
    window.addEventListener('beryl-toast', listener)
    let releaseRead!: () => void
    const readGate = new Promise<void>(resolve => { releaseRead = resolve })
    try {
    const { page } = await openLibrary()
      await page.get('[aria-label="资源标题"]').setValue('保存中的资料')
      await page.get('[aria-label="资源内容"]').setValue('内容')
      const list = unifiedAsyncRepository.list.bind(unifiedAsyncRepository)
      vi.spyOn(unifiedAsyncRepository, 'list').mockImplementation(async entityType => { await readGate; return list(entityType) })
      await click(page, '保存')
      await page.get('[aria-label="资源类型"]').setValue('seed')
      releaseRead()
      await flushPromises()
      expect(await unifiedAsyncRepository.list<Resource>('resource')).toEqual([expect.objectContaining({ title: '保存中的资料' })])
      expect(messages.at(-1)).toBe('资料已加入')
    } finally { releaseRead(); window.removeEventListener('beryl-toast', listener) }
  })

  it('shows the loading and empty states at the repository read boundary', async () => {
    let releaseRead!: () => void
    const readGate = new Promise<void>(resolve => { releaseRead = resolve })
    const list = unifiedAsyncRepository.list.bind(unifiedAsyncRepository)
    vi.spyOn(unifiedAsyncRepository, 'list').mockImplementation(async entityType => { await readGate; return list(entityType) })
    try {
      const { page } = await openLibrary(false)
      await nextTick()
      expect(page.text()).toContain('读取中…')
      expect(page.text()).toContain('正在读取附件…')
      expect(page.text()).toContain('正在读取资源…')
      expect(page.text()).toContain('正在读取洞察与种子…')
      releaseRead()
      await flushPromises()
      expect(page.text()).toContain('还没有附件元数据。')
      expect(page.text()).toContain('还没有资源。')
      expect(page.text()).toContain('复盘后留下的洞察和 Seed 会出现在这里。')
    } finally { releaseRead() }
  })

  it('lists non-retired insights beside seeds and excludes retired insights', async () => {
    await unifiedAsyncRepository.create(unifiedFactories.insight({ title: '可用洞察', body: '复盘结论', status: 'confirmed', sourceRecordIds: [], matterIds: [], resourceIds: [] }))
    await unifiedAsyncRepository.create(unifiedFactories.insight({ title: '退休洞察', body: '旧结论', status: 'retired', sourceRecordIds: [], matterIds: [], resourceIds: [] }))
    const { page } = await openLibrary()
    const listed = page.findAll('.library-grid section:last-child .library-card')
    expect(listed).toHaveLength(1)
    expect(listed[0].text()).toContain('可用洞察')
    expect(listed[0].text()).toContain('Insight · confirmed')
    expect(page.text()).not.toContain('退休洞察')
    expect(await unifiedAsyncRepository.list<Insight>('insight')).toHaveLength(2)
  })

  it('validates attachment metadata and changes its lifecycle', async () => {
    const messages: string[] = []
    const listener = (event: Event) => messages.push((event as CustomEvent<{ message: string }>).detail.message)
    window.addEventListener('beryl-toast', listener)
    try {
    const { page } = await openLibrary()
      await click(page, '保存附件')
      expect(messages.at(-1)).toBe('Asset 需要路径、类型、hash 和非负大小')
      await page.get('[aria-label="附件路径"]').setValue('  assets/manual.pdf  ')
      await page.get('[aria-label="附件类型"]').setValue('  application/pdf  ')
      await page.get('[aria-label="附件大小"]').setValue('1024')
      await page.get('[aria-label="附件 hash"]').setValue('  abc123  ')
      await click(page, '保存附件')
      const asset = (await unifiedAsyncRepository.list<Asset>('asset'))[0]
      expect(asset).toMatchObject({ path: 'assets/manual.pdf', mimeType: 'application/pdf', sizeBytes: 1024, hash: 'abc123', lifecycle: 'active', version: 1 })
      const lifecycle = page.get('[aria-label="assets/manual.pdf 生命周期"]')
      await lifecycle.setValue('missing')
      await flushPromises()
      expect((await unifiedAsyncRepository.find<Asset>('asset', asset.calmyId))?.lifecycle).toBe('missing')
    } finally { window.removeEventListener('beryl-toast', listener) }
  })

  it('transitions resource status, retires a seed, and hides retired items', async () => {
    const resource = await unifiedAsyncRepository.create(unifiedFactories.resource({ title: '可用资源', body: '内容', kind: 'knowledge', status: 'active', assetIds: [], matterIds: [], sourceIds: [], tags: [] }))
    const seed = await unifiedAsyncRepository.create(unifiedFactories.seed({ title: '开放种子', body: '下一步', status: 'open', sourceRecordIds: [], targetMatterIds: [], tags: [] }))
    const { page } = await openLibrary()
    await click(page, '标记过期')
    expect((await unifiedAsyncRepository.find<Resource>('resource', resource.calmyId))?.status).toBe('expired')
    await click(page, '恢复有效')
    expect((await unifiedAsyncRepository.find<Resource>('resource', resource.calmyId))?.status).toBe('active')
    await page.get('.library-grid section:last-child button').trigger('click')
    await flushPromises()
    expect((await unifiedAsyncRepository.find<Seed>('seed', seed.calmyId))?.status).toBe('retired')
    expect(page.text()).not.toContain('开放种子')
    await click(page, '退休')
    expect((await unifiedAsyncRepository.find<Resource>('resource', resource.calmyId))?.status).toBe('retired')
    expect(page.text()).not.toContain('可用资源')
  })

  it('shows a read error, retries, and navigates to exploration', async () => {
    const list = unifiedAsyncRepository.list.bind(unifiedAsyncRepository)
    vi.spyOn(unifiedAsyncRepository, 'list').mockImplementationOnce(async () => { throw new Error('离线读取失败') }).mockImplementation(list)
    const { page, router } = await openLibrary()
    expect(page.get('[role="alert"]').text()).toContain('离线读取失败')
    await click(page, '重试')
    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(page.text()).toContain('还没有资源。')
    await click(page, '带着问题进探索')
    expect(router.currentRoute.value.path).toBe('/app/flow')
  })
})
