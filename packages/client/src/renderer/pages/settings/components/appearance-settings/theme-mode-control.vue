<script setup lang="ts">
import type { Component } from 'vue'
import { Monitor, Moon, Sun } from 'lucide-vue-next'
import { SegmentedControl, type SegmentedItem } from '@oh-my-github/ui'
import type { ThemePreference } from '@/stores/settings'

const props = defineProps<{
  controlLabel: string
  modelValue: ThemePreference
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ThemePreference]
}>()

const items: SegmentedItem<ThemePreference>[] = [
  { value: 'auto' },
  { value: 'light' },
  { value: 'dark' }
]

const icons: Record<ThemePreference, Component> = {
  auto: Monitor,
  dark: Moon,
  light: Sun
}
</script>

<template>
  <SegmentedControl
    :aria-label="props.controlLabel"
    :items="items"
    :model-value="props.modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #item="{ item }">
      <component
        :is="icons[item.value]"
        class="size-4"
      />
    </template>
  </SegmentedControl>
</template>
