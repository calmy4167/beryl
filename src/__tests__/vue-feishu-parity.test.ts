import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sync } from '@/core/sync'
import { feishuWorkspace } from '@/domain/feishu/workspace-instance'
import FeishuPage from '@/vue/pages/FeishuPage.vue'

const fixtures = vi.hoisted(() => ({
  tasks: [{ record_id: 'rec-task-1', fields: { '任务': '写迁移计划', '状态': '未开始', '截止时间': '' } }] as Array<{record_id:string;fields:Record<string,unknown>}>,
  projects: [{ record_id: 'rec-project-1', fields: { '项目名称': '迁移项目', '目标': '保持当前路线', '状态': '进行中', '项目截止时间': '' } }] as Array<{record_id:string;fields:Record<string,unknown>}>,
  updates: [] as Array<{ id: string; fields: Record<string,unknown> }>,
}))
vi.mock('@/core/api/feishu', () => ({
  getFeishuStatus: vi.fn(async () => ({ ok:true,provider:'feishu-bitable',authMode:'tenant_access_token',configured:true,appIdConfigured:true,appSecretConfigured:true,baseTokenConfigured:true,workspaceId:'workspace-test',tables:{tasks:true,projects:true,reviews:true,members:true} })),
  getFeishuSchema: vi.fn(async () => ({ ok:true,tables:{
    tasks:{items:[{field_id:'title',field_name:'任务',type:1},{field_id:'status',field_name:'状态',type:3,property:{options:[{name:'未开始'},{name:'进行中'},{name:'已完成'}]}},{field_id:'due',field_name:'截止时间',type:5},{field_id:'project',field_name:'所属项目',type:18}]},
    projects:{items:[{field_id:'project-title',field_name:'项目名称',type:1},{field_id:'project-body',field_name:'目标',type:1},{field_id:'project-status',field_name:'状态',type:3,property:{options:[{name:'进行中'}]}},{field_id:'project-due',field_name:'项目截止时间',type:5}]},
    reviews:{items:[{field_id:'review-title',field_name:'汇报标题',type:1}]},
    members:{items:[{field_id:'member-title',field_name:'成员名',type:1}]},
  } })),
  listAllFeishuRecords: vi.fn(async (_config: unknown, table: string) => ({ ok:true,items:table==='tasks'?fixtures.tasks:table==='projects'?fixtures.projects:[],has_more:false,total:table==='tasks'?fixtures.tasks.length:table==='projects'?fixtures.projects.length:0 })),
  createFeishuRecord: vi.fn(async (_config:unknown,_table:string,fields:Record<string,unknown>) => { const record={record_id:'rec-task-new',fields};fixtures.tasks.push(record);return {ok:true,record} }),
  updateFeishuRecord: vi.fn(async (_config:unknown,_table:string,id:string,fields:Record<string,unknown>) => { fixtures.updates.push({id,fields});const record=fixtures.tasks.find(item=>item.record_id===id);if(record)Object.assign(record.fields,fields);return {ok:true,record} }),
}))

let wrapper: VueWrapper | undefined
async function openFeishu() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app/feishu', component: FeishuPage }, { path: '/app/admin', component: { template: '<h1>设置</h1>' } }] })
  await router.push('/app/feishu'); await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}
describe('Vue Feishu parity', () => {
  it('uses the React native select treatment for project and status fields', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/controls.css'), 'utf8')
    const match = css.match(/html\.tactile-ui #app \.page-container \.feishu-page select\s*\{([^}]+)\}/)
    expect(match?.[1]).toContain('padding: 9px 11px;')
    expect(match?.[1]).toContain('background-image: none;')
    expect(match?.[1]).toContain('appearance: auto;')
    expect(css).toMatch(/html\.tactile-ui #app \.page-container :is\([^)]*\.feishu-page[^)]*\) select:disabled\s*\{[^}]*opacity: \.7;/s)
  })
  beforeEach(() => { localStorage.clear(); sync.saved.cloud = null; fixtures.tasks.splice(0,fixtures.tasks.length,{record_id:'rec-task-1',fields:{'任务':'写迁移计划','状态':'未开始','截止时间':'','所属项目':['rec-project-1']}});fixtures.projects.splice(0,fixtures.projects.length,{record_id:'rec-project-1',fields:{'项目名称':'迁移项目','目标':'保持当前路线','状态':'进行中','项目截止时间':''}});fixtures.updates.length=0 })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined })
  it('shows connection setup state and keeps all four table views reachable', async () => {
    const page = await openFeishu()
    expect(page.get('[aria-label="飞书连接状态"]').text()).toContain('飞书未连接')
    expect(page.get('[role="alert"]').text()).toContain('Worker 地址与同步密码')
    expect(page.findAll('[aria-label="飞书数据表"] [role="tab"]')).toHaveLength(4)
    await page.findAll('[aria-label="飞书数据表"] [role="tab"]')[2].trigger('click')
    expect(page.find('[aria-label="飞书周报列表"]').exists()).toBe(true)
  })
  it('keeps the forced Feishu source button enabled like 迁移前界面基线', async () => {
    const page = await openFeishu()
    const sources = page.findAll('[aria-label="选择数据来源"] button')
    expect(sources).toHaveLength(2)
    expect(sources[0].attributes('disabled')).toBeDefined()
    expect(sources[1].attributes('disabled')).toBeUndefined()
  })
  it('preserves legacy source-bar spacing and separate table-label/count text nodes', async () => {
    const page = await openFeishu()
    const segments = (element: Element) => [...element.childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE && node.textContent !== '')
      .map(node => node.textContent)

    expect(page.get('.workspace-source small').element.textContent).toBe('任务直接保存在飞书；前台每 15 秒检查更新。 此工作台始终显示飞书。')
    const expected = [['任务', ' ', '0'], ['项目', ' ', '0'], ['周报', ' ', '0'], ['成员', ' ', '0']]
    expect(page.findAll('[aria-label="飞书数据表"] [role="tab"]').map(tab => segments(tab.element))).toEqual(expected)
  })
  it('provides a refresh action while offline', async () => {
    const page = await openFeishu()
    const refresh = page.get('[aria-label="飞书连接状态"] button')
    expect(refresh.attributes('disabled')).toBeUndefined()
    await refresh.trigger('click'); await flushPromises()
    expect(page.get('[role="alert"]').text()).toContain('Worker 地址与同步密码')
  })
  it('loads task records and writes a selected status through the Feishu workspace service', async () => {
    sync.saved.cloud = { url:'https://worker.example',key:'test-key' }
    const page = await openFeishu()
    await flushPromises()
    expect(page.get('[aria-label="飞书任务看板"]').text()).toContain('写迁移计划')
    expect(feishuWorkspace.getSnapshot().tables.tasks.map(task => task.fields['任务'])).toContain('写迁移计划')
    expect(page.get('[aria-label="飞书任务关联项目"]').element.tagName).toBe('SELECT')
    expect(page.get('[aria-label="写迁移计划状态"]').element.tagName).toBe('SELECT')
    await page.get('[aria-label="写迁移计划状态"]').setValue('进行中')
    await flushPromises()
    expect(fixtures.updates).toContainEqual({id:'rec-task-1',fields:{'状态':'进行中'}})
  })
  it('expands and collapses the linked task card from a project action button', async () => {
    sync.saved.cloud = { url:'https://worker.example',key:'test-key' }
    const page = await openFeishu()
    await page.findAll('[aria-label="飞书数据表"] [role="tab"]')[1].trigger('click')
    await flushPromises()

    const toggle = page.get('.feishu-record-card button[aria-expanded]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(page.find('.feishu-record-card details').exists()).toBe(false)
    await toggle.trigger('click')
    await flushPromises()
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(page.get('.feishu-project-tasks .task-board-card h3').text()).toBe('写迁移计划')
    expect(page.find('.feishu-project-tasks [aria-label="写迁移计划状态"]').exists()).toBe(true)
    await toggle.trigger('click')
    expect(page.find('.feishu-project-tasks').exists()).toBe(false)
  })
})
