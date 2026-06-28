<script setup lang="ts">
import { NumberField } from '@oh-my-github/ui'

const props = defineProps<{
  controlLabel: string
  max: number
  min: number
  modelValue: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

function update(value: number | undefined): void {
  if (typeof value !== 'number') return
  emit('update:modelValue', value)
}
</script>

<template>
  <NumberField
    :aria-label="props.controlLabel"
    class="w-28"
    :max="props.max"
    :min="props.min"
    :model-value="props.modelValue"
    size="sm"
    :step="1"
    @update:model-value="update"
  />
</template>
