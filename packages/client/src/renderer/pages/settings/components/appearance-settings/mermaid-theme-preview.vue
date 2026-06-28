<script setup lang="ts">
import { computed } from 'vue'
import MermaidRenderer from '../../../../components/mermaid/mermaid-renderer.vue'
import type { MermaidTheme } from '../../../../stores/settings'

const props = defineProps<{
  isDark: boolean
  theme: MermaidTheme
}>()

const previewCode = `flowchart LR
  A([Idea]) --> B{Pick a theme}
  B -->|Auto| C[Match interface]
  B -->|Forest| D[Forest]
  B -->|Neutral| E[Neutral]`

const previewKey = computed(() => `${props.theme}:${props.isDark ? 'dark' : 'light'}`)
</script>

<template>
  <div class="min-h-64 overflow-hidden rounded-md border border-border bg-card p-3">
    <MermaidRenderer
      :key="previewKey"
      :code="previewCode"
      :is-dark="props.isDark"
    />
  </div>
</template>
