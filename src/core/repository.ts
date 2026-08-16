/**
 * 领域数据的统一入口。
 *
 * 视图和组件只通过 Repository 读写业务集合；底层仍由 storage 适配旧版
 * localStorage 数据，并同步镜像到 IndexedDB、键级同步日志和实体级变更日志。
 * 以后切换 IndexedDB 主存储时，调用方无需改变。
 */
import { nextId, store } from './storage.ts'

export type EntityId = string | number

export interface CollectionRepository<T> {
  list(): T[]
  replace(items: T[]): boolean
  create(item: T): T
  update(id: EntityId, updater: (item: T) => T): boolean
  remove(id: EntityId): boolean
  find(id: EntityId): T | undefined
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
      replace([item, ...list()])
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
    }
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
