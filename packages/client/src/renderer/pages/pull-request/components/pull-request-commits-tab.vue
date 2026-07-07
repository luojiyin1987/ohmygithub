<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { usePullRequestCommitsQuery } from '@/composables/github/use-pull-requests'
import CommitList from '@/pages/repository/components/commits/list.vue'

const props = defineProps<{
  active: boolean
  owner: string
  repo: string
  number: number
}>()

const PER_PAGE = 30

const router = useRouter()
const page = ref(1)

const hasIdentity = computed(() => Boolean(props.owner && props.repo && props.number > 0))
const commitsQuery = usePullRequestCommitsQuery(
  () => props.owner,
  () => props.repo,
  () => props.number,
  page,
  () => PER_PAGE,
  () => props.active,
)
const result = computed(() => commitsQuery.data.value ?? null)
const commits = computed(() => result.value?.items ?? [])
const hasNextPage = computed(() => result.value?.hasNextPage ?? false)
// No total from the commits API; grow a synthetic one from the pages seen so
// far (same approach as the repository commits section).
const syntheticTotalCount = computed(() =>
  (page.value - 1) * PER_PAGE
  + commits.value.length
  + (hasNextPage.value ? PER_PAGE : 0)
)
const isLoading = computed(() => commitsQuery.isLoading.value)
const hasError = computed(() => Boolean(commitsQuery.error.value))

watch(
  () => [props.owner, props.repo, props.number] as const,
  () => {
    page.value = 1
  },
)

function refetchCommits(): void {
  void commitsQuery.refetch()
}

function openCommit(commit: GitHubRepositoryCommit): void {
  void router.push(
    `/${encodeURIComponent(props.owner)}/${encodeURIComponent(props.repo)}/commit/${encodeURIComponent(commit.sha)}`
  )
}
</script>

<template>
  <CommitList
    :commits="commits"
    :has-error="hasError"
    :has-identity="hasIdentity"
    :has-next-page="hasNextPage"
    :is-loading="isLoading"
    :owner="owner"
    :page="page"
    :per-page="PER_PAGE"
    :repo="repo"
    :total-count="syntheticTotalCount"
    @retry="refetchCommits"
    @select="openCommit"
    @update:page="page = $event"
  />
</template>
