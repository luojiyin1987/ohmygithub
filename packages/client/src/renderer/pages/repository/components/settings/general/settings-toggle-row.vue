<script setup lang="ts">
import { Switch } from '@oh-my-github/ui'
import SettingsRow from '@/pages/settings/components/appearance-settings/settings-row.vue'

defineProps<{
  title: string
  description?: string
  modelValue: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<template>
  <SettingsRow
    :description="description"
    :label="title"
  >
    <Switch
      :disabled="disabled"
      :model-value="modelValue"
      @update:model-value="emit('update:modelValue', $event === true)"
    />
  </SettingsRow>
</template>
