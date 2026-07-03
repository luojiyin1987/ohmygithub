<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { GitBranch, Hash, RotateCcw } from 'lucide-vue-next'
import { Badge } from '@oh-my-github/ui'
import ActionStatusIcon from '@/components/actions/action-status-icon.vue'
import ActionStatusBadge from '@/components/actions/action-status-badge.vue'
import { GitHubActorLink } from '@/components'

const props = defineProps<{
  run: GitHubActionRun
}>()

const emit = defineEmits<{
  select: [run: GitHubActionRun]
}>()

const { t } = useI18n()

const startedAt = computed(() => formatDateTime(props.run.runStartedAt ?? props.run.createdAt ?? props.run.updatedAt))
const updatedAt = computed(() => formatDateTime(props.run.updatedAt ?? props.run.completedAt ?? props.run.createdAt))
const shaLabel = computed(() => props.run.headSha.slice(0, 7))

function formatDateTime(value: string | null): string {
  if (!value) return t('actions.values.unknown')

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value))
}

function selectRun(): void {
  emit('select', props.run)
}
</script>

<template>
  <div
    class="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-3 p-4 text-left outline-hidden transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/30"
    role="button"
    tabindex="0"
    @click="selectRun"
    @keydown.enter.prevent="selectRun"
    @keydown.space.prevent="selectRun"
  >
    <div class="mt-0.5 flex size-5 items-center justify-center">
      <ActionStatusIcon
        :conclusion="run.conclusion"
        :status="run.status"
      />
    </div>

    <div class="grid min-w-0 gap-2">
      <div class="flex min-w-0 items-start gap-3">
        <div class="grid min-w-0 flex-1 gap-1">
          <div class="min-w-0 truncate text-control font-medium text-foreground">
            {{ run.displayTitle }}
          </div>
          <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-body text-muted-foreground">
            <span class="min-w-0 truncate">
              {{ run.workflowName ?? run.name ?? t('actions.values.unknownWorkflow') }}
            </span>
            <span aria-hidden="true">·</span>
            <span>{{ t('repository.actions.runs.meta.started', { date: startedAt }) }}</span>
            <span aria-hidden="true">·</span>
            <span>{{ t('repository.actions.runs.meta.updated', { date: updatedAt }) }}</span>
          </div>
        </div>

        <ActionStatusBadge
          class="shrink-0"
          :conclusion="run.conclusion"
          :status="run.status"
        />
      </div>

      <div class="flex min-w-0 flex-wrap items-center gap-1.5">
        <Badge
          size="sm"
          variant="outline"
        >
          <Hash class="size-3" />
          {{ run.runNumber }}
        </Badge>
        <Badge
          v-if="run.runAttempt > 1"
          size="sm"
          variant="secondary"
        >
          <RotateCcw class="size-3" />
          {{ t('repository.actions.runs.attempt', { attempt: run.runAttempt }) }}
        </Badge>
        <Badge
          size="sm"
          variant="secondary"
        >
          {{ run.event }}
        </Badge>
        <Badge
          v-if="run.headBranch"
          size="sm"
          variant="outline"
        >
          <GitBranch class="size-3" />
          {{ run.headBranch }}
        </Badge>
        <Badge
          size="sm"
          variant="outline"
        >
          {{ shaLabel }}
        </Badge>
        <GitHubActorLink
          avatar-size="xs"
          :avatar-url="run.actor.avatarUrl"
          :login="run.actor.login"
        />
      </div>
    </div>
  </div>
</template>
