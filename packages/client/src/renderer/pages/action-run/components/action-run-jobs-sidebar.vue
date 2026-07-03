<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RefreshCw, RotateCcw } from 'lucide-vue-next'
import { Button, Empty, EmptyDescription, EmptyHeader, EmptyTitle, Skeleton, Spinner } from '@oh-my-github/ui'
import ActionStatusIcon from '@/components/actions/action-status-icon.vue'

const props = defineProps<{
  canRerunJobs: boolean
  hasError: boolean
  isLoading: boolean
  jobs: GitHubActionJob[]
  rerunDisabled: boolean
  rerunningJobId: number | null
  selectedJobId: number | null
}>()

const emit = defineEmits<{
  rerun: [jobId: number]
  retry: []
  select: [jobId: number]
}>()

const { t } = useI18n()

const showLoading = computed(() => props.isLoading && props.jobs.length === 0)
const showEmpty = computed(() => !props.hasError && !props.isLoading && props.jobs.length === 0)

function stepSummary(job: GitHubActionJob): string {
  const completedSteps = job.steps.filter((step) => step.status === 'completed').length

  return t('actions.detail.jobs.stepsSummary', {
    completed: completedSteps,
    total: job.steps.length,
  })
}

function canRerunJob(job: GitHubActionJob): boolean {
  return props.canRerunJobs && !props.rerunDisabled && job.status === 'completed'
}

function isRerunningJob(job: GitHubActionJob): boolean {
  return props.rerunningJobId === job.id
}
</script>

<template>
  <aside class="flex min-h-0 flex-col border-r border-border bg-card/70">
    <div class="border-b border-border px-4 py-3">
      <h2 class="select-none text-title font-semibold text-foreground">
        {{ t('actions.detail.jobs.title') }}
      </h2>
    </div>

    <div class="min-h-0 flex-1 overflow-auto">
      <div
        v-if="showLoading"
        class="grid gap-1 p-2"
      >
        <Skeleton
          v-for="index in 5"
          :key="index"
          class="h-14 rounded-lg"
        />
      </div>

      <Empty
        v-else-if="hasError"
        class="min-h-[16rem] border-0 bg-transparent"
      >
        <EmptyHeader>
          <EmptyTitle>
            {{ t('actions.detail.jobs.errorTitle') }}
          </EmptyTitle>
          <EmptyDescription>
            {{ t('actions.detail.jobs.errorDescription') }}
          </EmptyDescription>
          <Button
            class="justify-self-center"
            size="sm"
            type="button"
            variant="outline"
            @click="emit('retry')"
          >
            <RefreshCw class="size-3.5" />
            {{ t('actions.detail.retry') }}
          </Button>
        </EmptyHeader>
      </Empty>

      <Empty
        v-else-if="showEmpty"
        class="min-h-[16rem] border-0 bg-transparent"
      >
        <EmptyHeader>
          <EmptyTitle>
            {{ t('actions.detail.jobs.emptyTitle') }}
          </EmptyTitle>
          <EmptyDescription>
            {{ t('actions.detail.jobs.emptyDescription') }}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>

      <div
        v-else
        class="grid gap-1 p-2"
      >
        <div
          v-for="job in jobs"
          :key="job.id"
          class="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-lg transition-colors hover:bg-muted/60"
          :class="job.id === selectedJobId ? 'bg-muted text-foreground' : 'text-muted-foreground'"
        >
          <button
            class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 px-2 py-2 text-left outline-hidden focus-visible:ring-2 focus-visible:ring-ring/30"
            type="button"
            @click="emit('select', job.id)"
          >
            <ActionStatusIcon
              class="mt-0.5"
              :conclusion="job.conclusion"
              size="sm"
              :status="job.status"
            />
            <span class="grid min-w-0 gap-0.5">
              <span class="min-w-0 truncate text-control font-medium text-foreground">
                {{ job.name }}
              </span>
              <span class="select-none text-body text-muted-foreground">
                {{ stepSummary(job) }}
              </span>
            </span>
          </button>

          <Button
            class="mr-1"
            :aria-label="t('actions.detail.rerun.singleJobLabel', { job: job.name })"
            :disabled="!canRerunJob(job)"
            :loading="isRerunningJob(job)"
            loading-mode="manual"
            size="icon-sm"
            :title="t('actions.detail.rerun.singleJobLabel', { job: job.name })"
            type="button"
            variant="ghost"
            @click.stop="emit('rerun', job.id)"
          >
            <Spinner
              v-if="isRerunningJob(job)"
              class="size-3.5"
            />
            <RotateCcw
              v-else
              class="size-3.5"
            />
          </Button>
        </div>
      </div>
    </div>
  </aside>
</template>
