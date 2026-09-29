export type ThemeMode = 'light' | 'dark'

export interface BackgroundPreferences {
  light?: string
  dark?: string
}

export type BackgroundSaveResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-format' | 'insufficient-contrast' | 'storage-unavailable' }

export interface CanvasTextPalette {
  primary: string
  secondary: string
  muted: string
}

type Rgb = { r: number; g: number; b: number }

const STORAGE_KEY = 'calmy.ui.backgrounds.v1'
const HEX_COLOR = /^#[\da-f]{6}$/i
const MIN_TEXT_CONTRAST = 4.5
const DARK_TEXT = '#1c2922'
const LIGHT_TEXT = '#f1eee7'
const DEFAULT_CANVAS: Readonly<Record<ThemeMode, string>> = { light: '#f7faf8', dark: '#1d211f' }

export function getDefaultBackgroundColor(mode: ThemeMode): string {
  return DEFAULT_CANVAS[mode]
}

export const BACKGROUND_COLOR_PRESETS: Readonly<Record<ThemeMode, readonly { name: string; value: string }[]>> = {
  light: [
    { name: 'Calmy 浅绿', value: '#f1f7ef' },
    { name: '暖米白', value: '#f4f1e9' },
    { name: '雾蓝灰', value: '#eef3f6' },
    { name: '浅玫瑰灰', value: '#f4eced' },
  ],
  dark: [
    { name: '石墨绿', value: '#1d2622' },
    { name: '深暖灰', value: '#292623' },
    { name: '夜蓝灰', value: '#20262d' },
    { name: '深莓灰', value: '#2c242a' },
  ],
}

function normalizeHexColor(color: string): string | undefined {
  const normalized = color.trim().toLowerCase()
  return HEX_COLOR.test(normalized) ? normalized : undefined
}

function parseHexColor(color: string): Rgb | undefined {
  const normalized = normalizeHexColor(color)
  if (!normalized) return undefined
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  }
}

function linearize(channel: number): number {
  const normalized = channel / 255
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(color: Rgb): number {
  return 0.2126 * linearize(color.r) + 0.7152 * linearize(color.g) + 0.0722 * linearize(color.b)
}

export function getContrastRatio(foreground: string, background: string): number {
  const foregroundRgb = parseHexColor(foreground)
  const backgroundRgb = parseHexColor(background)
  if (!foregroundRgb || !backgroundRgb) return 0
  const first = relativeLuminance(foregroundRgb)
  const second = relativeLuminance(backgroundRgb)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

function mixHexColors(foreground: string, background: string, amount: number): string {
  const first = parseHexColor(foreground)
  const second = parseHexColor(background)
  if (!first || !second) return foreground
  const channel = (a: number, b: number) => Math.round(a + (b - a) * amount).toString(16).padStart(2, '0')
  return `#${channel(first.r, second.r)}${channel(first.g, second.g)}${channel(first.b, second.b)}`
}

function maxReadableMix(foreground: string, background: string): number {
  let low = 0
  let high = 0.98
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const middle = (low + high) / 2
    const mixed = mixHexColors(foreground, background, middle)
    if (getContrastRatio(mixed, background) >= MIN_TEXT_CONTRAST) low = middle
    else high = middle
  }
  return low
}

export function getCanvasTextPalette(background: string): CanvasTextPalette {
  const normalized = normalizeHexColor(background)
  if (!normalized) return { primary: DARK_TEXT, secondary: DARK_TEXT, muted: DARK_TEXT }

  const primary = getContrastRatio(DARK_TEXT, normalized) >= getContrastRatio(LIGHT_TEXT, normalized)
    ? DARK_TEXT
    : LIGHT_TEXT
  const readableMix = maxReadableMix(primary, normalized)
  return {
    primary,
    secondary: mixHexColors(primary, normalized, readableMix * 0.48),
    muted: mixHexColors(primary, normalized, readableMix * 0.78),
  }
}

export function isAccessibleCanvasColor(color: string): boolean {
  const normalized = normalizeHexColor(color)
  if (!normalized) return false
  const palette = getCanvasTextPalette(normalized)
  return [palette.primary, palette.secondary, palette.muted]
    .every(foreground => getContrastRatio(foreground, normalized) >= MIN_TEXT_CONTRAST)
}

function readStoredPreferences(): BackgroundPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const value = parsed as Record<string, unknown>
    if (value.version !== 1 || !value.colors || typeof value.colors !== 'object') return {}
    const colors = value.colors as Record<string, unknown>
    const light = typeof colors.light === 'string' ? normalizeHexColor(colors.light) : undefined
    const dark = typeof colors.dark === 'string' ? normalizeHexColor(colors.dark) : undefined
    return { ...(light ? { light } : {}), ...(dark ? { dark } : {}) }
  } catch {
    return {}
  }
}

export function readBackgroundPreferences(): BackgroundPreferences {
  return readStoredPreferences()
}

function writePreferences(preferences: BackgroundPreferences): boolean {
  try {
    if (!preferences.light && !preferences.dark) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, colors: preferences }))
    }
    return true
  } catch {
    return false
  }
}

export function getThemeMode(): ThemeMode {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function applyBackgroundPreferences(mode: ThemeMode): void {
  const root = document.documentElement
  const color = readStoredPreferences()[mode]
  if (!color || !isAccessibleCanvasColor(color)) {
    root.classList.remove('custom-canvas-active')
    root.style.removeProperty('--calmy-page-canvas')
    root.style.removeProperty('--calmy-canvas-text')
    root.style.removeProperty('--calmy-canvas-text-2')
    root.style.removeProperty('--calmy-canvas-text-3')
    return
  }

  const text = getCanvasTextPalette(color)
  root.style.setProperty('--calmy-page-canvas', color)
  root.style.setProperty('--calmy-canvas-text', text.primary)
  root.style.setProperty('--calmy-canvas-text-2', text.secondary)
  root.style.setProperty('--calmy-canvas-text-3', text.muted)
  root.classList.add('custom-canvas-active')
}

export function previewBackgroundColor(mode: ThemeMode, color: string): BackgroundSaveResult {
  const normalized = normalizeHexColor(color)
  if (!normalized) return { ok: false, reason: 'invalid-format' }
  if (!isAccessibleCanvasColor(normalized)) return { ok: false, reason: 'insufficient-contrast' }
  if (getThemeMode() === mode) {
    const root = document.documentElement
    const text = getCanvasTextPalette(normalized)
    root.style.setProperty('--calmy-page-canvas', normalized)
    root.style.setProperty('--calmy-canvas-text', text.primary)
    root.style.setProperty('--calmy-canvas-text-2', text.secondary)
    root.style.setProperty('--calmy-canvas-text-3', text.muted)
    root.classList.add('custom-canvas-active')
  }
  return { ok: true }
}

export function saveBackgroundColor(mode: ThemeMode, color: string): BackgroundSaveResult {
  const normalized = normalizeHexColor(color)
  if (!normalized) return { ok: false, reason: 'invalid-format' }
  if (!isAccessibleCanvasColor(normalized)) return { ok: false, reason: 'insufficient-contrast' }

  const next = { ...readStoredPreferences(), [mode]: normalized }
  if (!writePreferences(next)) return { ok: false, reason: 'storage-unavailable' }
  if (getThemeMode() === mode) applyBackgroundPreferences(mode)
  return { ok: true }
}

export function resetBackgroundColor(mode: ThemeMode): boolean {
  const next = readStoredPreferences()
  delete next[mode]
  const saved = writePreferences(next)
  if (saved && getThemeMode() === mode) applyBackgroundPreferences(mode)
  return saved
}

export function setThemeMode(mode: ThemeMode): void {
  const root = document.documentElement
  root.classList.toggle('dark', mode === 'dark')
  try {
    localStorage.setItem('b_theme', mode)
  } catch {
    // Theme remains active for this page even when storage is unavailable.
  }
  applyBackgroundPreferences(mode)
  window.dispatchEvent(new CustomEvent('calmy-theme-mode-change', { detail: { mode } }))
}
