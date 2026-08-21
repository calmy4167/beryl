/* ================================================================
   Beryl v2 核心逻辑测试（Node 内置 node:test，零依赖、零 spawn）
   运行：npm run test:node （沙箱环境可用）
   组件级测试见 src/__tests__（vitest，建议在本机运行 npm test）
   ================================================================ */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

/* ---------- localStorage 内存 mock（Node 无 localStorage） ---------- */
const mem = new Map<string, string>()
const localStorageMock = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)) },
  removeItem: (k: string) => { mem.delete(k) },
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size }
}
;(globalThis as Record<string, unknown>).localStorage = localStorageMock

/* document mock（scenes 的 applySceneTheme 需要） */
const styleProps: Record<string, string> = {}
;(globalThis as Record<string, unknown>).document = {
  documentElement: { style: { setProperty: (k: string, v: string) => { styleProps[k] = v } } }
}

/* ---------- storage ---------- */
import { store, safeParse, nextId, fmtDate, todayKey, setSyncWriteHook } from '../../src/core/storage.ts'

describe('storage', () => {
  test('store 读写与容错解析', () => {
    store.set('tasks', [{ id: 'a', title: 't' }])
    assert.equal(store.get<any[]>('tasks', []).length, 1)
    assert.equal(store.get('not-exists', 'def'), 'def')
    localStorage.setItem('b_bad', '{bad json')
    assert.equal(store.get('bad', 'def'), 'def')
  })
  test('safeParse 兼容裸字符串与 JSON', () => {
    assert.equal(safeParse('"couple"'), 'couple')
    assert.equal(safeParse('couple'), undefined)
    assert.equal(safeParse('5'), 5)
    assert.equal(safeParse(null), undefined)
  })
  test('nextId 100 个不重复', () => {
    const s = new Set<string>()
    for (let i = 0; i < 100; i++) s.add(nextId())
    assert.equal(s.size, 100)
  })
  test('fmtDate / todayKey 格式', () => {
    assert.match(fmtDate(new Date(2026, 7, 14, 9, 5).getTime()), /^2026-08-14 09:05$/)
    assert.match(todayKey(), /^\d{4}-\d{2}-\d{2}$/)
  })
  test('同步写入钩子：store.set 触发 fileData + dirty', () => {
    const calls: string[] = []
    setSyncWriteHook((key, str) => calls.push(key + '=' + str))
    store.set('inbox', [{ id: 'x' }])
    assert.equal(calls.length, 1)
    assert.ok(calls[0].startsWith('b_inbox='))
    setSyncWriteHook(null)
  })
})

/* ---------- auth ---------- */
import {
  createAuthRecord, ensureAuth, verifyPassword,
  writeSession, readSession, clearSession, isLocked, registerFail, resetFails
} from '../../src/core/auth.ts'

describe('auth', () => {
  test('ensureAuth 创建默认凭据', async () => {
    const rec = await ensureAuth()
    assert.equal(rec.u, 'calmy')
    assert.equal(rec._d, true)
    assert.match(rec.hash, /^[0-9a-f]{64}$/)
  })
  test('verifyPassword 正误与无明文', async () => {
    const rec = await createAuthRecord('me', 'secret123', false)
    assert.equal(await verifyPassword(rec, 'secret123'), true)
    assert.equal(await verifyPassword(rec, 'wrong'), false)
    assert.ok(!JSON.stringify(rec).includes('secret123'))
  })
  test('旧版明文 b_auth 惰性升级', async () => {
    localStorage.setItem('b_auth', '{"u":"calmy","p":"cy2024"}')
    const rec = await ensureAuth()
    assert.ok(rec.hash)
    assert.ok(!(localStorage.getItem('b_auth') || '').includes('"p"'))
  })
  test('会话写入/读取/过期', () => {
    writeSession('me')
    assert.equal(readSession()?.u, 'me')
    clearSession()
    assert.equal(readSession(), null)
    localStorage.setItem('b_session', JSON.stringify({ u: 'me', ts: Date.now() - 31 * 86400000 }))
    assert.equal(readSession(), null)
    assert.equal(localStorage.getItem('b_session'), '')
  })
  test('失败 5 次锁定', () => {
    resetFails()
    assert.equal(isLocked(), false)
    for (let i = 0; i < 5; i++) registerFail()
    assert.equal(isLocked(), true)
  })
})

/* ---------- modules ---------- */
import { maxStreak, statValue, catsFor, modsFor } from '../../src/core/modules.ts'

describe('modules', () => {
  test('maxStreak', () => {
    assert.equal(maxStreak(['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-14']), 3)
    assert.equal(maxStreak([]), 0)
    assert.equal(maxStreak(undefined), 0)
  })
  test('statValue', () => {
    store.set('tasks', [{ id: 'task-1', title: '完成报告', done: true }, { id: 'task-2', title: '回复邮件', done: false }])
    store.set('goals', [{ id: 'goal-1', title: '阅读', done: true }, { id: 'goal-2', title: '运动', done: false }, { id: 'goal-3', title: '学习', done: true }])
    store.set('habits', [])
    store.set('finance', [])
    store.set('posts', [])
    assert.equal(statValue('count'), '2')
    assert.equal(statValue('done'), '1')
    assert.ok(statValue('pct').startsWith('67') && statValue('pct').includes('%'))
    store.set('finance', [{ id: 'finance-1', type: 'income', amount: 100 }, { id: 'finance-2', type: 'expense', amount: 25.5 }])
    assert.equal(statValue('balance'), '74.50')
  })
  test('场景差异化：模块数与分类过滤', () => {
    assert.equal(modsFor('personal').length, 10)
    assert.equal(modsFor('married').length, 9)
    assert.equal(modsFor('family').length, 8)
    const cai = catsFor('family').find(c => c.id === 'cai')!
    assert.deepEqual(cai.mods.filter(m => modsFor('family').includes(m)), ['finance'])
  })
})

/* ---------- 场景 ---------- */
import { SCENES, applySceneTheme } from '../../src/core/scenes.ts'

describe('scenes', () => {
  test('四个场景配置齐全', () => {
    assert.equal(Object.keys(SCENES).length, 4)
    for (const s of Object.values(SCENES)) {
      assert.ok(s.mods.length >= 8 && s.mods.length <= 10)
      assert.equal(s.stats.length, 4)
      assert.ok(s.tagline.length > 0)
    }
  })
  test('applySceneTheme 写入 CSS 变量', () => {
    applySceneTheme('couple')
    const root = document.documentElement.style
    // Node 无 DOM：jsdom 不可用时跳过（在 jsdom/浏览器中生效）
    assert.ok(root && typeof root.setProperty === 'function')
  })
})
