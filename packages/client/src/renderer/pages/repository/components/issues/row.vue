<script setup lang="ts">
import type { Component } from 'vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  CircleCheck,
  CircleDot,
  CircleSlash,
} from 'lucide-vue-next'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
} from '@oh-my-github/ui'

const props = defineProps<{
  issue: GitHubIssue
}>()

const emit = defineEmits<{
  select: [issue: GitHubIssue]
}>()

const { t } = useI18n()

const stateIcon = computed<Component>(() => {
  if (props.issue.state === 'completed') return CircleCheck
  if (props.issue.state === 'not_planned') return CircleSlash

  return CircleDot
})

const stateIconClass = computed(() => {
  if (props.issue.state === 'completed') return 'text-[color:var(--accent-purple)]'
  if (props.issue.state === 'not_planned') return 'text-muted-foreground'

  return 'text-success'
})

const stateLabel = computed(() => t(`repository.issues.states.${props.issue.state}`))
const updatedAt = computed(() => formatDate(props.issue.updatedAt))
const authorFallback = computed(() => props.issue.author.login.slice(0, 2).toUpperCase())

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function selectIssue(): void {
  emit('select', props.issue)
}
</script>

<template>
  <button
    class="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-3 p-4 text-left outline-hidden transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/30"
    type="button"
    @click="selectIssue"
  >
    <div class="relative mt-0.5 flex size-5 items-center justify-center">
      <component
        :is="stateIcon"
        class="size-4"
        :class="stateIconClass"
        :stroke-width="1.8"
      />
      <span
        v-if="issue.hasUpdates"
        class="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-info"
      />
    </div>

    <div class="grid min-w-0 gap-2">
      <div class="flex min-w-0 items-start gap-2">
        <div class="min-w-0 flex-1">
          <div class="truncate text-control font-medium text-foreground">
            #{{ issue.number }} {{ issue.title }}
          </div>
          <div class="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-body text-muted-foreground">
            <Badge
              size="sm"
              variant="secondary"
            >
              {{ stateLabel }}
            </Badge>
            <span>{{ t('repository.issues.meta.updated', { date: updatedAt }) }}</span>
            <span class="inline-flex min-w-0 items-center gap-1">
              <Avatar class="size-4">
                <AvatarImage
                  v-if="issue.author.avatarUrl"
                  :alt="issue.author.login"
                  :src="issue.author.avatarUrl"
                />
                <AvatarFallback class="text-[9px]">
                  {{ authorFallback }}
                </AvatarFallback>
              </Avatar>
              <span class="truncate">{{ issue.author.login }}</span>
            </span>
          </div>
        </div>
      </div>

      <div
        v-if="issue.labels.length > 0"
        class="flex min-w-0 flex-wrap gap-1.5"
      >
        <Badge
          v-for="label in issue.labels"
          :key="label"
          size="sm"
          variant="outline"
        >
          {{ label }}
        </Badge>
      </div>
    </div>
  </button>
</template>
