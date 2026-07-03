<script setup lang="ts">
import type { WorkspaceTab } from '@/pages/workspace/types'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { SearchX } from 'lucide-vue-next'
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@oh-my-github/ui'

const props = defineProps<{
  tab: WorkspaceTab
}>()

const emit = defineEmits<{
  search: []
}>()

const { t } = useI18n()
const router = useRouter()
const input = computed(() => props.tab.notFoundInput ?? '')

function searchGitHub(): void {
  if (!input.value.trim()) return

  void router.push(`/search/all?q=${encodeURIComponent(input.value.trim())}`)
}
</script>

<template>
  <section class="min-h-full bg-background">
    <div class="mx-auto grid w-full max-w-3xl gap-5 px-6 py-6">
      <div class="grid gap-2">
        <Badge
          class="justify-self-start"
          variant="secondary"
        >
          <SearchX />
          {{ t('notFound.eyebrow') }}
        </Badge>
      </div>

      <Empty class="min-h-[24rem] border border-border bg-card">
        <EmptyHeader>
          <EmptyTitle>
            {{ t('notFound.title', { input }) }}
          </EmptyTitle>
          <EmptyDescription>
            {{ t('notFound.description') }}
          </EmptyDescription>
          <div class="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              @click="emit('search')"
            >
              {{ t('notFound.actions.searchAgain') }}
            </Button>
            <Button
              :disabled="!input.trim()"
              type="button"
              @click="searchGitHub"
            >
              {{ t('notFound.actions.searchGitHub') }}
            </Button>
          </div>
        </EmptyHeader>
      </Empty>
    </div>
  </section>
</template>
