<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { TooltipProvider } from '@oh-my-github/ui'
import {
  KEYBOARD_SHORTCUT_DEFINITION_BY_ID,
  KEYBOARD_SHORTCUT_DEFINITIONS,
  KEYBOARD_SHORTCUT_GROUPS,
  type KeyboardShortcutCommandId,
  type KeyboardShortcutGroupId,
} from '../../../../keyboard/shortcut-definitions'
import { parseAccelerator } from '../../../../keyboard/shortcut-accelerator'
import { useKeyboardShortcutStore } from '../../../../stores/keyboard-shortcuts'
import ShortcutSection from './shortcut-section.vue'

const { t } = useI18n()
const shortcuts = useKeyboardShortcutStore()
const editingId = ref<KeyboardShortcutCommandId | null>(null)
const pendingId = ref<KeyboardShortcutCommandId | null>(null)
const conflictIds = ref<Partial<Record<KeyboardShortcutCommandId, KeyboardShortcutCommandId>>>({})

const groupedShortcuts = computed(() => {
  return KEYBOARD_SHORTCUT_GROUPS.map((group) => ({
    group,
    shortcuts: KEYBOARD_SHORTCUT_DEFINITIONS.filter((definition) => definition.group === group),
  }))
})

const customizedIds = computed(() => new Set(
  Object.keys(shortcuts.overrides) as KeyboardShortcutCommandId[]
))
const disabledIds = computed(() => new Set(
  Object.entries(shortcuts.overrides)
    .filter(([, override]) => override?.disabled)
    .map(([commandId]) => commandId as KeyboardShortcutCommandId)
))
const conflictLabels = computed(() => {
  const labels: Partial<Record<KeyboardShortcutCommandId, string>> = {}

  for (const [commandId, conflictId] of Object.entries(conflictIds.value)) {
    if (!conflictId) continue

    const definition = KEYBOARD_SHORTCUT_DEFINITION_BY_ID.get(conflictId)
    if (definition) {
      labels[commandId as KeyboardShortcutCommandId] = t(definition.labelKey)
    }
  }

  return labels
})
const statusMessage = computed(() => {
  if (shortcuts.error === 'load') return t('settings.keyboard.errors.load')
  if (shortcuts.error === 'save') return t('settings.keyboard.errors.save')

  return ''
})

onMounted(() => {
  void shortcuts.load()
})

function startEdit(commandId: KeyboardShortcutCommandId): void {
  editingId.value = commandId
  clearConflict(commandId)
}

function cancelEdit(): void {
  editingId.value = null
  conflictIds.value = {}
}

async function saveShortcut(commandId: KeyboardShortcutCommandId, accelerator: string): Promise<void> {
  const parsed = parseAccelerator(accelerator, shortcuts.platform)
  if (!parsed) return

  const conflictId = shortcuts.findConflict(commandId, parsed.accelerator)
  if (conflictId) {
    conflictIds.value = {
      ...conflictIds.value,
      [commandId]: conflictId,
    }
    return
  }

  pendingId.value = commandId
  clearConflict(commandId)
  await shortcuts.setShortcut(commandId, parsed.accelerator)
  pendingId.value = null

  if (!shortcuts.error) {
    editingId.value = null
  }
}

async function disableShortcut(commandId: KeyboardShortcutCommandId): Promise<void> {
  pendingId.value = commandId
  clearConflict(commandId)
  await shortcuts.disableShortcut(commandId)
  pendingId.value = null
}

async function resetShortcut(commandId: KeyboardShortcutCommandId): Promise<void> {
  pendingId.value = commandId
  clearConflict(commandId)
  await shortcuts.resetShortcut(commandId)
  pendingId.value = null
}

function clearConflict(commandId: KeyboardShortcutCommandId): void {
  if (!conflictIds.value[commandId]) return

  const nextConflictIds = { ...conflictIds.value }
  delete nextConflictIds[commandId]
  conflictIds.value = nextConflictIds
}

function groupKey(group: KeyboardShortcutGroupId): string {
  return group
}
</script>

<template>
  <TooltipProvider>
    <div class="grid gap-6">
      <p class="max-w-2xl text-body text-muted-foreground">
        {{ t('settings.keyboard.description') }}
      </p>

      <p
        v-if="statusMessage"
        class="rounded-lg border border-border bg-card px-3 py-2 text-body text-destructive"
      >
        {{ statusMessage }}
      </p>

      <ShortcutSection
        v-for="groupedShortcut in groupedShortcuts"
        :key="groupKey(groupedShortcut.group)"
        :accelerators="shortcuts.effectiveAccelerators"
        :conflict-labels="conflictLabels"
        :customized-ids="customizedIds"
        :disabled-ids="disabledIds"
        :editing-id="editingId"
        :group="groupedShortcut.group"
        :pending-id="pendingId"
        :shortcuts="groupedShortcut.shortcuts"
        @cancel="cancelEdit"
        @disable="disableShortcut"
        @reset="resetShortcut"
        @save="saveShortcut"
        @start-edit="startEdit"
      />
    </div>
  </TooltipProvider>
</template>
