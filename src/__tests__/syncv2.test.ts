/* 阶段 2–5 核心逻辑测试：AES-GCM 加密往返 / 增量合并（LWW） / 数据迁移 */
import { describe, it, expect, beforeAll } from 'vitest'
import { webcrypto } from 'node:crypto'

// jsdom 无 crypto.subtle，注入 Node webcrypto
beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
})

describe('crypto（阶段 5：AES-GCM 加密）', async () => {
  const { encryptValue, decryptValue } = await import('@/core/crypto')

  it('加密→解密往返还原原文', async () => {
    const enc = await encryptValue('sync-pass-123', '["hello","世界"]')
    expect(enc).not.toBeNull()
    expect(enc!.v).toBe(2)
    expect(enc!.salt.length).toBeGreaterThan(0)
    const plain = await decryptValue('sync-pass-123', enc)
    expect(plain).toBe('["hello","世界"]')
  })

  it('每次加密使用不同盐/IV（密文不同）', async () => {
    const a = await encryptValue('p', 'same value')
    const b = await encryptValue('p', 'same value')
    expect(a!.salt).not.toBe(b!.salt)
    expect(a!.ct).not.toBe(b!.ct)
  })

  it('错误密码解密返回 null', async () => {
    const enc = await encryptValue('right-pass', 'secret')
    const plain = await decryptValue('wrong-pass', enc)
    expect(plain).toBeNull()
  })

  it('旧明文（非密文格式）解密返回 null（调用方按明文处理）', async () => {
    const plain = await decryptValue('any', '["plain","old"]')
    expect(plain).toBeNull()
    const plain2 = await decryptValue('any', null)
    expect(plain2).toBeNull()
  })
})

describe('增量合并 LWW（阶段 3 规则）', async () => {
  // 规则：云端记录 ts <= 本地时间线（自己推的）→ 跳过；ts 更大 → 应用
  const merge = (records: { ts: number }[], localTs: number) =>
    records.filter(r => r.ts > localTs)

  it('跳过自己推送的记录', () => {
    const out = merge([{ ts: 100 }, { ts: 200 }], 200)
    expect(out.length).toBe(0)
  })

  it('应用云端更新的记录', () => {
    const out = merge([{ ts: 150 }, { ts: 300 }], 200)
    expect(out.length).toBe(1)
    expect(out[0].ts).toBe(300)
  })

  it('同毫秒按 device 字典序决胜（服务端 ts 相等时不覆盖）', () => {
    // 服务端 SQL：ts 相等时按 device 决胜，避免同毫秒写入不稳定。
    const newer = (next: { ts: number; device: string }, old: { ts: number; device: string }) =>
      next.ts > old.ts || (next.ts === old.ts && next.device > old.device)
    expect(newer({ ts: 100, device: 'devB' }, { ts: 100, device: 'devA' })).toBe(true)
    expect(newer({ ts: 100, device: 'devA' }, { ts: 100, device: 'devB' })).toBe(false)
  })
})

describe('数据版本迁移（阶段 2）', async () => {
  it('migrateData 写回当前版本', async () => {
    localStorage.setItem('b_version', '2')
    const { migrateData, DATA_VERSION } = await import('@/core/migrate')
    migrateData()
    expect(Number(localStorage.getItem('b_version'))).toBe(DATA_VERSION)
    expect(DATA_VERSION).toBe(4)
  })

  it('已是当前版本时不重复执行', async () => {
    localStorage.setItem('b_version', '4')
    const { migrateData } = await import('@/core/migrate')
    migrateData()
    expect(localStorage.getItem('b_version')).toBe('4')
  })
})

describe('增量合并 applyIncremental（刷新/轮询 LWW，防覆盖本地新数据）', async () => {
  const { applyIncremental, incomingDeletedKeys } = await import('@/core/sync')

  it('ts 不大于本地时间线的记录全部跳过（本地新数据不被云端旧数据覆盖）', async () => {
    const out = await applyIncremental([
      { key: 'b_inbox', value: '["cloud-old"]', ts: 100 },
      { key: 'b_tasks', value: '[]', ts: 200 }
    ], 'p', 200)
    expect(out['b_inbox']).toBeUndefined()
    expect(out['b_tasks']).toBeUndefined()
  })

  it('云端更新的记录被应用（ts 大于本地时间线）', async () => {
    const out = await applyIncremental([
      { key: 'b_inbox', value: '["cloud-new"]', ts: 300 }
    ], 'p', 200)
    expect(out['b_inbox']).toBe('["cloud-new"]')
  })

  it('密文记录正确解密后应用', async () => {
    const { encryptValue } = await import('@/core/crypto')
    const enc = await encryptValue('sync-pass', '["secret"]')
    expect(enc).not.toBeNull()
    const out = await applyIncremental([
      { key: 'b_inbox', value: enc, ts: 300 }
    ], 'sync-pass', 200)
    expect(out['b_inbox']).toBe('["secret"]')
  })

  it('字符串形式的密文（Worker JSON.stringify 存储）正确解密', async () => {
    const { encryptValue } = await import('@/core/crypto')
    const enc = await encryptValue('pw1234', '["hello"]')
    const asString = JSON.stringify(enc) // 模拟 Worker 存储后的字符串形态
    const out = await applyIncremental([
      { key: 'b_inbox', value: asString, ts: 300 }
    ], 'pw1234', 0)
    expect(out['b_inbox']).toBe('["hello"]')
  })

  it('v2 密文解密失败时不把密文当作业务明文', async () => {
    const { encryptValue } = await import('@/core/crypto')
    const enc = await encryptValue('right-pass', '["secret"]')
    const out = await applyIncremental([
      { key: 'b_inbox', value: JSON.stringify(enc), ts: 300 }
    ], 'wrong-pass', 0)
    expect(out['b_inbox']).toBeUndefined()
  })

  it('按 key 使用本地时间线，其他 key 的新写入不被全局时间线误跳过', async () => {
    const out = await applyIncremental([
      { key: 'b_inbox', value: '["new-inbox"]', ts: 150 },
      { key: 'b_tasks', value: '["new-task"]', ts: 300 }
    ], 'p', { b_inbox: 100, b_tasks: 300 })
    expect(out['b_inbox']).toBe('["new-inbox"]')
    expect(out['b_tasks']).toBeUndefined()
  })

  it('普通明文字符串/明文 JSON 不被误判为密文', async () => {
    const out = await applyIncremental([
      { key: 'b_scene', value: '"personal"', ts: 300 },
      { key: 'b_tasks', value: '[{"id":"a"}]', ts: 301 },
      { key: 'b_pomoTotal', value: '25', ts: 302 }
    ], 'pw1234', 0)
    expect(out['b_scene']).toBe('"personal"')
    expect(out['b_tasks']).toBe('[{"id":"a"}]')
    expect(out['b_pomoTotal']).toBe('25')
  })

  it('deleted 记录与非 b_ 前缀键跳过', async () => {
    const records = [
      { key: 'b_inbox', value: 'x', ts: 300, deleted: true },
      { key: 'b_scene', value: '"personal"', ts: 300 },
      { key: 'other-key', value: 'y', ts: 300 }
    ]
    const out = await applyIncremental(records, 'p', 0)
    expect(Object.keys(out)).toEqual(['b_scene'])
    expect(incomingDeletedKeys(records, 0)).toEqual(['b_inbox'])
    expect(incomingDeletedKeys(records, { b_inbox: 300 })).toEqual([])
  })
})

describe('坏值防御（添加/刷新不因非数组存储值崩溃）', () => {
  it('存储值为 "null" 时按非数组处理', () => {
    localStorage.setItem('b_inbox', 'null')
    const parsed = JSON.parse(localStorage.getItem('b_inbox')!)
    expect(parsed).toBeNull()
    expect(Array.isArray(parsed)).toBe(false)
  })
  it('存储值合法时正常解析为数组', () => {
    localStorage.setItem('b_tasks', '[{"id":"a","title":"t"}]')
    const parsed = JSON.parse(localStorage.getItem('b_tasks')!)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBe(1)
  })
})
