<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
} from '@oh-my-github/ui'
import AppPagination from '@/components/navigation/app-pagination.vue'
import RunRow from './run-row.vue'

const props = defineProps<{
  disabled?: boolean
  hasError: boolean
  hasIdentity: boolean
  hasNextPage: boolean
  isLoading: boolean
  page: number
  perPage: number
  runs: GitHubActionRun[]
  totalCount: number
  workflowName: string | null
}>()

const emit = defineEmits<{
  retry: []
  select: [run: GitHubActionRun]
  'update:page': [page: number]
}>()

const { t } = useI18n()

const showLoading = computed(() => props.isLoading && props.runs.length === 0)
const showEmpty = computed(() =>
  props.hasIdentity
  && !props.hasError
  && !props.isLoading
  && props.runs.length === 0
)
const emptyDescription = computed(() =>
  props.workflowName
    ? t('repository.actions.runs.empty.workflowDescription', { workflow: props.workflowName })
    : t('repository.actions.runs.empty.allDescription')
)
</script>

<template>
  <section class="overflow-hidden rounded-xl border border-border bg-card">
    <div class="min-h-[18rem]">
      <div
        v-if="showLoading"
        class="divide-y divide-border"
      >
        <div
          v-for="index in 6"
          :key="index"
          class="grid grid-cols-[auto_minmax(0,1fr)] gap-3 p-4"
        >
          <Skeleton class="mt-0.5 size-5 rounded-md" />
          <div class="grid min-w-0 gap-2">
            <Skeleton class="h-4 w-4/5 rounded-md" />
            <Skeleton class="h-3 w-3/5 rounded-md" />
            <div class="flex gap-1.5">
              <Skeleton class="h-5 w-14 rounded-full" />
              <Skeleton class="h-5 w-20 rounded-full" />
              <Skeleton class="h-5 w-16 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      <Empty
        v-else-if="!hasIdentity"
        class="min-h-[18rem] border-0 bg-transparent"
      >
        <EmptyHeader>
          <EmptyTitle>
            {{ t('repository.actions.runs.empty.missingRepositoryTitle') }}
          </EmptyTitle>
          <EmptyDescription>
            {{ t('repository.actions.runs.empty.missingRepositoryDescription') }}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>

      <Empty
        v-else-if="hasError"
        class="min-h-[18rem] border-0 bg-transparent"
      >
        <EmptyHeader>
          <EmptyTitle>
            {{ t('repository.actions.runs.error.title') }}
          </EmptyTitle>
          <EmptyDescription>
            {{ t('repository.actions.runs.error.description') }}
          </EmptyDescription>
          <Button
            class="justify-self-center"
            size="sm"
            type="button"
            variant="outline"
            @click="emit('retry')"
          >
            {{ t('repository.actions.runs.error.retry') }}
          </Button>
        </EmptyHeader>
      </Empty>

      <Empty
        v-else-if="showEmpty"
        class="min-h-[18rem] border-0 bg-transparent"
      >
        <EmptyHeader>
          <EmptyTitle>
            {{ t('repository.actions.runs.empty.title') }}
          </EmptyTitle>
          <EmptyDescription>
            {{ emptyDescription }}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>

      <div
        v-else
        class="divide-y divide-border"
      >
        <RunRow
          v-for="run in runs"
          :key="run.id"
          :run="run"
          @select="emit('select', $event)"
        />
      </div>
    </div>

    <footer class="border-t border-border px-4 py-3">
      <AppPagination
        :disabled="disabled || isLoading || hasError || !hasIdentity"
        :has-next-page="hasNextPage"
        :page="page"
        :per-page="perPage"
        summary-key="repository.actions.runs.pagination.summary"
        :total-count="totalCount"
        @update:page="emit('update:page', $event)"
      />
    </footer>
  </section>
</template>
