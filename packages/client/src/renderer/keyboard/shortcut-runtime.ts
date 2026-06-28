import { onBeforeUnmount, onMounted } from 'vue'
import type { KeyboardShortcutCommandId } from './shortcut-definitions'
import { signatureForEvent } from './shortcut-accelerator'
import { useKeyboardShortcutStore } from '../stores/keyboard-shortcuts'

type KeyboardShortcutHandler = () => boolean | void

interface KeyboardShortcutRegistration {
  commandId: KeyboardShortcutCommandId
  enabled?: () => boolean
  handler: KeyboardShortcutHandler
}

const registrations: KeyboardShortcutRegistration[] = []

export function registerKeyboardShortcutHandler(
  commandId: KeyboardShortcutCommandId,
  handler: KeyboardShortcutHandler,
  options: { enabled?: () => boolean } = {},
): () => void {
  const registration: KeyboardShortcutRegistration = {
    commandId,
    enabled: options.enabled,
    handler,
  }

  registrations.push(registration)

  return () => {
    const index = registrations.indexOf(registration)
    if (index !== -1) {
      registrations.splice(index, 1)
    }
  }
}

export function useKeyboardShortcutListener(): void {
  const shortcuts = useKeyboardShortcutStore()

  function onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || shouldIgnoreGlobalShortcut(event.target)) return

    const signature = signatureForEvent(event, shortcuts.platform)
    if (!signature) return

    const commandId = shortcuts.commandIdForSignature(signature)
    if (!commandId) return

    if (!invokeKeyboardShortcut(commandId)) return

    event.preventDefault()
    event.stopPropagation()
  }

  onMounted(() => {
    void shortcuts.load()
    window.addEventListener('keydown', onKeydown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
  })
}

function invokeKeyboardShortcut(commandId: KeyboardShortcutCommandId): boolean {
  for (let index = registrations.length - 1; index >= 0; index -= 1) {
    const registration = registrations[index]
    if (registration.commandId !== commandId) continue
    if (registration.enabled && !registration.enabled()) continue

    return registration.handler() !== false
  }

  return false
}

function shouldIgnoreGlobalShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"], [data-shortcut-recorder]'
    )
  )
}
