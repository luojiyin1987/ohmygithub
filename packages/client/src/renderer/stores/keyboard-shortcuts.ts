import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  acceleratorToDisplayParts,
  getShortcutPlatform,
  parseAccelerator,
} from '../keyboard/shortcut-accelerator'
import {
  KEYBOARD_SHORTCUT_DEFINITIONS,
  type KeyboardShortcutCommandId,
  type ShortcutPlatform,
  defaultAcceleratorForPlatform,
} from '../keyboard/shortcut-definitions'

export interface KeyboardShortcutOverride {
  accelerator: string | null
  disabled: boolean
}

export type KeyboardShortcutOverrides = Partial<Record<KeyboardShortcutCommandId, KeyboardShortcutOverride>>

export const useKeyboardShortcutStore = defineStore('keyboard-shortcuts', () => {
  const platform: ShortcutPlatform = getShortcutPlatform()
  const overrides = ref<KeyboardShortcutOverrides>({})
  const configPath = ref('')
  const isLoaded = ref(false)
  const isLoading = ref(false)
  const error = ref('')

  const effectiveAccelerators = computed(() => {
    const values = {} as Record<KeyboardShortcutCommandId, string | null>

    for (const definition of KEYBOARD_SHORTCUT_DEFINITIONS) {
      const override = overrides.value[definition.id]
      values[definition.id] = override?.disabled
        ? null
        : override?.accelerator ?? defaultAcceleratorForPlatform(definition, platform)
    }

    return values
  })

  async function load(): Promise<void> {
    if (isLoading.value || isLoaded.value) return

    isLoading.value = true
    error.value = ''

    try {
      const result = await window.ohMyGithub.config.get()
      configPath.value = result.path
      overrides.value = coerceShortcutOverrides(result.config.ui.keyboardShortcuts)
      isLoaded.value = true
    } catch {
      error.value = 'load'
    } finally {
      isLoading.value = false
    }
  }

  async function setShortcut(commandId: KeyboardShortcutCommandId, accelerator: string): Promise<void> {
    await saveOverrides({
      ...overrides.value,
      [commandId]: {
        accelerator,
        disabled: false,
      },
    })
  }

  async function disableShortcut(commandId: KeyboardShortcutCommandId): Promise<void> {
    await saveOverrides({
      ...overrides.value,
      [commandId]: {
        accelerator: null,
        disabled: true,
      },
    })
  }

  async function resetShortcut(commandId: KeyboardShortcutCommandId): Promise<void> {
    const nextOverrides = { ...overrides.value }
    delete nextOverrides[commandId]
    await saveOverrides(nextOverrides)
  }

  function acceleratorFor(commandId: KeyboardShortcutCommandId): string | null {
    return effectiveAccelerators.value[commandId] ?? null
  }

  function displayPartsFor(commandId: KeyboardShortcutCommandId): string[] {
    return acceleratorToDisplayParts(acceleratorFor(commandId), platform)
  }

  function isCustomized(commandId: KeyboardShortcutCommandId): boolean {
    return Boolean(overrides.value[commandId])
  }

  function isDisabled(commandId: KeyboardShortcutCommandId): boolean {
    return overrides.value[commandId]?.disabled === true
  }

  function commandIdForSignature(signature: string): KeyboardShortcutCommandId | null {
    for (const definition of KEYBOARD_SHORTCUT_DEFINITIONS) {
      const accelerator = acceleratorFor(definition.id)
      const parsed = parseAccelerator(accelerator, platform)
      if (parsed?.signature === signature) {
        return definition.id
      }
    }

    return null
  }

  function findConflict(
    commandId: KeyboardShortcutCommandId,
    accelerator: string,
  ): KeyboardShortcutCommandId | null {
    const signature = parseAccelerator(accelerator, platform)?.signature
    if (!signature) return null

    for (const definition of KEYBOARD_SHORTCUT_DEFINITIONS) {
      if (definition.id === commandId) continue

      const parsed = parseAccelerator(acceleratorFor(definition.id), platform)
      if (parsed?.signature === signature) {
        return definition.id
      }
    }

    return null
  }

  async function saveOverrides(nextOverrides: KeyboardShortcutOverrides): Promise<void> {
    error.value = ''

    try {
      const result = await window.ohMyGithub.config.update({
        ui: {
          keyboardShortcuts: nextOverrides,
        },
      })

      configPath.value = result.path
      overrides.value = coerceShortcutOverrides(result.config.ui.keyboardShortcuts)
      isLoaded.value = true
    } catch {
      error.value = 'save'
    }
  }

  return {
    acceleratorFor,
    commandIdForSignature,
    configPath,
    disableShortcut,
    displayPartsFor,
    effectiveAccelerators,
    error,
    findConflict,
    isCustomized,
    isDisabled,
    isLoaded,
    isLoading,
    load,
    overrides,
    platform,
    resetShortcut,
    setShortcut,
  }
})

function coerceShortcutOverrides(value: LocalConfig['ui']['keyboardShortcuts']): KeyboardShortcutOverrides {
  const result: KeyboardShortcutOverrides = {}
  const knownIds = new Set(KEYBOARD_SHORTCUT_DEFINITIONS.map((definition) => definition.id))

  for (const [commandId, override] of Object.entries(value)) {
    if (!knownIds.has(commandId as KeyboardShortcutCommandId)) continue

    result[commandId as KeyboardShortcutCommandId] = {
      accelerator: typeof override.accelerator === 'string' ? override.accelerator : null,
      disabled: override.disabled === true,
    }
  }

  return result
}
