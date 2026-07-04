# System Tray Design

## Goal

Add a system tray (macOS menu bar / Windows-Linux system tray) to the Oh My GitHub
Electron client. The tray gives quick access to the window, workspace search, saved
bookmarks, and recent inbox notifications without needing the main window focused.

## Tray menu layout

```
Open Oh My GitHub          → show / focus the main window
Search Workspace           → show the window and open the workspace search dialog
─────────────
Bookmarks                  (disabled category header)
  📁 Folder A          ▸    (submenu containing that folder's bookmarks)
  bookmark 4
  bookmark 5               (folders first, then root-level bookmarks — mirrors the sidebar)
─────────────
Inbox                      (disabled category header)
  <notification 1>         (up to 5 most recent notifications)
  …
─────────────
Quit
```

- The **Bookmarks** and **Inbox** rows are disabled label rows that act as category
  headers (matching the request's "分类，用禁用选项替代").
- **Bookmark ordering mirrors the sidebar exactly**: folders first (each as a submenu of
  its bookmarks), then root-level bookmarks. This falls out for free because both read the
  same persisted order from `bookmarks.json`.
- **Empty / edge states** are represented by a single disabled placeholder row:
  - No bookmarks → "No bookmarks yet"
  - No notifications → "No notifications"
  - Not signed in → "Sign in to see your inbox" (under the Inbox header)

## Architecture

The tray lives entirely in the **main process**. Main owns the data because it can read
both sources itself:

- **Bookmarks** are read directly from `~/.oh-my-github/bookmarks.json` using the existing
  normalize/read logic in `main/bookmarks.ts`. This file is the same source of truth the
  renderer's sidebar renders from, so the tray and sidebar never disagree on ordering.
- **Inbox** notifications are fetched through the GitHub API using the existing
  authenticated-API helper in `main/inbox.ts`.

Clicking a menu item shows/focuses the window and sends an IPC intent to the renderer.
The renderer performs navigation with logic that **already exists**, so no URL-building or
notification-routing logic is duplicated in main:

- Bookmark click → renderer runs `router.push(url)`; the workspace's existing `applyRoute`
  watcher opens/activates the matching tab.
- Inbox click → renderer runs the existing `resolveNotificationTarget(notification)`, which
  returns an internal workspace URL (PRs/Issues → `router.push`) or an external target
  (commits/releases/etc. → `openGitHubUrl`, since there is no in-app view for those).
- Search → renderer ensures it is on the workspace route, then fires a shared
  "search request" signal that the workspace page already knows how to act on.

## Units and changes

### Main process

**`main/tray.ts` (new)** — Owns the `Tray` instance and its lifecycle.
- `createAppTray(deps)` where `deps` provides: `showWindow()`, `sendToRenderer(channel, payload)`,
  `getLanguage()` (from config), a bookmarks reader, and an inbox lister.
- Loads the tray icon (see Assets), creates the `Tray`, builds the initial menu.
- Refresh triggers that rebuild the menu:
  - `fs.watch` on the bookmarks file → debounced rebuild (bookmarks changed in-app).
  - Inbox: fetch on init, on an interval (~5 min), and when the window is shown/focused.
  - Auth change (login/logout) → rebuild (so the Inbox section reflects sign-in state).
- Click handlers call `deps.showWindow()` then `deps.sendToRenderer(...)`.

**`main/tray-menu.ts` (new, pure)** — `buildTrayMenuTemplate(data, handlers, labels)`.
- Pure function: takes `{ bookmarks, folders, notifications, isAuthenticated }`, the click
  handlers, and the localized label strings; returns an Electron
  `MenuItemConstructorOptions[]`.
- Encapsulates ordering (folders-first-then-root), the 5-notification cap, header rows, and
  empty-state placeholders. Unit tested — this is where the menu-shape logic is verified.

**`main/bookmarks.ts` (change)** — Export the existing internal `readBookmarks()` (currently
private) so the tray can reuse it. No behavior change.

**`main/inbox.ts` (change)** — Export `listRecentNotifications(limit: number)` that reuses
`createAuthenticatedGitHubApi()` and returns the mapped `GitHubNotification[]`. Returns an
empty list (does not throw) when unauthenticated, so the tray can show the sign-in
placeholder.

**`main/index.ts` (change)** — Window lifecycle + tray wiring.
- Hold the created window in a module-level `mainWindow` reference.
- `showWindow()`: if a window exists, `show()` + `focus()` it (and un-minimize); otherwise
  `createWindow()`. On macOS keep the Dock icon visible (no `app.dock.hide()`).
- `sendToRenderer(channel, payload)`: calls `showWindow()`, then sends immediately if the
  webContents is loaded, otherwise sends once after `did-finish-load` (covers the
  cold-create case).
- Intercept the window `close` event: if `!app.isQuitting`, `event.preventDefault()` and
  `mainWindow.hide()` — the app keeps running in the tray on **all platforms**.
- Remove the `window-all-closed` → `app.quit()` behavior so the app survives window close on
  Windows/Linux too. Quitting happens only via the tray's **Quit** item, which sets
  `app.isQuitting = true` then `app.quit()`.
- Keep the existing macOS `activate` handler (re-show/re-create window).
- Call `createAppTray(...)` during `app.whenReady()` wiring, after auth/config init.

### Preload

**`preload/index.ts` (change)** — Add a `tray` namespace mirroring the existing
`windowControls` listener pattern (each returns an unsubscribe function):
- `onNavigate(cb: (url: string) => void)` — channel `tray:navigate`.
- `onOpenNotification(cb: (payload) => void)` — channel `tray:open-notification`, payload
  `{ repositoryFullName, number, subjectType, htmlUrl }` (the minimal fields
  `resolveNotificationTarget` needs).
- `onOpenSearch(cb: () => void)` — channel `tray:open-search`.

### Renderer

**`renderer/composables/use-tray-bridge.ts` (new)** — Invoked once in `app.vue`.
- `onNavigate` → validate the path is an internal workspace path (starts with `/`, not an
  absolute external URL) then `router.push(path)`.
- `onOpenNotification` → build a minimal notification object and call the existing
  `resolveNotificationTarget`; internal → `router.push(target.url)`, external →
  `window.ohMyGithub.links.openGitHubUrl(target.url)`.
- `onOpenSearch` → if the current route is not the workspace, `router.push('/')` first, then
  call `requestWorkspaceSearch()`.
- Registers listeners on mount, unsubscribes on unmount.

**`renderer/pages/workspace/composables/use-workspace-search-request.ts` (new, tiny)** —
Module-singleton signal so the tray can open the workspace-local search dialog:
- `requestWorkspaceSearch()` bumps a counter ref.
- `onWorkspaceSearchRequested(cb)` for the workspace page to subscribe.
- Because the workspace page can be unmounted (e.g. on the settings route) when the request
  arrives, the signal is a monotonic counter and the workspace page both `watch`es it and
  checks for an unhandled request on mount, so a request fired during navigation is not lost.

**`renderer/pages/workspace/workspace-page.vue` (change)** — Subscribe to
`onWorkspaceSearchRequested` and open the existing search dialog (reusing `openSearchDialog`).

## Localization

Tray fixed labels are localized to match the app's current language
(`config.ui.language`, zh/en). The main process does not currently load the renderer's
i18n bundle, so the tray uses a small self-contained string map in `main/tray.ts` (or a
dedicated `main/tray-labels.ts`) covering only the fixed labels:
`Open Oh My GitHub`, `Search Workspace`, `Bookmarks`, `Inbox`, `Quit`, and the three
placeholder strings. Bookmark titles and notification titles are user/content data and are
shown as-is. `getLanguage()` reads the current config value; the menu is rebuilt on config
language change so the labels update live.

## Assets

The tray needs an icon distinct from the app icon:
- **macOS**: a monochrome **template** image (`...Template.png` naming so Electron auto-inverts
  for light/dark menu bars), at 16×16 and 32×32 (@2x). Derived from the existing
  `assets/inline.svg` / `assets/badge.svg` mark.
- **Windows/Linux**: a small colored icon (16×16 / 32×32) derived from `assets/icon.png`.

Exact asset generation is an implementation detail; the plan will add the tray icon files
under `assets/` and reference them from `main/tray.ts` (dev vs packaged path resolution
follows the existing app-icon resolution pattern in `main/index.ts`).

## Data flow examples

Bookmark click:
```
Tray click
  → deps.showWindow()
  → deps.sendToRenderer('tray:navigate', bookmark.url)
  → renderer use-tray-bridge → router.push(url)
  → workspace applyRoute() opens/activates the tab
```

Inbox click:
```
Tray click
  → deps.showWindow()
  → deps.sendToRenderer('tray:open-notification', { repositoryFullName, number, subjectType, htmlUrl })
  → renderer use-tray-bridge → resolveNotificationTarget(...)
     → internal: router.push(target.url)   (PR / Issue)
     → external: openGitHubUrl(target.url)  (commit / release / other)
```

Search:
```
Tray "Search Workspace"
  → deps.showWindow()
  → deps.sendToRenderer('tray:open-search')
  → renderer use-tray-bridge → (ensure workspace route) → requestWorkspaceSearch()
  → workspace-page opens the search dialog
```

## Error handling

- Inbox fetch failures (network/auth) are caught and treated as an empty notification list;
  the tray shows the appropriate placeholder rather than crashing the menu build.
- Reading a missing/corrupt `bookmarks.json` reuses the existing normalize logic, which
  already falls back to empty bookmarks.
- `sendToRenderer` guards against a destroyed/absent window (re-creates via `showWindow`).

## Testing

- **`main/tray-menu.test.ts`** (new) — unit tests for `buildTrayMenuTemplate`:
  ordering (folders before root bookmarks; folder submenus contain the right children),
  the 5-notification cap, disabled category headers, and each empty/edge state
  (no bookmarks, no notifications, unauthenticated). Follows the existing
  `updates-state.test.ts` pure-function test pattern.
- `resolveNotificationTarget` and `inbox-helpers` are already covered by existing tests and
  are reused unchanged.
- Renderer bridge path validation (reject non-internal paths) can be covered by a small
  unit test on the validation helper.

## Out of scope (YAGNI)

- No unread badge/count on the tray icon.
- No configurable notification count or bookmark limit.
- No tray-specific preferences UI.
- No left-click-opens-window vs right-click-menu distinction beyond Electron defaults.
