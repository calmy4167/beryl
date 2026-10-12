const STORAGE_KEY = 'calmy.desk.hidden-captures.v1'

function parseHiddenIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))]
}

export function readHiddenDesktopCaptureIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? parseHiddenIds(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

function writeHiddenDesktopCaptureIds(ids: string[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parseHiddenIds(ids)))
    return true
  } catch {
    return false
  }
}

export function hideDesktopCaptureId(id: string): boolean {
  if (!id.trim()) return false
  return writeHiddenDesktopCaptureIds([...readHiddenDesktopCaptureIds(), id])
}

export function restoreDesktopCaptureId(id: string): boolean {
  return writeHiddenDesktopCaptureIds(readHiddenDesktopCaptureIds().filter(hiddenId => hiddenId !== id))
}
