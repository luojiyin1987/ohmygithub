<script setup lang="ts">
import { useGlobalKeyboardShortcuts } from './keyboard/global-shortcuts'
import { useKeyboardShortcutListener } from './keyboard/shortcut-runtime'
import { useSettingsStore } from './stores/settings'

const settingsStore = useSettingsStore()

void settingsStore.initialize()
useKeyboardShortcutListener()
useGlobalKeyboardShortcuts()
</script>

<template>
  <RouterView />
</template>
