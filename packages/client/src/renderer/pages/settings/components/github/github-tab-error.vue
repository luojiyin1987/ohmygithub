<script setup lang="ts">
import { CircleAlert } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { Button } from '@oh-my-github/ui'
import { resolveErrorMessage } from './github-settings-utils'

defineProps<{
  error: unknown
}>()

const emit = defineEmits<{
  retry: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="flex items-start gap-3 rounded-[var(--radius-menu-shell)] border border-destructive/30 bg-destructive/5 px-4 py-3">
    <CircleAlert class="mt-0.5 size-4 shrink-0 text-destructive" />
    <div class="min-w-0 flex-1">
      <p class="text-control font-medium text-foreground">
        {{ t('settings.github.loadFailed') }}
      </p>
      <p class="mt-0.5 break-all text-body text-muted-foreground">
        {{ resolveErrorMessage(error) ?? String(error) }}
      </p>
    </div>
    <Button
      size="sm"
      variant="outline"
      @click="emit('retry')"
    >
      {{ t('settings.github.retry') }}
    </Button>
  </div>
</template>
