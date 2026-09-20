const DB_NAME = 'calmy-feishu-cache'
const DB_VERSION = 1
const SNAPSHOTS = 'snapshots'

let dbPromise: Promise<IDBDatabase> | null = null

function openCacheDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      dbPromise = null
      reject(new Error('IndexedDB 不可用'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(SNAPSHOTS)) request.result.createObjectStore(SNAPSHOTS)
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      db.onclose = () => { dbPromise = null }
      resolve(db)
    }
    request.onerror = () => {
      dbPromise = null
      reject(request.error || new Error('无法打开飞书缓存'))
    }
  })
  return dbPromise
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('飞书缓存事务失败'))
    transaction.onabort = () => reject(transaction.error || new Error('飞书缓存事务已取消'))
  })
}

export async function readFeishuCache<T>(key: string): Promise<T | undefined> {
  const db = await openCacheDb()
  const transaction = db.transaction(SNAPSHOTS, 'readonly')
  const done = transactionDone(transaction)
  const request = transaction.objectStore(SNAPSHOTS).get(key)
  const value = await new Promise<T | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error || new Error('读取飞书缓存失败'))
  })
  await done
  return value
}

export async function writeFeishuCache(key: string, value: unknown): Promise<void> {
  const db = await openCacheDb()
  const transaction = db.transaction(SNAPSHOTS, 'readwrite')
  const done = transactionDone(transaction)
  transaction.objectStore(SNAPSHOTS).put(value, key)
  await done
}

export async function clearFeishuCache(): Promise<void> {
  const db = await openCacheDb()
  const transaction = db.transaction(SNAPSHOTS, 'readwrite')
  const done = transactionDone(transaction)
  transaction.objectStore(SNAPSHOTS).clear()
  await done
}
