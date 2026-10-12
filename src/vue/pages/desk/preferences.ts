export interface DeskPreferences {
  background: string
  fontSize: 14 | 16 | 19 | 22 | 26
  columnWidth: 'full' | 64 | 48 | 32
  horizontalAlign: 'left' | 'center' | 'right' | 'justify'
  verticalAlign: 'top' | 'middle' | 'bottom'
  lineSpacing: 1.5 | 1.65 | 1.85 | 2 | 2.2
  letterSpacing: -0.01 | 0 | 0.02 | 0.05 | 0.1
  paragraphSpacing: 0 | 0.5 | 1 | 1.5 | 2
}

const STORAGE_KEY = 'calmy.desk.preferences.v1'
const fontSizes = [14, 16, 19, 22, 26] as const
const widths = ['full', 64, 48, 32] as const
const alignments = ['left', 'center', 'right', 'justify'] as const
const verticalAlignments = ['top', 'middle', 'bottom'] as const
const lineSpacings = [1.5, 1.65, 1.85, 2, 2.2] as const
const letterSpacings = [-0.01, 0, 0.02, 0.05, 0.1] as const
const paragraphSpacings = [0, 0.5, 1, 1.5, 2] as const

function defaultBackground(): string {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? '#131312'
    : '#FBFBF8'
}

export function defaultDeskPreferences(): DeskPreferences {
  return {
    background: defaultBackground(),
    fontSize: 19,
    columnWidth: 'full',
    horizontalAlign: 'left',
    verticalAlign: 'top',
    lineSpacing: 1.85,
    letterSpacing: 0,
    paragraphSpacing: 0,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
}

function validate(value: unknown): value is DeskPreferences {
  return isRecord(value)
    && isColor(value.background)
    && fontSizes.includes(value.fontSize as typeof fontSizes[number])
    && widths.includes(value.columnWidth as typeof widths[number])
    && alignments.includes(value.horizontalAlign as typeof alignments[number])
    && verticalAlignments.includes(value.verticalAlign as typeof verticalAlignments[number])
    && lineSpacings.includes(value.lineSpacing as typeof lineSpacings[number])
    && letterSpacings.includes(value.letterSpacing as typeof letterSpacings[number])
    && paragraphSpacings.includes(value.paragraphSpacing as typeof paragraphSpacings[number])
}

export function readDeskPreferences(): DeskPreferences {
  const fallback = defaultDeskPreferences()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    return validate(parsed) ? { ...parsed } : fallback
  } catch {
    return fallback
  }
}

export function saveDeskPreferences(value: DeskPreferences): boolean {
  if (!validate(value)) return false
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function resetDeskPreferences(): DeskPreferences {
  const defaults = defaultDeskPreferences()
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* safe fallback for private browsing */ }
  return defaults
}
