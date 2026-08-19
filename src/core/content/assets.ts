import { createCollectionRepository } from '@/core/repository'

export interface OpenAsset {
  path: string
  data: Uint8Array
  mimeType: string
}

interface StoredAsset {
  path: string
  data: string
  mimeType: string
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export function hashOpenBytes(value: Uint8Array): string {
  let hash = 2166136261
  for (const byte of value) {
    hash ^= byte
    hash = Math.imul(hash, 16777619)
  }
  return 'fnv1a-' + (hash >>> 0).toString(16).padStart(8, '0')
}

export const assetRepository = {
  list(): OpenAsset[] {
    const collection = createCollectionRepository<StoredAsset>('openAssets', item => item.path)
    return collection.list().map(item => ({ path: item.path, data: base64ToBytes(item.data), mimeType: item.mimeType }))
  },
  importAsset(asset: OpenAsset): 'created' | 'unchanged' | 'conflict' {
    const collection = createCollectionRepository<StoredAsset>('openAssets', item => item.path)
    const current = collection.find(asset.path)
    if (current) {
      if (current.data === bytesToBase64(asset.data) && current.mimeType === asset.mimeType) return 'unchanged'
      return 'conflict'
    }
    collection.create({ path: asset.path, data: bytesToBase64(asset.data), mimeType: asset.mimeType })
    return 'created'
  },
  removeAsset(path: string): boolean {
    const collection = createCollectionRepository<StoredAsset>('openAssets', item => item.path)
    return collection.remove(path)
  }
}
