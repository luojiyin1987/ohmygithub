<script setup lang="ts">
import { computed } from 'vue'
import type { BundledTheme } from 'shiki'
import ShikiCode from '../../../../components/code/shiki-code.vue'

const props = defineProps<{
  theme: BundledTheme
}>()

const previewCode = `function greet(name: string): string {
  return \`Hello, \${name}\`
}`
const themes = computed(() => ({
  dark: props.theme,
  light: props.theme
}))
</script>

<template>
  <div class="overflow-hidden rounded-md border border-border">
    <ShikiCode
      :code="previewCode"
      language="typescript"
      :padded="true"
      :themed-background="true"
      :themes="themes"
    />
  </div>
</template>
