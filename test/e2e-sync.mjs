/* ================================================================
 * Beryl 同步协议端到端自测（node 直跑，无需浏览器）
 * 用法：node test/e2e-sync.mjs
 * 验证：Worker(D1) 的 setup/push/pull、前端加密协议、LWW、
 *       "电脑 push → 手机 pull" 全链路
 * ================================================================ */
import { DatabaseSync } from 'node:sqlite'
import { webcrypto } from 'node:crypto'
import worker from '../backend/src/worker.js'

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✅', name) }
  else { fail++; console.log('  ❌', name, extra) }
}

/* ---------- 前端加密（与 src/core/crypto.ts 同算法） ---------- */
const enc = new TextEncoder()
const toHex = (b) => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('')
const fromHex = (h) => new Uint8Array(h.match(/.{2}/g).map(x => parseInt(x, 16)))
async function encryptValue(password, plain) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16))
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  const key = await webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    await webcrypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']),
    { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  const ct = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain))
  return { v: 2, salt: toHex(salt), iv: toHex(iv), ct: toHex(new Uint8Array(ct)) }
}
async function decryptValue(password, payload) {
  try {
    if (!payload || payload.v !== 2) return null
    const key = await webcrypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: fromHex(payload.salt), iterations: 100000, hash: 'SHA-256' },
      await webcrypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']),
      { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
    const pt = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: fromHex(payload.iv) }, key, fromHex(payload.ct))
    return new TextDecoder().decode(pt)
  } catch { return null }
}

/* ---------- 真实 SQLite 模拟 D1 ---------- */
function makeD1() {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE records (key TEXT PRIMARY KEY, value TEXT NOT NULL, ts INTEGER NOT NULL, device TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)')
  db.exec('CREATE TABLE auth (id INTEGER PRIMARY KEY CHECK (id = 1), hash TEXT NOT NULL)')
  return {
    prepare(sql) {
      return {
        args: [],
        bind(...args) { this.args = args; return this },
        async run() { db.prepare(sql).run(...this.args); return { success: true } },
        async first() { return db.prepare(sql).get(...this.args) ?? null },
        async all() { return { results: db.prepare(sql).all(...this.args) } }
      }
    },
    async batch(stmts) { db.exec('BEGIN'); for (const s of stmts) await s.run(); db.exec('COMMIT') }
  }
}

/* ---------- mock Worker 环境 ---------- */
function makeEnv(d1, withKv = false) {
  const kv = new Map()
  if (withKv) {
    kv.set('data', JSON.stringify({ b_inbox: '[{"id":"old","text":"KV旧数据","date":"2026-01-01"}]' }))
    kv.set('auth', 'kv-password-hash')
  }
  return {
    BERYL_D1: d1,
    BERYL_KV: withKv ? {
      async get(k) { return kv.get(k) ?? null },
      async getWithMetadata(k) {
        const v = kv.get(k)
        return v == null ? null : { value: v, metadata: null }
      },
      async put(k, v) { kv.set(k, v) }
    } : undefined,
    ASSETS: { async fetch() { return new Response('static') } }
  }
}

async function call(env, method, path, body, password) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (password !== undefined) headers['Authorization'] = 'Bearer ' + password
  const req = new Request('https://test.pages.dev' + path, {
    method, headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  const res = await worker.fetch(req, env)
  let json = null
  try { json = await res.json() } catch { /* ignore */ }
  return { status: res.status, json }
}

/* ---------- 前端同步协议（与 sync.ts cloudPush/cloudPull 同构） ---------- */
async function clientPush(env, password, changes) {
  const body = { changes: await Promise.all(changes.map(async c => ({
    key: c.key, ts: c.ts, device: c.device,
    value: c.deleted ? null : await encryptValue(password, c.value),
    deleted: Boolean(c.deleted)
  }))) }
  const r = await call(env, 'POST', '/api/sync/push', body, password)
  return r
}
async function clientPull(env, password, since, sinceDevice = '', sinceKey = '') {
  const r = await call(env, 'POST', '/api/sync/pull', { since, sinceDevice, sinceKey }, password)
  if (r.status !== 200 || !r.json || !r.json.ok) return r
  const out = {}
  for (const rec of r.json.records) {
    if (rec.deleted) continue
    // 与前端 decryptRecordValue 相同逻辑：字符串可能是 JSON 序列化的密文
    let payload = rec.value
    if (typeof payload === 'string') {
      try {
        const p = JSON.parse(payload)
        if (p && typeof p === 'object' && p.v === 2) payload = p
        else { out[rec.key] = payload; continue }
      } catch { out[rec.key] = payload; continue }
    }
    const plain = await decryptValue(password, payload)
    out[rec.key] = plain ?? (typeof rec.value === 'string' ? rec.value : null)
  }
  return { status: r.status, data: out, maxTs: r.json.maxTs, nextCursor: r.json.nextCursor, raw: r.json }
}
async function entityPush(env, password, changes) {
  return call(env, 'POST', '/api/entity-sync/push', { changes }, password)
}
async function entityPull(env, password, cursor = { since: 0, sinceDevice: '', sinceEntity: '', sinceEntityId: '' }) {
  return call(env, 'POST', '/api/entity-sync/pull', cursor, password)
}

/* ================================================================ */
console.log('▶ Beryl 同步协议端到端自测\n')

/* 场景 1：全新 D1，setup 密码 → 电脑 push → 手机 pull */
console.log('场景 1：新部署 D1（无密码）→ setup → 电脑 push → 手机 pull')
{
  const env = makeEnv(makeD1())
  const r1 = await call(env, 'POST', '/api/setup', { password: 'sync-pass-1' })
  check('setup 成功', r1.status === 200 && r1.json.ok === true)
  const r2 = await call(env, 'POST', '/api/setup', { password: 'again' })
  check('重复 setup 被拒绝', r2.status === 400 && r2.json.error === 'already-setup')

  const push = await clientPush(env, 'sync-pass-1', [
    { key: 'b_inbox', ts: 1000, device: 'devA', value: '[{"id":"1","text":"你好世界","date":"2026-08-15"}]' },
    { key: 'b_scene', ts: 1001, device: 'devA', value: '"personal"' }
  ])
  check('电脑 push 成功', push.status === 200 && push.json.ok === true)

  const pull = await clientPull(env, 'sync-pass-1', 0)
  console.log('    [debug] pull.status:', pull.status, 'records:', JSON.stringify(pull.raw ? pull.raw.records : null).slice(0, 160), 'maxTs:', pull.maxTs)
  check('手机 pull 成功', pull.status === 200 && pull.data.b_inbox != null)
  check('手机拿到电脑数据（收件箱内容一致）', pull.data.b_inbox === '[{"id":"1","text":"你好世界","date":"2026-08-15"}]')
  check('手机拿到场景', pull.data.b_scene === '"personal"')
  check('云端 maxTs 正确', pull.maxTs === 1001)
}

/* 场景 2：鉴权——错误密码 401 */
console.log('场景 2：鉴权（错误密码拒绝）')
{
  const env = makeEnv(makeD1())
  await call(env, 'POST', '/api/setup', { password: 'correct-pass' })
  const r = await clientPull(env, 'wrong-pass', 0)
  check('错误密码 pull 返回 401', r.status === 401)
}

/* 场景 3：LWW——旧数据不覆盖新数据 */
console.log('场景 3：LWW 决胜（旧 ts 不覆盖）')
{
  const env = makeEnv(makeD1())
  await call(env, 'POST', '/api/setup', { password: 'pass1234' })
  await clientPush(env, 'pass1234', [{ key: 'b_tasks', ts: 2000, device: 'devA', value: '["new-task"]' }])
  await clientPush(env, 'pass1234', [{ key: 'b_tasks', ts: 1000, device: 'devA', value: '["old-task"]' }])
  const pull = await clientPull(env, 'pass1234', 0)
  check('新数据保留（旧 ts 被拒绝）', pull.data.b_tasks === '["new-task"]')
}

/* 场景 3b：键级 tombstone——删除可上云、可下发，且旧值不能复活 */
console.log('场景 3b：键级 tombstone（删除跨设备传播）')
{
  const env = makeEnv(makeD1())
  await call(env, 'POST', '/api/setup', { password: 'delete-pass' })
  await clientPush(env, 'delete-pass', [{ key: 'b_tasks', ts: 3000, device: 'devA', value: '["keep"]' }])
  const deleted = await clientPush(env, 'delete-pass', [{ key: 'b_tasks', ts: 3001, device: 'devA', value: null, deleted: true }])
  check('键级删除 push 成功', deleted.status === 200 && deleted.json.ok === true)
  await clientPush(env, 'delete-pass', [{ key: 'b_tasks', ts: 3000, device: 'devA', value: '["stale"]' }])
  const pull = await clientPull(env, 'delete-pass', 0)
  const tombstone = pull.raw?.records?.find(r => r.key === 'b_tasks')
  check('手机 pull 收到键级 tombstone', tombstone?.deleted === true)
  check('旧值不能在 tombstone 后复活', pull.data.b_tasks === undefined)
}

/* 场景 4：前端合并——本地新数据不被云端旧数据覆盖（applyIncremental 规则） */
console.log('场景 4：前端 LWW 合并（刷新不丢本地数据）')
{
  const env = makeEnv(makeD1())
  await call(env, 'POST', '/api/setup', { password: 'pass1234' })
  // 云端有旧数据 ts=500；本地时间线=500，本地刚添加 ts=600（未推送）
  await clientPush(env, 'pass1234', [{ key: 'b_inbox', ts: 500, device: 'cloud', value: '[{"id":"c","text":"云端旧","date":"x"}]' }])
  const pull = await clientPull(env, 'pass1234', 0)
  // 前端逻辑：仅应用 ts > localTs(500) 的记录 → 云端记录 ts=500 被跳过
  const localTs = 500
  const incoming = {}
  for (const rec of pull.raw.records) {
    if (rec.deleted) continue
    if (rec.ts <= localTs) continue
    let payload = rec.value
    if (typeof payload === 'string') {
      try { const p = JSON.parse(payload); if (p && typeof p === 'object' && p.v === 2) payload = p; else { incoming[rec.key] = payload; continue } }
      catch { incoming[rec.key] = payload; continue }
    }
    const plain = await decryptValue('pass1234', payload)
    incoming[rec.key] = plain ?? null
  }
  check('云端 ts<=本地时间线的记录被跳过（本地新数据不丢）', Object.keys(incoming).length === 0)
}

/* 场景 5：KV 退役后不再作为认证或数据回退 */
console.log('场景 5：KV 退役后不再作为认证或数据回退')
{
  const env = makeEnv(makeD1(), true)
  const pull = await clientPull(env, 'kv-password-hash', 0) // KV auth 哈希即密码（简化模拟）
  check('KV 密码不再作为认证回退', pull.status === 401)
  const r = await call(env, 'GET', '/api/data')
  check('未配置 D1 认证时旧数据接口拒绝访问', r.status === 401)
}

/* 场景 6：同毫秒游标按 device/key 继续分页，不跳过同 ts 记录 */
console.log('场景 6：复合游标（同毫秒记录不丢失）')
{
  const env = makeEnv(makeD1())
  await call(env, 'POST', '/api/setup', { password: 'cursor-pass' })
  await clientPush(env, 'cursor-pass', [
    { key: 'b_page_a', ts: 5000, device: 'devA', value: '"a"' },
    { key: 'b_page_b', ts: 5000, device: 'devB', value: '"b"' },
    { key: 'b_page_c', ts: 5001, device: 'devA', value: '"c"' }
  ])
  const page = await clientPull(env, 'cursor-pass', 5000, 'devA', 'b_page_a')
  check('同 ts 的后续记录仍可拉取', page.data.b_page_b === '"b"')
  check('复合游标推进到最后一条', page.nextCursor && page.nextCursor.ts === 5001 && page.nextCursor.key === 'b_page_c')
}

/* 场景 7：实体级兼容层（不改变默认键级同步） */
console.log('场景 7：实体级同步兼容层（LWW + tombstone）')
{
  const env = makeEnv(makeD1())
  await call(env, 'POST', '/api/setup', { password: 'entity-pass' })
  const kvStatus = await call(env, 'GET', '/api/kv-status', undefined, 'entity-pass')
  check('KV 退役状态可鉴权查询', kvStatus.status === 200 && kvStatus.json.ok === true && kvStatus.json.d1Auth === 1)
  const pushed = await entityPush(env, 'entity-pass', [
    { entity: 'tasks', entityId: 'task-1', value: { id: 'task-1', title: '实体任务' }, updatedAt: 7000, device: 'devA' },
    { entity: 'tasks', entityId: 'task-2', value: { id: 'task-2' }, updatedAt: 7001, device: 'devA', deleted: true }
  ])
  check('实体 push 成功', pushed.status === 200 && pushed.json.ok === true)
  const pulled = await entityPull(env, 'entity-pass')
  check('实体 pull 返回创建与删除记录', pulled.status === 200 && pulled.json.records.length === 2)
  check('实体删除以 tombstone 传输', pulled.json.records.find(r => r.entityId === 'task-2')?.deleted === true)
  const stale = await entityPush(env, 'entity-pass', [{ entity: 'tasks', entityId: 'task-1', value: { id: 'task-1', title: '旧' }, updatedAt: 6999, device: 'devB' }])
  const after = await entityPull(env, 'entity-pass')
  check('实体旧版本不覆盖新版本', stale.status === 200 && after.json.records.find(r => r.entityId === 'task-1')?.value?.includes('实体任务'))
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
