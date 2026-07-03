<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  useRepositoryWorkflowRunsQuery,
  useRepositoryWorkflowsQuery,
} from '@/composables/github/use-actions'
import { createActionRunWorkspaceUrl } from '@/pages/workspace/workspace-url'
import RunList from './run-list.vue'
import WorkflowSelect from './workflow-select.vue'

const props = defineProps<{
  isActive: boolean
  owner: string
  repo: string
}>()

const ALL_WORKFLOWS_VALUE = 'all'
const PER_PAGE = 20
const LIVE_POLL_INTERVAL_MS = 5000

const router = useRouter()
const { t } = useI18n()
const workflowValue = ref(ALL_WORKFLOWS_VALUE)
const page = ref(1)
let pollingTimer: ReturnType<typeof setInterval> | null = null

const hasRepositoryIdentity = computed(() => Boolean(props.owner && props.repo))
const selectedWorkflowId = computed(() => {
  const id = Number(workflowValue.value)

  return Number.isInteger(id) && id > 0 ? id : null
})
const workflowsQuery = useRepositoryWorkflowsQuery(
  () => props.owner,
  () => props.repo,
  hasRepositoryIdentity,
)
const workflowRunsQuery = useRepositoryWorkflowRunsQuery(
  () => props.owner,
  () => props.repo,
  selectedWorkflowId,
  page,
  PER_PAGE,
  hasRepositoryIdentity,
)
const workflows = computed(() => workflowsQuery.data.value ?? [])
const selectedWorkflow = computed(() =>
  workflows.value.find((workflow) => workflow.id === selectedWorkflowId.value) ?? null
)
const result = computed(() => workflowRunsQuery.data.value ?? null)
const runs = computed(() => result.value?.items ?? [])
const totalCount = computed(() => result.value?.totalCount ?? 0)
const hasNextPage = computed(() => result.value?.hasNextPage ?? false)
const hasLiveRuns = computed(() => runs.value.some(isLiveRun))
const hasError = computed(() => Boolean(workflowsQuery.error.value || workflowRunsQuery.error.value))
const isLoading = computed(() => workflowsQuery.isLoading.value || workflowRunsQuery.isLoading.value)
const selectDisabled = computed(() => !hasRepositoryIdentity.value || workflowsQuery.isLoading.value)

watch(
  () => [props.owner, props.repo, workflowValue.value] as const,
  () => {
    page.value = 1
  },
)

watch(result, (currentResult) => {
  if (currentResult && currentResult.items.length === 0 && currentResult.totalCount > 0 && page.value > 1) {
    page.value = 1
  }
})

watch(
  () => [props.isActive, hasLiveRuns.value, props.owner, props.repo, workflowValue.value, page.value] as const,
  restartPolling,
  { immediate: true },
)

onBeforeUnmount(() => {
  stopPolling()
})

function isLiveRun(run: GitHubActionRun): boolean {
  return run.status !== 'completed'
}

function openRun(run: GitHubActionRun): void {
  if (!props.owner || !props.repo) return

  void router.push(createActionRunWorkspaceUrl(props.owner, props.repo, run.id))
}

function refetchActions(): void {
  void workflowsQuery.refetch()
  void workflowRunsQuery.refetch()
}

function restartPolling(): void {
  stopPolling()

  if (!props.isActive || !hasLiveRuns.value || !hasRepositoryIdentity.value) return

  pollingTimer = setInterval(() => {
    void workflowRunsQuery.refetch()
  }, LIVE_POLL_INTERVAL_MS)
}

function stopPolling(): void {
  if (!pollingTimer) return

  clearInterval(pollingTimer)
  pollingTimer = null
}
</script>

<template>
  <section class="grid gap-3">
    <div class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div class="grid min-w-0 gap-1">
        <h2 class="select-none truncate text-title font-semibold text-foreground">
          {{ t('repository.actions.title') }}
        </h2>
        <p class="select-none text-body text-muted-foreground">
          {{ t('repository.actions.description') }}
        </p>
      </div>
      <WorkflowSelect
        v-model="workflowValue"
        :disabled="selectDisabled"
        :workflows="workflows"
      />
    </div>

    <RunList
      :disabled="!hasRepositoryIdentity"
      :has-error="hasError"
      :has-identity="hasRepositoryIdentity"
      :has-next-page="hasNextPage"
      :is-loading="isLoading"
      :page="page"
      :per-page="PER_PAGE"
      :runs="runs"
      :total-count="totalCount"
      :workflow-name="selectedWorkflow?.name ?? null"
      @retry="refetchActions"
      @select="openRun"
      @update:page="page = $event"
    />
  </section>
</template>
