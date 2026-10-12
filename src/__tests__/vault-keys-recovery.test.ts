import { afterEach, describe, expect, it, vi } from 'vitest'
import { recoverVault } from '@/core/vault-keys'

function encode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function installMemoryIndexedDb(): void {
  vi.stubGlobal('indexedDB', {
    open() {
      const request: { result?: { createObjectStore: () => void }; onsuccess?: () => void; onupgradeneeded?: () => void } = {}
      const database = {
        createObjectStore() {},
        transaction() {
          const tx: { oncomplete?: () => void; onerror?: () => void; onabort?: () => void; objectStore: () => { put: () => void } } = {
            objectStore: () => ({ put() {} })
          }
          queueMicrotask(() => tx.oncomplete?.())
          return tx
        },
        close() {}
      }
      queueMicrotask(() => { request.result = database; request.onupgradeneeded?.(); request.onsuccess?.() })
      return request
    }
  })
}

describe('Vault recovery package input', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each(['serialized text', 'object'] as const)('unlocks from a downloaded package when the server returns the envelope as %s', async representation => {
    installMemoryIndexedDb()
    const recoveryBytes = new Uint8Array(32).fill(23)
    const userKeyBytes = new Uint8Array(32).fill(41)
    const recoveryCryptoKey = await crypto.subtle.importKey('raw', recoveryBytes, { name: 'AES-GCM' }, false, ['encrypt'])
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, recoveryCryptoKey, userKeyBytes))
    const envelope = { v: 1, iv: encode(iv), ciphertext: encode(ciphertext) }
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      ok: true, initialized: true,
      // Legacy Workers return the D1 TEXT value; updated Workers return object.
      recoveryEnvelope: representation === 'serialized text' ? JSON.stringify(envelope) : envelope
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const packageText = JSON.stringify({ format: 'calmy-recovery-v1', recoveryKey: encode(recoveryBytes) })

    await expect(recoverVault('https://vault.example.test', 'user-recovery-package', packageText)).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined()
  })
})
