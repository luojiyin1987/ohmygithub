import { ipcMain, shell } from 'electron'

// Hosts the renderer is allowed to open externally. Kept to a small allowlist
// so a compromised renderer can't turn this IPC into an arbitrary URL launcher.
const ALLOWED_HOSTS = new Set(['github.com', 't.me'])

export function registerLinksIpc(): void {
  ipcMain.handle('links:open-github-url', (_event, url: string) => openGitHubUrl(url))
  ipcMain.handle('links:open-external-url', (_event, url: string) => openExternalUrl(url))
}

async function openGitHubUrl(value: string): Promise<void> {
  const url = normalizeGitHubUrl(value)
  await shell.openExternal(url)
}

async function openExternalUrl(value: string): Promise<void> {
  const url = normalizeAllowedUrl(value)
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

function normalizeAllowedUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('URL must be a string')
  }

  const url = new URL(value)
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(`Only https URLs on ${[...ALLOWED_HOSTS].join(', ')} can be opened`)
  }

  return url.toString()
}
