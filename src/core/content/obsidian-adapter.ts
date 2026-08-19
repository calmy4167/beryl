import type { OpenAsset, OpenImportResult, OpenWorkspace } from './open-format'
import { hashOpenBytes } from './assets'
import { hashOpenText, importOpenWorkspace, OPEN_MANIFEST_PATH } from './open-format'

export interface VaultAdapter {
  listPaths(): Promise<string[]>
  readText(path: string): Promise<string>
  readBinary(path: string): Promise<Uint8Array>
  writeText(path: string, content: string): Promise<void>
  writeBinary(path: string, content: Uint8Array): Promise<void>
  deletePath?(path: string): Promise<void>
  onChange?(listener: (path: string) => void): () => void
}

export interface VaultImportSnapshot extends OpenImportResult {
  paths: string[]
  files: Record<string, string>
}

export interface VaultSyncResult {
  writtenPaths: string[]
  unchangedPaths: string[]
  deletedPaths: string[]
  errors: string[]
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '')
}

function isIgnoredPath(path: string): boolean {
  return path.split('/').some(segment => segment === '.obsidian' || segment === '')
}

function isTextPath(path: string): boolean {
  return path.toLowerCase().endsWith('.md') || path === OPEN_MANIFEST_PATH
}

export async function readVaultSnapshot(adapter: VaultAdapter): Promise<VaultImportSnapshot> {
  const paths = (await adapter.listPaths()).map(normalizePath).filter(path => !isIgnoredPath(path))
  const textEntries: Record<string, string> = {}
  const assets: OpenAsset[] = []
  for (const path of paths) {
    if (isTextPath(path)) textEntries[path] = await adapter.readText(path)
    else assets.push({ path, data: await adapter.readBinary(path), mimeType: 'application/octet-stream' })
  }
  return { ...importOpenWorkspace(textEntries, assets), paths, files: textEntries }
}

export async function readVaultWorkspace(adapter: VaultAdapter): Promise<OpenWorkspace> {
  const snapshot = await readVaultSnapshot(adapter)
  if (snapshot.issues.length) throw new Error('vault-import-blocked:' + snapshot.issues.map(issue => issue.code).join(','))
  if (!snapshot.manifest) throw new Error('vault-manifest-missing')
  return { files: snapshot.files, assets: snapshot.assets, manifest: snapshot.manifest }
}

async function sameText(adapter: VaultAdapter, path: string, content: string): Promise<boolean> {
  try {
    return hashOpenText(await adapter.readText(path)) === hashOpenText(content)
  } catch {
    return false
  }
}

async function sameBinary(adapter: VaultAdapter, path: string, content: Uint8Array): Promise<boolean> {
  try {
    return hashOpenBytes(await adapter.readBinary(path)) === hashOpenBytes(content)
  } catch {
    return false
  }
}

export async function syncWorkspaceToVault(adapter: VaultAdapter, workspace: OpenWorkspace, deletePaths: string[] = []): Promise<VaultSyncResult> {
  const result: VaultSyncResult = { writtenPaths: [], unchangedPaths: [], deletedPaths: [], errors: [] }
  if (deletePaths.length && !adapter.deletePath) {
    result.errors.push(deletePaths.join(', ') + ': delete-not-supported')
    return result
  }
  for (const path of [...new Set(deletePaths.map(normalizePath))]) {
    try {
      await adapter.deletePath!(path)
      result.deletedPaths.push(path)
    } catch (error) {
      result.errors.push(path + ': ' + (error instanceof Error ? error.message : 'delete-failed'))
    }
  }
  if (result.errors.length) return result
  const textEntries = Object.entries(workspace.files).filter(([path]) => path !== OPEN_MANIFEST_PATH)
  const writeTextEntries = async () => {
    for (const [path, content] of textEntries) {
      try {
        if (await sameText(adapter, path, content)) result.unchangedPaths.push(path)
        else {
          await adapter.writeText(path, content)
          result.writtenPaths.push(path)
        }
      } catch (error) {
        result.errors.push(path + ': ' + (error instanceof Error ? error.message : 'write-failed'))
      }
    }
  }
  await writeTextEntries()
  for (const asset of workspace.assets) {
    try {
      if (await sameBinary(adapter, asset.path, asset.data)) result.unchangedPaths.push(asset.path)
      else {
        await adapter.writeBinary(asset.path, asset.data)
        result.writtenPaths.push(asset.path)
      }
    } catch (error) {
      result.errors.push(asset.path + ': ' + (error instanceof Error ? error.message : 'write-failed'))
    }
  }
  const manifest = workspace.files[OPEN_MANIFEST_PATH]
  if (manifest !== undefined) {
    try {
      if (await sameText(adapter, OPEN_MANIFEST_PATH, manifest)) result.unchangedPaths.push(OPEN_MANIFEST_PATH)
      else {
        await adapter.writeText(OPEN_MANIFEST_PATH, manifest)
        result.writtenPaths.push(OPEN_MANIFEST_PATH)
      }
    } catch (error) {
      result.errors.push(OPEN_MANIFEST_PATH + ': ' + (error instanceof Error ? error.message : 'write-failed'))
    }
  }
  return result
}

export function watchVault(adapter: VaultAdapter, onChange: (path: string) => void, debounceMs = 250): () => void {
  if (!adapter.onChange) return () => undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  return adapter.onChange(path => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      onChange(normalizePath(path))
    }, debounceMs)
  })
}
