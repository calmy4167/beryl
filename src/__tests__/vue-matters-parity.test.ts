import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Matter } from '@/domain/matter/model'

const harness = vi.hoisted(() => ({
  items: [] as Matter[],
  listError: undefined as Error | undefined,
  workspaceSnapshot: undefined as Record<string, unknown> | undefined,
  workspaceListeners: new Set<() => void>(),
  workspaceRefresh: vi.fn(),
  watchWorkspace: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  transition: vi.fn(),
  archive: vi.fn(),
  update: vi.fn(),
}))

const mattersSource = readFileSync('src/vue/pages/MattersPage.vue', 'utf8')
const controlsSource = readFileSync('src/styles/controls.css', 'utf8')

vi.mock('@/domain/matter/repository', () => ({
  matterAsyncRepository: {
    list: harness.list,
    create: harness.create,
    transition: harness.transition,
    archive: harness.archive,
    update: harness.update,
  },
}))

vi.mock('@/domain/feishu/workspace-instance', () => ({
  feishuWorkspace: {
    getSnapshot: () => harness.workspaceSnapshot,
    subscribe: (listener: () => void) => {
      harness.workspaceListeners.add(listener)
      return () => harness.workspaceListeners.delete(listener)
    },
    refresh: harness.workspaceRefresh,
  },
  watchFeishuWorkspace: harness.watchWorkspace,
}))

import MattersPage from '@/vue/pages/MattersPage.vue'

const mountPage = () => mount(MattersPage, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })

const makeMatter = (id: string, overrides: Partial<Matter> = {}): Matter => ({
  calmyId: id,
  title: id,
  why: `${id} 为什么重要`,
  primaryContradiction: '',
  status: 'active',
  currentStage: 'wood',
  trajectory: 'stable',
  evidenceIds: [],
  createdAt: 1,
  updatedAt: 1,
  revision: 1,
  ...overrides,
})

describe('Vue MattersPage parity', () => {
  beforeEach(() => {
    localStorage.removeItem('calmy:workspace:source')
    harness.workspaceListeners.clear()
    harness.workspaceSnapshot = {
      workspaceId: '', tables: { tasks: [], projects: [], reviews: [], members: [] }, fields: {}, bindings: {},
      tableErrors: {}, ready: false, loading: false, saving: false, error: '', writeError: '',
      lastRead: null, cacheUpdatedAt: null, usingCache: false,
    }
    harness.workspaceRefresh.mockReset()
    harness.watchWorkspace.mockReset().mockReturnValue(vi.fn())
    harness.items = [makeMatter('建立工作节奏'), makeMatter('暂缓的计划', { status: 'paused' })]
    harness.listError = undefined
    harness.list.mockReset().mockImplementation(async () => {
      if (harness.listError) throw harness.listError
      return structuredClone(harness.items)
    })
    harness.create.mockReset().mockImplementation(async (input: Partial<Matter>) => {
      const item = makeMatter('新处境', { ...input, status: 'active' })
      harness.items.unshift(item)
      return structuredClone(item)
    })
    harness.transition.mockReset().mockImplementation(async (id: string, status: Matter['status']) => {
      const item = harness.items.find(candidate => candidate.calmyId === id)!
      Object.assign(item, { status, revision: item.revision + 1 })
      return structuredClone(item)
    })
    harness.archive.mockReset().mockImplementation(async (id: string) => {
      const item = harness.items.find(candidate => candidate.calmyId === id)!
      Object.assign(item, { status: 'archived', revision: item.revision + 1 })
      return structuredClone(item)
    })
    harness.update.mockReset().mockImplementation(async (id: string, patch: Partial<Matter>) => {
      const item = harness.items.find(candidate => candidate.calmyId === id)!
      Object.assign(item, patch, { revision: item.revision + 1 })
      return structuredClone(item)
    })
  })

  it('loads active and paused matters, filters by lifecycle status, and shows an empty result', async () => {
    const wrapper = mountPage()
    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(false))

    expect(wrapper.text()).toContain('处境 · 正在面对')
    expect(wrapper.text()).toContain('记录持续影响你的现实问题，并写下想看到的变化。')
    expect(wrapper.get('[aria-label="处境筛选"]').element.tagName).toBe('SELECT')
    expect(controlsSource).toContain('html.tactile-ui #app .page-container .matters-page select')
    expect(wrapper.text()).toContain('建立工作节奏')
    expect(wrapper.text()).toContain('暂缓的计划')
    expect(wrapper.findAll('.matter-status').map(status => status.text())).toEqual(['进行中', '已暂停'])
    await wrapper.get('[aria-label="处境筛选"]').setValue('paused')
    expect(wrapper.text()).toContain('暂缓的计划')
    expect(wrapper.text()).not.toContain('建立工作节奏')
    await wrapper.get('[aria-label="处境筛选"]').setValue('archived')
    expect(wrapper.text()).toContain('还没有匹配的处境。')
  })

  it('validates the title and creates a matter with optional problem-driven fields', async () => {
    const messages: string[] = []
    const onToast = (event: Event) => messages.push((event as CustomEvent<{ message: string }>).detail.message)
    window.addEventListener('beryl-toast', onToast)
    const wrapper = mountPage()
    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(false))

    await wrapper.get('button.primary').trigger('click')
    expect(harness.create).not.toHaveBeenCalled()
    expect(messages).toContain('先写下处境名称')

    await wrapper.get('[aria-label="新处境名称"]').setValue('  改善睡眠  ')
    await wrapper.get('[aria-label="处境为什么重要"]').setValue('恢复白天精力')
    await wrapper.get('summary').trigger('click')
    await wrapper.get('[aria-label="现实问题"]').setValue('连续熬夜')
    await wrapper.get('[aria-label="期望变化"]').setValue('稳定在零点前入睡')
    await wrapper.get('[aria-label="进展证据"]').setValue('一周有五天准时休息')
    await wrapper.get('[aria-label="当前缺口"]').setValue('睡前刷手机')
    await wrapper.get('[aria-label="下一次验证"]').setValue('手机放到房间外')
    await wrapper.get('[aria-label="停止条件"]').setValue('连续两周稳定后复盘')
    await wrapper.get('button.primary').trigger('click')

    await vi.waitFor(() => expect(wrapper.text()).toContain('改善睡眠'))
    expect(harness.create).toHaveBeenCalledWith({
      title: '  改善睡眠  ',
      why: '恢复白天精力',
      problem: '连续熬夜',
      desiredChange: '稳定在零点前入睡',
      progressEvidence: '一周有五天准时休息',
      currentGap: '睡前刷手机',
      nextTest: '手机放到房间外',
      stopCondition: '连续两周稳定后复盘',
    })
    expect(messages).toContain('处境已创建')
    expect((wrapper.get('[aria-label="新处境名称"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).toContain('当前要解决的问题')
    expect(wrapper.text()).toContain('期望变化')
    window.removeEventListener('beryl-toast', onToast)
  })

  it('pauses and resumes matters, then ends a matter without deleting it', async () => {
    const messages: string[] = []
    const onToast = (event: Event) => messages.push((event as CustomEvent<{ message: string }>).detail.message)
    window.addEventListener('beryl-toast', onToast)
    const wrapper = mountPage()
    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(false))

    await wrapper.get('[aria-label="建立工作节奏状态切换"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('.matter-card').find('.matter-status').text()).toBe('已暂停'))
    expect(harness.transition).toHaveBeenCalledWith('建立工作节奏', 'paused', { expectedRevision: 1 })
    expect(messages).toContain('处境已暂停')

    await wrapper.get('[aria-label="建立工作节奏状态切换"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('.matter-card').find('.matter-status').text()).toBe('进行中'))
    expect(harness.transition).toHaveBeenLastCalledWith('建立工作节奏', 'active', { expectedRevision: 2 })
    expect(messages).toContain('处境已恢复')

    await wrapper.findAll('.matter-card').at(0)!.findAll('button').find(button => button.text() === '结束')!.trigger('click')
    await vi.waitFor(() => expect(wrapper.get('.matter-card').find('.matter-status').text()).toBe('已结束'))
    expect(harness.archive).toHaveBeenCalledWith('建立工作节奏', { expectedRevision: 3 })
    expect(wrapper.text()).toContain('建立工作节奏')
    expect(messages).toContain('处境已结束并归档，不代表失败')
    window.removeEventListener('beryl-toast', onToast)
  })

  it('keeps the trajectory picker at the 迁移前界面基线 width', async () => {
    const wrapper = mountPage()
    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(false))

    const trigger = wrapper.get('[aria-label="建立工作节奏趋势"]')
    expect(trigger.element.tagName).toBe('SELECT')
    expect(trigger.classes()).toContain('matter-trajectory-select')
    expect((trigger.element as HTMLElement).style.minWidth).toBe('')
    expect(controlsSource).toMatch(/html\.tactile-ui #app \.page-container \.matters-page select:not\(\.matter-trajectory-select\)/)
    expect(controlsSource).toMatch(/html :where\(select:not\(\[multiple\]\):not\(\[size\]\):not\(\.matter-trajectory-select\)\)/)
    expect(controlsSource).toMatch(/html\.tactile-ui #app \.page-container :where\(select:not\(\[multiple\]\):not\(\[size\]\):not\(\.matter-trajectory-select\)\)/)
  })
  it('keeps the compact trajectory label on one line for narrow cards', async () => {
    const wrapper = mountPage()
    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(false))

    expect(wrapper.get('.matter-card-trend label .matter-trajectory-label').text()).toBe('趋势')
    expect(mattersSource).toMatch(/white-space:\s*nowrap/)
  })
  it('keeps the trajectory label and picker at their natural width', () => {
    expect(mattersSource).toMatch(/\.matter-card-trend\s+label\s*\{[^}]*width:\s*auto/s)
  })
  it('updates the trajectory independently from status', async () => {
    const messages: string[] = []
    const onToast = (event: Event) => messages.push((event as CustomEvent<{ message: string }>).detail.message)
    window.addEventListener('beryl-toast', onToast)
    const wrapper = mountPage()
    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(false))

    await wrapper.get('[aria-label="建立工作节奏趋势"]').setValue('advancing')
    await vi.waitFor(() => expect(harness.update).toHaveBeenCalled())
    expect(harness.update).toHaveBeenCalledWith('建立工作节奏', { trajectory: 'advancing' }, { expectedRevision: 1 })
    expect(wrapper.get('.matter-card').find('.matter-status').text()).toBe('进行中')
    expect((wrapper.get('[aria-label="建立工作节奏趋势"]').element as HTMLSelectElement).value).toBe('advancing')
    expect(messages).toContain('趋势判断已更新')
    window.removeEventListener('beryl-toast', onToast)
  })

  it('shows a list read error and retries', async () => {
    harness.listError = new Error('暂时不可用')
    const wrapper = mountPage()
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))

    expect(wrapper.text()).toContain('处境列表暂时无法读取')
    expect(wrapper.text()).toContain('暂时不可用')
    harness.listError = undefined
    await wrapper.findAll('button').find(button => button.text().trim() === '重试')!.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(false))
    expect(wrapper.text()).toContain('建立工作节奏')
  })

  it('switches between local data and the existing Feishu projects view with connection status', async () => {
    const wrapper = mountPage()
    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(false))
    expect(wrapper.get('[aria-label="选择数据来源"] button').text()).toBe('本地')
    expect(wrapper.text()).toContain('保留原有本机数据；切换来源不会迁移或删除数据。')
    await wrapper.get('[aria-label="新处境名称"]').setValue('未提交草稿')

    await wrapper.get('[aria-label="选择数据来源"] button:nth-child(2)').trigger('click')
    expect(localStorage.getItem('calmy:workspace:source')).toBe('feishu')
    expect(wrapper.text()).toContain('飞书 · 工作区')
    harness.workspaceSnapshot = {
      ...harness.workspaceSnapshot,
      error: '请先在“设置与同步”填写 Worker 地址和同步密码。',
    }
    harness.workspaceListeners.forEach(listener => listener())
    await vi.waitFor(() => expect(wrapper.text()).toContain('飞书未连接，尚无本机缓存'))
    expect(wrapper.text()).toContain('请先在“设置与同步”填写 Worker 地址和同步密码。')
    expect(wrapper.find('.matters-page').exists()).toBe(false)

    harness.workspaceSnapshot = {
      workspaceId: 'workspace-1', tables: { tasks: [], projects: [], reviews: [], members: [] }, fields: {}, bindings: {},
      tableErrors: {}, ready: false, loading: false, saving: false, error: '连接不可用', writeError: '',
      lastRead: null, cacheUpdatedAt: null, usingCache: false,
    }
    harness.workspaceListeners.forEach(listener => listener())
    await vi.waitFor(() => expect(wrapper.text()).toContain('飞书连接暂不可用'))
    expect(wrapper.text()).toContain('连接不可用')
    expect(wrapper.text()).toContain('连接恢复后可重新读取飞书数据。')

    await wrapper.get('[aria-label="选择数据来源"] button:nth-child(1)').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.matter-grid [role="status"]').exists()).toBe(false))
    expect((wrapper.get('[aria-label="新处境名称"]').element as HTMLInputElement).value).toBe('')
  })

  it('searches read-only Feishu projects and expands related tasks', async () => {
    localStorage.setItem('calmy:workspace:source', 'feishu')
    harness.workspaceSnapshot = {
      workspaceId: 'workspace-1',
      tables: {
        projects: [
          { record_id: 'rec-project-1', fields: { 项目名称: 'Calmy', 目标: '打磨迁移', 状态: '进行中' } },
          { record_id: 'rec-project-2', fields: { 项目名称: 'Archive', 目标: '旧项目' } },
        ],
        tasks: [{ record_id: 'rec-task-1', fields: { 任务: '补齐 Vue 页面', 所属项目: [{ record_id: 'rec-project-1' }], 状态: '未开始' } }],
        reviews: [], members: [],
      },
      fields: {
        projects: [
          { field_id: 'p-title', field_name: '项目名称', type: 1 },
          { field_id: 'p-body', field_name: '目标', type: 1 },
          { field_id: 'p-status', field_name: '状态', type: 3 },
        ],
        tasks: [
          { field_id: 't-title', field_name: '任务', type: 1 },
          { field_id: 't-project', field_name: '所属项目', type: 18 },
          { field_id: 't-status', field_name: '状态', type: 3, property: { options: [{ name: '未开始' }, { name: '进行中' }] } },
        ],
      },
      bindings: { projects: { title: 'p-title', body: 'p-body', status: 'p-status' }, tasks: { title: 't-title', project: 't-project', status: 't-status' } },
      tableErrors: {}, ready: true, loading: false, saving: false, error: '', writeError: '',
      lastRead: Date.now(), cacheUpdatedAt: null, usingCache: false,
    }
    const wrapper = mountPage()
    await vi.waitFor(() => expect(wrapper.find('.feishu-record-card').exists()).toBe(true))

    expect(wrapper.get('[aria-label="飞书项目列表"]').text()).toContain('Calmy')
    expect(wrapper.get('[aria-label="飞书项目列表"]').text()).toContain('飞书完成度：— · 已读取 1 项关联任务')
    await wrapper.get('[aria-label="搜索飞书数据"]').setValue('Archive')
    expect(wrapper.get('[aria-label="飞书项目列表"]').text()).toContain('Archive')
    expect(wrapper.get('[aria-label="飞书项目列表"]').text()).not.toContain('Calmy')
    await wrapper.get('[aria-label="搜索飞书数据"]').setValue('Calmy')
    await wrapper.get('[aria-label="飞书项目列表"] button').trigger('click')
    expect(wrapper.get('[aria-label="飞书项目列表"]').text()).toContain('补齐 Vue 页面')
    expect(wrapper.get('[aria-label="补齐 Vue 页面状态"]').attributes('role')).toBe('combobox')
    await wrapper.get('[aria-label="补齐 Vue 页面状态"]').trigger('click')
    expect(wrapper.find('[role="listbox"] [role="option"][data-value="进行中"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('项目、周报和成员只读')
  })
})
