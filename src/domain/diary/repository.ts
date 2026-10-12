import { createAsyncCollectionRepository, createCollectionRepository } from '@/core/repository'
import { isDiaryEntry, type DiaryEntry, type DiaryRevision } from './model'

const synchronous = createCollectionRepository<DiaryEntry>('diary', entry => entry.date)
const asynchronous = createAsyncCollectionRepository<DiaryEntry>('diary', entry => entry.date)

function comparable(entry: DiaryEntry): DiaryEntry {
  return { ...entry, revision: entry.revision ?? 0 }
}

function copyOwnership(ownership: DiaryEntry['ownership']): DiaryEntry['ownership'] | undefined {
  if (!ownership) return undefined
  return {
    ...ownership,
    ownerRef: { ...ownership.ownerRef },
    ...(ownership.coOwnerRefs ? { coOwnerRefs: ownership.coOwnerRefs.map(ref => ({ ...ref })) } : {}),
    ...(ownership.subjectRef ? { subjectRef: { ...ownership.subjectRef } } : {}),
    stewardRefs: ownership.stewardRefs.map(ref => ({ ...ref }))
  }
}

export const diaryRepository = {
  list(): DiaryEntry[] { return synchronous.list().filter(isDiaryEntry) },
  find(date: string): DiaryEntry | undefined { const entry = synchronous.find(date); return entry && isDiaryEntry(entry) ? entry : undefined },
  importSync(entry: DiaryEntry): 'created' | 'unchanged' {
    const current = this.find(entry.date)
    if (current) {
      if (JSON.stringify(comparable(current)) === JSON.stringify(comparable(entry))) return 'unchanged'
      throw new Error(`Diary entity diary_${entry.date} has local changes`)
    }
    synchronous.create(entry)
    return 'created'
  },
  replaceSync(entry: DiaryEntry): 'replaced' | 'unchanged' {
    const current = this.find(entry.date)
    if (current && JSON.stringify(comparable(current)) === JSON.stringify(comparable(entry))) return 'unchanged'
    if (!current) { synchronous.create(entry); return 'replaced' }
    if (!synchronous.update(entry.date, () => entry)) throw new Error(`Diary entity diary_${entry.date} disappeared`)
    return 'replaced'
  },
  async listDurable(): Promise<DiaryEntry[]> { return (await asynchronous.list()).filter(isDiaryEntry) },
  async findDurable(date: string): Promise<DiaryEntry | undefined> { const entry = await asynchronous.find(date); return entry && isDiaryEntry(entry) ? entry : undefined },
  async create(entry: DiaryEntry): Promise<DiaryEntry> {
    if (!isDiaryEntry(entry)) throw new Error('diary-entry-invalid')
    return asynchronous.create(entry)
  },
  async createVersioned(entry: DiaryEntry, actorUserId?: string): Promise<DiaryEntry> {
    if (!isDiaryEntry(entry)) throw new Error('diary-entry-invalid')
    const revision = entry.revision ?? 1
    const history: DiaryRevision[] = [...(entry.history || []), {
      revision, operation: 'created', occurredAt: Date.now(), actorUserId,
      content: entry.content, ...(entry.sourceMaterialIds?.length ? { sourceMaterialIds: [...entry.sourceMaterialIds] } : {}),
      ...(entry.ownership ? { ownership: copyOwnership(entry.ownership) } : {})
    }]
    return asynchronous.create({ ...entry, revision, history })
  },
  async updateVersioned(
    date: string,
    patch: Partial<Pick<DiaryEntry, 'content' | 'sourceMaterialIds' | 'ownership'>>,
    operation: Exclude<DiaryRevision['operation'], 'created'>,
    expectedRevision: number,
    actorUserId?: string
  ): Promise<DiaryEntry> {
    let updated: DiaryEntry | undefined
    const persisted = await asynchronous.update(date, current => {
      const revision = current.revision ?? 0
      if (revision !== expectedRevision) throw new Error('diary-revision-conflict')
      const next = { ...current, ...patch, revision: revision + 1 }
      const event: DiaryRevision = {
        revision: next.revision!, operation, occurredAt: Date.now(), actorUserId,
        content: next.content, ...(next.sourceMaterialIds?.length ? { sourceMaterialIds: [...next.sourceMaterialIds] } : {}),
        ...(next.ownership ? { ownership: copyOwnership(next.ownership) } : {})
      }
      updated = { ...next, history: [...(current.history || []), event] }
      return updated
    })
    if (!persisted || !updated) throw new Error('diary-entry-update-failed')
    return updated
  },
  async importEntity(entry: DiaryEntry): Promise<'created' | 'unchanged'> {
    const current = await this.findDurable(entry.date)
    if (current) {
      if (JSON.stringify(comparable(current)) === JSON.stringify(comparable(entry))) return 'unchanged'
      throw new Error(`Diary entity diary_${entry.date} has local changes`)
    }
    await asynchronous.create(entry)
    return 'created'
  },
  async replaceImported(entry: DiaryEntry): Promise<'replaced' | 'unchanged'> {
    const current = await this.findDurable(entry.date)
    if (current && JSON.stringify(comparable(current)) === JSON.stringify(comparable(entry))) return 'unchanged'
    if (!current) { await asynchronous.create(entry); return 'replaced' }
    if (!await asynchronous.update(entry.date, () => entry)) throw new Error(`Diary entity diary_${entry.date} disappeared`)
    return 'replaced'
  },
  ready: asynchronous.ready
}
