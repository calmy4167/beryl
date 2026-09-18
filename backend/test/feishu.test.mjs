import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FeishuApiError, feishuStatus, listFeishuRecords, createFeishuRecord } from '../src/lib/feishu.js'
import { handleFeishuRecords } from '../src/routes/feishu.js'

function config(id) {
  return {
    FEISHU_APP_ID: `test-app-${id}`,
    FEISHU_APP_SECRET: 'test-secret-not-for-production',
    FEISHU_BASE_TOKEN: 'test-base',
    FEISHU_TABLE_TASKS: 'test-tasks',
    FEISHU_TABLE_MEMBERS: 'test-members',
  }
}

const response = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
const authResponse = () => response({ code: 0, tenant_access_token: 'test-token', expire: 7200 })

test('status reveals only configuration flags, never credential values', () => {
  const env = config('status')
  const status = feishuStatus(env)
  assert.equal(status.configured, true)
  assert.equal(status.tables.members, true)
  assert.equal(status.tables.projects, false)
  const serialized = JSON.stringify(status)
  for (const secret of [env.FEISHU_APP_ID, env.FEISHU_APP_SECRET, env.FEISHU_BASE_TOKEN]) assert.equal(serialized.includes(secret), false)
})

test('unknown and inherited table keys are rejected before requesting Feishu', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('unexpected fetch') })
  for (const key of ['other', 'constructor', '__proto__']) {
    await assert.rejects(listFeishuRecords(config('allowlist'), key, new URL('https://calmy.test/api/feishu/records')), error => error instanceof FeishuApiError && error.status === 400)
  }
  assert.equal(calls, 0)
})

test('Feishu application errors inside HTTP 200 are returned as upstream failures', async t => {
  t.mock.method(globalThis, 'fetch', async url => String(url).includes('/auth/') ? authResponse() : response({ code: 1254302, msg: 'Permission denied' }))
  await assert.rejects(listFeishuRecords(config('error'), 'tasks', new URL('https://calmy.test/api/feishu/records')), error => error instanceof FeishuApiError && error.status === 502 && error.code === 'FEISHU_1254302')
})

test('member records use only their configured table and preserve pagination', async t => {
  let dataUrl
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).includes('/auth/')) return authResponse()
    dataUrl = new URL(url)
    return response({ code: 0, data: { items: [{ record_id: 'recMember', fields: {} }], has_more: true, page_token: 'next-page' } })
  })
  const data = await listFeishuRecords(config('members'), 'members', new URL('https://calmy.test/api/feishu/records?page_size=9999&page_token=current-page'))
  assert.equal(dataUrl.pathname.endsWith('/tables/test-members/records'), true)
  assert.equal(dataUrl.searchParams.get('page_size'), '500')
  assert.equal(dataUrl.searchParams.get('page_token'), 'current-page')
  assert.equal(data.has_more, true)
  assert.equal(data.page_token, 'next-page')
})

test('task writes pass fields to Feishu without including the app secret', async t => {
  let write
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).includes('/auth/')) return authResponse()
    write = init
    return response({ code: 0, data: { record: { record_id: 'recTest' } } })
  })
  await createFeishuRecord(config('create'), 'tasks', { 任务: '本地模拟任务', 状态: '未开始' })
  assert.equal(write.method, 'POST')
  assert.deepEqual(JSON.parse(write.body), { fields: { 任务: '本地模拟任务', 状态: '未开始' } })
  assert.equal(write.body.includes('test-secret'), false)
})

test('unauthenticated Worker requests cannot trigger any Feishu call', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('unexpected fetch') })
  const env = {
    ...config('guard'),
    BERYL_D1: { prepare: () => ({ run: async () => ({}), first: async () => ({ hash: 'existing-password-hash' }) }) },
  }
  const result = await handleFeishuRecords(new Request('https://calmy.test/api/feishu/records?table=tasks'), env)
  assert.equal(result.status, 401)
  assert.equal(calls, 0)
})
