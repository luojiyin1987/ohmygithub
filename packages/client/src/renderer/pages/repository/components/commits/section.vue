<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import GitHubBranchSelect from '../../../../components/github/github-branch-select.vue'
import { useRepositoryCommitsQuery } from '../../../../composables/github/use-repositories'
import CommitList from './list.vue'

const props = defineProps<{
  owner: string
  repo: string
  defaultBranch: string | null
}>()

const PER_PAGE = 30

const router = useRouter()
const selectedRef = ref<string | null>(props.defaultBranch)
const page = ref(1)

const hasRepositoryIdentity = computed(() => Boolean(props.owner && props.repo))
const effectiveRef = computed(() => selectedRef.value ?? props.defaultBranch)
const commitsQuery = useRepositoryCommitsQuery(
  () => props.owner,
  () => props.repo,
  effectiveRef,
  page,
  () => PER_PAGE,
  hasRepositoryIdentity,
)
const result = computed(() => commitsQuery.data.value ?? null)
const commits = computed(() => result.value?.items ?? [])
const hasNextPage = computed(() => result.value?.hasNextPage ?? false)
const isLoading = computed(() => commitsQuery.isLoading.value)
const hasError = computed(() => Boolean(commitsQuery.error.value))

watch(
  () => props.defaultBranch,
  (branch) => {
    if (selectedRef.value === null && branch) {
      selectedRef.value = branch
    }
  },
)

watch(
  () => [props.owner, props.repo] as const,
  () => {
    selectedRef.value = props.defaultBranch
    page.value = 1
  },
)

function selectBranch(branch: string): void {
  if (branch === effectiveRef.value) return
  selectedRef.value = branch
  page.value = 1
}

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
  <section class="grid gap-3">
    <div class="flex min-w-0 items-center gap-2">
      <GitHubBranchSelect
        :default-branch="defaultBranch"
        :model-value="effectiveRef"
        :owner="owner"
        :repo="repo"
        @update:model-value="selectBranch"
      />
    </div>

    <CommitList
      :commits="commits"
      :has-error="hasError"
      :has-identity="hasRepositoryIdentity"
      :has-next-page="hasNextPage"
      :is-loading="isLoading"
      :owner="owner"
      :page="page"
      :per-page="PER_PAGE"
      :repo="repo"
      @retry="refetchCommits"
      @select="openCommit"
      @update:page="page = $event"
    />
  </section>
</template>
