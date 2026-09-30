import { apiFetch } from './api/client'
import { DEVICE_ID } from './db'

const FORMAT = 'calmy-recovery-v1'
const enc = new TextEncoder()
const dec = new TextDecoder()

type Envelope = { v: 1; iv: string; ciphertext: string }
type Keyring = { deviceKey: CryptoKey; userKeyEnvelope: Envelope; pendingRecoveryEnvelope?: Envelope; recoveryEnvelope?: Envelope }

function base64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
function unbase64(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4))
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}
function randomKeyBytes(): Uint8Array { return crypto.getRandomValues(new Uint8Array(32)) }
function dbName(userId: string): string { return `calmy-keyring-${encodeURIComponent(userId)}` }

function openKeyring(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName(userId), 1)
    request.onupgradeneeded = () => request.result.createObjectStore('keys')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('keyring-open-failed'))
  })
}
async function readKeyring(userId: string): Promise<Keyring | undefined> {
  const db = await openKeyring(userId)
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('keys', 'readonly').objectStore('keys').get('keyring')
      request.onsuccess = () => resolve(request.result as Keyring | undefined)
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}
async function writeKeyring(userId: string, keyring: Keyring): Promise<void> {
  const db = await openKeyring(userId)
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('keys', 'readwrite')
      tx.objectStore('keys').put(keyring, 'keyring')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error || new Error('keyring-write-aborted'))
    })
  } finally { db.close() }
}
async function createKeyringIfAbsent(userId: string, keyring: Keyring): Promise<boolean> {
  const db = await openKeyring(userId)
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('keys', 'readwrite')
      const store = tx.objectStore('keys')
      let created = false
      const existing = store.get('keyring')
      existing.onsuccess = () => {
        if (existing.result) return
        store.add(keyring, 'keyring')
        created = true
      }
      existing.onerror = () => reject(existing.error || new Error('keyring-read-failed'))
      tx.oncomplete = () => resolve(created)
      tx.onerror = () => reject(tx.error || new Error('keyring-create-failed'))
      tx.onabort = () => reject(tx.error || new Error('keyring-create-aborted'))
    })
  } finally { db.close() }
}
async function importAes(raw: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, usages)
}
async function wrap(raw: Uint8Array, key: CryptoKey): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, raw)
  return { v: 1, iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) }
}
async function unwrap(envelope: Envelope, key: CryptoKey): Promise<Uint8Array> {
  if (envelope?.v !== 1 || typeof envelope.iv !== 'string' || typeof envelope.ciphertext !== 'string') throw new Error('invalid-key-envelope')
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(envelope.iv) }, key, unbase64(envelope.ciphertext))
  return new Uint8Array(raw)
}
function validateRecoveryKey(value: string): Uint8Array {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('recovery-key-required')
  try {
    const raw = unbase64(trimmed)
    if (raw.byteLength !== 32) throw new Error()
    return raw
  } catch { throw new Error('恢复密钥格式不正确，请使用 32 字节恢复密钥或恢复包中的密钥字段。') }
}

async function getRecoveryEnvelope(baseUrl: string): Promise<Envelope | null> {
  const response = await apiFetch(baseUrl, '/api/vault/key')
  const body = await response.json().catch(() => ({})) as { ok?: boolean; initialized?: boolean; recoveryEnvelope?: Envelope }
  if (!response.ok) throw new Error('无法读取 Vault 密钥状态')
  return body.initialized && body.recoveryEnvelope ? body.recoveryEnvelope : null
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index]
  return difference === 0
}

async function ensureRecoveryEnvelope(baseUrl: string, recoveryEnvelope: Envelope, recoveryKey: Uint8Array, expectedUserKey: Uint8Array): Promise<void> {
  const recoveryCryptoKey = await importAes(recoveryKey, ['encrypt', 'decrypt'])
  const verifyExisting = async (current: Envelope): Promise<void> => {
    try {
      const userKey = await unwrap(current, recoveryCryptoKey)
      if (sameBytes(userKey, expectedUserKey)) return
    } catch { /* treat an envelope this key cannot unwrap as another device's setup */ }
    throw new Error('此账号已在另一台设备初始化 Vault，请使用服务器上的恢复密钥恢复本设备。')
  }
  const current = await getRecoveryEnvelope(baseUrl)
  if (current) return verifyExisting(current)
  const response = await apiFetch(baseUrl, '/api/vault/key', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 1, recoveryEnvelope })
  })
  if (!response.ok) {
    if (response.status === 409) {
      const racedEnvelope = await getRecoveryEnvelope(baseUrl)
      if (racedEnvelope) return verifyExisting(racedEnvelope)
    }
    throw new Error('Vault 恢复包保存失败，请保持此设备登录并重试')
  }
}

/** Create a random account key and independently generated recovery secret, or report this device needs recovery. */
export async function setupVault(baseUrl: string, userId: string): Promise<{ recoveryKey?: string; alreadyUnlocked: boolean; recoveryNeeded: boolean }> {
  const cached = await readKeyring(userId)
  if (cached) {
    let userKey: Uint8Array
    let pending: Uint8Array | undefined
    try {
      userKey = await unwrap(cached.userKeyEnvelope, cached.deviceKey)
      pending = cached.pendingRecoveryEnvelope ? await unwrap(cached.pendingRecoveryEnvelope, cached.deviceKey) : undefined
    } catch {
      const serverEnvelope = await getRecoveryEnvelope(baseUrl)
      if (serverEnvelope) return { alreadyUnlocked: false, recoveryNeeded: true }
      throw new Error('本机 Vault 密钥数据无法读取，服务器也没有恢复包；为保护现有数据，Calmy 不会覆盖这份密钥。')
    }
    if (!pending) return { alreadyUnlocked: true, recoveryNeeded: false }
    // A prior attempt may have persisted the local keyring before the server
    // request was interrupted. Reuse the exact envelope so setup is retryable.
    const recoveryEnvelope = cached.recoveryEnvelope || await wrap(userKey, await importAes(pending, ['encrypt', 'decrypt']))
    if (!cached.recoveryEnvelope) {
      cached.recoveryEnvelope = recoveryEnvelope
      await writeKeyring(userId, cached)
    }
    await ensureRecoveryEnvelope(baseUrl, recoveryEnvelope, pending, userKey)
    return { recoveryKey: base64(pending), alreadyUnlocked: false, recoveryNeeded: false }
  }
  const serverEnvelope = await getRecoveryEnvelope(baseUrl)
  if (serverEnvelope) return { alreadyUnlocked: false, recoveryNeeded: true }

  const userKey = randomKeyBytes()
  const recoveryKey = randomKeyBytes()
  const deviceKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const recoveryCryptoKey = await importAes(recoveryKey, ['encrypt', 'decrypt'])
  const recoveryEnvelope = await wrap(userKey, recoveryCryptoKey)
  const localEnvelope = await wrap(userKey, deviceKey)
  const pendingRecoveryEnvelope = await wrap(recoveryKey, deviceKey)
  // Persist both the unlock material and the exact recovery envelope first. If
  // the browser stops before or during the Worker request, the next attempt can
  // safely retry without generating a different User Key or Recovery Key.
  const created = await createKeyringIfAbsent(userId, { deviceKey, userKeyEnvelope: localEnvelope, pendingRecoveryEnvelope, recoveryEnvelope })
  if (!created) return setupVault(baseUrl, userId)
  try {
    await ensureRecoveryEnvelope(baseUrl, recoveryEnvelope, recoveryKey, userKey)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('此账号已在另一台设备')) {
      return { alreadyUnlocked: false, recoveryNeeded: true }
    }
    throw error
  }
  return { recoveryKey: base64(recoveryKey), alreadyUnlocked: false, recoveryNeeded: false }
}

export async function recoverVault(baseUrl: string, userId: string, recoveryKeyText: string): Promise<void> {
  const envelope = await getRecoveryEnvelope(baseUrl)
  if (!envelope) throw new Error('此账号尚未初始化 Vault，请先在原设备完成初始化。')
  const recoveryKey = await importAes(validateRecoveryKey(recoveryKeyText), ['encrypt', 'decrypt'])
  let userKey: Uint8Array
  try { userKey = await unwrap(envelope, recoveryKey) }
  catch { throw new Error('恢复密钥不正确，或恢复包已损坏。') }
  const deviceKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const localEnvelope = await wrap(userKey, deviceKey)
  await writeKeyring(userId, { deviceKey, userKeyEnvelope: localEnvelope })
}

export async function loadUserKey(userId: string): Promise<CryptoKey> {
  const keyring = await readKeyring(userId)
  if (!keyring) throw new Error('vault-locked')
  return importAes(await unwrap(keyring.userKeyEnvelope, keyring.deviceKey), ['encrypt', 'decrypt'])
}

export async function hasUnlockedVault(userId: string): Promise<boolean> {
  try {
    const keyring = await readKeyring(userId)
    if (!keyring || keyring.pendingRecoveryEnvelope) return false
    await unwrap(keyring.userKeyEnvelope, keyring.deviceKey)
    return true
  } catch { return false }
}

export async function confirmRecoveryKeySaved(userId: string): Promise<void> {
  const keyring = await readKeyring(userId)
  if (!keyring) throw new Error('vault-locked')
  delete keyring.pendingRecoveryEnvelope
  await writeKeyring(userId, keyring)
}

export async function createEntityContentKey(userId: string): Promise<{ key: CryptoKey; envelope: Envelope }> {
  const userKey = await loadUserKey(userId)
  const raw = randomKeyBytes()
  const envelope = await wrap(raw, userKey)
  return { key: await importAes(raw, ['encrypt', 'decrypt']), envelope }
}

export async function unwrapEntityContentKey(userId: string, envelope: Envelope): Promise<CryptoKey> {
  const userKey = await loadUserKey(userId)
  return importAes(await unwrap(envelope, userKey), ['encrypt', 'decrypt'])
}

export async function encryptEntityContent(key: CryptoKey, value: unknown): Promise<{ v: 1; iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = enc.encode(JSON.stringify(value))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  return { v: 1, iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) }
}

export async function decryptEntityContent(key: CryptoKey, payload: { v: 1; iv: string; ciphertext: string }): Promise<unknown> {
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(payload.iv) }, key, unbase64(payload.ciphertext))
  return JSON.parse(dec.decode(plaintext)) as unknown
}

export function currentDeviceId(): string { return DEVICE_ID }

export function recoveryPackage(recoveryKey: string): string {
  return JSON.stringify({ format: FORMAT, recoveryKey }, null, 2)
}
