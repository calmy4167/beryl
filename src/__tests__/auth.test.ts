import { describe, it, expect, beforeEach } from 'vitest'
import {
  createAuthRecord, ensureAuth, verifyPassword,
  writeSession, writeServerSession, readServerSession, readSession, clearSession,
  isLocked, registerFail, resetFails
} from '../core/auth'

describe('auth', () => {
  beforeEach(() => { localStorage.clear(); resetFails() })

  it('does not create local credentials when authentication must come from the server', async () => {
    await expect(ensureAuth()).rejects.toThrow('server-auth-required')
  })

  it('verifyPassword：正确密码通过、错误拒绝', async () => {
    const rec = await createAuthRecord('me', 'secret123', false)
    expect(await verifyPassword(rec, 'secret123')).toBe(true)
    expect(await verifyPassword(rec, 'wrong')).toBe(false)
    // 哈希不落明文
    expect(JSON.stringify(rec)).not.toContain('secret123')
  })

  it('does not treat legacy local credentials as server authentication', async () => {
    localStorage.setItem('b_auth', '{"u":"calmy","p":"cy2024"}')
    await expect(ensureAuth()).rejects.toThrow('server-auth-required')
    expect(readSession()).toBeNull()
    expect(localStorage.getItem('b_auth')).toContain('"p"')
  })

  it('accepts only a server-issued session and clears it from the current tab', () => {
    writeSession('me')
    expect(readSession()).toBeNull()
    writeServerSession({
      token: 'server-token', apiOrigin: 'https://api.example.test', expiresAt: Date.now() + 60_000,
      user: { id: 'user-1', username: 'me', displayName: 'Me', role: 'user' }, mustChangePassword: false
    })
    expect(readServerSession()?.user.id).toBe('user-1')
    expect(readSession()?.u).toBe('me')
    clearSession()
    expect(readSession()).toBeNull()
    localStorage.setItem('b_session', JSON.stringify({ u: 'me', ts: Date.now() - 31 * 86400000 }))
    expect(readSession()).toBeNull()
    expect(localStorage.getItem('b_session')).toBeNull()
  })

  it('失败锁定：5 次后锁定', () => {
    expect(isLocked()).toBe(false)
    for (let i = 0; i < 5; i++) registerFail()
    expect(isLocked()).toBe(true)
  })
})
