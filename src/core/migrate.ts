/* ============ 数据版本迁移机制（对齐 v1 文档 §6.2） ============
 * b_version 驱动：启动时若低于当前版本，依次执行 MIGRATIONS[v] 后写回新版本。
 * v2 平移自 v1（数据已是 v4 格式），v1→v4 的转换由兼容解析（safeParse）天然覆盖，
 * 此机制保证未来数据结构变更时有标准升级通道。
 */
import { lsGet, lsSet } from './storage.ts'

/** 当前数据版本（与 v1 的 b_version=4 对齐） */
export const DATA_VERSION = 4

interface Migration {
  desc: string
  run: () => void
}

const MIGRATIONS: Record<number, Migration> = {
  1: { desc: 'v1→v2：引入版本号，数据结构无变化', run: () => { /* noop */ } },
  2: {
    desc: 'v2→v3：b_auth 改为 PBKDF2 哈希格式（旧明文由 ensureAuth 惰性升级）',
    run: () => { /* ensureAuth 惰性处理 */ }
  },
  3: {
    desc: 'v3→v4：标量键统一 JSON 字符串存储（safeParse 兼容新旧格式）',
    run: () => { /* 兼容解析覆盖 */ }
  }
}

/** 启动时调用：低版本数据按序升级 */
export function migrateData(): void {
  try {
    const cur = Number(lsGet('b_version'))
    if (!isNaN(cur) && cur >= DATA_VERSION) return
    const start = isNaN(cur) ? 1 : Math.floor(cur)
    for (let v = start; v < DATA_VERSION; v++) {
      const m = MIGRATIONS[v]
      if (m) {
        try { m.run() } catch { /* 单步失败不阻断后续 */ }
      }
    }
    lsSet('b_version', String(DATA_VERSION))
  } catch {
    /* 存储不可用时静默 */
  }
}
