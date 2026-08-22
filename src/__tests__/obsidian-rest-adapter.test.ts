import { describe, expect, it } from 'vitest'
import { createObsidianRestVaultAdapter, type ObsidianRestFetch, type ObsidianRestResponse } from '@/core/content/obsidian-rest-adapter'

function response(value: unknown, status = 200): ObsidianRestResponse {
  const raw = typeof value === 'string' ? value : JSON.stringify(value)
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return JSON.parse(raw) },
    async text() { return raw },
    async arrayBuffer() { return new TextEncoder().encode(raw).buffer }
  }
}

describe('Obsidian Local REST Vault adapter', () => {
  it('recursively lists folders and reads URL-encoded text with bearer auth', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetchMock: ObsidianRestFetch = async (url, init) => {
      calls.push({ url, init })
      if (url.endsWith('/vault/')) return response({ files: ['0-心力/'] })
      if (url.endsWith('/vault/0-%E5%BF%83%E5%8A%9B/')) return response({ files: ['心力.md', 'assets/'] })
      if (url.endsWith('/vault/0-%E5%BF%83%E5%8A%9B/assets/')) return response({ files: ['icon.bin'] })
      if (url.endsWith('/vault/0-%E5%BF%83%E5%8A%9B/%E5%BF%83%E5%8A%9B.md')) return response('# 心力')
      return response('not found', 404)
    }
    const adapter = createObsidianRestVaultAdapter({ baseUrl: 'http://127.0.0.1:27123/', apiKey: 'test-key', fetch: fetchMock })

    await expect(adapter.listPaths()).resolves.toEqual(['0-心力/心力.md', '0-心力/assets/icon.bin'])
    await expect(adapter.readText('0-心力/心力.md')).resolves.toBe('# 心力')
    expect(calls.every(call => (call.init?.headers as Record<string, string>).Authorization === 'Bearer test-key')).toBe(true)
  })

  it('reads binary files and rejects traversal or writes in the default read-only mode', async () => {
    const fetchMock: ObsidianRestFetch = async (_url, init) => {
      if (init?.method) return response('not allowed', 405)
      return {
        ...response('ignored'),
        async arrayBuffer() { return new Uint8Array([0, 1, 255]).buffer }
      }
    }
    const adapter = createObsidianRestVaultAdapter({ baseUrl: 'http://vault.test', apiKey: 'key', fetch: fetchMock })

    await expect(adapter.readBinary('asset.bin')).resolves.toEqual(new Uint8Array([0, 1, 255]))
    await expect(adapter.readText('../secret.md')).rejects.toThrow('obsidian-rest-path-invalid')
    await expect(adapter.writeText('note.md', 'content')).rejects.toThrow('obsidian-rest-read-only')
    expect(adapter.deletePath).toBeUndefined()
  })

  it('enables explicit PUT and DELETE only when readOnly is disabled', async () => {
    const methods: string[] = []
    const fetchMock: ObsidianRestFetch = async (_url, init) => {
      methods.push(init?.method || 'GET')
      return response('ok')
    }
    const adapter = createObsidianRestVaultAdapter({ baseUrl: 'http://vault.test', apiKey: 'key', fetch: fetchMock, readOnly: false })

    await adapter.writeText('note.md', 'content')
    await adapter.writeBinary('asset.bin', new Uint8Array([1]))
    await adapter.deletePath?.('note.md')
    expect(methods).toEqual(['PUT', 'PUT', 'DELETE'])
  })
})
