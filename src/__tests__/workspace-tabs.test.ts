import { describe, expect, it } from 'vitest'
import {
  closeWorkspaceTab,
  createWorkspaceTabs,
  moveWorkspaceTab,
  readWorkspaceTabs,
  visitWorkspaceTab,
  writeWorkspaceTabs,
  type WorkspaceTab,
} from '../router/workspace-tabs'

const page = (path: string, title: string): WorkspaceTab => ({ path, title, pinned: false })

describe('workspace tab state', () => {
  it('always starts with a pinned Today tab', () => {
    expect(createWorkspaceTabs()).toEqual([
      { path: '/app/today', title: '今天', pinned: true },
    ])
  })

  it('adds a visited path once and refreshes its visible title', () => {
    const initial = visitWorkspaceTab(createWorkspaceTabs(), page('/app/people', '人物'))
    const revisited = visitWorkspaceTab(initial, page('/app/people', '人物关系'))

    expect(revisited).toEqual([
      { path: '/app/today', title: '今天', pinned: true },
      { path: '/app/people', title: '人物关系', pinned: false },
    ])
  })

  it('closes an active tab into its left neighbour without removing Today', () => {
    const tabs = [
      { path: '/app/today', title: '今天', pinned: true },
      page('/app/matters', '处境'),
      page('/app/people', '人物'),
    ]

    expect(closeWorkspaceTab(tabs, '/app/people', '/app/people')).toEqual({
      tabs: [
        { path: '/app/today', title: '今天', pinned: true },
        { path: '/app/matters', title: '处境', pinned: false },
      ],
      nextPath: '/app/matters',
    })
    expect(closeWorkspaceTab(tabs, '/app/today', '/app/today')).toEqual({ tabs, nextPath: undefined })
  })

  it('keeps at most twelve tabs by dropping the oldest non-pinned page', () => {
    const full = Array.from({ length: 11 }, (_, index) => page(`/app/page-${index + 1}`, `页面 ${index + 1}`))
      .reduce((tabs, tab) => visitWorkspaceTab(tabs, tab), createWorkspaceTabs())
    const next = visitWorkspaceTab(full, page('/app/page-12', '页面 12'))

    expect(next).toHaveLength(12)
    expect(next.map(tab => tab.path)).toEqual([
      '/app/today',
      '/app/page-2', '/app/page-3', '/app/page-4', '/app/page-5', '/app/page-6',
      '/app/page-7', '/app/page-8', '/app/page-9', '/app/page-10', '/app/page-11', '/app/page-12',
    ])
  })

  it('round-trips valid session tabs and falls back when cached JSON is damaged', () => {
    const cache = new Map<string, string>()
    const storage = {
      getItem: (key: string) => cache.get(key) ?? null,
      setItem: (key: string, value: string) => { cache.set(key, value) },
    }
    const tabs = visitWorkspaceTab(createWorkspaceTabs(), page('/app/review', '回顾'))

    writeWorkspaceTabs(storage, tabs)
    expect(readWorkspaceTabs(storage)).toEqual(tabs)

    cache.set('calmy_workspace_tabs_v1', '{broken')
    expect(readWorkspaceTabs(storage)).toEqual(createWorkspaceTabs())
  })

  it('moves ordinary tabs in either direction without moving the pinned Today tab', () => {
    const tabs = [createWorkspaceTabs()[0], page('/app/matters', '处境'), page('/app/people', '人物'), page('/app/review', '回顾')]

    expect(moveWorkspaceTab(tabs, '/app/review', '/app/matters').map(tab => tab.path)).toEqual([
      '/app/today', '/app/review', '/app/matters', '/app/people',
    ])
    expect(moveWorkspaceTab(tabs, '/app/matters', '/app/review').map(tab => tab.path)).toEqual([
      '/app/today', '/app/people', '/app/review', '/app/matters',
    ])
    expect(moveWorkspaceTab(tabs, '/app/people', '/app/today')).toEqual(tabs)
    expect(moveWorkspaceTab(tabs, '/app/today', '/app/people')).toEqual(tabs)
  })
})
