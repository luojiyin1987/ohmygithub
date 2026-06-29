<script setup lang="ts">
import type { PullRequestDetail } from './types'
import type { Component } from 'vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  CalendarDays,
  FileDiff,
  GitBranch,
  GitPullRequest,
  ShieldCheck,
  Users,
} from 'lucide-vue-next'
import {
  GitHubActorLink,
  GitHubReferenceLink,
  WorkItemLabelList,
  WorkItemSidebarSection,
} from '../../../components'

const props = defineProps<{
  pullRequest: PullRequestDetail
}>()

interface SummaryItem {
  id: string
  icon: Component
  label: string
  value: string
}

interface DateItem {
  id: string
  label: string
  value: string
}

const { t } = useI18n()

const labels = computed(() => props.pullRequest.labels ?? [])
const assignees = computed(() => props.pullRequest.assignees ?? [])
const participants = computed(() => props.pullRequest.participants ?? [])
const reviewRequests = computed(() => props.pullRequest.reviewRequests ?? [])
const linkedIssues = computed(() => props.pullRequest.linkedIssues ?? [])
const latestReviews = computed(() => props.pullRequest.latestReviews ?? [])
const statusItems = computed<SummaryItem[]>(() => [
  {
    id: 'checks',
    icon: ShieldCheck,
    label: t('pullRequest.sidebar.status.checks'),
    value: props.pullRequest.status.ciState
      ? t(`pullRequest.checks.${props.pullRequest.status.ciState}`)
      : t('pullRequest.values.unknown'),
  },
  {
    id: 'review',
    icon: Users,
    label: t('pullRequest.sidebar.status.review'),
    value: props.pullRequest.reviewDecision
      ? t(`pullRequest.reviewDecision.${props.pullRequest.reviewDecision}`)
      : t('pullRequest.reviewDecision.none'),
  },
  {
    id: 'merge',
    icon: GitPullRequest,
    label: t('pullRequest.sidebar.status.merge'),
    value: props.pullRequest.status.mergeStateStatus || t('pullRequest.values.unknown'),
  },
])
const diffItems = computed<SummaryItem[]>(() => [
  {
    id: 'files',
    icon: FileDiff,
    label: t('pullRequest.sidebar.diff.files'),
    value: formatCount(props.pullRequest.diffStats.changedFiles),
  },
  {
    id: 'additions',
    icon: FileDiff,
    label: t('pullRequest.sidebar.diff.additions'),
    value: `+${formatCount(props.pullRequest.diffStats.additions)}`,
  },
  {
    id: 'deletions',
    icon: FileDiff,
    label: t('pullRequest.sidebar.diff.deletions'),
    value: `-${formatCount(props.pullRequest.diffStats.deletions)}`,
  },
])
const dates = computed<DateItem[]>(() => [
  {
    id: 'created',
    label: t('pullRequest.sidebar.dates.created'),
    value: formatDate(props.pullRequest.createdAt),
  },
  {
    id: 'updated',
    label: t('pullRequest.sidebar.dates.updated'),
    value: formatDate(props.pullRequest.updatedAt),
  },
  props.pullRequest.closedAt
    ? {
        id: 'closed',
        label: t('pullRequest.sidebar.dates.closed'),
        value: formatDate(props.pullRequest.closedAt),
      }
    : null,
  props.pullRequest.mergedAt
    ? {
        id: 'merged',
        label: t('pullRequest.sidebar.dates.merged'),
        value: formatDate(props.pullRequest.mergedAt),
      }
    : null,
].filter(isDateItem))

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

function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value)
}

function isDateItem(value: DateItem | null): value is DateItem {
  return value !== null
}
</script>

<template>
  <aside class="grid">
    <WorkItemSidebarSection :title="t('pullRequest.sidebar.sections.reviewers')">
      <div
        v-if="reviewRequests.length > 0"
        class="grid gap-2"
      >
        <div
          v-for="request in reviewRequests"
          :key="request.id"
          class="flex min-w-0 text-body"
        >
          <GitHubActorLink
            :avatar-url="request.reviewer.avatarUrl"
            :login="request.reviewer.login"
          />
        </div>
      </div>
      <p
        v-else
        class="text-body text-muted-foreground"
      >
        {{ t('pullRequest.sidebar.empty.reviewers') }}
      </p>
    </WorkItemSidebarSection>

    <WorkItemSidebarSection :title="t('pullRequest.sidebar.sections.assignees')">
      <div
        v-if="assignees.length > 0"
        class="grid gap-2"
      >
        <div
          v-for="assignee in assignees"
          :key="assignee.login"
          class="flex min-w-0 text-body"
        >
          <GitHubActorLink
            :avatar-url="assignee.avatarUrl"
            :login="assignee.login"
          />
        </div>
      </div>
      <p
        v-else
        class="text-body text-muted-foreground"
      >
        {{ t('pullRequest.sidebar.empty.assignees') }}
      </p>
    </WorkItemSidebarSection>

    <WorkItemSidebarSection :title="t('pullRequest.sidebar.sections.labels')">
      <WorkItemLabelList
        :empty-label="t('pullRequest.sidebar.empty.labels')"
        :labels="labels"
      />
    </WorkItemSidebarSection>

    <WorkItemSidebarSection :title="t('pullRequest.sidebar.sections.milestone')">
      <div
        v-if="pullRequest.milestone"
        class="grid gap-1 text-body"
      >
        <a
          v-if="pullRequest.milestone.url"
          class="truncate font-medium text-foreground underline-offset-4 outline-hidden hover:underline focus-visible:underline"
          :href="pullRequest.milestone.url"
          rel="noreferrer"
          target="_blank"
        >
          {{ pullRequest.milestone.title }}
        </a>
        <span
          v-else
          class="truncate font-medium text-foreground"
        >
          {{ pullRequest.milestone.title }}
        </span>
        <span
          v-if="pullRequest.milestone.dueOn"
          class="text-muted-foreground"
        >
          {{ t('pullRequest.sidebar.dates.due', { date: formatDate(pullRequest.milestone.dueOn) }) }}
        </span>
      </div>
      <p
        v-else
        class="text-body text-muted-foreground"
      >
        {{ t('pullRequest.sidebar.empty.milestone') }}
      </p>
    </WorkItemSidebarSection>

    <WorkItemSidebarSection :title="t('pullRequest.sidebar.sections.linkedIssues')">
      <div
        v-if="linkedIssues.length > 0"
        class="grid min-w-0 gap-1.5"
      >
        <GitHubReferenceLink
          v-for="issue in linkedIssues"
          :key="issue.id"
          class="text-body"
          :current-owner="pullRequest.owner"
          :current-repo="pullRequest.repo"
          :fallback-href="issue.url"
          initial-kind="issue"
          :initial-state="issue.state"
          :initial-title="issue.title"
          kind-hint="issue"
          :number="issue.number"
          :owner="issue.owner"
          :repo="issue.repo"
        />
      </div>
      <p
        v-else
        class="text-body text-muted-foreground"
      >
        {{ t('pullRequest.sidebar.empty.linkedIssues') }}
      </p>
    </WorkItemSidebarSection>

    <WorkItemSidebarSection :title="t('pullRequest.sidebar.sections.branches')">
      <div class="grid gap-2.5">
        <div
          v-for="branch in [pullRequest.baseBranch, pullRequest.headBranch]"
          :key="`${branch.repository ?? pullRequest.repository}:${branch.name}`"
          class="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2 text-body"
        >
          <GitBranch class="mt-0.5 size-3.5 text-muted-foreground" />
          <div class="min-w-0">
            <div class="truncate text-muted-foreground">
              {{ branch === pullRequest.baseBranch ? t('pullRequest.sidebar.branches.base') : t('pullRequest.sidebar.branches.head') }}
            </div>
            <a
              v-if="branch.url"
              class="block truncate font-medium text-foreground underline-offset-4 outline-hidden hover:underline focus-visible:underline"
              :href="branch.url"
              rel="noreferrer"
              target="_blank"
            >
              {{ branch.repository ? `${branch.repository}:${branch.name}` : branch.name }}
            </a>
            <div
              v-else
              class="truncate font-medium text-foreground"
            >
              {{ branch.repository ? `${branch.repository}:${branch.name}` : branch.name }}
            </div>
          </div>
        </div>
      </div>
    </WorkItemSidebarSection>

    <WorkItemSidebarSection :title="t('pullRequest.sidebar.sections.status')">
      <div class="grid gap-2.5">
        <div
          v-for="item in statusItems"
          :key="item.id"
          class="flex min-w-0 items-center justify-between gap-3 text-body"
        >
          <span class="inline-flex min-w-0 items-center gap-2 text-muted-foreground">
            <component
              :is="item.icon"
              class="size-3.5 shrink-0"
            />
            <span class="truncate">{{ item.label }}</span>
          </span>
          <span class="shrink-0 font-medium text-foreground">{{ item.value }}</span>
        </div>
      </div>
    </WorkItemSidebarSection>

    <WorkItemSidebarSection :title="t('pullRequest.sidebar.sections.diff')">
      <div class="grid gap-2.5">
        <div
          v-for="item in diffItems"
          :key="item.id"
          class="flex min-w-0 items-center justify-between gap-3 text-body"
        >
          <span class="inline-flex min-w-0 items-center gap-2 text-muted-foreground">
            <component
              :is="item.icon"
              class="size-3.5 shrink-0"
            />
            <span class="truncate">{{ item.label }}</span>
          </span>
          <span class="shrink-0 font-medium tabular-nums text-foreground">{{ item.value }}</span>
        </div>
      </div>
    </WorkItemSidebarSection>

    <WorkItemSidebarSection :title="t('pullRequest.sidebar.sections.dates')">
      <div class="grid gap-2.5">
        <div
          v-for="date in dates"
          :key="date.id"
          class="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2 text-body"
        >
          <CalendarDays class="mt-0.5 size-3.5 text-muted-foreground" />
          <div class="min-w-0">
            <div class="truncate text-muted-foreground">
              {{ date.label }}
            </div>
            <div class="truncate font-medium text-foreground">
              {{ date.value }}
            </div>
          </div>
        </div>
      </div>
    </WorkItemSidebarSection>

    <WorkItemSidebarSection :title="t('pullRequest.sidebar.sections.participants')">
      <div
        v-if="participants.length > 0"
        class="flex min-w-0 flex-wrap gap-2"
      >
        <GitHubActorLink
          v-for="participant in participants"
          :key="participant.login"
          avatar-size="md"
          :avatar-url="participant.avatarUrl"
          :login="participant.login"
          :show-username="false"
        />
      </div>
      <p
        v-else
        class="text-body text-muted-foreground"
      >
        {{ t('pullRequest.sidebar.empty.participants') }}
      </p>
    </WorkItemSidebarSection>

    <WorkItemSidebarSection
      v-if="latestReviews.length > 0"
      :title="t('pullRequest.sidebar.sections.latestReviews')"
    >
      <div class="grid gap-2.5">
        <a
          v-for="review in latestReviews"
          :key="review.id"
          class="grid min-w-0 gap-1 rounded-md p-1 -m-1 text-body outline-hidden underline-offset-4 hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring/30"
          :href="review.url"
          rel="noreferrer"
          target="_blank"
        >
          <span class="flex min-w-0 items-center justify-between gap-2">
            <GitHubActorLink
              :avatar-url="review.author.avatarUrl"
              :interactive="false"
              :login="review.author.login"
            />
            <span class="shrink-0 text-muted-foreground">{{ t(`pullRequest.reviewStates.${review.state}`) }}</span>
          </span>
          <span
            v-if="review.body"
            class="line-clamp-2 text-muted-foreground"
          >
            {{ review.body }}
          </span>
        </a>
      </div>
    </WorkItemSidebarSection>
  </aside>
</template>
