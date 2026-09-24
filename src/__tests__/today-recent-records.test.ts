import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { RealityDocument } from '@/domain/reality'

const listActionRecordDocumentsAsync = vi.hoisted(() => vi.fn())
vi.mock('@/domain/reality', () => ({ listActionRecordDocumentsAsync }))

import { TodayRecentRecords } from '@/react/pages/today/TodayRecentRecords'

const now = Date.now()
const rowDocument = (id: string, overrides: Partial<RealityDocument> = {}): RealityDocument => ({
  id, calmyId: id, source: 'legacy', entityType: 'record', title: id, summary: id,
  route: '/app/review', updatedAt: now, occurredAt: now, searchText: id, ...overrides
})

describe('TodayRecentRecords', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    host = document.createElement('div')
    window.document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    listActionRecordDocumentsAsync.mockReset()
  })

  it('loads only records and renders categories only when present', async () => {
    listActionRecordDocumentsAsync.mockResolvedValue([
      rowDocument('mind-row', { journalCategory: 'mind' } as Partial<RealityDocument>),
      rowDocument('legacy-row')
    ])

    await act(async () => {
      root.render(createElement(MemoryRouter, null, createElement(TodayRecentRecords)))
    })

    expect(listActionRecordDocumentsAsync).toHaveBeenCalledWith(expect.objectContaining({ types: ['record'] }))
    expect(host.textContent).toContain('心')
    expect(host.textContent).not.toContain('事实')
    expect(host.querySelectorAll('.recent-record-row')).toHaveLength(2)
  })
})
