<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useRepositoryIssueSearchQuery } from '@/composables/github/use-issues'
import FilterBar from './filter-bar.vue'
import IssueList from './list.vue'

const props = defineProps<{
  owner: string
  repo: string
}>()

const PER_PAGE = 20
const SEARCH_DEBOUNCE_MS = 300

const router = useRouter()
const state = ref<GitHubIssueSearchState>('open')
const searchInput = ref('')
const debouncedSearch = ref('')
const page = ref(1)
let searchTimer: ReturnType<typeof setTimeout> | null = null

const hasRepositoryIdentity = computed(() => Boolean(props.owner && props.repo))
const issuesQuery = useRepositoryIssueSearchQuery(
  () => props.owner,
  () => props.repo,
  state,
  debouncedSearch,
  page,
  PER_PAGE,
  hasRepositoryIdentity,
)
const result = computed(() => issuesQuery.data.value ?? null)
const issues = computed(() => result.value?.items ?? [])
const totalCount = computed(() => result.value?.totalCount ?? 0)
const incompleteResults = computed(() => result.value?.incompleteResults ?? false)
const hasError = computed(() => Boolean(issuesQuery.error.value))
const isLoading = computed(() => issuesQuery.isLoading.value)

watch(searchInput, (value) => {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }

  searchTimer = setTimeout(() => {
    debouncedSearch.value = value.trim()
    page.value = 1
    searchTimer = null
  }, SEARCH_DEBOUNCE_MS)
})

watch(
  () => [props.owner, props.repo, state.value] as const,
  () => {
    page.value = 1
  },
)

watch(result, (currentResult) => {
  if (currentResult && currentResult.items.length === 0 && currentResult.totalCount > 0 && page.value > 1) {
    page.value = 1
  }
})

onBeforeUnmount(() => {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
})

function openIssue(issue: GitHubIssue): void {
  void router.push(
    `/${encodeURIComponent(issue.owner)}/${encodeURIComponent(issue.repo)}/issues/${issue.number}`
  )
}

function refetchIssues(): void {
  void issuesQuery.refetch()
}
</script>

<template>
  <section class="grid gap-3">
    <FilterBar
      v-model:search="searchInput"
      v-model:state="state"
      :disabled="!hasRepositoryIdentity"
    />

    <IssueList
      :disabled="!hasRepositoryIdentity"
      :has-error="hasError"
      :has-identity="hasRepositoryIdentity"
      :incomplete-results="incompleteResults"
      :is-loading="isLoading"
      :issues="issues"
      :page="page"
      :per-page="PER_PAGE"
      :search="debouncedSearch"
      :state="state"
      :total-count="totalCount"
      @retry="refetchIssues"
      @select="openIssue"
      @update:page="page = $event"
    />
  </section>
</template>
