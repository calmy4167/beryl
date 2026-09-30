import type { FileSystemDirectoryHandleLike } from './obsidian-adapter'
import { getActiveAccount } from '../account-context'

const DB_VERSION = 1
const STORE_NAME = 'handles'
const VAULT_KEY = 'primary'

export type VaultPermission = 'granted' | 'prompt' | 'denied'

export interface PersistableVaultDirectoryHandle extends FileSystemDirectoryHandleLike {
  name: string
  queryPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<VaultPermission>
  requestPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<VaultPermission>
}

function openHandleDatabase(): Promise<IDBDatabase> {
  const userId = getActiveAccount()
  if (!userId) return Promise.reject(new Error('user-account-required'))
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('vault-handle-storage-unavailable'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`calmy-vault-handles-${encodeURIComponent(userId)}`, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('vault-handle-storage-open-failed'))
  })
}

async function withHandleStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openHandleDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode)
      const request = operation(transaction.objectStore(STORE_NAME))
      let result!: T
      request.onsuccess = () => { result = request.result }
      request.onerror = () => reject(request.error || new Error('vault-handle-storage-operation-failed'))
      transaction.oncomplete = () => resolve(result)
      transaction.onerror = () => reject(transaction.error || new Error('vault-handle-storage-transaction-failed'))
      transaction.onabort = () => reject(transaction.error || new Error('vault-handle-storage-aborted'))
    })
  } finally {
    db.close()
  }
}

export interface StoredVaultHandle {
  handle: PersistableVaultDirectoryHandle
  name: string
}

export async function loadVaultHandle(): Promise<StoredVaultHandle | undefined> {
  return withHandleStore('readonly', store => store.get(VAULT_KEY))
}

export async function saveVaultHandle(handle: PersistableVaultDirectoryHandle): Promise<void> {
  await withHandleStore('readwrite', store => store.put({ handle, name: handle.name }, VAULT_KEY))
}

export async function clearVaultHandle(): Promise<void> {
  await withHandleStore('readwrite', store => store.delete(VAULT_KEY))
}

export function queryVaultHandlePermission(handle: PersistableVaultDirectoryHandle): Promise<VaultPermission> {
  return handle.queryPermission({ mode: 'readwrite' })
}

export function requestVaultHandlePermission(handle: PersistableVaultDirectoryHandle): Promise<VaultPermission> {
  return handle.requestPermission({ mode: 'readwrite' })
}
