<script setup lang="ts">
import type { WorkspaceTab } from '../workspace/types'
import type { ReasonFilterKey } from './inbox-helpers'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Badge, Button, Empty, EmptyDescription, EmptyHeader, EmptyTitle, ScrollArea, Skeleton } from '@oh-my-github/ui'
import { Inbox as InboxIcon } from 'lucide-vue-next'
import {
  markAllNotificationsRead,
  markNotificationDone,
  markNotificationRead,
  unsubscribeNotification,
  useInboxNotificationsQuery,
} from '../../composables/github/use-inbox'
import { useToast } from '../../composables/use-toast'
import {
  REASON_FILTER_KEYS,
  matchesReasonFilter,
  projectNotifications,
  resolveNotificationTarget,
} from './inbox-helpers'
import InboxNotificationItem from './components/inbox-notification-item.vue'

defineProps<{
  tab: WorkspaceTab
}>()

const { t } = useI18n()
const router = useRouter()
const { error: toastError } = useToast()

const showAll = ref(false)
const reasonFilter = ref<ReasonFilterKey | null>(null)

const readIds = reactive(new Set<string>())
const removedIds = reactive(new Set<string>())

const notificationsQuery = useInboxNotificationsQuery(showAll)
const isLoading = computed(() => notificationsQuery.isLoading.value)
const hasError = computed(() => Boolean(notificationsQuery.error.value))

const notifications = computed(() => {
  const list = projectNotifications(notificationsQuery.data.value ?? [], { readIds, removedIds })
  return list.filter((notification) => matchesReasonFilter(notification.reason, reasonFilter.value))
})

function setShowAll(value: boolean): void {
  showAll.value = value
}

function toggleReasonFilter(key: ReasonFilterKey): void {
  reasonFilter.value = reasonFilter.value === key ? null : key
}

function refresh(): void {
  void notificationsQuery.refetch()
}

async function runTriage(action: () => Promise<void>, rollback: () => void): Promise<void> {
  try {
    await action()
  } catch {
    rollback()
    toastError(t('workspace.inbox.toast.actionFailed'))
  }
}

function openNotification(notification: GitHubNotification): void {
  if (notification.unread) {
    readIds.add(notification.id)
    void runTriage(
      () => markNotificationRead(notification.id),
      () => readIds.delete(notification.id),
    )
  }

  const target = resolveNotificationTarget(notification)
  if (target.kind === 'internal') {
    void router.push(target.url)
  } else {
    void window.ohMyGithub?.links?.openGitHubUrl?.(target.url)
  }
}

function markRead(notification: GitHubNotification): void {
  readIds.add(notification.id)
  void runTriage(
    () => markNotificationRead(notification.id),
    () => readIds.delete(notification.id),
  )
}

function markDone(notification: GitHubNotification): void {
  removedIds.add(notification.id)
  void runTriage(
    () => markNotificationDone(notification.id),
    () => removedIds.delete(notification.id),
  )
}

function unsubscribe(notification: GitHubNotification): void {
  removedIds.add(notification.id)
  void runTriage(
    () => unsubscribeNotification(notification.id),
    () => removedIds.delete(notification.id),
  )
}

async function markAllRead(): Promise<void> {
  const previous = new Set(readIds)
  for (const notification of notificationsQuery.data.value ?? []) {
    readIds.add(notification.id)
  }
  try {
    await markAllNotificationsRead()
    void notificationsQuery.refetch()
  } catch {
    readIds.clear()
    for (const id of previous) {
      readIds.add(id)
    }
    toastError(t('workspace.inbox.toast.actionFailed'))
  }
}
</script>

<template>
  <section class="flex min-h-full flex-col bg-background">
    <header class="grid gap-3 border-b border-border px-6 py-4">
      <div class="flex items-center justify-between gap-3">
        <h1 class="select-none text-heading font-semibold text-foreground">
          {{ t('workspace.inbox.title') }}
        </h1>
        <div class="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            @click="markAllRead"
          >
            {{ t('workspace.inbox.actions.markAllRead') }}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            @click="refresh"
          >
            {{ t('workspace.inbox.actions.refresh') }}
          </Button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Button
          :variant="showAll ? 'ghost' : 'secondary'"
          size="sm"
          @click="setShowAll(false)"
        >
          {{ t('workspace.inbox.filters.unread') }}
        </Button>
        <Button
          :variant="showAll ? 'secondary' : 'ghost'"
          size="sm"
          @click="setShowAll(true)"
        >
          {{ t('workspace.inbox.filters.all') }}
        </Button>

        <span class="mx-1 h-4 w-px bg-border" />

        <Badge
          v-for="key in REASON_FILTER_KEYS"
          :key="key"
          :variant="reasonFilter === key ? 'info' : 'secondary'"
          class="cursor-pointer"
          @click="toggleReasonFilter(key)"
        >
          {{ t(`workspace.inbox.filters.${key}`) }}
        </Badge>
      </div>
    </header>

    <ScrollArea class="flex-1">
      <div
        v-if="isLoading"
        class="grid gap-2 p-4"
      >
        <Skeleton
          v-for="index in 6"
          :key="index"
          class="h-14 w-full rounded-md"
        />
      </div>

      <div
        v-else-if="hasError"
        class="grid place-items-center gap-3 p-10 text-center"
      >
        <p class="text-label text-muted-foreground">{{ t('workspace.inbox.error.title') }}</p>
        <Button
          variant="secondary"
          size="sm"
          @click="refresh"
        >
          {{ t('workspace.inbox.error.retry') }}
        </Button>
      </div>

      <Empty
        v-else-if="notifications.length === 0"
        class="p-10"
      >
        <EmptyHeader>
          <InboxIcon class="size-6 text-muted-foreground" />
          <EmptyTitle>{{ t('workspace.inbox.empty.title') }}</EmptyTitle>
          <EmptyDescription>{{ t('workspace.inbox.empty.description') }}</EmptyDescription>
        </EmptyHeader>
      </Empty>

      <div v-else>
        <InboxNotificationItem
          v-for="notification in notifications"
          :key="notification.id"
          :notification="notification"
          @open="openNotification"
          @mark-read="markRead"
          @done="markDone"
          @unsubscribe="unsubscribe"
        />
      </div>
    </ScrollArea>
  </section>
</template>
