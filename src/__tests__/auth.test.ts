import { describe, it, expect, beforeEach } from 'vitest'
import {
  createAuthRecord, ensureAuth, verifyPassword,
  writeSession, readSession, clearSession,
  isLocked, registerFail, resetFails
} from '../core/auth'

describe('auth', () => {
  beforeEach(() => { localStorage.clear(); resetFails() })

  it('ensureAuth 创建默认凭据（_d 标记）', async () => {
    const rec = await ensureAuth()
    expect(rec.u).toBe('calmy')
    expect(rec._d).toBe(true)
    expect(rec.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('verifyPassword：正确密码通过、错误拒绝', async () => {
    const rec = await createAuthRecord('me', 'secret123', false)
    expect(await verifyPassword(rec, 'secret123')).toBe(true)
    expect(await verifyPassword(rec, 'wrong')).toBe(false)
    // 哈希不落明文
    expect(JSON.stringify(rec)).not.toContain('secret123')
  })

  it('旧版明文 b_auth 惰性升级', async () => {
    localStorage.setItem('b_auth', '{"u":"calmy","p":"cy2024"}')
    const rec = await ensureAuth()
    expect(rec.hash).toBeTruthy()
    expect(localStorage.getItem('b_auth')).not.toContain('"p"')
  })

  it('会话：写入/读取/过期清除', () => {
    writeSession('me')
    expect(readSession()?.u).toBe('me')
    clearSession()
    expect(readSession()).toBeNull()
    localStorage.setItem('b_session', JSON.stringify({ u: 'me', ts: Date.now() - 31 * 86400000 }))
    expect(readSession()).toBeNull()
    expect(localStorage.getItem('b_session')).toBe('')
  })

  it('失败锁定：5 次后锁定', () => {
    expect(isLocked()).toBe(false)
    for (let i = 0; i < 5; i++) registerFail()
    expect(isLocked()).toBe(true)
  })
})
