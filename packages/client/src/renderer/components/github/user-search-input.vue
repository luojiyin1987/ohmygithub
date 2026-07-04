<script setup lang="ts">
import { Command } from '@oh-my-github/ui'
import UserSearchInputContent from './user-search-input-content.vue'

defineProps<{
  disabled?: boolean
  inputId?: string
  modelValue: string
  placeholder?: string
}>()

const emit = defineEmits<{
  select: [item: GitHubWorkspaceSearchItem]
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <!--
    A text field with GitHub-style user typeahead. Composes Command (reka
    Listbox) so the suggestion rows get menu-row highlight and arrow/Enter
    keyboard navigation for free; the menu chrome is swapped for the shared
    field hairline so the closed state reads as a plain form input.
  -->
  <Command
    class="h-auto overflow-visible rounded-md border-0 bg-transparent shadow-[inset_0_0_0_1px_var(--field-edge-rest)] transition-shadow focus-within:shadow-[inset_0_0_0_1px_var(--field-edge-solid)] [&_[data-slot=command-input-wrapper]]:border-b-0"
    model-value=""
  >
    <UserSearchInputContent
      :disabled="disabled"
      :input-id="inputId"
      :model-value="modelValue"
      :placeholder="placeholder"
      @select="emit('select', $event)"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </Command>
</template>
