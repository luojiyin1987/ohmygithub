<script setup lang="ts">
import type { Component } from 'vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  CalendarClock,
  GitBranch,
  GitCommitHorizontal,
  Hash,
  RotateCcw,
  UserRound,
  Workflow,
} from 'lucide-vue-next'
import { Badge, Skeleton } from '@oh-my-github/ui'
import { GitHubActorLink } from '@/components'

interface SummaryItem {
  id: string
  icon: Component
  label: string
  value: string
}

const props = defineProps<{
  isLoading: boolean
  run: GitHubActionRun | null
}>()

const { t } = useI18n()

const summaryItems = computed<SummaryItem[]>(() => {
  const run = props.run
  if (!run) return []

  return [
    {
      id: 'workflow',
      icon: Workflow,
      label: t('actions.detail.summary.workflow'),
      value: run.workflowName ?? run.name ?? t('actions.values.unknownWorkflow'),
    },
    {
      id: 'event',
      icon: Hash,
      label: t('actions.detail.summary.event'),
      value: run.event,
    },
    {
      id: 'branch',
      icon: GitBranch,
      label: t('actions.detail.summary.branch'),
      value: run.headBranch ?? t('actions.values.unknownBranch'),
    },
    {
      id: 'commit',
      icon: GitCommitHorizontal,
      label: t('actions.detail.summary.commit'),
      value: run.headSha.slice(0, 7),
    },
    {
      id: 'attempt',
      icon: RotateCcw,
      label: t('actions.detail.summary.attempt'),
      value: String(run.runAttempt),
    },
    {
      id: 'started',
      icon: CalendarClock,
      label: t('actions.detail.summary.started'),
      value: formatDateTime(run.runStartedAt ?? run.createdAt),
    },
    {
      id: 'updated',
      icon: CalendarClock,
      label: t('actions.detail.summary.updated'),
      value: formatDateTime(run.updatedAt ?? run.completedAt),
    },
  ]
})

function formatDateTime(value: string | null): string {
  if (!value) return t('actions.values.unknown')

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}
</script>

<template>
  <section class="grid gap-3 rounded-xl border border-border bg-card p-4">
    <div class="flex min-w-0 items-center justify-between gap-3">
      <h2 class="select-none text-title font-semibold text-foreground">
        {{ t('actions.detail.summary.title') }}
      </h2>
      <Badge
        v-if="run"
        size="sm"
        variant="outline"
      >
        {{ t('actions.detail.summary.runNumber', { runNumber: run.runNumber }) }}
      </Badge>
    </div>

    <div
      v-if="isLoading && !run"
      class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
    >
      <Skeleton
        v-for="index in 6"
        :key="index"
        class="h-12 rounded-lg"
      />
    </div>

    <div
      v-else-if="run"
      class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
    >
      <div
        v-for="item in summaryItems"
        :key="item.id"
        class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-lg border border-border/70 bg-background/60 px-3 py-2"
      >
        <component
          :is="item.icon"
          class="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
        <div class="grid min-w-0 gap-0.5">
          <div class="select-none text-body text-muted-foreground">
            {{ item.label }}
          </div>
          <div class="min-w-0 truncate text-control font-medium text-foreground">
            {{ item.value }}
          </div>
        </div>
      </div>

      <div class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-lg border border-border/70 bg-background/60 px-3 py-2">
        <UserRound class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div class="grid min-w-0 gap-0.5">
          <div class="select-none text-body text-muted-foreground">
            {{ t('actions.detail.summary.actor') }}
          </div>
          <GitHubActorLink
            avatar-size="xs"
            :avatar-url="run.actor.avatarUrl"
            :login="run.actor.login"
          />
        </div>
      </div>
    </div>
  </section>
</template>
