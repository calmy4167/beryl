import { beforeEach, describe, expect, it } from 'vitest'
import { applyOpenAssets, applyOpenEntities, currentOpenOrphanAssets, removeOpenAssets } from '@/core/content/open-workspace'
import type { Matter } from '@/domain/matter/model'
import { matterRepository } from '@/domain/matter/repository'

const importedMatter: Matter = {
  calmyId: 'matter-import-1', title: '导入冲突测试', why: '原始原因', primaryContradiction: '',
  status: 'active', currentStage: 'wood', trajectory: 'stable', evidenceIds: [], createdAt: 1723900000000,
  updatedAt: 1723900001000, revision: 2
}

describe('Open Workspace apply policy', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('replaces a local entity only when the explicit incoming decision is provided', () => {
    applyOpenEntities([importedMatter])
    const incoming = { ...importedMatter, why: 'Vault 中的新原因', revision: 3 }

    const result = applyOpenEntities([incoming], { [incoming.calmyId]: 'use-incoming' })

    expect(result.replaced).toBe(1)
    expect(matterRepository.find(incoming.calmyId)?.why).toBe('Vault 中的新原因')
  })

  it('keeps the local entity when the explicit local decision is provided', () => {
    applyOpenEntities([importedMatter])
    const incoming = { ...importedMatter, why: '不应覆盖本地', revision: 3 }

    const result = applyOpenEntities([incoming], { [incoming.calmyId]: 'keep-local' })

    expect(result.keptLocal).toBe(1)
    expect(matterRepository.find(incoming.calmyId)?.why).toBe('原始原因')
  })

  it('applies a field-level merge without taking unselected incoming fields', () => {
    applyOpenEntities([importedMatter])
    const incoming = { ...importedMatter, why: 'Vault 中的新原因', title: 'Vault 新标题', revision: 3 }

    const result = applyOpenEntities([incoming], {
      [incoming.calmyId]: { mode: 'merge', fields: { why: 'use-incoming', revision: 'use-incoming' } }
    })

    expect(result.merged).toBe(1)
    expect(matterRepository.find(incoming.calmyId)).toMatchObject({ title: '导入冲突测试', why: 'Vault 中的新原因', revision: 3 })
  })

  it('imports new assets idempotently and refuses same-path binary replacement', () => {
    const asset = { path: 'assets/photo.bin', data: new Uint8Array([1, 2, 3]), mimeType: 'application/octet-stream' }

    const first = applyOpenAssets([asset])
    const second = applyOpenAssets([asset])
    const conflict = applyOpenAssets([{ ...asset, data: new Uint8Array([9, 9, 9]) }])

    expect(first.created).toBe(1)
    expect(second.unchanged).toBe(1)
    expect(conflict.conflicts).toEqual(['assets/photo.bin'])
  })

  it('previews and explicitly removes only the current orphan assets', () => {
    const asset = { path: 'assets/orphan.bin', data: new Uint8Array([4, 5]), mimeType: 'application/octet-stream' }
    applyOpenAssets([asset])

    expect(currentOpenOrphanAssets().map(item => item.path)).toEqual(['assets/orphan.bin'])
    expect(removeOpenAssets(['assets/orphan.bin'])).toBe(1)
    expect(currentOpenOrphanAssets()).toEqual([])
  })
})
