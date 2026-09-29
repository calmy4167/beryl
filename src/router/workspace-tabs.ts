export const WORKSPACE_TABS_STORAGE_KEY = 'calmy_workspace_tabs_v1'
export const WORKSPACE_TAB_LIMIT = 12

export type WorkspaceTab = {
  path: string
  title: string
  pinned: boolean
}

type WorkspaceTabStorage = Pick<Storage, 'getItem' | 'setItem'>

const TODAY_TAB: WorkspaceTab = { path: '/app/today', title: '今天', pinned: true }

export function createWorkspaceTabs(): WorkspaceTab[] {
  return [{ ...TODAY_TAB }]
}

function isWorkspaceTab(value: unknown): value is WorkspaceTab {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<WorkspaceTab>
  return typeof candidate.path === 'string'
    && candidate.path.startsWith('/app/')
    && typeof candidate.title === 'string'
    && candidate.title.trim().length > 0
    && typeof candidate.pinned === 'boolean'
}

export function visitWorkspaceTab(
  tabs: readonly WorkspaceTab[],
  next: WorkspaceTab,
  limit = WORKSPACE_TAB_LIMIT,
): WorkspaceTab[] {
  if (next.path === TODAY_TAB.path) {
    return tabs.some(tab => tab.path === TODAY_TAB.path)
      ? tabs.map(tab => tab.path === TODAY_TAB.path ? { ...TODAY_TAB } : tab)
      : [{ ...TODAY_TAB }, ...tabs]
  }

  const existingIndex = tabs.findIndex(tab => tab.path === next.path)
  if (existingIndex >= 0) {
    return tabs.map((tab, index) => index === existingIndex
      ? { path: next.path, title: next.title, pinned: false }
      : tab)
  }

  const appended = [...tabs, { path: next.path, title: next.title, pinned: false }]
  if (appended.length <= limit) return appended

  const removableIndex = appended.findIndex(tab => !tab.pinned && tab.path !== next.path)
  return removableIndex < 0
    ? appended.slice(appended.length - limit)
    : appended.filter((_, index) => index !== removableIndex)
}

export function closeWorkspaceTab(
  tabs: readonly WorkspaceTab[],
  path: string,
  activePath: string,
): { tabs: WorkspaceTab[]; nextPath?: string } {
  const closingIndex = tabs.findIndex(tab => tab.path === path)
  if (closingIndex < 0 || tabs[closingIndex].pinned) return { tabs: [...tabs], nextPath: undefined }

  const remaining = tabs.filter(tab => tab.path !== path)
  if (path !== activePath) return { tabs: remaining, nextPath: undefined }

  const neighbourIndex = Math.max(0, Math.min(closingIndex - 1, remaining.length - 1))
  return { tabs: remaining, nextPath: remaining[neighbourIndex]?.path ?? TODAY_TAB.path }
}

export function moveWorkspaceTab(
  tabs: readonly WorkspaceTab[],
  path: string,
  targetPath: string,
): WorkspaceTab[] {
  const from = tabs.findIndex(tab => tab.path === path)
  const to = tabs.findIndex(tab => tab.path === targetPath)
  if (from < 0 || to < 0 || from === to || tabs[from].pinned || tabs[to].pinned) return [...tabs]

  const reordered = [...tabs]
  const [moving] = reordered.splice(from, 1)
  reordered.splice(to, 0, moving)
  return reordered
}

export function readWorkspaceTabs(storage: Pick<WorkspaceTabStorage, 'getItem'> = sessionStorage): WorkspaceTab[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(WORKSPACE_TABS_STORAGE_KEY) ?? 'null')
    if (!Array.isArray(parsed)) return createWorkspaceTabs()
    const valid = parsed.filter(isWorkspaceTab)
    const unique = valid.filter((tab, index) => valid.findIndex(candidate => candidate.path === tab.path) === index)
    const restored = unique.reduce<WorkspaceTab[]>((tabs, tab) => visitWorkspaceTab(tabs, tab), createWorkspaceTabs())
    return restored.length ? restored : createWorkspaceTabs()
  } catch {
    return createWorkspaceTabs()
  }
}

export function writeWorkspaceTabs(storage: Pick<WorkspaceTabStorage, 'setItem'> = sessionStorage, tabs: readonly WorkspaceTab[]) {
  try {
    storage.setItem(WORKSPACE_TABS_STORAGE_KEY, JSON.stringify(tabs))
  } catch {
    // Session persistence is a UI convenience; navigation remains usable if storage is unavailable.
  }
}
