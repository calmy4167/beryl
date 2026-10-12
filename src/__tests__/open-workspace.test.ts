import { beforeEach, describe, expect, it } from 'vitest'
import { afterEach } from 'vitest'
import { setActiveAccount } from '@/core/account-context'
import { resetStoreCache } from '@/core/storage'
import { applyOpenAssets, applyOpenEntities, applyOpenEntitiesDurable, currentOpenOrphanAssets, exportCurrentOpenWorkspace, removeOpenAssets } from '@/core/content/open-workspace'
import { importOpenWorkspace } from '@/core/content/open-format'
import { createAsyncCollectionRepository, createCollectionRepository } from '@/core/repository'
import type { OpenHabit } from '@/core/content/open-format'
import type { OpenLegacyInboxHistory } from '@/core/content/open-format'
import type { Matter } from '@/domain/matter/model'
import { matterRepository } from '@/domain/matter/repository'

const importedMatter: Matter = {
  calmyId: 'matter-import-1', title: '导入冲突测试', why: '原始原因', primaryContradiction: '',
  status: 'active', currentStage: 'wood', trajectory: 'stable', evidenceIds: [], createdAt: 1723900000000,
  updatedAt: 1723900001000, revision: 2
}

const habitWithHistory: OpenHabit = {
  entityType: 'habit_entry', id: 'portable-habit-1', name: '散步', color: '#123456', days: 1,
  dates: ['2026-10-02'], revision: 2, history: [
    { revision: 1, operation: 'created', source: 'user', occurredAt: 10, after: { name: '散步', color: '#123456', days: 0, dates: [] } },
    { revision: 2, operation: 'updated', source: 'user', occurredAt: 20, before: { name: '散步', color: '#123456', days: 0, dates: [] }, after: { name: '散步', color: '#123456', days: 1, dates: ['2026-10-02'] } }
  ]
}

describe('Open Workspace apply policy', () => {
  beforeEach(() => {
    setActiveAccount('open-workspace-test-user')
    localStorage.clear()
    resetStoreCache()
  })
  afterEach(() => setActiveAccount(null))

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

  it('exports and synchronously imports Habit history through its existing collection', () => {
    const habits = createCollectionRepository<Omit<OpenHabit, 'entityType'>>('habits', item => item.id)
    habits.create({ id: 'portable-habit-1', name: '散步', color: '#123456', days: 1, dates: ['2026-10-02'], revision: 2, history: habitWithHistory.history })
    const exported = exportCurrentOpenWorkspace()
    expect(exported.manifest.entities).toContainEqual(expect.objectContaining({ calmy_id: habitWithHistory.id, calmy_type: 'habit_entry' }))
    expect(JSON.stringify(exported.files)).toContain('portable-habit-1')
    expect(JSON.stringify(exported.files)).toContain('occurredAt')

    localStorage.clear(); resetStoreCache()
    const result = applyOpenEntities([habitWithHistory])
    expect(result.created).toBe(1)
    expect(habits.find(habitWithHistory.id)).toMatchObject({ id: habitWithHistory.id, revision: 2, history: habitWithHistory.history })
  })

  it('durably imports Habit history without persisting the Open Format discriminator', async () => {
    const habits = createAsyncCollectionRepository<Omit<OpenHabit, 'entityType'>>('habits', item => item.id)
    const result = await applyOpenEntitiesDurable([habitWithHistory])

    expect(result.created).toBe(1)
    expect(await habits.find(habitWithHistory.id)).toEqual({
      id: habitWithHistory.id, name: habitWithHistory.name, color: habitWithHistory.color, days: habitWithHistory.days,
      dates: habitWithHistory.dates, revision: habitWithHistory.revision, history: habitWithHistory.history
    })
  })

  it('exports and durably imports Inbox history while storing it in the original history collection', async () => {
    const history: OpenLegacyInboxHistory = {
      entityType: 'inbox_history', id: 'legacy-inbox-history:open-1', revision: 1, operation: 'removed',
      source: 'user', occurredAt: 42, before: { id: 'inbox-1', text: '已移除的收件项' }, after: null
    }
    const historyRepository = createAsyncCollectionRepository<Omit<OpenLegacyInboxHistory, 'entityType'>>('inboxHistory', item => item.id)
    const { entityType: _entityType, ...stored } = history
    await historyRepository.create(stored)
    const exported = exportCurrentOpenWorkspace()
    expect(exported.manifest.entities).toContainEqual(expect.objectContaining({ calmy_id: history.id, calmy_type: 'inbox_history' }))
    const imported = importOpenWorkspace(exported.files)
    expect(imported.issues).toEqual([])
    expect(imported.entities).toContainEqual(history)

    localStorage.clear(); resetStoreCache()
    const result = await applyOpenEntitiesDurable(imported.entities)
    expect(result.created).toBe(1)
    expect(await historyRepository.find(history.id)).toEqual(stored)
  })
})
