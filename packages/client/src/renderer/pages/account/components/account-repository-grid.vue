<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from 'lucide-vue-next'
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Skeleton,
} from '@oh-my-github/ui'
import AppPagination from '@/components/navigation/app-pagination.vue'
import RepositoryCard from '@/components/github/repository-card.vue'

const props = defineProps<{
  disabled?: boolean
  hasError: boolean
  isLoading: boolean
  mode: 'repositories' | 'stars'
  page: number
  perPage: number
  repositories: GitHubAccountRepository[]
  search: string
  totalCount: number
}>()

const emit = defineEmits<{
  retry: []
  select: [repository: GitHubAccountRepository]
  'update:page': [page: number]
  'update:search': [search: string]
}>()

const { t } = useI18n()

const pageModel = computed({
  get: () => props.page,
  set: (page: number) => {
    emit('update:page', page)
  },
})
const showPagination = computed(() => props.totalCount > props.perPage || props.page > 1)
const hasSearch = computed(() => props.search.trim().length > 0)
const emptyTitleKey = computed(() =>
  hasSearch.value ? `account.${props.mode}.search.empty.title` : `account.${props.mode}.empty.title`
)
const emptyDescriptionKey = computed(() =>
  hasSearch.value ? `account.${props.mode}.search.empty.description` : `account.${props.mode}.empty.description`
)

function updateSearch(value: string | number): void {
  emit('update:search', String(value))
}
</script>

<template>
  <section class="grid gap-3">
    <div class="flex min-w-0 justify-end">
      <InputGroup
        class="w-full sm:max-w-xs"
        size="sm"
      >
        <InputGroupAddon>
          <Search class="size-3.5 text-muted-foreground" />
        </InputGroupAddon>
        <InputGroupInput
          :model-value="search"
          :disabled="disabled"
          :placeholder="t(`account.${mode}.search.placeholder`)"
          type="search"
          @update:model-value="updateSearch"
        />
      </InputGroup>
    </div>

    <div
      v-if="isLoading && repositories.length === 0"
      class="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
    >
      <Skeleton
        v-for="index in 6"
        :key="index"
        class="h-52 rounded-lg"
      />
    </div>

    <Empty
      v-else-if="hasError"
      class="min-h-[18rem] border border-border bg-card"
    >
      <EmptyHeader>
        <EmptyTitle>
          {{ t(`account.${mode}.error.title`) }}
        </EmptyTitle>
        <EmptyDescription>
          {{ t(`account.${mode}.error.description`) }}
        </EmptyDescription>
        <Button
          class="justify-self-center"
          size="sm"
          type="button"
          variant="outline"
          @click="emit('retry')"
        >
          {{ t('account.error.retry') }}
        </Button>
      </EmptyHeader>
    </Empty>

    <Empty
      v-else-if="repositories.length === 0"
      class="min-h-[18rem] border border-border bg-card"
    >
      <EmptyHeader>
        <EmptyTitle>
          {{ t(emptyTitleKey) }}
        </EmptyTitle>
        <EmptyDescription>
          {{ t(emptyDescriptionKey) }}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>

    <template v-else>
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <RepositoryCard
          v-for="repository in repositories"
          :key="repository.id || repository.nameWithOwner"
          :repository="repository"
          @select="emit('select', $event)"
        />
      </div>

      <AppPagination
        v-if="showPagination"
        v-model:page="pageModel"
        :disabled="disabled || isLoading"
        hide-when-single-page
        :per-page="perPage"
        summary-key="account.pagination.summary"
        :total-count="totalCount"
      />
    </template>
  </section>
</template>
