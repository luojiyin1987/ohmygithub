# System Tray Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a system tray (macOS menu bar / Windows-Linux system tray) to the Oh My GitHub Electron client giving quick access to the window, workspace search, bookmarks, and recent inbox notifications.

**Architecture:** The tray lives entirely in the **main process**. A pure builder (`tray-menu.ts`) turns bookmark/notification data into an Electron menu template; a controller (`tray.ts`) owns the `Tray` instance, refresh triggers, and click handlers. Clicks call `showWindow()` then send an IPC intent; a renderer bridge (`use-tray-bridge.ts`) performs navigation reusing existing routing/notification logic. Closing the window hides it to the tray on all platforms; quit happens only via the tray's Quit item.

**Tech Stack:** Electron (main/preload/renderer), TypeScript (strict), Vue 3 `<script setup>`, vue-router, vue-i18n, vitest, pnpm workspace, electron-vite, electron-builder, sharp (dev-only, tray-icon generation).

## Global Constraints

- Package manager is **pnpm**; client package is `@oh-my-github/client`. Run scripts via `pnpm --filter @oh-my-github/client <script>`.
- Test runner: `vitest run` (client `test` script). Typecheck: `vue-tsc -p tsconfig.json --noEmit` (client `typecheck` script).
- TypeScript strict — no `any` leaks, no unused symbols (typecheck fails otherwise).
- **Close = hide to tray on ALL platforms.** The window `close` event is intercepted and hides the window unless a genuine quit is in progress. Quit only via the tray Quit item (or OS quit / auto-updater, guarded by `before-quit`).
- **Notification cap = 5** (`TRAY_NOTIFICATION_LIMIT`). No unread badge/count on the icon. No configurable limits. No tray preferences UI. (YAGNI per spec.)
- Localization: fixed tray labels are zh/en, driven by `config.ui.locale` (values `'en' | 'zh'`). Bookmark/notification titles are content data, shown as-is.
- Follow the existing preload listener pattern: each `on*` returns an unsubscribe function (mirror `windowControls` / `updates` in `preload/index.ts:442-473`).
- No new **runtime** dependencies. `sharp` is added as a **devDependency** only (regenerates committed icon assets).
- Spec of record: `docs/superpowers/specs/2026-07-04-system-tray-design.md`. Note: the spec says `config.ui.language`; the real field is `config.ui.locale` — use `locale`.

---

### Task 1: Expose bookmark & notification data from the main process

**Files:**
- Modify: `packages/client/src/main/bookmarks.ts` (export `readBookmarks`, export `bookmarksFilePath`)
- Modify: `packages/client/src/main/inbox.ts` (add `listRecentNotifications`)

**Interfaces:**
- Produces: `readBookmarks(): StoredWorkspaceBookmarks` — reused by the tray controller.
- Produces: `bookmarksFilePath: string` — absolute path the tray watches for changes.
- Produces: `listRecentNotifications(limit: number): Promise<GitHubNotification[]>` — returns at most `limit` notifications; returns `[]` (never throws) when unauthenticated or on network/API error.

- [ ] **Step 1: Export `readBookmarks` and the bookmarks path**

In `packages/client/src/main/bookmarks.ts`, change the private path const and function to exports.

Change line 47 from:
```ts
const bookmarksPath = join(homedir(), '.oh-my-github', 'bookmarks.json')
```
to:
```ts
export const bookmarksFilePath = join(homedir(), '.oh-my-github', 'bookmarks.json')
```

Then replace every remaining `bookmarksPath` reference in the file with `bookmarksFilePath` (occurs in `readBookmarksInfo`, `registerBookmarksIpc`, `writeBookmarks`). Use editor replace-all within this file.

Change line 73 from:
```ts
function readBookmarks(): StoredWorkspaceBookmarks {
```
to:
```ts
export function readBookmarks(): StoredWorkspaceBookmarks {
```

- [ ] **Step 2: Add `listRecentNotifications` to inbox.ts**

In `packages/client/src/main/inbox.ts`, update the import on line 1 to also import the notification type, and append the new exported function.

Change line 1 from:
```ts
import { createGitHubApi, type ListNotificationsOptions } from '@oh-my-github/api'
```
to:
```ts
import { createGitHubApi, type GitHubNotification, type ListNotificationsOptions } from '@oh-my-github/api'
```

Append at the end of the file (after `createAuthenticatedGitHubApi`):
```ts
export async function listRecentNotifications(limit: number): Promise<GitHubNotification[]> {
  try {
    const api = await createAuthenticatedGitHubApi()
    const notifications = await api.inbox.listInboxNotifications({ limit })
    return notifications.slice(0, limit)
  } catch {
    // Unauthenticated or network/API failure: the tray shows its placeholder row
    // rather than surfacing an error. Never throw from here.
    return []
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @oh-my-github/client typecheck`
Expected: PASS (no errors). This task is verified by typecheck — `listRecentNotifications` hits the network/auth, so it is not unit-tested here (the tray-menu pure logic in Task 3 is where behavior is tested).

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/main/bookmarks.ts packages/client/src/main/inbox.ts
git commit -m "feat(main): expose bookmarks + recent notifications for tray"
```

---

### Task 2: Add an auth-change signal to the main process

**Files:**
- Modify: `packages/client/src/main/auth.ts`

**Interfaces:**
- Produces: `isAuthenticated(): boolean` — true when there is an active account.
- Produces: `onAuthChanged(listener: () => void): () => void` — subscribe to sign-in/out/switch; returns an unsubscribe function. Fired after any successful auth-file write (login, personal token, switch account, logout).

- [ ] **Step 1: Add the emitter, subscriber, and `isAuthenticated`**

In `packages/client/src/main/auth.ts`, add module state and exports. Place the following just after the `pendingDeviceFlows` map declaration (after line 52):
```ts
const authChangeListeners = new Set<() => void>()

export function onAuthChanged(listener: () => void): () => void {
  authChangeListeners.add(listener)
  return () => {
    authChangeListeners.delete(listener)
  }
}

export function isAuthenticated(): boolean {
  return getActiveAccount(readAuthFile()) !== null
}

function emitAuthChanged(): void {
  for (const listener of authChangeListeners) {
    listener()
  }
}
```

- [ ] **Step 2: Emit on every auth mutation**

Add `emitAuthChanged()` after each successful auth-file write:

In `switchToAccount` (line ~110), after `writeAuthFile(setActiveAccount(file, accountId))`:
```ts
  writeAuthFile(setActiveAccount(file, accountId))
  emitAuthChanged()
  return getAuthState()
```

In `logoutActiveAccount` (line ~117), inside the `if` block after `writeAuthFile(...)`:
```ts
  if (file && file.activeAccountId !== null) {
    writeAuthFile(removeAccount(file, file.activeAccountId))
    emitAuthChanged()
  }
```

In `persistAccount` (line ~234), after `writeAuthFile(...)` (this covers both device-flow login and personal-token login):
```ts
  const file = readAuthFile() ?? createEmptyAuthFile()
  writeAuthFile(upsertAccount(file, input, new Date().toISOString()))
  emitAuthChanged()
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @oh-my-github/client typecheck`
Expected: PASS. (`isAuthenticated`/`onAuthChanged` read the real auth file, so they are verified by typecheck + the manual tray verification in Task 6, not a brittle fs-dependent unit test.)

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/main/auth.ts
git commit -m "feat(main): emit auth-change signal for tray refresh"
```

---

### Task 3: Tray labels + pure menu builder (TDD)

**Files:**
- Create: `packages/client/src/main/tray-labels.ts`
- Create: `packages/client/src/main/tray-menu.ts`
- Test: `packages/client/src/main/tray-menu.test.ts`

**Interfaces:**
- Consumes: `StoredWorkspaceBookmark`, `StoredWorkspaceBookmarkFolder` (from `./bookmarks`); `GitHubNotification` (from `@oh-my-github/api`).
- Produces: `getTrayLabels(language: 'en' | 'zh'): TrayLabels`.
- Produces: `TRAY_NOTIFICATION_LIMIT = 5`.
- Produces: `buildTrayMenuTemplate(data: TrayMenuData, handlers: TrayMenuHandlers, labels: TrayLabels): MenuItemConstructorOptions[]` where
  - `TrayMenuData = { folders: StoredWorkspaceBookmarkFolder[]; bookmarks: StoredWorkspaceBookmark[]; notifications: GitHubNotification[]; isAuthenticated: boolean }`
  - `TrayMenuHandlers = { openWindow: () => void; openSearch: () => void; navigateBookmark: (url: string) => void; openNotification: (notification: GitHubNotification) => void; quit: () => void }`

- [ ] **Step 1: Write `tray-labels.ts`**

Create `packages/client/src/main/tray-labels.ts`:
```ts
export type TrayLanguage = 'en' | 'zh'

export interface TrayLabels {
  openWindow: string
  searchWorkspace: string
  bookmarks: string
  inbox: string
  quit: string
  noBookmarks: string
  noNotifications: string
  signInForInbox: string
}

const LABELS: Record<TrayLanguage, TrayLabels> = {
  en: {
    openWindow: 'Open Oh My GitHub',
    searchWorkspace: 'Search Workspace',
    bookmarks: 'Bookmarks',
    inbox: 'Inbox',
    quit: 'Quit',
    noBookmarks: 'No bookmarks yet',
    noNotifications: 'No notifications',
    signInForInbox: 'Sign in to see your inbox'
  },
  zh: {
    openWindow: '打开 Oh My GitHub',
    searchWorkspace: '搜索工作区',
    bookmarks: '书签',
    inbox: '收件箱',
    quit: '退出',
    noBookmarks: '暂无书签',
    noNotifications: '暂无通知',
    signInForInbox: '登录后查看收件箱'
  }
}

export function getTrayLabels(language: TrayLanguage): TrayLabels {
  return LABELS[language]
}
```

- [ ] **Step 2: Write the failing test**

Create `packages/client/src/main/tray-menu.test.ts`:
```ts
import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import type { GitHubNotification } from '@oh-my-github/api'
import type { StoredWorkspaceBookmark, StoredWorkspaceBookmarkFolder } from './bookmarks'
import { getTrayLabels } from './tray-labels'
import { buildTrayMenuTemplate, TRAY_NOTIFICATION_LIMIT, type TrayMenuHandlers } from './tray-menu'

const labels = getTrayLabels('en')

function noopHandlers(): TrayMenuHandlers {
  return {
    openWindow: vi.fn(),
    openSearch: vi.fn(),
    navigateBookmark: vi.fn(),
    openNotification: vi.fn(),
    quit: vi.fn()
  }
}

function folder(id: string, title: string): StoredWorkspaceBookmarkFolder {
  return { id, title, createdAt: '', updatedAt: '' }
}

function bookmark(id: string, title: string, folderId: string | null): StoredWorkspaceBookmark {
  return { id, url: `/b/${id}`, type: 'repository', title, folderId }
}

function notification(id: string, title: string): GitHubNotification {
  return {
    id,
    unread: true,
    reason: 'subscribed',
    updatedAt: '',
    subjectType: 'PullRequest',
    subjectTitle: title,
    repositoryFullName: 'o/r',
    repositoryHtmlUrl: '',
    number: 1,
    htmlUrl: 'https://github.com/o/r/pull/1'
  }
}

function labelsOf(items: MenuItemConstructorOptions[]): string[] {
  return items.map((item) => (item.type === 'separator' ? '---' : String(item.label)))
}

describe('buildTrayMenuTemplate', () => {
  it('renders the fixed top rows and Quit', () => {
    const template = buildTrayMenuTemplate(
      { folders: [], bookmarks: [], notifications: [], isAuthenticated: true },
      noopHandlers(),
      labels
    )
    const flat = labelsOf(template)
    expect(flat[0]).toBe('Open Oh My GitHub')
    expect(flat[1]).toBe('Search Workspace')
    expect(flat).toContain('Bookmarks')
    expect(flat).toContain('Inbox')
    expect(flat.at(-1)).toBe('Quit')
  })

  it('orders folders (as submenus) before root bookmarks, mirroring the sidebar', () => {
    const template = buildTrayMenuTemplate(
      {
        folders: [folder('f1', 'Folder A')],
        bookmarks: [bookmark('b1', 'In Folder', 'f1'), bookmark('b2', 'Root One', null)],
        notifications: [],
        isAuthenticated: true
      },
      noopHandlers(),
      labels
    )
    const bookmarksHeaderIndex = labelsOf(template).indexOf('Bookmarks')
    const folderRow = template[bookmarksHeaderIndex + 1]
    const rootRow = template[bookmarksHeaderIndex + 2]
    expect(folderRow.label).toBe('Folder A')
    expect(folderRow.submenu).toBeDefined()
    expect((folderRow.submenu as MenuItemConstructorOptions[])[0].label).toBe('In Folder')
    expect(rootRow.label).toBe('Root One')
  })

  it('shows a disabled placeholder in an empty folder', () => {
    const template = buildTrayMenuTemplate(
      { folders: [folder('f1', 'Empty')], bookmarks: [], notifications: [], isAuthenticated: true },
      noopHandlers(),
      labels
    )
    const bookmarksHeaderIndex = labelsOf(template).indexOf('Bookmarks')
    const folderRow = template[bookmarksHeaderIndex + 1]
    const child = (folderRow.submenu as MenuItemConstructorOptions[])[0]
    expect(child.label).toBe('No bookmarks yet')
    expect(child.enabled).toBe(false)
  })

  it('shows the no-bookmarks placeholder when there are none', () => {
    const template = buildTrayMenuTemplate(
      { folders: [], bookmarks: [], notifications: [], isAuthenticated: true },
      noopHandlers(),
      labels
    )
    const idx = labelsOf(template).indexOf('Bookmarks')
    const row = template[idx + 1]
    expect(row.label).toBe('No bookmarks yet')
    expect(row.enabled).toBe(false)
  })

  it('caps notifications at TRAY_NOTIFICATION_LIMIT', () => {
    const notifications = Array.from({ length: 8 }, (_, i) => notification(`n${i}`, `PR ${i}`))
    const template = buildTrayMenuTemplate(
      { folders: [], bookmarks: [], notifications, isAuthenticated: true },
      noopHandlers(),
      labels
    )
    const shown = labelsOf(template).filter((l) => l.startsWith('PR '))
    expect(shown).toHaveLength(TRAY_NOTIFICATION_LIMIT)
  })

  it('shows the sign-in placeholder when unauthenticated', () => {
    const template = buildTrayMenuTemplate(
      { folders: [], bookmarks: [], notifications: [], isAuthenticated: false },
      noopHandlers(),
      labels
    )
    const idx = labelsOf(template).indexOf('Inbox')
    expect(template[idx + 1].label).toBe('Sign in to see your inbox')
    expect(template[idx + 1].enabled).toBe(false)
  })

  it('shows the no-notifications placeholder when authenticated with none', () => {
    const template = buildTrayMenuTemplate(
      { folders: [], bookmarks: [], notifications: [], isAuthenticated: true },
      noopHandlers(),
      labels
    )
    const idx = labelsOf(template).indexOf('Inbox')
    expect(template[idx + 1].label).toBe('No notifications')
  })

  it('wires a notification click to openNotification', () => {
    const handlers = noopHandlers()
    const target = notification('n1', 'Click me')
    const template = buildTrayMenuTemplate(
      { folders: [], bookmarks: [], notifications: [target], isAuthenticated: true },
      handlers,
      labels
    )
    const row = template.find((item) => item.label === 'Click me')
    ;(row?.click as () => void)()
    expect(handlers.openNotification).toHaveBeenCalledWith(target)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @oh-my-github/client test src/main/tray-menu.test.ts`
Expected: FAIL — `buildTrayMenuTemplate` / `TRAY_NOTIFICATION_LIMIT` not exported (module `./tray-menu` has no such export).

- [ ] **Step 4: Write `tray-menu.ts`**

Create `packages/client/src/main/tray-menu.ts`:
```ts
import type { MenuItemConstructorOptions } from 'electron'
import type { GitHubNotification } from '@oh-my-github/api'
import type { StoredWorkspaceBookmark, StoredWorkspaceBookmarkFolder } from './bookmarks'
import type { TrayLabels } from './tray-labels'

export const TRAY_NOTIFICATION_LIMIT = 5

export interface TrayMenuData {
  folders: StoredWorkspaceBookmarkFolder[]
  bookmarks: StoredWorkspaceBookmark[]
  notifications: GitHubNotification[]
  isAuthenticated: boolean
}

export interface TrayMenuHandlers {
  openWindow: () => void
  openSearch: () => void
  navigateBookmark: (url: string) => void
  openNotification: (notification: GitHubNotification) => void
  quit: () => void
}

function disabledRow(label: string): MenuItemConstructorOptions {
  return { label, enabled: false }
}

function bookmarkRow(
  bookmark: StoredWorkspaceBookmark,
  handlers: TrayMenuHandlers
): MenuItemConstructorOptions {
  return { label: bookmark.title, click: () => handlers.navigateBookmark(bookmark.url) }
}

function buildBookmarkRows(
  data: TrayMenuData,
  handlers: TrayMenuHandlers,
  labels: TrayLabels
): MenuItemConstructorOptions[] {
  if (data.folders.length === 0 && data.bookmarks.length === 0) {
    return [disabledRow(labels.noBookmarks)]
  }

  const rows: MenuItemConstructorOptions[] = []

  // Folders first, each a submenu of its bookmarks (mirrors the sidebar order).
  for (const folder of data.folders) {
    const children = data.bookmarks
      .filter((bookmark) => bookmark.folderId === folder.id)
      .map((bookmark) => bookmarkRow(bookmark, handlers))
    rows.push({
      label: folder.title,
      submenu: children.length > 0 ? children : [disabledRow(labels.noBookmarks)]
    })
  }

  // Then root-level bookmarks in their stored order.
  for (const bookmark of data.bookmarks) {
    if (bookmark.folderId === null) {
      rows.push(bookmarkRow(bookmark, handlers))
    }
  }

  return rows
}

function buildInboxRows(
  data: TrayMenuData,
  handlers: TrayMenuHandlers,
  labels: TrayLabels
): MenuItemConstructorOptions[] {
  if (!data.isAuthenticated) {
    return [disabledRow(labels.signInForInbox)]
  }

  if (data.notifications.length === 0) {
    return [disabledRow(labels.noNotifications)]
  }

  return data.notifications.slice(0, TRAY_NOTIFICATION_LIMIT).map((notification) => ({
    label: notification.subjectTitle,
    click: () => handlers.openNotification(notification)
  }))
}

export function buildTrayMenuTemplate(
  data: TrayMenuData,
  handlers: TrayMenuHandlers,
  labels: TrayLabels
): MenuItemConstructorOptions[] {
  return [
    { label: labels.openWindow, click: () => handlers.openWindow() },
    { label: labels.searchWorkspace, click: () => handlers.openSearch() },
    { type: 'separator' },
    disabledRow(labels.bookmarks),
    ...buildBookmarkRows(data, handlers, labels),
    { type: 'separator' },
    disabledRow(labels.inbox),
    ...buildInboxRows(data, handlers, labels),
    { type: 'separator' },
    { label: labels.quit, click: () => handlers.quit() }
  ]
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @oh-my-github/client test src/main/tray-menu.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Typecheck & commit**

Run: `pnpm --filter @oh-my-github/client typecheck`
Expected: PASS
```bash
git add packages/client/src/main/tray-labels.ts packages/client/src/main/tray-menu.ts packages/client/src/main/tray-menu.test.ts
git commit -m "feat(main): add tray labels and pure menu builder"
```

---

### Task 4: Generate & bundle tray icon assets

**Files:**
- Create: `packages/client/scripts/generate-tray-icons.mjs`
- Create (generated, committed): `packages/client/resources/tray/trayTemplate.png`, `trayTemplate@2x.png`, `tray.png`, `tray@2x.png`
- Modify: `packages/client/package.json` (add `sharp` devDependency + `generate:tray-icons` script)
- Modify: `packages/client/electron-builder.yml` (add `extraResources`)

**Interfaces:**
- Produces: tray icons resolvable at runtime. In packaged builds they live at `join(process.resourcesPath, 'tray')`; in dev at `resolve(__dirname, '../../resources/tray')`. macOS uses `trayTemplate.png` (monochrome template, black-on-transparent — Electron auto-inverts for light/dark). Windows/Linux use `tray.png` (colored). `@2x` variants sit adjacent so `nativeImage.createFromPath` auto-loads them on HiDPI.

- [ ] **Step 1: Add sharp as a devDependency**

Run: `pnpm --filter @oh-my-github/client add -D sharp`
Expected: sharp appears under `devDependencies` in `packages/client/package.json`.

- [ ] **Step 2: Write the generation script**

Create `packages/client/scripts/generate-tray-icons.mjs`:
```js
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const source = resolve(here, '../../../assets/badge.svg') // repo-root assets/badge.svg
const outDir = resolve(here, '../resources/tray')

// A macOS template image must be a solid monochrome (black) glyph on transparency;
// Electron inverts it automatically for light/dark menu bars. badge.svg is a single
// purple mark, so we render it, then force every pixel's RGB to black while keeping
// the rendered alpha as the glyph mask.
async function renderTemplate(size, outFile) {
  const { data, info } = await sharp(source)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += info.channels) {
    data[i] = 0
    data[i + 1] = 0
    data[i + 2] = 0
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png()
    .toFile(outFile)
}

async function renderColored(size, outFile) {
  await sharp(source)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outFile)
}

await mkdir(outDir, { recursive: true })
await renderTemplate(16, resolve(outDir, 'trayTemplate.png'))
await renderTemplate(32, resolve(outDir, 'trayTemplate@2x.png'))
await renderColored(16, resolve(outDir, 'tray.png'))
await renderColored(32, resolve(outDir, 'tray@2x.png'))
console.log('Generated tray icons in', outDir)
```

Add to `packages/client/package.json` `scripts`:
```json
"generate:tray-icons": "node scripts/generate-tray-icons.mjs"
```

- [ ] **Step 3: Generate the icons**

Run: `pnpm --filter @oh-my-github/client generate:tray-icons`
Expected: `Generated tray icons in .../resources/tray` and four PNG files created.

Verify: `ls -la packages/client/resources/tray` shows `trayTemplate.png`, `trayTemplate@2x.png`, `tray.png`, `tray@2x.png`, each non-empty.

- [ ] **Step 4: Bundle the icons in packaged builds**

In `packages/client/electron-builder.yml`, after the `files:` block (after line 13), add:
```yaml
extraResources:
  - from: resources/tray
    to: tray
```

- [ ] **Step 5: Commit**

```bash
git add packages/client/scripts/generate-tray-icons.mjs packages/client/resources/tray packages/client/package.json packages/client/electron-builder.yml pnpm-lock.yaml
git commit -m "feat(client): add tray icon assets and generator"
```

---

### Task 5: Tray controller (`tray.ts`)

**Files:**
- Create: `packages/client/src/main/tray.ts`

**Interfaces:**
- Consumes: `buildTrayMenuTemplate`, `TRAY_NOTIFICATION_LIMIT` (from `./tray-menu`); `getTrayLabels` (from `./tray-labels`); `bookmarksFilePath` (from `./bookmarks`); `StoredWorkspaceBookmarks`, `GitHubNotification` types.
- Produces: `createAppTray(deps: AppTrayDeps): AppTrayHandle` where
  - `AppTrayDeps = { showWindow: () => void; sendToRenderer: (channel: string, payload?: unknown) => void; getLanguage: () => 'en' | 'zh'; isAuthenticated: () => boolean; listBookmarks: () => StoredWorkspaceBookmarks; listNotifications: (limit: number) => Promise<GitHubNotification[]>; onAuthChanged: (listener: () => void) => () => void; quit: () => void }`
  - `AppTrayHandle = { refresh: () => void; refreshInbox: () => void; destroy: () => void }`

- [ ] **Step 1: Write `tray.ts`**

Create `packages/client/src/main/tray.ts`:
```ts
import { watch, type FSWatcher } from 'node:fs'
import { join, resolve } from 'node:path'
import { Menu, nativeImage, Tray } from 'electron'
import { is } from '@electron-toolkit/utils'
import type { GitHubNotification } from '@oh-my-github/api'
import { bookmarksFilePath, type StoredWorkspaceBookmarks } from './bookmarks'
import { getTrayLabels, type TrayLanguage } from './tray-labels'
import { buildTrayMenuTemplate, TRAY_NOTIFICATION_LIMIT, type TrayMenuHandlers } from './tray-menu'

export interface AppTrayDeps {
  showWindow: () => void
  sendToRenderer: (channel: string, payload?: unknown) => void
  getLanguage: () => TrayLanguage
  isAuthenticated: () => boolean
  listBookmarks: () => StoredWorkspaceBookmarks
  listNotifications: (limit: number) => Promise<GitHubNotification[]>
  onAuthChanged: (listener: () => void) => () => void
  quit: () => void
}

export interface AppTrayHandle {
  refresh: () => void
  refreshInbox: () => void
  destroy: () => void
}

const INBOX_REFRESH_INTERVAL_MS = 5 * 60 * 1000
const BOOKMARKS_DEBOUNCE_MS = 200

function resolveTrayIcon(): Electron.NativeImage {
  const dir = is.dev ? resolve(__dirname, '../../resources/tray') : join(process.resourcesPath, 'tray')
  const file = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'
  const icon = nativeImage.createFromPath(join(dir, file))
  if (process.platform === 'darwin') {
    icon.setTemplateImage(true)
  }
  return icon
}

export function createAppTray(deps: AppTrayDeps): AppTrayHandle {
  const tray = new Tray(resolveTrayIcon())
  tray.setToolTip('Oh My GitHub')

  let notifications: GitHubNotification[] = []

  const handlers: TrayMenuHandlers = {
    openWindow: () => deps.showWindow(),
    openSearch: () => deps.sendToRenderer('tray:open-search'),
    navigateBookmark: (url) => deps.sendToRenderer('tray:navigate', url),
    openNotification: (notification) =>
      deps.sendToRenderer('tray:open-notification', {
        repositoryFullName: notification.repositoryFullName,
        number: notification.number,
        subjectType: notification.subjectType,
        htmlUrl: notification.htmlUrl
      }),
    quit: () => deps.quit()
  }

  function rebuild(): void {
    const { folders, bookmarks } = deps.listBookmarks()
    const template = buildTrayMenuTemplate(
      { folders, bookmarks, notifications, isAuthenticated: deps.isAuthenticated() },
      handlers,
      getTrayLabels(deps.getLanguage())
    )
    tray.setContextMenu(Menu.buildFromTemplate(template))
  }

  async function refreshInbox(): Promise<void> {
    notifications = await deps.listNotifications(TRAY_NOTIFICATION_LIMIT)
    rebuild()
  }

  // Initial render, then fetch the inbox in the background.
  rebuild()
  void refreshInbox()

  // Triggers.
  const interval = setInterval(() => void refreshInbox(), INBOX_REFRESH_INTERVAL_MS)
  const unsubscribeAuth = deps.onAuthChanged(() => void refreshInbox())

  let debounce: ReturnType<typeof setTimeout> | null = null
  let watcher: FSWatcher | null = null
  try {
    watcher = watch(bookmarksFilePath, () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => rebuild(), BOOKMARKS_DEBOUNCE_MS)
    })
  } catch {
    // Bookmarks file may not exist yet; rebuild() reads it lazily on other triggers.
  }

  return {
    refresh: () => rebuild(),
    refreshInbox: () => void refreshInbox(),
    destroy: () => {
      clearInterval(interval)
      unsubscribeAuth()
      if (debounce) clearTimeout(debounce)
      watcher?.close()
      tray.destroy()
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @oh-my-github/client typecheck`
Expected: PASS. (The controller is exercised end-to-end during manual verification in Task 6.)

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/main/tray.ts
git commit -m "feat(main): add tray controller with refresh triggers"
```

---

### Task 6: Window lifecycle + tray wiring in `index.ts`

**Files:**
- Modify: `packages/client/src/main/index.ts`

**Interfaces:**
- Consumes: `createAppTray` (Task 5); `readBookmarks` (Task 1); `listRecentNotifications` (Task 1); `isAuthenticated`, `onAuthChanged` (Task 2); `getLocalConfig` (existing, `config.ts:74`).
- Produces: `showWindow()`, `sendToRenderer()`, close-to-tray behavior, and a live tray. This is the integration task — verified by running the app.

- [ ] **Step 1: Add imports**

In `packages/client/src/main/index.ts`, add to the electron import (line 2) `Tray` is NOT needed here (it lives in tray.ts). Add these module imports near the other `./` imports:
```ts
import { readBookmarks } from './bookmarks'
import { isAuthenticated, onAuthChanged } from './auth'
import { getLocalConfig } from './config'
import { listRecentNotifications } from './inbox'
import { createAppTray, type AppTrayHandle } from './tray'
```
(Note: `initializeAuth`, `registerAuthIpc` are already imported from `./auth` on line 7 — extend that existing import instead of adding a duplicate line: `import { initializeAuth, isAuthenticated, onAuthChanged, registerAuthIpc } from './auth'`. Likewise `getLocalConfig` can be added to the existing `./config` import on line 9.)

- [ ] **Step 2: Add module-level window/tray/quit state**

Replace the `createWindow` function's opening so the created window is held at module scope. Add near the top-level consts (after line 36):
```ts
let mainWindow: BrowserWindow | null = null
let appTray: AppTrayHandle | null = null
let isQuitting = false
```

Change `function createWindow(): void {` body so it assigns the module variable instead of a local const. Change:
```ts
  const mainWindow = new BrowserWindow({
```
to:
```ts
  mainWindow = new BrowserWindow({
```
Then, because `mainWindow` is now nullable at type level, add a local non-null alias right after construction for the rest of the function's event wiring:
```ts
  const window = mainWindow
```
and replace subsequent `mainWindow.` references inside `createWindow` with `window.` (the `sendFullscreenState`, `syncBackgroundColor`, `.on(...)`, `.once(...)`, `.webContents...`, `.loadURL/.loadFile` calls). Add a `closed` handler that clears the reference:
```ts
  window.on('closed', () => {
    mainWindow = null
  })
```

- [ ] **Step 3: Intercept close → hide to tray**

Inside `createWindow`, after the `ready-to-show` handler, add:
```ts
  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      window.hide()
    }
  })
```

- [ ] **Step 4: Add `showWindow` and `sendToRenderer`**

Add these module-level functions (after `registerWindowIpc`):
```ts
function showWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    return
  }
  createWindow()
}

function sendToRenderer(channel: string, payload?: unknown): void {
  showWindow()
  const target = mainWindow
  if (!target || target.isDestroyed()) return
  if (target.webContents.isLoading()) {
    target.webContents.once('did-finish-load', () => target.webContents.send(channel, payload))
  } else {
    target.webContents.send(channel, payload)
  }
}
```

- [ ] **Step 5: Change quit behavior**

Add a `before-quit` guard so genuine quits (OS quit, auto-updater relaunch) bypass the hide-on-close interception. Add near the bottom, and change `window-all-closed` to keep running:
```ts
app.on('before-quit', () => {
  isQuitting = true
})
```
Replace the existing `window-all-closed` handler (lines 172-176) with:
```ts
app.on('window-all-closed', () => {
  // The app keeps running in the tray on all platforms. Quit happens only via the
  // tray's Quit item (which sets isQuitting) or a genuine OS/updater quit.
})
```

- [ ] **Step 6: Create the tray during `whenReady`**

Inside `app.whenReady().then(...)`, after `applyThemeSource(initializeConfig().config.ui.theme)` and before/after `createWindow()`, wire the tray. Place after `createWindow()`:
```ts
    appTray = createAppTray({
      showWindow,
      sendToRenderer,
      getLanguage: () => getLocalConfig().ui.locale,
      isAuthenticated,
      listBookmarks: () => readBookmarks(),
      listNotifications: (limit) => listRecentNotifications(limit),
      onAuthChanged,
      quit: () => {
        isQuitting = true
        app.quit()
      }
    })
```

Refresh the tray labels when the UI language changes: update the existing `registerConfigIpc` call (line 146) from:
```ts
  registerConfigIpc((config) => applyThemeSource(config.ui.theme))
```
to:
```ts
  registerConfigIpc((config) => {
    applyThemeSource(config.ui.theme)
    appTray?.refresh()
  })
```

- [ ] **Step 7: Refresh the inbox when the window is focused**

Inside `createWindow`, add (after the `close` handler):
```ts
  window.on('focus', () => appTray?.refreshInbox())
```

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter @oh-my-github/client typecheck`
Expected: PASS

- [ ] **Step 9: Manual verification (run the app)**

Run: `pnpm dev`
Verify:
1. A tray icon appears (macOS menu bar / Windows-Linux tray). On macOS it is monochrome and adapts to light/dark.
2. Right-click (or click) the tray → menu shows **Open Oh My GitHub**, **Search Workspace**, a **Bookmarks** header, an **Inbox** header, and **Quit**.
3. Closing the main window hides it (app stays alive; tray remains). Clicking **Open Oh My GitHub** re-shows and focuses it.
4. **Quit** actually exits the app.
5. Add a bookmark in-app → the tray menu reflects it within ~1s (fs.watch). Switch language in settings → fixed labels update.

Note: `pnpm dev` is long-running. Launch it, observe, then stop it (Ctrl-C). Do not leave it running.

- [ ] **Step 10: Commit**

```bash
git add packages/client/src/main/index.ts
git commit -m "feat(main): hide-to-tray window lifecycle and tray wiring"
```

---

### Task 7: Preload `tray` namespace + renderer type declarations

**Files:**
- Modify: `packages/client/src/preload/index.ts`
- Modify: `packages/client/src/renderer/env.d.ts`

**Interfaces:**
- Produces on `window.ohMyGithub.tray`:
  - `onNavigate(listener: (url: string) => void): () => void` — channel `tray:navigate`.
  - `onOpenNotification(listener: (payload: { repositoryFullName: string; number?: number; subjectType: string; htmlUrl: string }) => void): () => void` — channel `tray:open-notification`.
  - `onOpenSearch(listener: () => void): () => void` — channel `tray:open-search`.

- [ ] **Step 1: Add the `tray` namespace in preload**

In `packages/client/src/preload/index.ts`, add a `tray` entry to the `api` object, after the `windowControls` block (after line 473, before the closing `}` on line 474). Mirror the existing unsubscribe pattern:
```ts
  ,
  tray: {
    onNavigate: (listener: (url: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, url: string): void => {
        listener(url)
      }
      ipcRenderer.on('tray:navigate', handler)
      return () => {
        ipcRenderer.removeListener('tray:navigate', handler)
      }
    },
    onOpenNotification: (
      listener: (payload: {
        repositoryFullName: string
        number?: number
        subjectType: string
        htmlUrl: string
      }) => void
    ) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: { repositoryFullName: string; number?: number; subjectType: string; htmlUrl: string }
      ): void => {
        listener(payload)
      }
      ipcRenderer.on('tray:open-notification', handler)
      return () => {
        ipcRenderer.removeListener('tray:open-notification', handler)
      }
    },
    onOpenSearch: (listener: () => void) => {
      const handler = (): void => {
        listener()
      }
      ipcRenderer.on('tray:open-search', handler)
      return () => {
        ipcRenderer.removeListener('tray:open-search', handler)
      }
    }
  }
```
(The leading `,` joins it after the `windowControls` block — adjust to the file's actual comma style: place a comma after the `windowControls: { ... }` closing brace and drop the leading comma here.)

- [ ] **Step 2: Declare the types in `env.d.ts`**

In `packages/client/src/renderer/env.d.ts`, add a `tray` block inside `window.ohMyGithub` after the `windowControls` block (after line 2639):
```ts
    tray: {
      onNavigate: (listener: (url: string) => void) => () => void
      onOpenNotification: (
        listener: (payload: {
          repositoryFullName: string
          number?: number
          subjectType: string
          htmlUrl: string
        }) => void
      ) => () => void
      onOpenSearch: (listener: () => void) => () => void
    }
```

- [ ] **Step 3: Typecheck & commit**

Run: `pnpm --filter @oh-my-github/client typecheck`
Expected: PASS
```bash
git add packages/client/src/preload/index.ts packages/client/src/renderer/env.d.ts
git commit -m "feat(preload): expose tray navigation bridge"
```

---

### Task 8: Workspace search-request signal

**Files:**
- Create: `packages/client/src/renderer/pages/workspace/composables/use-workspace-search-request.ts`
- Modify: `packages/client/src/renderer/pages/workspace/workspace-page.vue`

**Interfaces:**
- Produces: `requestWorkspaceSearch(): void` — bumps a module-singleton monotonic counter.
- Produces: `useWorkspaceSearchRequestSignal(): Readonly<Ref<number>>` — the counter to watch.

- [ ] **Step 1: Write the signal module**

Create `packages/client/src/renderer/pages/workspace/composables/use-workspace-search-request.ts`:
```ts
import { readonly, ref, type Ref } from 'vue'

// Module singleton: the tray (via use-tray-bridge) fires a search request that the
// workspace page consumes. Because the workspace page may be unmounted when the
// request arrives (e.g. on the settings route), the signal is a monotonic counter
// the page both watches and checks on mount, so a request is never lost.
const searchRequestCount = ref(0)

export function requestWorkspaceSearch(): void {
  searchRequestCount.value += 1
}

export function useWorkspaceSearchRequestSignal(): Readonly<Ref<number>> {
  return readonly(searchRequestCount)
}
```

- [ ] **Step 2: Subscribe in the workspace page**

In `packages/client/src/renderer/pages/workspace/workspace-page.vue`, ensure `watch` and `onMounted` are imported from `vue` (add them to the existing `vue` import if missing), and import the signal:
```ts
import { useWorkspaceSearchRequestSignal } from './composables/use-workspace-search-request'
```
After the `openSearchDialog` function definition (around line 165), add:
```ts
const searchRequestSignal = useWorkspaceSearchRequestSignal()
let handledSearchRequest = searchRequestSignal.value

function consumeSearchRequestIfPending(): void {
  if (searchRequestSignal.value !== handledSearchRequest) {
    handledSearchRequest = searchRequestSignal.value
    openSearchDialog()
  }
}

watch(searchRequestSignal, consumeSearchRequestIfPending)
onMounted(consumeSearchRequestIfPending)
```

- [ ] **Step 3: Typecheck & commit**

Run: `pnpm --filter @oh-my-github/client typecheck`
Expected: PASS
```bash
git add packages/client/src/renderer/pages/workspace/composables/use-workspace-search-request.ts packages/client/src/renderer/pages/workspace/workspace-page.vue
git commit -m "feat(workspace): add search-request signal for tray"
```

---

### Task 9: Renderer tray bridge (TDD on path validation)

**Files:**
- Create: `packages/client/src/renderer/composables/use-tray-bridge.ts`
- Test: `packages/client/src/renderer/composables/use-tray-bridge.test.ts`
- Modify: `packages/client/src/renderer/app.vue`

**Interfaces:**
- Consumes: `resolveNotificationTarget` (from `@/pages/inbox/inbox-helpers`); `requestWorkspaceSearch` (Task 8); `window.ohMyGithub.tray` (Task 7); `window.ohMyGithub.links.openGitHubUrl` (existing).
- Produces: `isInternalWorkspacePath(path: string): boolean`; `useTrayBridge(): void`.

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/renderer/composables/use-tray-bridge.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { isInternalWorkspacePath } from './use-tray-bridge'

describe('isInternalWorkspacePath', () => {
  it('accepts internal workspace paths', () => {
    expect(isInternalWorkspacePath('/o/r/pull-request/1')).toBe(true)
    expect(isInternalWorkspacePath('/')).toBe(true)
  })

  it('rejects external and protocol-relative URLs', () => {
    expect(isInternalWorkspacePath('https://github.com/o/r')).toBe(false)
    expect(isInternalWorkspacePath('//evil.example.com')).toBe(false)
    expect(isInternalWorkspacePath('javascript:alert(1)')).toBe(false)
    expect(isInternalWorkspacePath('')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oh-my-github/client test src/renderer/composables/use-tray-bridge.test.ts`
Expected: FAIL — module `./use-tray-bridge` / `isInternalWorkspacePath` not found.

- [ ] **Step 3: Write `use-tray-bridge.ts`**

Create `packages/client/src/renderer/composables/use-tray-bridge.ts`:
```ts
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { resolveNotificationTarget } from '@/pages/inbox/inbox-helpers'
import { requestWorkspaceSearch } from '@/pages/workspace/composables/use-workspace-search-request'

export function isInternalWorkspacePath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//')
}

export function useTrayBridge(): void {
  const router = useRouter()
  const unsubscribers: Array<() => void> = []

  onMounted(() => {
    unsubscribers.push(
      window.ohMyGithub.tray.onNavigate((url) => {
        if (isInternalWorkspacePath(url)) {
          void router.push(url)
        }
      })
    )

    unsubscribers.push(
      window.ohMyGithub.tray.onOpenNotification((payload) => {
        const target = resolveNotificationTarget({
          id: '',
          unread: false,
          reason: 'subscribed',
          updatedAt: '',
          subjectType: payload.subjectType,
          subjectTitle: '',
          repositoryFullName: payload.repositoryFullName,
          repositoryHtmlUrl: '',
          number: payload.number,
          htmlUrl: payload.htmlUrl
        })
        if (target.kind === 'internal') {
          void router.push(target.url)
        } else {
          void window.ohMyGithub.links.openGitHubUrl(target.url)
        }
      })
    )

    unsubscribers.push(
      window.ohMyGithub.tray.onOpenSearch(() => {
        if (router.currentRoute.value.path !== '/') {
          void router.push('/')
        }
        requestWorkspaceSearch()
      })
    )
  })

  onUnmounted(() => {
    for (const unsubscribe of unsubscribers) unsubscribe()
    unsubscribers.length = 0
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oh-my-github/client test src/renderer/composables/use-tray-bridge.test.ts`
Expected: PASS

- [ ] **Step 5: Wire the bridge into `app.vue`**

In `packages/client/src/renderer/app.vue`, add the import with the other composable imports:
```ts
import { useTrayBridge } from './composables/use-tray-bridge'
```
and call it alongside the other composable calls (after `useGlobalKeyboardShortcuts()`):
```ts
useTrayBridge()
```

- [ ] **Step 6: Typecheck & commit**

Run: `pnpm --filter @oh-my-github/client typecheck`
Expected: PASS
```bash
git add packages/client/src/renderer/composables/use-tray-bridge.ts packages/client/src/renderer/composables/use-tray-bridge.test.ts packages/client/src/renderer/app.vue
git commit -m "feat(renderer): route tray intents via bridge composable"
```

---

### Task 10: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `pnpm --filter @oh-my-github/client test`
Expected: PASS (including `tray-menu.test.ts` and `use-tray-bridge.test.ts`).

- [ ] **Step 2: Full typecheck**

Run: `pnpm typecheck`
Expected: PASS across all packages.

- [ ] **Step 3: Manual end-to-end (run the app)**

Run: `pnpm dev`. With an authenticated account and at least one bookmark + folder:
1. Tray menu lists folders (as submenus) before root bookmarks; Inbox shows up to 5 recent notifications.
2. Click a **bookmark** → window shows and navigates to that bookmark's workspace tab.
3. Click an **inbox notification** → a PR/Issue opens in-app; a commit/release opens in the browser.
4. Click **Search Workspace** → window shows, workspace search dialog opens (even if you were on the settings route first).
5. Sign out → Inbox section shows "Sign in to see your inbox"; sign in → notifications return.
6. Close window → app stays in tray; **Quit** exits.

Stop `pnpm dev` (Ctrl-C) when done.

- [ ] **Step 4: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "test(client): verify system tray end-to-end"
```

---

## Notes for the implementer

- **Do not leave `pnpm dev` running.** It is long-lived; launch, observe, Ctrl-C.
- The user develops on `main` and commits in parallel. Before each commit, confirm the branch (`git branch --show-current`) and that you are only staging tray-related files.
- If `sharp` fails to install in this environment, the committed PNGs from Task 4 still work at runtime (sharp is only needed to regenerate them). As a last resort, `tray.ts`'s `resolveTrayIcon` can fall back to the app icon, but prefer fixing the asset generation.
- Retina `@2x` icons are auto-loaded by `nativeImage.createFromPath` because they sit adjacent to the base file in `resources/tray/` (this is why Task 4 uses `extraResources` copying a real directory, not hashed `?asset` imports).
