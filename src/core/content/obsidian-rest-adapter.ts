import type { VaultAdapter } from './obsidian-adapter'

export interface ObsidianRestResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
  text(): Promise<string>
  arrayBuffer(): Promise<ArrayBuffer>
}

export type ObsidianRestFetch = (input: string, init?: RequestInit) => Promise<ObsidianRestResponse>

export interface ObsidianRestVaultAdapterOptions {
  baseUrl: string
  apiKey: string
  fetch?: ObsidianRestFetch
  readOnly?: boolean
}

interface DirectoryListing {
  files: string[]
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/')
}

function encodePath(path: string): string {
  return normalizePath(path).split('/').filter(Boolean).map(segment => encodeURIComponent(segment)).join('/')
}

function requirePath(path: string): string {
  const normalized = normalizePath(path)
  if (!normalized || normalized.split('/').some(segment => segment === '.' || segment === '..')) {
    throw new Error('obsidian-rest-path-invalid')
  }
  return normalized
}

function requireListing(value: unknown): DirectoryListing {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { files?: unknown }).files)) {
    throw new Error('obsidian-rest-directory-invalid')
  }
  const files = (value as { files: unknown[] }).files
  if (files.some(file => typeof file !== 'string' || !file.trim())) throw new Error('obsidian-rest-directory-invalid')
  return { files: files as string[] }
}

function responseError(response: ObsidianRestResponse): Error {
  return new Error(`obsidian-rest-http-${response.status}`)
}

export function createObsidianRestVaultAdapter(options: ObsidianRestVaultAdapterOptions): VaultAdapter {
  const baseUrl = options.baseUrl.replace(/\/+$/, '')
  if (!baseUrl) throw new Error('obsidian-rest-base-url-empty')
  if (!options.apiKey.trim()) throw new Error('obsidian-rest-api-key-empty')
  const fetchImpl = options.fetch || fetch
  const readOnly = options.readOnly !== false

  const urlFor = (path = '', directory = false) => {
    const encoded = encodePath(path)
    return `${baseUrl}/vault/${encoded}${directory && encoded ? '/' : ''}`
  }
  const request = async (path: string, init?: RequestInit, directory = false): Promise<ObsidianRestResponse> => {
    const response = await fetchImpl(urlFor(path, directory), {
      ...init,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        ...(init?.headers || {})
      }
    })
    if (!response.ok) throw responseError(response)
    return response
  }
  const rejectReadOnly = () => { throw new Error('obsidian-rest-read-only') }

  const adapter: VaultAdapter = {
    async listPaths() {
      const paths: string[] = []
      const visit = async (prefix: string): Promise<void> => {
        const listing = requireListing(await (await request(prefix, undefined, true)).json())
        for (const entry of listing.files) {
          const isDirectory = entry.endsWith('/')
          const child = normalizePath(`${prefix}/${entry}`)
          if (isDirectory) await visit(child)
          else paths.push(child)
        }
      }
      await visit('')
      return paths
    },
    async readText(path) {
      return (await request(requirePath(path))).text()
    },
    async readBinary(path) {
      return new Uint8Array(await (await request(requirePath(path))).arrayBuffer())
    },
    async writeText(path, content) {
      if (readOnly) return rejectReadOnly()
      await request(requirePath(path), {
        method: 'PUT',
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
        body: content
      })
    },
    async writeBinary(path, content) {
      if (readOnly) return rejectReadOnly()
      await request(requirePath(path), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: content as unknown as BodyInit
      })
    }
  }

  if (!readOnly) {
    adapter.deletePath = async path => {
      await request(requirePath(path), { method: 'DELETE' })
    }
  }
  return adapter
}
