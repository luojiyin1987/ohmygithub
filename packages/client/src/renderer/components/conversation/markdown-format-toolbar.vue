<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import {
  Button,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@oh-my-github/ui'
import {
  Bold,
  Code,
  Heading,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  SquareCode,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import type { MarkdownFormatAction } from './markdown-format-actions'

const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  (event: 'action', action: MarkdownFormatAction): void
}>()

const { t } = useI18n()

type ToolbarItem =
  | { type: 'action', action: MarkdownFormatAction, icon: Component }
  | { type: 'separator' }

const items: ToolbarItem[] = [
  { type: 'action', action: 'bold', icon: Bold },
  { type: 'action', action: 'italic', icon: Italic },
  { type: 'action', action: 'heading', icon: Heading },
  { type: 'separator' },
  { type: 'action', action: 'quote', icon: Quote },
  { type: 'action', action: 'code', icon: Code },
  { type: 'action', action: 'codeBlock', icon: SquareCode },
  { type: 'action', action: 'link', icon: Link },
  { type: 'separator' },
  { type: 'action', action: 'unorderedList', icon: List },
  { type: 'action', action: 'orderedList', icon: ListOrdered },
]
</script>

<template>
  <TooltipProvider>
    <div
      class="flex select-none items-center gap-0.5 border-b border-border px-1.5 py-1"
      role="toolbar"
      :aria-label="t('conversation.toolbar.label')"
    >
      <template
        v-for="(item, index) in items"
        :key="item.type === 'separator' ? `sep-${index}` : item.action"
      >
        <Separator
          v-if="item.type === 'separator'"
          class="mx-1 h-4"
          orientation="vertical"
        />
        <Tooltip v-else>
          <TooltipTrigger as-child>
            <Button
              :aria-label="t(`conversation.toolbar.${item.action}`)"
              :disabled="props.disabled"
              size="icon-sm"
              type="button"
              variant="ghost"
              @click="emit('action', item.action)"
            >
              <component
                :is="item.icon"
                class="size-3.5"
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ t(`conversation.toolbar.${item.action}`) }}</TooltipContent>
        </Tooltip>
      </template>
    </div>
  </TooltipProvider>
</template>
