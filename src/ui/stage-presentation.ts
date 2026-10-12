export type StagePresentation = {
  mode: 'full' | 'simple'
  density: 'comfortable' | 'compact'
}

const STORAGE_KEY = 'calmy.ui.stage.v1'

function normalizePresentation(value: unknown): StagePresentation {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
  return {
    mode: record?.mode === 'simple' ? 'simple' : 'full',
    density: record?.density === 'compact' ? 'compact' : 'comfortable',
  }
}

function resolveStorage(storage?: Storage): Storage | undefined {
  return storage ?? (typeof window === 'undefined' ? undefined : window.localStorage)
}

export function readStagePresentation(storage?: Storage): StagePresentation {
  try {
    const raw = resolveStorage(storage)?.getItem(STORAGE_KEY)
    if (!raw) return normalizePresentation(undefined)
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return normalizePresentation(undefined)
    }
    const record = parsed as Record<string, unknown>
    return normalizePresentation(record.version === 1 ? record : undefined)
  } catch {
    return normalizePresentation(undefined)
  }
}

export function saveStagePresentation(value: StagePresentation, storage?: Storage): boolean {
  try {
    const target = resolveStorage(storage)
    if (!target) return false
    target.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...normalizePresentation(value) }))
    return true
  } catch {
    return false
  }
}
