<script setup lang="ts">
import type { CommitActionRun } from '@/composables/github/use-actions'
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
import { createActionRunWorkspaceUrl } from '@/pages/workspace/workspace-url'
import { useCommitActionRunsQuery } from '@/composables/github/use-actions'
import { actionStatusLabelKey } from './action-status'
import ActionStatusBadge from './action-status-badge.vue'
import ActionStatusIcon from './action-status-icon.vue'

const props = defineProps<{
  open: boolean
  owner: string
  repo: string
  sha: string
}>()

const emit = defineEmits<{
  navigate: [url: string]
}>()

const { t, te } = useI18n()

const hasIdentity = computed(() => Boolean(props.owner && props.repo && props.sha))
const runsQuery = useCommitActionRunsQuery(
  () => props.owner,
  () => props.repo,
  () => props.sha,
  () => props.open && hasIdentity.value,
)
const items = computed(() => runsQuery.data.value ?? [])
const showLoading = computed(() => runsQuery.isLoading.value && items.value.length === 0)
const showEmpty = computed(() =>
  hasIdentity.value
  && !runsQuery.error.value
  && !runsQuery.isLoading.value
  && items.value.length === 0
)

function refetch(): void {
  void runsQuery.refetch()
}

function openJob(run: GitHubActionRun, job: GitHubActionJob): void {
  emit('navigate', createActionRunWorkspaceUrl(props.owner, props.repo, run.id, job.id))
}

function runTitle(item: CommitActionRun): string {
  return item.run.workflowName ?? item.run.name ?? t('actions.values.unknownWorkflow')
}

function runSubtitle(item: CommitActionRun): string {
  const parts = [
    t('actions.commitChecks.runNumber', { run: item.run.runNumber }),
    t('actions.commitChecks.attempt', { attempt: item.run.runAttempt }),
  ]
  const startedAt = formatDate(item.run.runStartedAt ?? item.run.createdAt)
  if (startedAt) parts.push(t('actions.commitChecks.started', { date: startedAt }))

  return parts.join(' · ')
}

function jobSubtitle(job: GitHubActionJob): string {
  const parts: string[] = []
  const startedAt = formatDate(job.startedAt)
  if (startedAt) parts.push(t('actions.commitChecks.started', { date: startedAt }))
  if (job.runnerName) parts.push(job.runnerName)

  return parts.join(' · ')
}

function statusLabel(status: GitHubActionRunStatus | null, conclusion: GitHubActionConclusion | null): string {
  const key = actionStatusLabelKey(status, conclusion)
  if (te(key)) return t(key)

  return conclusion ?? status ?? t('actions.statuses.unknown')
}

function formatDate(value: string | null | undefined): string {
  if (!value) return ''

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value))
}
</script>

<template>
  <div class="min-h-0">
    <div
      v-if="showLoading"
      class="grid gap-3"
    >
      <div
        v-for="index in 3"
        :key="index"
        class="grid gap-3 rounded-lg border border-border bg-background p-3"
      >
        <div class="flex items-center gap-3">
          <Skeleton class="size-4 rounded-full" />
          <div class="grid min-w-0 flex-1 gap-2">
            <Skeleton class="h-4 w-2/5 rounded-md" />
            <Skeleton class="h-3 w-3/5 rounded-md" />
          </div>
        </div>
        <Skeleton class="h-9 w-full rounded-md" />
        <Skeleton class="h-9 w-full rounded-md" />
      </div>
    </div>

    <Empty
      v-else-if="!hasIdentity || runsQuery.error.value"
      class="min-h-[16rem] border border-border bg-background"
    >
      <EmptyHeader>
        <EmptyTitle>{{ t('actions.commitChecks.errorTitle') }}</EmptyTitle>
        <EmptyDescription>
          {{ hasIdentity ? t('actions.commitChecks.errorDescription') : t('actions.commitChecks.missingDescription') }}
        </EmptyDescription>
        <Button
          v-if="hasIdentity"
          class="justify-self-center"
          size="sm"
          type="button"
          variant="outline"
          @click="refetch"
        >
          {{ t('actions.commitChecks.retry') }}
        </Button>
      </EmptyHeader>
    </Empty>

    <Empty
      v-else-if="showEmpty"
      class="min-h-[16rem] border border-border bg-background"
    >
      <EmptyHeader>
        <EmptyTitle>{{ t('actions.commitChecks.emptyTitle') }}</EmptyTitle>
        <EmptyDescription>{{ t('actions.commitChecks.emptyDescription') }}</EmptyDescription>
      </EmptyHeader>
    </Empty>

    <div
      v-else
      class="grid gap-3"
    >
      <section
        v-for="item in items"
        :key="item.run.id"
        class="overflow-hidden rounded-lg border border-border bg-background"
      >
        <header class="flex min-w-0 items-center gap-3 border-b border-border px-3 py-2.5">
          <ActionStatusIcon
            :conclusion="item.run.conclusion"
            :status="item.run.status"
          />
          <div class="grid min-w-0 flex-1 gap-0.5">
            <div class="min-w-0 truncate text-control font-medium text-foreground">
              {{ runTitle(item) }}
            </div>
            <div class="min-w-0 truncate text-body text-muted-foreground">
              {{ runSubtitle(item) }}
            </div>
          </div>
          <ActionStatusBadge
            :conclusion="item.run.conclusion"
            :status="item.run.status"
          />
        </header>

        <div
          v-if="item.jobsError !== null"
          class="px-3 py-3 text-body text-destructive"
        >
          {{ item.jobsError || t('actions.commitChecks.jobsErrorDescription') }}
        </div>

        <div
          v-else-if="item.jobs.length === 0"
          class="px-3 py-3 text-body text-muted-foreground"
        >
          {{ t('actions.commitChecks.noJobs') }}
        </div>

        <div
          v-else
          class="divide-y divide-border"
        >
          <button
            v-for="job in item.jobs"
            :key="job.id"
            class="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left outline-hidden transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/30"
            type="button"
            @click="openJob(item.run, job)"
          >
            <ActionStatusIcon
              :conclusion="job.conclusion"
              size="sm"
              :status="job.status"
            />
            <div class="grid min-w-0 gap-0.5">
              <div class="min-w-0 truncate text-body font-medium text-foreground">
                {{ job.name }}
              </div>
              <div class="min-w-0 truncate text-body text-muted-foreground">
                {{ jobSubtitle(job) || t('actions.commitChecks.jobFallbackMeta') }}
              </div>
            </div>
            <span class="shrink-0 select-none text-body text-muted-foreground">
              {{ statusLabel(job.status, job.conclusion) }}
            </span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
