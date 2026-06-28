import type { ShortcutPlatform } from './shortcut-definitions'

export interface ParsedAccelerator {
  accelerator: string
  signature: string
  parts: string[]
}

const MODIFIER_ORDER = ['Primary', 'Ctrl', 'Meta', 'Alt', 'Shift'] as const
const MODIFIER_KEY_VALUES = new Set([
  'Alt',
  'AltGraph',
  'Control',
  'Fn',
  'Meta',
  'Shift',
])

export function getShortcutPlatform(): ShortcutPlatform {
  const platform = navigator.platform || ''
  const userAgent = navigator.userAgent || ''

  return {
    isMac: /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS X/i.test(userAgent),
  }
}

export function parseAccelerator(
  accelerator: string | null | undefined,
  platform: ShortcutPlatform,
): ParsedAccelerator | null {
  if (!accelerator) return null

  const tokens = accelerator
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean)

  if (!tokens.length) return null

  const modifiers = new Set<string>()
  let key: string | null = null

  for (const token of tokens) {
    const modifier = normalizeModifierToken(token)
    if (modifier) {
      modifiers.add(modifier)
      continue
    }

    if (key) return null
    key = normalizeKeyToken(token)
  }

  if (!key) return null

  const parts = [
    ...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)),
    displayKeyToken(key),
  ]

  return {
    accelerator: canonicalAccelerator(modifiers, key),
    parts,
    signature: signatureFor(modifiers, key, platform),
  }
}

export function eventToAccelerator(
  event: KeyboardEvent,
  platform: ShortcutPlatform,
): string | null {
  if (MODIFIER_KEY_VALUES.has(event.key)) {
    return null
  }

  const key = normalizeEventKey(event.key)
  if (!key) return null

  const modifiers = new Set<string>()
  const hasPrimary = platform.isMac ? event.metaKey : event.ctrlKey

  if (hasPrimary) {
    modifiers.add('Primary')
  }

  if (event.ctrlKey && !(hasPrimary && !platform.isMac)) {
    modifiers.add('Ctrl')
  }

  if (event.metaKey && !(hasPrimary && platform.isMac)) {
    modifiers.add('Meta')
  }

  if (event.altKey) {
    modifiers.add('Alt')
  }

  if (event.shiftKey && !isShiftOnlyKey(key)) {
    modifiers.add('Shift')
  }

  return canonicalAccelerator(modifiers, key)
}

export function acceleratorToDisplayParts(
  accelerator: string | null | undefined,
  platform: ShortcutPlatform,
): string[] {
  return parseAccelerator(accelerator, platform)?.parts ?? []
}

export function signatureForEvent(event: KeyboardEvent, platform: ShortcutPlatform): string | null {
  const accelerator = eventToAccelerator(event, platform)
  return parseAccelerator(accelerator, platform)?.signature ?? null
}

function canonicalAccelerator(modifiers: Set<string>, key: string): string {
  const orderedModifiers = MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier))
  return [...orderedModifiers, displayKeyToken(key)].join('+')
}

function signatureFor(modifiers: Set<string>, key: string, platform: ShortcutPlatform): string {
  const ctrl = modifiers.has('Ctrl') || (modifiers.has('Primary') && !platform.isMac)
  const meta = modifiers.has('Meta') || (modifiers.has('Primary') && platform.isMac)
  const alt = modifiers.has('Alt')
  const shift = modifiers.has('Shift')

  return `ctrl:${ctrl ? '1' : '0'}|meta:${meta ? '1' : '0'}|alt:${alt ? '1' : '0'}|shift:${shift ? '1' : '0'}|key:${key}`
}

function normalizeModifierToken(token: string): string | null {
  const normalized = token.toLowerCase()

  if (normalized === 'primary' || normalized === 'cmdorctrl' || normalized === 'commandorcontrol') {
    return 'Primary'
  }

  if (normalized === 'ctrl' || normalized === 'control') return 'Ctrl'
  if (normalized === 'cmd' || normalized === 'command' || normalized === 'meta' || normalized === 'super') return 'Meta'
  if (normalized === 'alt' || normalized === 'option') return 'Alt'
  if (normalized === 'shift') return 'Shift'

  return null
}

function normalizeKeyToken(token: string): string {
  const normalized = token.trim()

  if (normalized.length === 1) {
    return normalized.toLowerCase()
  }

  const key = normalized.toLowerCase()
  if (key === 'arrowleft' || key === 'left') return 'left'
  if (key === 'arrowright' || key === 'right') return 'right'
  if (key === 'arrowup' || key === 'up') return 'up'
  if (key === 'arrowdown' || key === 'down') return 'down'
  if (key === 'escape' || key === 'esc') return 'escape'
  if (key === 'return') return 'enter'
  if (key === ' ') return 'space'

  return key
}

function normalizeEventKey(value: string): string | null {
  if (!value || value === 'Dead') return null
  if (value.length === 1) return value.toLowerCase()

  return normalizeKeyToken(value)
}

function displayKeyToken(key: string): string {
  if (key.length === 1) {
    return key.toUpperCase()
  }

  if (key === 'left') return 'Left'
  if (key === 'right') return 'Right'
  if (key === 'up') return 'Up'
  if (key === 'down') return 'Down'
  if (key === 'escape') return 'Esc'
  if (key === 'enter') return 'Enter'
  if (key === 'space') return 'Space'

  return key.slice(0, 1).toUpperCase() + key.slice(1)
}

function isShiftOnlyKey(key: string): boolean {
  return key.length === 1 && key !== key.toLowerCase()
}
