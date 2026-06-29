<script setup lang="ts">
import type { PullRequestDetail } from './types'
import type { Component } from 'vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@oh-my-github/ui'
import {
  Copy,
  ExternalLink,
  GitCommitHorizontal,
  MessageSquare,
  MoreHorizontal,
  ShieldCheck,
} from 'lucide-vue-next'
import { GitHubActorLink, WorkItemStateBadge } from '../../../components'

const props = defineProps<{
  pullRequest: PullRequestDetail
  repository: string
}>()

interface PullRequestTabItem {
  id: string
  icon: Component
  label: string
  disabled: boolean
}

const { t } = useI18n()
const router = useRouter()

const pullRequestNumber = computed(() => `#${props.pullRequest.number}`)
const createdAt = computed(() => formatDate(props.pullRequest.createdAt))
const updatedAt = computed(() => formatDate(props.pullRequest.updatedAt))
const stateLabel = computed(() => t(`pullRequest.states.${props.pullRequest.state}`))
const updatedMeta = computed(() =>
  t('pullRequest.meta.updated', {
    date: updatedAt.value,
  })
)
const repositoryUrl = computed(() =>
  props.pullRequest.owner && props.pullRequest.repo
    ? `/${encodeURIComponent(props.pullRequest.owner)}/${encodeURIComponent(props.pullRequest.repo)}`
    : null
)
const tabs = computed<PullRequestTabItem[]>(() => [
  {
    id: 'conversations',
    icon: MessageSquare,
    label: t('pullRequest.tabs.conversations'),
    disabled: false,
  },
  {
    id: 'commits',
    icon: GitCommitHorizontal,
    label: t('pullRequest.tabs.commits'),
    disabled: true,
  },
  {
    id: 'checks',
    icon: ShieldCheck,
    label: t('pullRequest.tabs.checks'),
    disabled: true,
  },
  {
    id: 'review',
    icon: ShieldCheck,
    label: t('pullRequest.tabs.review'),
    disabled: true,
  },
])

async function copyPullRequestUrl(): Promise<void> {
  if (!props.pullRequest.url || !navigator.clipboard) return

  await navigator.clipboard.writeText(props.pullRequest.url)
}

function openRepository(): void {
  if (!repositoryUrl.value) return

  void router.push(repositoryUrl.value)
}

function formatDate(value: string | null | undefined): string {
  if (!value) return t('pullRequest.values.unknown')

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t('pullRequest.values.unknown')

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}
</script>

<template>
  <header class="grid gap-3 border-b border-border pb-4">
    <div class="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div class="grid min-w-0 gap-2">
        <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <WorkItemStateBadge
            kind="pull-request"
            :label="stateLabel"
            :state="pullRequest.state"
          />
          <button
            v-if="repositoryUrl"
            class="truncate rounded-sm text-body text-muted-foreground outline-hidden underline-offset-4 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring/30"
            type="button"
            @click="openRepository"
          >
            {{ repository }} {{ pullRequestNumber }}
          </button>
          <span
            v-else
            class="truncate text-body text-muted-foreground"
          >
            {{ repository }} {{ pullRequestNumber }}
          </span>
        </div>

        <h1 class="min-w-0 text-heading font-semibold leading-tight text-foreground">
          {{ pullRequest.title }}
        </h1>
      </div>

      <div class="flex shrink-0 items-center gap-1.5">
        <Button
          v-if="pullRequest.url"
          as="a"
          :href="pullRequest.url"
          rel="noreferrer"
          size="sm"
          target="_blank"
          type="button"
          variant="outline"
        >
          <ExternalLink class="size-3.5" />
          <span>{{ t('pullRequest.actions.openOnGitHub') }}</span>
        </Button>

        <DropdownMenu v-if="pullRequest.url">
          <DropdownMenuTrigger as-child>
            <Button
              :aria-label="t('pullRequest.actions.more')"
              class="size-8 text-muted-foreground"
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <MoreHorizontal class="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @select="copyPullRequestUrl">
              <Copy class="size-3.5" />
              <span>{{ t('pullRequest.actions.copyUrl') }}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-body text-muted-foreground">
      <span class="shrink-0">{{ t('pullRequest.meta.createdByPrefix') }}</span>
      <GitHubActorLink
        class="text-body"
        :avatar-url="pullRequest.author.avatarUrl"
        :login="pullRequest.author.login"
        :show-avatar="false"
      />
      <span class="truncate">{{ t('pullRequest.meta.createdByDate', { date: createdAt }) }}</span>
      <span aria-hidden="true">·</span>
      <span class="truncate">{{ updatedMeta }}</span>
    </div>

    <nav
      :aria-label="t('pullRequest.tabs.label')"
      class="flex min-w-0 flex-wrap items-center gap-1"
    >
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="inline-flex h-8 select-none items-center gap-1.5 border-b px-2 text-body font-medium outline-hidden transition-colors"
        :class="tab.disabled ? 'cursor-not-allowed border-transparent text-muted-foreground/70' : 'border-foreground text-foreground'"
        :aria-current="tab.disabled ? undefined : 'page'"
        :aria-disabled="tab.disabled ? 'true' : undefined"
        :disabled="tab.disabled"
        type="button"
      >
        <component
          :is="tab.icon"
          class="size-3.5"
        />
        <span>{{ tab.label }}</span>
      </button>
    </nav>
  </header>
</template>
