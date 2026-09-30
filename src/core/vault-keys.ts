import { apiFetch } from './api/client'
import { DEVICE_ID } from './db'

const FORMAT = 'calmy-recovery-v1'
const enc = new TextEncoder()
const dec = new TextDecoder()

type Envelope = { v: 1; iv: string; ciphertext: string }
type Keyring = { deviceKey: CryptoKey; userKeyEnvelope: Envelope; pendingRecoveryEnvelope?: Envelope }

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

async function putRecoveryEnvelope(baseUrl: string, recoveryEnvelope: Envelope): Promise<void> {
  const current = await getRecoveryEnvelope(baseUrl)
  if (current) return
  const response = await apiFetch(baseUrl, '/api/vault/key', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 1, recoveryEnvelope })
  })
  if (!response.ok) throw new Error('Vault 恢复包保存失败，请保持此设备登录并重试')
}

/** Create a random account key and independently generated recovery secret, or report this device needs recovery. */
export async function setupVault(baseUrl: string, userId: string): Promise<{ recoveryKey?: string; alreadyUnlocked: boolean; recoveryNeeded: boolean }> {
  const cached = await readKeyring(userId)
  if (cached) {
    try {
      await unwrap(cached.userKeyEnvelope, cached.deviceKey)
      if (cached.pendingRecoveryEnvelope) {
        const pending = await unwrap(cached.pendingRecoveryEnvelope, cached.deviceKey)
        return { recoveryKey: base64(pending), alreadyUnlocked: false, recoveryNeeded: false }
      }
      return { alreadyUnlocked: true, recoveryNeeded: false }
    }
    catch { /* recover below */ }
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
  await putRecoveryEnvelope(baseUrl, recoveryEnvelope)
  await writeKeyring(userId, { deviceKey, userKeyEnvelope: localEnvelope, pendingRecoveryEnvelope })
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
