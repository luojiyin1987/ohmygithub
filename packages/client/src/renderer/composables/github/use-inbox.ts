import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'
import { useQuery } from '@pinia/colada'

function requireInboxBridge() {
  if (!window.ohMyGithub?.inbox) {
    throw new Error('GitHub inbox bridge is unavailable')
  }

  return window.ohMyGithub.inbox
}

export function useInboxNotificationsQuery(all: MaybeRefOrGetter<boolean>) {
  return useQuery<GitHubNotification[]>({
    key: () => ['github', 'notifications', toValue(all)],
    // Smart refresh: keep the inbox fresh automatically instead of via a manual
    // button — refetch when the tab mounts, the window regains focus, or the
    // network reconnects, but only once the cached data is older than staleTime.
    staleTime: 1000 * 30,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    query: async () => requireInboxBridge().listNotifications({ all: toValue(all) }),
  })
}

export async function markNotificationRead(threadId: string): Promise<void> {
  await requireInboxBridge().markThreadAsRead(threadId)
}

export async function markAllNotificationsRead(): Promise<void> {
  await requireInboxBridge().markAllAsRead()
}

export async function markNotificationDone(threadId: string): Promise<void> {
  await requireInboxBridge().markThreadAsDone(threadId)
}

export async function unsubscribeNotification(threadId: string): Promise<void> {
  await requireInboxBridge().unsubscribe(threadId)
}
