import { createGitHubApi, type ListNotificationsOptions } from '@oh-my-github/api'
import { ipcMain } from 'electron'
import { getAuthenticatedAccessToken } from './auth'
import { resolveGitHubProxyUrl } from './proxy'

export function registerInboxIpc(): void {
  ipcMain.handle('inbox:list-notifications', (_event, options?: ListNotificationsOptions) =>
    listNotifications(options),
  )
  ipcMain.handle('inbox:mark-thread-read', (_event, threadId: string) => markThreadAsRead(threadId))
  ipcMain.handle('inbox:mark-all-read', () => markAllAsRead())
  ipcMain.handle('inbox:mark-thread-done', (_event, threadId: string) => markThreadAsDone(threadId))
  ipcMain.handle('inbox:unsubscribe', (_event, threadId: string) => unsubscribe(threadId))
}

async function listNotifications(options?: ListNotificationsOptions) {
  const api = await createAuthenticatedGitHubApi()
  return api.inbox.listInboxNotifications(options ?? {})
}

async function markThreadAsRead(threadId: string) {
  const api = await createAuthenticatedGitHubApi()
  await api.inbox.markThreadAsRead(threadId)
}

async function markAllAsRead() {
  const api = await createAuthenticatedGitHubApi()
  await api.inbox.markAllAsRead()
}

async function markThreadAsDone(threadId: string) {
  const api = await createAuthenticatedGitHubApi()
  await api.inbox.markThreadAsDone(threadId)
}

async function unsubscribe(threadId: string) {
  const api = await createAuthenticatedGitHubApi()
  await api.inbox.unsubscribe(threadId)
}

async function createAuthenticatedGitHubApi() {
  return createGitHubApi({
    token: getAuthenticatedAccessToken(),
    proxyUrl: await resolveGitHubProxyUrl(),
  })
}
