<script setup lang="ts">
import { computed } from 'vue'
import { Check, Circle, X } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  label: string
  preserveSpace?: boolean
  showLabel?: boolean
  state: GitHubCiState | null
}>(), {
  preserveSpace: false,
  showLabel: false,
})

const emit = defineEmits<{
  click: []
}>()

const iconClass = computed(() => {
  if (props.state === 'success') return 'size-4 text-success'
  if (props.state === 'failure') return 'size-4 text-destructive'
  return 'size-3 fill-warning text-warning'
})

function open(): void {
  if (!props.state) return
  emit('click')
}
</script>

<template>
  <button
    v-if="state"
    :aria-label="label"
    class="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-muted-foreground outline-hidden transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
    :class="showLabel ? 'px-1 py-0.5 text-body' : 'size-5'"
    :title="label"
    type="button"
    @click.stop="open"
  >
    <Check
      v-if="state === 'success'"
      :class="iconClass"
      :stroke-width="2"
    />
    <X
      v-else-if="state === 'failure'"
      :class="iconClass"
      :stroke-width="2"
    />
    <Circle
      v-else
      :class="iconClass"
      :stroke-width="2"
    />
    <span v-if="showLabel">{{ label }}</span>
  </button>
  <span
    v-else-if="preserveSpace"
    aria-hidden="true"
    class="inline-flex size-5 shrink-0 invisible"
  />
</template>
