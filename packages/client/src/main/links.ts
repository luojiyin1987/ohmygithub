import { ipcMain, shell } from 'electron'

export function registerLinksIpc(): void {
  ipcMain.handle('links:open-github-url', (_event, url: string) => openGitHubUrl(url))
}

async function openGitHubUrl(value: string): Promise<void> {
  const url = normalizeGitHubUrl(value)
  await shell.openExternal(url)
}

function normalizeGitHubUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('GitHub URL must be a string')
  }

  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
    throw new Error('Only https://github.com URLs can be opened')
  }

  return url.toString()
}
