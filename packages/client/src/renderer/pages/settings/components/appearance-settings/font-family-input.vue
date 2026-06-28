<script setup lang="ts">
import { ref, watch } from 'vue'
import { Input } from '@oh-my-github/ui'

const props = defineProps<{
  controlLabel: string
  modelValue: string
  placeholder: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const draft = ref(props.modelValue)

watch(
  () => props.modelValue,
  (value) => {
    draft.value = value
  }
)

function commit(): void {
  emit('update:modelValue', draft.value)
}
</script>

<template>
  <Input
    v-model="draft"
    :aria-label="props.controlLabel"
    :placeholder="props.placeholder"
    class="h-8 w-56 font-mono text-body"
    size="sm"
    @blur="commit"
    @change="commit"
    @keydown.enter="commit"
  />
</template>
