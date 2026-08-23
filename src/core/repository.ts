/**
 * 领域数据的统一入口。
 *
 * 视图和组件只通过 Repository 读写业务集合；底层仍由 storage 适配旧版
 * localStorage 数据，并同步镜像到 IndexedDB、键级同步日志和实体级变更日志。
 * 以后切换 IndexedDB 主存储时，调用方无需改变。
 */
import { flushPendingDbWrites, getDbStatus, readKvSnapshot, type DbRuntimeStatus } from './db.ts'
import { isStoreCacheReady, nextId, store } from './storage.ts'

export type EntityId = string | number

export interface CollectionRepository<T> {
  list(): T[]
  replace(items: T[]): boolean
  create(item: T): T
  update(id: EntityId, updater: (item: T) => T): boolean
  remove(id: EntityId): boolean
  find(id: EntityId): T | undefined
  ready(): Promise<RepositoryReadyStatus>
}

export interface AsyncCollectionRepository<T> {
  list(): Promise<T[]>
  replace(items: T[]): Promise<boolean>
  create(item: T): Promise<T>
  update(id: EntityId, updater: (item: T) => T): Promise<boolean>
  remove(id: EntityId): Promise<boolean>
  find(id: EntityId): Promise<T | undefined>
  ready(): Promise<RepositoryReadyStatus>
}

/**
 * Repository 写入边界的结果。
 *
 * `ready()` 会等待当前已排入 storage/db 的写入链；IndexedDB 降级时仍然
 * resolve，而不是阻断同步 API，调用方可通过 durable/available 判断是否已
 * 落到持久层，pendingWrites 则表示下次启动仍需重放的 outbox 数量。
 */
export interface RepositoryReadyStatus {
  durable: boolean
  state: DbRuntimeStatus['state']
  available: boolean
  pendingWrites: number
  lastError: string | null
}

function toRepositoryReadyStatus(): RepositoryReadyStatus {
  const status = getDbStatus()
  return {
    durable: status.state === 'ready' && status.available && status.pendingWrites === 0,
    state: status.state,
    available: status.available,
    pendingWrites: status.pendingWrites,
    lastError: status.lastError
  }
}

let repositoryFlushChain: Promise<void> = Promise.resolve()
const asyncRepositoryWriteChains = new Map<string, Promise<void>>()

/** 等待所有已排入 Repository/storage 的写入完成，并返回持久化结果。 */
export function flushRepositoryWrites(): Promise<RepositoryReadyStatus> {
  const next = repositoryFlushChain.then(async () => {
    await flushPendingDbWrites()
    return toRepositoryReadyStatus()
  }, async () => {
    await flushPendingDbWrites()
    return toRepositoryReadyStatus()
  })
  repositoryFlushChain = next.then(() => undefined, () => undefined)
  return next
}

/**
 * 读取仍以旧键保存的标量设置，但等待已存在的持久化恢复链完成。
 * 这让计时器等非集合数据也能遵守与 Repository 相同的 durable 边界。
 */
export async function readAsyncStorageValue<T>(key: string, fallback: T): Promise<T> {
  if (isStoreCacheReady()) return store.get(key, fallback)
  await flushPendingDbWrites()
  const snapshot = await readKvSnapshot()
  const raw = snapshot === undefined ? null : snapshot['b_' + key] ?? null
  if (raw == null) {
    if (snapshot !== undefined) return fallback
    return store.get(key, fallback)
  }
  try { return JSON.parse(raw) as T } catch { return fallback }
}

/** 写入旧键并等待 durable outbox 完成，兼容原有键名和导出格式。 */
export async function writeAsyncStorageValue<T>(key: string, value: T): Promise<boolean> {
  if (!store.set(key, value)) return false
  await flushRepositoryWrites()
  return true
}

function queueAsyncRepositoryWrite(key: string, work: () => Promise<void>): Promise<void> {
  const previous = asyncRepositoryWriteChains.get(key) || Promise.resolve()
  const next = previous.then(work, work)
  asyncRepositoryWriteChains.set(key, next.catch(() => undefined))
  return next
}

function sameId(a: EntityId, b: EntityId): boolean { return String(a) === String(b) }

export function createCollectionRepository<T>(
  key: string,
  identify: (item: T) => EntityId | undefined = item => (item as { id?: EntityId }).id
): CollectionRepository<T> {
  const list = (): T[] => {
    const value = store.get<unknown>(key, [])
    return Array.isArray(value) ? value as T[] : []
  }
  const replace = (items: T[]): boolean => store.set(key, items)
  return {
    list,
    replace,
    create(item: T): T {
      if (!replace([item, ...list()])) throw new Error(`storage-write-failed:${key}`)
      return item
    },
    update(id: EntityId, updater: (item: T) => T): boolean {
      const items = list()
      const index = items.findIndex(item => {
        const entityId = identify(item)
        return entityId !== undefined && sameId(entityId, id)
      })
      if (index < 0) return false
      items[index] = updater(items[index])
      return replace(items)
    },
    remove(id: EntityId): boolean {
      const items = list()
      const next = items.filter(item => {
        const entityId = identify(item)
        return entityId === undefined || !sameId(entityId, id)
      })
      return next.length === items.length ? false : replace(next)
    },
    find(id: EntityId): T | undefined {
      return list().find(item => {
        const entityId = identify(item)
        return entityId !== undefined && sameId(entityId, id)
      })
    },
    ready: flushRepositoryWrites
  }
}

/**
 * Async migration seam for new callers. Reads use the durable IndexedDB KV
 * snapshot when it is available; writes keep the synchronous cache/outbox
 * compatibility path but do not resolve until the durable queue has flushed.
 */
export function createAsyncCollectionRepository<T>(
  key: string,
  identify: (item: T) => EntityId | undefined = item => (item as { id?: EntityId }).id
): AsyncCollectionRepository<T> {
  const fullKey = 'b_' + key
  const read = async (): Promise<T[]> => {
    if (isStoreCacheReady()) {
      const value = store.get<unknown>(key, [])
      return Array.isArray(value) ? value as T[] : []
    }
    await flushPendingDbWrites()
    const snapshot = await readKvSnapshot()
    const raw = snapshot === undefined ? null : snapshot[fullKey] ?? null
    if (raw == null) return snapshot === undefined ? (() => {
      const value = store.get<unknown>(key, [])
      return Array.isArray(value) ? value as T[] : []
    })() : []
    try {
      const value = JSON.parse(raw) as unknown
      return Array.isArray(value) ? value as T[] : []
    } catch {
      return []
    }
  }
  const persist = async (items: T[]): Promise<boolean> => {
    if (!store.set(key, items)) return false
    await flushRepositoryWrites()
    return true
  }
  const ready = flushRepositoryWrites
  return {
    list: read,
    replace(items) {
      let accepted = false
      return queueAsyncRepositoryWrite(key, async () => { accepted = await persist(items) }).then(() => accepted)
    },
    async create(item) {
      let created = false
      await queueAsyncRepositoryWrite(key, async () => {
        const items = await read()
        created = await persist([item, ...items])
      })
      if (!created) throw new Error(`storage-write-failed:${key}`)
      return item
    },
    async update(id, updater) {
      let updated = false
      await queueAsyncRepositoryWrite(key, async () => {
        const items = await read()
        const index = items.findIndex(item => {
          const entityId = identify(item)
          return entityId !== undefined && sameId(entityId, id)
        })
        if (index < 0) return
        items[index] = updater(items[index])
        updated = await persist(items)
      })
      return updated
    },
    async remove(id) {
      let removed = false
      await queueAsyncRepositoryWrite(key, async () => {
        const items = await read()
        const next = items.filter(item => {
          const entityId = identify(item)
          return entityId === undefined || !sameId(entityId, id)
        })
        if (next.length === items.length) return
        removed = await persist(next)
      })
      return removed
    },
    async find(id) {
      return (await read()).find(item => {
        const entityId = identify(item)
        return entityId !== undefined && sameId(entityId, id)
      })
    },
    ready
  }
}

/** 为新领域对象提供统一 ID，旧数据仍可原样读取。 */
export function createEntityId(): string { return nextId() }

export const repositories = {
  inbox: createCollectionRepository<{ id: string; text: string; date: string }>('inbox'),
  tasks: createCollectionRepository<{ id: string; title: string; done: boolean }>('tasks'),
  goals: createCollectionRepository<{ id: string; title: string; done: boolean }>('goals'),
  habits: createCollectionRepository<{ id: string; name: string }>('habits'),
  finance: createCollectionRepository<{ id: string; type: string; amount: number }>('finance'),
  chars: createCollectionRepository<{ id: string; name: string }>('chars'),
  posts: createCollectionRepository<{ id: string; title: string; content: string }>('posts'),
  diary: createCollectionRepository<{ date: string; content: string }>('diary', item => item.date)
}
