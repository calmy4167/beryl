import { beforeEach, describe, expect, it } from 'vitest'
import { exportOpenWorkspace, importOpenWorkspace } from '@/core/content/open-format'
import { assetRepository, hashOpenBytes } from '@/core/content/assets'
import { CoreDomainError, unifiedFactories, unifiedRepository, type Asset, type Resource } from '@/domain/unified'

describe('resource and asset lifecycle', () => {
  beforeEach(() => localStorage.clear())

  it('creates a versioned asset and moves both resource and asset through explicit lifecycle states', () => {
    const resource = unifiedRepository.create(unifiedFactories.resource({
      title: '接口文档', kind: 'reference', status: 'active', body: '当前版本', expiresAt: Date.now() + 86400000,
      assetIds: [], matterIds: ['matter-1'], sourceIds: [], tags: ['api']
    }))
    const asset = unifiedRepository.createAsset({
      path: 'assets/api.pdf', mimeType: 'application/pdf', sizeBytes: 2048, hash: 'fnv1a-deadbeef', lifecycle: 'active', version: 2,
      externalUri: 'https://example.test/api.pdf'
    })

    unifiedRepository.update<Resource>('resource', resource.calmyId, { assetIds: [asset.calmyId] }, { expectedRevision: 1 })
    const expired = unifiedRepository.updateResourceStatus(resource.calmyId, 'expired', { expectedRevision: 2 })
    const missing = unifiedRepository.updateAssetLifecycle(asset.calmyId, 'missing', { expectedRevision: 1 })

    expect(expired.status).toBe('expired')
    expect(missing).toMatchObject({ lifecycle: 'missing', version: 2, sizeBytes: 2048 })
    expect(unifiedRepository.mutations('resource', resource.calmyId)).toHaveLength(3)
    expect(unifiedRepository.mutations('asset', asset.calmyId)).toHaveLength(2)
  })

  it('rejects invalid asset metadata before creating a persistent entity', () => {
    expect(() => unifiedRepository.createAsset({ path: '', mimeType: 'text/plain', sizeBytes: 1, hash: 'h', lifecycle: 'active', version: 1 })).toThrowError(CoreDomainError)
    expect(() => unifiedRepository.createAsset({ path: 'assets/a.txt', mimeType: 'text/plain', sizeBytes: -1, hash: 'h', lifecycle: 'active', version: 1 })).toThrowError(CoreDomainError)
    expect(() => unifiedRepository.createAsset({ path: 'assets/a.txt', mimeType: 'text/plain', sizeBytes: 1, hash: 'h', lifecycle: 'active', version: 0 })).toThrowError(CoreDomainError)
    expect(unifiedRepository.list<Asset>('asset')).toEqual([])
  })

  it('requires a non-blank resource title and keeps retired resources out of active library queries', () => {
    expect(() => unifiedRepository.create(unifiedFactories.resource({ title: '   ', kind: 'knowledge', status: 'active', assetIds: [], matterIds: [], sourceIds: [], tags: [] }))).toThrowError(CoreDomainError)
    const resource = unifiedRepository.create(unifiedFactories.resource({ title: '可退休资料', kind: 'knowledge', status: 'active', assetIds: [], matterIds: [], sourceIds: [], tags: [] }))

    unifiedRepository.updateResourceStatus(resource.calmyId, 'retired', { expectedRevision: 1 })

    expect(unifiedRepository.list<Resource>('resource').filter(item => item.status !== 'retired')).toEqual([])
    expect(unifiedRepository.find<Resource>('resource', resource.calmyId)?.archivedAt).toBeTypeOf('number')
  })

  it('round-trips asset lifecycle metadata through the open format', () => {
    const asset = unifiedRepository.createAsset({ path: 'assets/guide.pdf', mimeType: 'application/pdf', sizeBytes: 10, hash: 'hash-1', lifecycle: 'missing', version: 3 })
    const workspace = exportOpenWorkspace({ unified: [asset] })
    const imported = importOpenWorkspace(workspace.files, workspace.assets)

    expect(imported.issues).toEqual([])
    expect(imported.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: 'asset', path: 'assets/guide.pdf', lifecycle: 'missing', version: 3 })
    ]))
  })

  it('stores binary bytes once, reports identical reimports, and blocks conflicting overwrites', () => {
    const data = new Uint8Array([1, 2, 3, 4])
    const asset = { path: 'assets/icon.bin', data, mimeType: 'application/octet-stream' }

    expect(assetRepository.importAsset(asset)).toBe('created')
    expect(assetRepository.importAsset({ ...asset, data: new Uint8Array([1, 2, 3, 4]) })).toBe('unchanged')
    expect(assetRepository.importAsset({ ...asset, data: new Uint8Array([9]) })).toBe('conflict')
    expect(assetRepository.list()[0]).toMatchObject({ path: 'assets/icon.bin', mimeType: asset.mimeType })
    expect(Array.from(assetRepository.list()[0].data)).toEqual([1, 2, 3, 4])
    expect(hashOpenBytes(data)).toMatch(/^fnv1a-/)
  })

  it('keeps resource-to-asset links explicit even when a linked asset becomes missing', () => {
    const asset = unifiedRepository.createAsset({ path: 'assets/linked.txt', mimeType: 'text/plain', sizeBytes: 4, hash: 'hash-linked', lifecycle: 'active', version: 1 })
    const resource = unifiedRepository.create(unifiedFactories.resource({ title: '带附件资源', kind: 'reference', status: 'active', assetIds: [asset.calmyId], matterIds: [], sourceIds: [], tags: [] }))

    unifiedRepository.updateAssetLifecycle(asset.calmyId, 'missing', { expectedRevision: 1 })

    expect(unifiedRepository.find<Resource>('resource', resource.calmyId)?.assetIds).toEqual([asset.calmyId])
    expect(unifiedRepository.find<Asset>('asset', asset.calmyId)?.lifecycle).toBe('missing')
  })
})
