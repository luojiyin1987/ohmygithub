<script setup lang="ts">
import { Switch } from '@oh-my-github/ui'

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
  <div class="flex items-start justify-between gap-6 py-2.5">
    <div class="grid gap-0.5">
      <span class="text-body font-medium text-foreground">{{ title }}</span>
      <span
        v-if="description"
        class="text-caption text-muted-foreground"
      >
        {{ description }}
      </span>
    </div>
    <Switch
      :disabled="disabled"
      :model-value="modelValue"
      @update:model-value="emit('update:modelValue', $event === true)"
    />
  </div>
</template>
