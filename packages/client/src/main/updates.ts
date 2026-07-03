import { app, ipcMain } from 'electron'

export interface AppInfo {
  version: string
  platform: NodeJS.Platform
}

export interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string | null
  hasUpdate: boolean
  /** False when no update feed URL was configured at build time (e.g. in dev). */
  configured: boolean
}

// Injected at build time from the `R2_PUBLIC_BASE_URL` env via electron.vite
// config `define`. Empty when unset (local dev), in which case update checks
// are a graceful no-op.
const UPDATE_FEED_BASE_URL = (process.env.R2_PUBLIC_BASE_URL ?? '').trim()

export function registerUpdatesIpc(): void {
  ipcMain.handle('app:get-info', (): AppInfo => ({
    version: app.getVersion(),
    platform: process.platform,
  }))
  ipcMain.handle('updates:check', () => checkForUpdate())
}

async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()

  if (!UPDATE_FEED_BASE_URL) {
    return { currentVersion, latestVersion: null, hasUpdate: false, configured: false }
  }

  const manifestUrl = new URL(manifestFileName(), ensureTrailingSlash(UPDATE_FEED_BASE_URL))
  const response = await fetch(manifestUrl, { cache: 'no-cache' })
  if (!response.ok) {
    throw new Error(`Update check failed: ${response.status} ${response.statusText}`)
  }

  const latestVersion = parseManifestVersion(await response.text())

  return {
    currentVersion,
    latestVersion,
    hasUpdate: latestVersion ? isNewer(latestVersion, currentVersion) : false,
    configured: true,
  }
}

// electron-builder emits a per-platform manifest alongside the artifacts.
function manifestFileName(): string {
  switch (process.platform) {
    case 'darwin':
      return 'latest-mac.yml'
    case 'linux':
      return 'latest-linux.yml'
    default:
      return 'latest.yml'
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

// The manifest is YAML; we only need the top-level `version:` line, so a scan
// avoids pulling in a YAML parser.
function parseManifestVersion(manifest: string): string | null {
  const match = /^version:\s*(.+)$/m.exec(manifest)
  if (!match) return null
  return match[1].trim().replace(/^["']|["']$/g, '') || null
}

// Compares numeric release cores (major.minor.patch); prerelease suffixes are
// ignored, which is fine for the "is there a newer stable build" check.
function isNewer(latest: string, current: string): boolean {
  const a = toReleaseCore(latest)
  const b = toReleaseCore(current)
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true
    if (a[i] < b[i]) return false
  }
  return false
}

function toReleaseCore(version: string): [number, number, number] {
  const [major = 0, minor = 0, patch = 0] = version
    .split('-')[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
  return [major, minor, patch]
}
