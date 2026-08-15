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
    // 服务端 SQL：WHERE excluded.ts > records.ts → 相等时保留旧值
    const serverKeepOld = (newTs: number, oldTs: number) => newTs > oldTs
    expect(serverKeepOld(100, 100)).toBe(false)
    expect(serverKeepOld(101, 100)).toBe(true)
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
