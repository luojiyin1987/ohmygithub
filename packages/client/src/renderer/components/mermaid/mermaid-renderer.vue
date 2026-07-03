<script setup lang="ts">
import { computed } from 'vue'
import { MermaidBlockNode } from 'markstream-vue'
import { useSettingsStore } from '@/stores/settings'
import type { MarkdownCodeNode, MarkstreamCodeNode } from '@/components/markdown/markstream-node-types'
import { applyMermaidThemeToSource, resolveMermaidIsDark } from './mermaid-theme'

const props = withDefaults(defineProps<{
  node?: MarkdownCodeNode
  code?: string
  loading?: boolean
  isDark?: boolean
}>(), {
  code: undefined,
  isDark: undefined,
  loading: false,
  node: undefined
})

const settings = useSettingsStore()
const isDark = computed(() =>
  resolveMermaidIsDark(settings.mermaidTheme, props.isDark ?? settings.isDark)
)
type MermaidRendererNode = MarkstreamCodeNode & MarkdownCodeNode

const baseNode = computed<MermaidRendererNode>(() => props.node as MermaidRendererNode ?? {
  type: 'code_block',
  raw: props.code ?? '',
  code: props.code ?? '',
  content: props.code ?? '',
  language: 'mermaid',
  loading: props.loading
} as MermaidRendererNode)
const node = computed<MarkstreamCodeNode>(() => {
  if (settings.mermaidTheme === 'auto') return baseNode.value

  const content = baseNode.value.content ?? baseNode.value.code ?? baseNode.value.raw ?? ''
  const themedContent = applyMermaidThemeToSource(content, settings.mermaidTheme)

  if (themedContent === content) return baseNode.value

  return {
    ...baseNode.value,
    code: themedContent,
    content: themedContent,
    raw: themedContent
  }
})
</script>

<template>
  <MermaidBlockNode
    :enable-mermaid-interactions="false"
    :is-dark="isDark"
    :loading="props.loading"
    :node="node"
    :show-copy-button="false"
    :show-export-button="false"
    :show-fullscreen-button="false"
    :show-header="false"
    :show-mode-toggle="false"
    :show-tooltips="false"
    class="rich-content-mermaid"
  />
</template>
