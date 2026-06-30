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
import AppPagination from '../../../../components/navigation/app-pagination.vue'
import CommitRow from './row.vue'

const props = defineProps<{
  commits: GitHubRepositoryCommit[]
  hasError: boolean
  hasIdentity: boolean
  hasNextPage: boolean
  isLoading: boolean
  owner: string
  page: number
  perPage: number
  repo: string
}>()

const emit = defineEmits<{
  retry: []
  select: [commit: GitHubRepositoryCommit]
  'update:page': [page: number]
}>()

const { t } = useI18n()

const showLoading = computed(() => props.isLoading && props.commits.length === 0)
const showEmpty = computed(() =>
  props.hasIdentity
  && !props.hasError
  && !props.isLoading
  && props.commits.length === 0
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
          v-for="index in 8"
          :key="index"
          class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4"
        >
          <Skeleton class="size-7 rounded-full" />
          <div class="grid min-w-0 gap-2">
            <Skeleton class="h-4 w-3/5 rounded-md" />
            <Skeleton class="h-3 w-2/5 rounded-md" />
          </div>
          <Skeleton class="hidden h-5 w-16 rounded-md sm:block" />
        </div>
      </div>

      <Empty
        v-else-if="!hasIdentity"
        class="min-h-[18rem] border-0 bg-transparent"
      >
        <EmptyHeader>
          <EmptyTitle>
            {{ t('repository.commits.empty.missingRepositoryTitle') }}
          </EmptyTitle>
          <EmptyDescription>
            {{ t('repository.commits.empty.missingRepositoryDescription') }}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>

      <Empty
        v-else-if="hasError"
        class="min-h-[18rem] border-0 bg-transparent"
      >
        <EmptyHeader>
          <EmptyTitle>
            {{ t('repository.commits.error.title') }}
          </EmptyTitle>
          <EmptyDescription>
            {{ t('repository.commits.error.description') }}
          </EmptyDescription>
          <Button
            class="justify-self-center"
            size="sm"
            type="button"
            variant="outline"
            @click="emit('retry')"
          >
            {{ t('repository.commits.error.retry') }}
          </Button>
        </EmptyHeader>
      </Empty>

      <Empty
        v-else-if="showEmpty"
        class="min-h-[18rem] border-0 bg-transparent"
      >
        <EmptyHeader>
          <EmptyTitle>
            {{ t('repository.commits.empty.title') }}
          </EmptyTitle>
          <EmptyDescription>
            {{ t('repository.commits.empty.description') }}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>

      <div
        v-else
        class="divide-y divide-border"
      >
        <CommitRow
          v-for="commit in commits"
          :key="commit.sha"
          :commit="commit"
          :owner="owner"
          :repo="repo"
          @select="emit('select', $event)"
        />
      </div>
    </div>

    <footer class="border-t border-border px-4 py-3">
      <AppPagination
        :disabled="isLoading"
        :has-next-page="hasNextPage"
        :page="page"
        :per-page="perPage"
        summary-key="repository.commits.pagination.summary"
        :total-count="0"
        variant="compact"
        @update:page="emit('update:page', $event)"
      />
    </footer>
  </section>
</template>
