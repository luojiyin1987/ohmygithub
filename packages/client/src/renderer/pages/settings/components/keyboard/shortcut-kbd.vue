<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Kbd, KbdGroup } from '@oh-my-github/ui'
import { acceleratorToDisplayParts } from '../../../../keyboard/shortcut-accelerator'
import { useKeyboardShortcutStore } from '../../../../stores/keyboard-shortcuts'

const props = defineProps<{
  accelerator: string | null
  disabled?: boolean
}>()

const { t } = useI18n()
const shortcuts = useKeyboardShortcutStore()
const parts = computed(() => props.disabled
  ? []
  : acceleratorToDisplayParts(props.accelerator, shortcuts.platform)
)

function displayPart(part: string): string {
  if (part === 'Primary') return shortcuts.platform.isMac ? '⌘' : 'Ctrl'
  if (part === 'Meta') return shortcuts.platform.isMac ? '⌘' : 'Meta'
  if (part === 'Alt') return shortcuts.platform.isMac ? '⌥' : 'Alt'
  if (part === 'Shift') return shortcuts.platform.isMac ? '⇧' : 'Shift'
  if (part === 'Left') return '←'
  if (part === 'Right') return '→'
  if (part === 'Up') return '↑'
  if (part === 'Down') return '↓'

  return part
}
</script>

<template>
  <span
    v-if="disabled || parts.length === 0"
    class="text-body text-muted-foreground"
  >
    {{ t('settings.keyboard.disabled') }}
  </span>
  <KbdGroup v-else>
    <Kbd
      v-for="part in parts"
      :key="part"
    >
      {{ displayPart(part) }}
    </Kbd>
  </KbdGroup>
</template>
