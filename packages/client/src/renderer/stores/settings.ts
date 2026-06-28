import { computed, ref, watch } from 'vue'
import { useColorMode } from '@vueuse/core'
import { defineStore } from 'pinia'
import type { BundledTheme } from 'shiki'
import { bundledThemesInfo } from 'shiki/themes'
import { i18n, type SupportedLocale } from '../i18n'

export type ThemePreference = 'auto' | 'light' | 'dark'
export type ColorSchemeId = 'default' | 'ocean' | 'forest' | 'rose' | 'amber'
export type MermaidTheme = 'auto' | 'default' | 'dark' | 'forest' | 'neutral'
export type CodeThemePreference = string
export type ShikiThemeVariant = 'light' | 'dark'

export interface BundledShikiTheme {
  id: BundledTheme
  displayName: string
  type: ShikiThemeVariant
}

export interface ColorSchemeOption {
  id: ColorSchemeId
  labelKey: string
  swatches: string[]
  darkSwatches: string[]
}

export const DEFAULT_UI_FONT_FAMILY = 'system-ui, sans-serif'
export const DEFAULT_CODE_FONT_FAMILY = 'ui-monospace, monospace'
export const DEFAULT_UI_FONT_SIZE_PX = 16
export const DEFAULT_CODE_FONT_SIZE_PX = 13
export const DEFAULT_CODE_THEME_LIGHT: BundledTheme = 'github-light'
export const DEFAULT_CODE_THEME_DARK: BundledTheme = 'github-dark'
export const DEFAULT_MERMAID_THEME: MermaidTheme = 'auto'
export const MERMAID_THEMES: MermaidTheme[] = ['auto', 'default', 'dark', 'forest', 'neutral']

export const colorSchemes: ColorSchemeOption[] = [
  {
    id: 'default',
    labelKey: 'settings.appearance.colorSchemes.default',
    swatches: ['oklch(0.984 0.0024 72)', 'rgb(255 255 255)', 'oklch(0.21 0.004 95)', 'oklch(0.52 0.006 95)', 'oklch(0.56 0.15 245)'],
    darkSwatches: ['oklch(0.152 0 0)', 'oklch(0.21 0 0)', 'oklch(0.86 0 0)', 'oklch(0.62 0 0)', 'oklch(0.72 0.13 245)']
  },
  {
    id: 'ocean',
    labelKey: 'settings.appearance.colorSchemes.ocean',
    swatches: ['oklch(0.984 0.0024 230)', 'rgb(255 255 255)', 'oklch(0.21 0.004 230)', 'oklch(0.52 0.006 230)', 'oklch(0.56 0.15 230)'],
    darkSwatches: ['oklch(0.152 0.006 230)', 'oklch(0.21 0.006 230)', 'oklch(0.86 0.004 230)', 'oklch(0.62 0.006 230)', 'oklch(0.72 0.13 230)']
  },
  {
    id: 'forest',
    labelKey: 'settings.appearance.colorSchemes.forest',
    swatches: ['oklch(0.984 0.0024 150)', 'rgb(255 255 255)', 'oklch(0.21 0.004 150)', 'oklch(0.52 0.006 150)', 'oklch(0.50 0.14 150)'],
    darkSwatches: ['oklch(0.152 0.006 150)', 'oklch(0.21 0.006 150)', 'oklch(0.86 0.004 150)', 'oklch(0.62 0.006 150)', 'oklch(0.66 0.12 150)']
  },
  {
    id: 'rose',
    labelKey: 'settings.appearance.colorSchemes.rose',
    swatches: ['oklch(0.984 0.0024 355)', 'rgb(255 255 255)', 'oklch(0.21 0.004 355)', 'oklch(0.52 0.006 355)', 'oklch(0.58 0.18 355)'],
    darkSwatches: ['oklch(0.152 0.006 355)', 'oklch(0.21 0.006 355)', 'oklch(0.86 0.004 355)', 'oklch(0.62 0.006 355)', 'oklch(0.74 0.16 355)']
  },
  {
    id: 'amber',
    labelKey: 'settings.appearance.colorSchemes.amber',
    swatches: ['oklch(0.984 0.0024 70)', 'rgb(255 255 255)', 'oklch(0.21 0.004 70)', 'oklch(0.52 0.006 70)', 'oklch(0.62 0.15 70)'],
    darkSwatches: ['oklch(0.152 0.006 70)', 'oklch(0.21 0.006 70)', 'oklch(0.86 0.004 70)', 'oklch(0.62 0.006 70)', 'oklch(0.78 0.13 70)']
  }
]

const bundledThemesById = new Map<string, BundledShikiTheme>(
  bundledThemesInfo.map((info) => [
    info.id,
    { id: info.id as BundledTheme, displayName: info.displayName, type: info.type }
  ])
)

const colorSchemeIds = new Set<ColorSchemeId>(colorSchemes.map((scheme) => scheme.id))
const CSS_GENERIC_FONT_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong'
])

export function listBundledShikiThemes(): BundledShikiTheme[] {
  return Array.from(bundledThemesById.values())
}

export function normalizeShikiTheme(value: unknown, variant: ShikiThemeVariant): BundledTheme {
  if (typeof value === 'string') {
    const info = bundledThemesById.get(value)
    if (info && info.type === variant) return info.id
  }

  return variant === 'light' ? DEFAULT_CODE_THEME_LIGHT : DEFAULT_CODE_THEME_DARK
}

export function normalizeUiFontSizePx(value: unknown): number {
  return normalizePx(value, DEFAULT_UI_FONT_SIZE_PX, 12, 20)
}

export function normalizeCodeFontSizePx(value: unknown): number {
  return normalizePx(value, DEFAULT_CODE_FONT_SIZE_PX, 11, 20)
}

export function cssFontFamilyDeclaration(value: unknown, fallback: string): string {
  return splitFontFamilyList(cssFontStack(value, fallback))
    .map((family) => serializeFontFamily(family, fallback))
    .join(', ')
}

function normalizePx(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function normalizeLocale(value: unknown): SupportedLocale {
  return value === 'zh' ? 'zh' : 'en'
}

function normalizeTheme(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'auto'
}

function normalizeColorScheme(value: unknown): ColorSchemeId {
  return typeof value === 'string' && colorSchemeIds.has(value as ColorSchemeId)
    ? value as ColorSchemeId
    : 'default'
}

function normalizeMermaidTheme(value: unknown): MermaidTheme {
  return typeof value === 'string' && (MERMAID_THEMES as string[]).includes(value)
    ? value as MermaidTheme
    : DEFAULT_MERMAID_THEME
}

function normalizeFontFamilyInput(value: unknown): string {
  if (typeof value !== 'string') return ''
  const normalized = value
    .replace(/[\r\n\f]+/g, ' ')
    .trim()
    .replace(/^[;,]+/g, '')
    .replace(/[;,]+$/g, '')
    .trim()
    .slice(0, 256)
  const lastCode = normalized.charCodeAt(normalized.length - 1)

  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    return normalized.slice(0, -1)
  }

  return normalized
}

function normalizeStoredFontFamilyInput(value: unknown, fallback: string): string {
  const fontFamily = normalizeFontFamilyInput(value)
  const normalizedFontFamily = fontFamily.toLowerCase()

  if (!fontFamily || normalizedFontFamily === fallback.toLowerCase() || normalizedFontFamily === 'default') {
    return ''
  }

  return fontFamily
}

function cssFontStack(value: unknown, fallback: string): string {
  const fontFamily = normalizeStoredFontFamilyInput(value, fallback)
  if (!fontFamily) return fallback

  if (splitFontFamilyList(fontFamily).some(isGenericFontFamily)) {
    return fontFamily
  }

  return `${fontFamily}, ${fallback}`
}

function isGenericFontFamily(family: string): boolean {
  const trimmed = family.trim()
  const first = trimmed.at(0)

  if (first === '"' || first === "'") return false

  return CSS_GENERIC_FONT_FAMILIES.has(trimmed.toLowerCase())
}

function splitFontFamilyList(value: string): string[] {
  const families: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaped = false

  for (const char of value) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }

    if (char === '\\') {
      current += char
      escaped = true
      continue
    }

    if ((char === '"' || char === "'") && !quote) {
      quote = char
      current += char
      continue
    }

    if (char === quote) {
      quote = null
      current += char
      continue
    }

    if ((char === ',' || char === ';') && !quote) {
      const family = current.trim()
      if (family) families.push(family)
      current = ''
      continue
    }

    current += char
  }

  const family = current.trim()
  if (family) families.push(family)

  return families.filter((family) => !hasUnterminatedQuote(family))
}

function hasUnterminatedQuote(family: string): boolean {
  const first = family.at(0)
  return (first === '"' || first === "'") && (family.length < 2 || family.at(-1) !== first)
}

function serializeFontFamily(value: string, fallback: string): string {
  const unquoted = stripMatchingQuotes(value.trim())
  if (!unquoted) return fallback
  const normalized = unquoted.toLowerCase()
  if (CSS_GENERIC_FONT_FAMILIES.has(normalized)) return normalized
  return `"${escapeCssString(unquoted)}"`
}

function stripMatchingQuotes(value: string): string {
  if (value.length < 2) return value
  const first = value.at(0)
  const last = value.at(-1)

  return first === last && (first === '"' || first === "'")
    ? value.slice(1, -1)
    : value
}

function escapeCssString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\a ')
    .replace(/\r/g, '\\d ')
    .replace(/\f/g, '\\c ')
    .replace(/</g, '\\3c ')
}

function normalizeConfigUi(ui: Partial<LocalConfig['ui']> | undefined): LocalConfig['ui'] {
  return {
    locale: normalizeLocale(ui?.locale),
    theme: normalizeTheme(ui?.theme),
    colorScheme: normalizeColorScheme(ui?.colorScheme),
    uiFontSizePx: normalizeUiFontSizePx(ui?.uiFontSizePx),
    codeFontSizePx: normalizeCodeFontSizePx(ui?.codeFontSizePx),
    uiFontFamily: normalizeStoredFontFamilyInput(ui?.uiFontFamily, DEFAULT_UI_FONT_FAMILY),
    codeFontFamily: normalizeStoredFontFamilyInput(ui?.codeFontFamily, DEFAULT_CODE_FONT_FAMILY),
    shikiThemeLight: normalizeShikiTheme(ui?.shikiThemeLight, 'light'),
    shikiThemeDark: normalizeShikiTheme(ui?.shikiThemeDark, 'dark'),
    mermaidTheme: normalizeMermaidTheme(ui?.mermaidTheme),
    keyboardShortcuts: normalizeKeyboardShortcuts(ui?.keyboardShortcuts)
  }
}

function normalizeKeyboardShortcuts(value: unknown): LocalConfig['ui']['keyboardShortcuts'] {
  if (!isRecord(value)) {
    return {}
  }

  const shortcuts: LocalConfig['ui']['keyboardShortcuts'] = {}

  for (const [commandId, override] of Object.entries(value)) {
    if (!isRecord(override)) continue

    shortcuts[commandId] = {
      accelerator: typeof override.accelerator === 'string' ? override.accelerator : null,
      disabled: override.disabled === true
    }
  }

  return shortcuts
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function applyTypographyVariables(ui: LocalConfig['ui']): void {
  if (typeof document === 'undefined') return

  const style = document.documentElement.style
  const uiSize = normalizeUiFontSizePx(ui.uiFontSizePx)
  const codeSize = normalizeCodeFontSizePx(ui.codeFontSizePx)
  const uiFamily = normalizeStoredFontFamilyInput(ui.uiFontFamily, DEFAULT_UI_FONT_FAMILY)
  const codeFamily = normalizeStoredFontFamilyInput(ui.codeFontFamily, DEFAULT_CODE_FONT_FAMILY)

  style.setProperty('--memoh-ui-font-family', cssFontFamilyDeclaration(ui.uiFontFamily, DEFAULT_UI_FONT_FAMILY))
  style.setProperty('--memoh-code-font-family', cssFontFamilyDeclaration(ui.codeFontFamily, DEFAULT_CODE_FONT_FAMILY))
  style.setProperty('--memoh-code-font-size', `${codeSize}px`)

  if (uiFamily) {
    style.setProperty('--font-sans', cssFontFamilyDeclaration(uiFamily, DEFAULT_UI_FONT_FAMILY))
  } else {
    style.removeProperty('--font-sans')
  }

  if (codeFamily) {
    style.setProperty('--font-mono', cssFontFamilyDeclaration(codeFamily, DEFAULT_CODE_FONT_FAMILY))
  } else {
    style.removeProperty('--font-mono')
  }

  if (uiSize === DEFAULT_UI_FONT_SIZE_PX) {
    style.removeProperty('--memoh-ui-font-size')
  } else {
    style.setProperty('--memoh-ui-font-size', `${uiSize}px`)
  }
}

export function isMermaidTheme(value: unknown): value is MermaidTheme {
  return normalizeMermaidTheme(value) === value
}

export const useSettingsStore = defineStore('settings', () => {
  const defaultUi = normalizeConfigUi(undefined)
  const initialized = ref(false)
  const isSaving = ref(false)
  const configPath = ref('')
  const locale = ref<SupportedLocale>(defaultUi.locale)
  const theme = ref<ThemePreference>(defaultUi.theme)
  const colorScheme = ref<ColorSchemeId>(defaultUi.colorScheme)
  const uiFontSizePx = ref(defaultUi.uiFontSizePx)
  const codeFontSizePx = ref(defaultUi.codeFontSizePx)
  const uiFontFamily = ref(defaultUi.uiFontFamily)
  const codeFontFamily = ref(defaultUi.codeFontFamily)
  const shikiThemeLight = ref<BundledTheme>(defaultUi.shikiThemeLight as BundledTheme)
  const shikiThemeDark = ref<BundledTheme>(defaultUi.shikiThemeDark as BundledTheme)
  const mermaidTheme = ref<MermaidTheme>(defaultUi.mermaidTheme)
  const keyboardShortcuts = ref<LocalConfig['ui']['keyboardShortcuts']>(defaultUi.keyboardShortcuts)
  const colorMode = useColorMode<ThemePreference>({
    initialValue: theme.value,
    modes: {
      auto: '',
      dark: 'dark',
      light: 'light'
    },
    storageKey: null,
    storageRef: theme
  })

  const resolvedColorMode = computed(() => colorMode.state.value)
  const isDark = computed(() => resolvedColorMode.value === 'dark')
  const activeCodeTheme = computed(() => (isDark.value ? shikiThemeDark.value : shikiThemeLight.value))
  const codeThemeLight = computed(() => shikiThemeLight.value)
  const codeThemeDark = computed(() => shikiThemeDark.value)
  const codeThemes = computed(() => ({
    light: shikiThemeLight.value,
    dark: shikiThemeDark.value
  }))
  const shikiThemes = codeThemes
  const uiFontStack = computed(() => cssFontFamilyDeclaration(uiFontFamily.value, DEFAULT_UI_FONT_FAMILY))
  const codeFontStack = computed(() => cssFontFamilyDeclaration(codeFontFamily.value, DEFAULT_CODE_FONT_FAMILY))

  function snapshotUi(): LocalConfig['ui'] {
    return normalizeConfigUi({
      locale: locale.value,
      theme: theme.value,
      colorScheme: colorScheme.value,
      uiFontSizePx: uiFontSizePx.value,
      codeFontSizePx: codeFontSizePx.value,
      uiFontFamily: uiFontFamily.value,
      codeFontFamily: codeFontFamily.value,
      shikiThemeLight: shikiThemeLight.value,
      shikiThemeDark: shikiThemeDark.value,
      mermaidTheme: mermaidTheme.value,
      keyboardShortcuts: keyboardShortcuts.value
    })
  }

  function assignUi(ui: Partial<LocalConfig['ui']> | undefined): void {
    const normalized = normalizeConfigUi(ui)

    locale.value = normalized.locale
    theme.value = normalized.theme
    colorScheme.value = normalized.colorScheme
    uiFontSizePx.value = normalized.uiFontSizePx
    codeFontSizePx.value = normalized.codeFontSizePx
    uiFontFamily.value = normalized.uiFontFamily
    codeFontFamily.value = normalized.codeFontFamily
    shikiThemeLight.value = normalized.shikiThemeLight as BundledTheme
    shikiThemeDark.value = normalized.shikiThemeDark as BundledTheme
    mermaidTheme.value = normalized.mermaidTheme
    keyboardShortcuts.value = normalized.keyboardShortcuts
  }

  async function initialize(): Promise<void> {
    try {
      const info = await window.ohMyGithub?.config?.get?.()
      configPath.value = info?.path ?? ''
      assignUi(info?.config.ui)
    } finally {
      initialized.value = true
    }
  }

  async function persistUi(): Promise<void> {
    const ui = snapshotUi()

    isSaving.value = true
    try {
      const info = await window.ohMyGithub?.config?.update?.({ ui: configUiPatch(ui) })
      configPath.value = info?.path ?? configPath.value
      assignUi(info?.config.ui ?? ui)
    } catch {
      await initialize()
    } finally {
      isSaving.value = false
    }
  }

  function updateUi(patch: Partial<LocalConfig['ui']>): void {
    assignUi({
      ...snapshotUi(),
      ...patch
    })
    void persistUi()
  }

  function configUiPatch(ui: LocalConfig['ui']): Partial<LocalConfig['ui']> {
    return {
      locale: ui.locale,
      theme: ui.theme,
      colorScheme: ui.colorScheme,
      uiFontSizePx: ui.uiFontSizePx,
      codeFontSizePx: ui.codeFontSizePx,
      uiFontFamily: ui.uiFontFamily,
      codeFontFamily: ui.codeFontFamily,
      shikiThemeLight: ui.shikiThemeLight,
      shikiThemeDark: ui.shikiThemeDark,
      mermaidTheme: ui.mermaidTheme
    }
  }

  function setLocale(value: SupportedLocale): void {
    updateUi({ locale: normalizeLocale(value) })
  }

  function setLanguage(value: SupportedLocale): void {
    setLocale(value)
  }

  function setTheme(value: ThemePreference): void {
    updateUi({ theme: normalizeTheme(value) })
  }

  function setColorScheme(value: ColorSchemeId): void {
    updateUi({ colorScheme: normalizeColorScheme(value) })
  }

  function setUiFontSizePx(value: number | string): void {
    updateUi({ uiFontSizePx: normalizeUiFontSizePx(value) })
  }

  function setCodeFontSizePx(value: number | string): void {
    updateUi({ codeFontSizePx: normalizeCodeFontSizePx(value) })
  }

  function setUiFontFamily(value: string): void {
    updateUi({ uiFontFamily: normalizeStoredFontFamilyInput(value, DEFAULT_UI_FONT_FAMILY) })
  }

  function setCodeFontFamily(value: string): void {
    updateUi({ codeFontFamily: normalizeStoredFontFamilyInput(value, DEFAULT_CODE_FONT_FAMILY) })
  }

  function setCodeThemes(value: { light?: CodeThemePreference; dark?: CodeThemePreference }): void {
    updateUi({
      shikiThemeLight: value.light ? normalizeShikiTheme(value.light, 'light') : shikiThemeLight.value,
      shikiThemeDark: value.dark ? normalizeShikiTheme(value.dark, 'dark') : shikiThemeDark.value
    })
  }

  function setShikiTheme(variant: ShikiThemeVariant, value: CodeThemePreference): void {
    updateUi({
      shikiThemeLight: variant === 'light' ? normalizeShikiTheme(value, 'light') : shikiThemeLight.value,
      shikiThemeDark: variant === 'dark' ? normalizeShikiTheme(value, 'dark') : shikiThemeDark.value
    })
  }

  function setMermaidTheme(value: MermaidTheme): void {
    updateUi({ mermaidTheme: normalizeMermaidTheme(value) })
  }

  watch(
    locale,
    (value) => {
      i18n.global.locale.value = value
      if (typeof document !== 'undefined') {
        document.documentElement.lang = value
      }
    },
    { immediate: true }
  )

  watch(
    theme,
    (value) => {
      colorMode.value = value
    },
    { immediate: true }
  )

  watch(
    colorScheme,
    (value) => {
      if (typeof document !== 'undefined') {
        if (value === 'default') {
          delete document.documentElement.dataset.colorScheme
        } else {
          document.documentElement.dataset.colorScheme = value
        }
      }
    },
    { immediate: true }
  )

  watch(
    [uiFontFamily, codeFontFamily, uiFontSizePx, codeFontSizePx],
    () => {
      applyTypographyVariables(snapshotUi())
    },
    { immediate: true }
  )

  return {
    activeCodeTheme,
    codeFontFamily,
    codeFontSizePx,
    codeFontStack,
    codeThemeDark,
    codeThemeLight,
    codeThemes,
    colorMode,
    colorScheme,
    configPath,
    initialized,
    isDark,
    isSaving,
    locale,
    mermaidTheme,
    resolvedColorMode,
    setCodeFontFamily,
    setCodeFontSizePx,
    setCodeThemes,
    setColorScheme,
    setLanguage,
    setLocale,
    setMermaidTheme,
    setShikiTheme,
    setTheme,
    setUiFontFamily,
    setUiFontSizePx,
    shikiThemeDark,
    shikiThemeLight,
    shikiThemes,
    theme,
    uiFontFamily,
    uiFontSizePx,
    uiFontStack,
    initialize
  }
})
