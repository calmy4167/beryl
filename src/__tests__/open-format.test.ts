import { describe, expect, it } from 'vitest'
import type { ActionItem } from '@/domain/action/model'
import type { Matter } from '@/domain/matter/model'
import type { RealityRecord } from '@/domain/record/model'
import type { TodayPlan } from '@/domain/today/model'
import { compareOpenEntities, compareOpenEntityFields, exportOpenWorkspace, importOpenWorkspace, mergeOpenEntity, OPEN_MANIFEST_PATH, scanOpenAssetReferences, serializeOpenEntity } from '@/core/content/open-format'

const matter: Matter = {
  calmyId: 'matter-stable-1', title: '处理：供应商/合同？', why: '减少长期不确定性', primaryContradiction: '',
  status: 'active', currentStage: 'wood', trajectory: 'stable', evidenceIds: [], createdAt: 1723900000000,
  updatedAt: 1723900001000, revision: 2
}

const action: ActionItem = {
  calmyId: 'action-stable-1', title: '发出确认邮件', date: '2026-08-19', status: 'done', matterId: matter.calmyId,
  resultNote: '已收到回复', createdAt: 1723900000000, updatedAt: 1723900002000, revision: 2
}

const record: RealityRecord = {
  calmyId: 'record-stable-1', type: 'fact', body: '对方在 15:30 回复：本周可以确认。', occurredAt: 1723900003000,
  createdAt: 1723900003000, updatedAt: 1723900003000, matterId: matter.calmyId, source: 'user',
  evidenceIds: [], revision: 1
}

const daily: TodayPlan = {
  date: '2026-08-19', load: 'normal', focusActionIds: [action.calmyId], why: '', mustProtect: ['午休'],
  letGo: [], review: { observation: '', analysis: '', adjustment: '', seed: '' }, revision: 1, updatedAt: 1723900004000
}

const asset = { path: 'assets/evidence.bin', data: new Uint8Array([0, 1, 2, 255]), mimeType: 'application/octet-stream' }

describe('Calmy Open Format', () => {
  it('round-trips all MVP entity types without losing stable IDs', () => {
    const workspace = exportOpenWorkspace({ matters: [matter], actions: [action], records: [record], dailies: [daily] })
    const result = importOpenWorkspace(workspace.files)

    expect(result.issues).toEqual([])
    expect(result.conflicts).toEqual([])
    expect(result.entities).toEqual(expect.arrayContaining([matter, action, record, daily]))
    expect(workspace.files[OPEN_MANIFEST_PATH]).toContain('calmy-open')
  })

  it('keeps the stable ID when a human renames or moves the Markdown file', () => {
    const workspace = exportOpenWorkspace({ matters: [matter] })
    const originalPath = Object.keys(workspace.files).find(path => path.endsWith('.md')) as string
    const renamedFiles = { 'Projects/供应商合同.md': workspace.files[originalPath] }

    const result = importOpenWorkspace(renamedFiles)

    expect(result.issues).toEqual([])
    expect(result.entities[0]).toMatchObject({ calmyId: matter.calmyId, title: matter.title })
  })

  it('accepts a moved file even when the old manifest path has not been edited yet', () => {
    const workspace = exportOpenWorkspace({ matters: [matter] })
    const originalPath = Object.keys(workspace.files).find(path => path.endsWith('.md')) as string
    const movedFiles = Object.fromEntries(Object.entries(workspace.files).map(([path, content]) => [
      path === originalPath ? 'Projects/供应商合同.md' : path, content
    ]))

    const result = importOpenWorkspace(movedFiles)

    expect(result.issues).toEqual([])
    expect(result.entities).toHaveLength(1)
    expect(result.entities[0]).toMatchObject({ calmyId: matter.calmyId })
  })

  it('classifies same-ID edits as conflicts while treating identical entities as unchanged', () => {
    const edited = { ...matter, why: '改动后的现实原因', revision: matter.revision + 1 }

    const changed = compareOpenEntities([matter], [edited])
    const unchanged = compareOpenEntities([matter], [matter])

    expect(changed.added).toHaveLength(0)
    expect(changed.conflicts).toEqual([expect.objectContaining({ calmyId: matter.calmyId, localRevision: 2, incomingRevision: 3 })])
    expect(unchanged.unchanged).toHaveLength(1)
  })

  it('merges only the fields explicitly selected from the incoming entity', () => {
    const incoming = { ...matter, why: 'Vault 原因', revision: 3 }
    const fields = compareOpenEntityFields(matter, incoming)
    const merged = mergeOpenEntity(matter, incoming, { why: 'use-incoming' })

    expect(fields.map(field => field.key)).toEqual(expect.arrayContaining(['why', 'revision']))
    expect(merged).toMatchObject({ why: 'Vault 原因', revision: matter.revision })
  })

  it('rejects duplicate stable IDs instead of silently overwriting one file', () => {
    const content = serializeOpenEntity(matter)
    const result = importOpenWorkspace({ 'A.md': content, 'B.md': content })

    expect(result.entities).toHaveLength(1)
    expect(result.conflicts).toEqual([expect.objectContaining({ calmyId: matter.calmyId, reason: 'duplicate-id' })])
  })

  it('reports malformed Markdown frontmatter as an import issue', () => {
    const result = importOpenWorkspace({ 'broken.md': '# no YAML frontmatter' })

    expect(result.entities).toHaveLength(0)
    expect(result.issues).toEqual([expect.objectContaining({ path: 'broken.md', code: 'invalid-entity' })])
  })

  it('detects a manifest hash mismatch after a file was edited outside Calmy', () => {
    const workspace = exportOpenWorkspace({ matters: [matter] })
    const markdownPath = Object.keys(workspace.files).find(path => path.endsWith('.md')) as string
    const files = { ...workspace.files, [markdownPath]: workspace.files[markdownPath] + '\n外部编辑' }

    const result = importOpenWorkspace(files)

    expect(result.issues).toEqual([expect.objectContaining({ code: 'manifest-hash-mismatch', path: markdownPath })])
  })

  it('does not silently discard unsupported asset files', () => {
    const result = importOpenWorkspace({ 'assets/photo.png': 'binary-placeholder' })

    expect(result.entities).toHaveLength(0)
    expect(result.issues).toEqual([expect.objectContaining({ code: 'unsupported-file', path: 'assets/photo.png' })])
  })

  it('round-trips binary assets through the manifest hash', () => {
    const workspace = exportOpenWorkspace({ matters: [matter], assets: [asset] })
    const result = importOpenWorkspace(workspace.files, workspace.assets)

    expect(result.issues).toEqual([])
    expect(result.assets).toHaveLength(1)
    expect([...result.assets[0].data]).toEqual([0, 1, 2, 255])
    expect(result.orphanAssets).toHaveLength(1)
    expect(workspace.files[OPEN_MANIFEST_PATH]).toContain('evidence.bin')
  })

  it('scans Obsidian and Markdown asset links and blocks missing references', () => {
    const references = scanOpenAssetReferences({ '50 Records/note.md': '![证据](assets/a.png)\\n![[assets/b.pdf|原件]]' })
    const missing = importOpenWorkspace({ '50 Records/note.md': serializeOpenEntity({ ...record, body: '![证据](assets/missing.png)' }) })

    expect(references).toEqual([
      { source_path: '50 Records/note.md', asset_path: 'assets/a.png', syntax: 'markdown' },
      { source_path: '50 Records/note.md', asset_path: 'assets/b.pdf', syntax: 'obsidian' }
    ])
    expect(missing.missingAssetReferences).toEqual([expect.objectContaining({ asset_path: 'assets/missing.png' })])
    expect(missing.issues).toEqual([expect.objectContaining({ code: 'missing-asset-reference' })])
  })
})
