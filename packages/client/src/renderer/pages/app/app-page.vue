<script setup lang="ts">
import type { WorkspaceTab } from '@/pages/workspace/types'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Badge, Card } from '@oh-my-github/ui'
import { Bot } from 'lucide-vue-next'

const props = defineProps<{
  tab: WorkspaceTab
}>()

const { t } = useI18n()

const appSlug = computed(() => props.tab.appSlug ?? '')
</script>

<template>
  <section class="min-h-full bg-background">
    <div class="mx-auto grid w-full max-w-4xl gap-5 px-6 py-6">
      <div class="grid max-w-3xl gap-2">
        <Badge
          class="justify-self-start"
          variant="secondary"
        >
          <Bot />
          {{ t('app.eyebrow') }}
        </Badge>
        <h1 class="select-none truncate text-heading font-semibold text-foreground">
          {{ appSlug }}
        </h1>
        <p class="max-w-2xl select-none text-label text-muted-foreground">
          {{ t('app.description') }}
        </p>
      </div>

      <Card class="flex-row items-center justify-between gap-3 rounded-lg p-4">
        <div class="flex min-w-0 items-center gap-3">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-sm border border-border bg-white text-muted-foreground">
            <Bot class="size-5 text-[color:var(--accent-gray-deep)]" />
          </span>
          <div class="min-w-0">
            <div class="truncate text-label font-medium text-foreground">
              {{ appSlug }}
            </div>
            <div class="truncate text-body text-muted-foreground">
              github.com/apps/{{ appSlug }}
            </div>
          </div>
        </div>
      </Card>
    </div>
  </section>
</template>
