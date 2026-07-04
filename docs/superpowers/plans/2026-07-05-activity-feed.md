# Activity Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在侧边栏 Inbox 下方新增 Activity 入口，打开 `activity` 类型 Tab，以紧凑行 + 聚合折叠样式展示 GitHub `received_events` 接收流（关注的人/组织、Star 的仓库的动态），支持类型过滤 badge 与"加载更多"。

**Architecture:** 数据链路照抄 Inbox：renderer composable（@pinia/colada `useQuery`）→ preload IPC bridge → main handler → `packages/api` 新增 `ActivityApi`（octokit REST）。API 层只做分页拉取 + 规范化为瘦类型 `GitHubFeedEvent`；聚合、过滤、文案选择全部是 renderer 纯函数（`activity-helpers.ts`），组件只渲染。`activity` tab 类型、`/activity` URL 解析、tab 标题已存在（占位符），本计划为它注册真实页面。

**Tech Stack:** Electron + Vue 3 + TypeScript、octokit、@pinia/colada、vue-i18n（`<i18n-t>` 组件插值 + 复数）、Tailwind（语义 token）、vitest。

**Spec:** `docs/superpowers/specs/2026-07-05-activity-feed-design.md`

## Global Constraints

- 功能命名统一 **Activity**（不叫 Timeline）；zh 文案的入口/标题也用英文 "Activity"。
- 复用已存在的 `activity` tab 类型；**不要**改 `types.ts` 的 `WorkspaceTabType`、`workspace-url.ts` 的解析逻辑。
- i18n key 必须同时加进 `en.json` 和 `zh.json`；locale 字符串不得出现裸 `@`（要写 `{'@'}`）；`|` 仅用于有意的复数。
- renderer 不接触 octokit/token；类型经 `env.d.ts` 全局声明（照 `GitHubNotification` 惯例）。
- 样式只用语义 token（`text-foreground`、`bg-muted/50`、`border-border` 等），暗色模式自动生效。
- 每个 task 一次 commit；测试先行（先写测试、跑失败、再实现）。
- 包管理：pnpm。测试命令：`pnpm --filter @oh-my-github/api test`、`pnpm --filter @oh-my-github/client test`；类型检查：`pnpm typecheck`。

---

### Task 1: `packages/api` 新增 ActivityApi（事件规范化 + 分页）

**Files:**
- Create: `packages/api/src/modules/activity.ts`
- Create: `packages/api/src/modules/activity.test.ts`
- Modify: `packages/api/src/client.ts`（import、interface、实例化、返回对象三处）
- Modify: `packages/api/src/index.ts`（加一行 export）

**Interfaces:**
- Consumes: `GitHubOctokit`（`../transport`），octokit REST `activity.listReceivedEventsForUser`。
- Produces（后续 task 依赖的精确签名）:
  - `class ActivityApi { listReceivedEvents(options: ListReceivedEventsOptions): Promise<GitHubFeedEventPage> }`
  - `interface ListReceivedEventsOptions { username: string; page?: number; perPage?: number }`
  - `interface GitHubFeedEvent { id: string; type: string; actor: GitHubFeedEventActor; repoFullName: string; createdAt: string; payload: GitHubFeedEventPayload }`
  - `interface GitHubFeedEventActor { login: string; avatarUrl: string | null }`
  - `interface GitHubFeedEventPage { events: GitHubFeedEvent[]; page: number; hasMore: boolean }`
  - `type GitHubFeedEventPayload`（判别联合，见下方代码）
  - `createGitHubApi(...)` 返回对象新增 `activity: ActivityApi`

- [ ] **Step 1: 写失败测试** — 创建 `packages/api/src/modules/activity.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest'
import type { GitHubOctokit } from '../transport'
import { ActivityApi, normalizeFeedEvent } from './activity'

function createApi(events: unknown[], linkHeader?: string) {
  const listReceivedEventsForUser = vi.fn().mockResolvedValue({
    data: events,
    headers: linkHeader ? { link: linkHeader } : {},
  })
  const api = new ActivityApi({
    rest: { activity: { listReceivedEventsForUser } },
  } as unknown as GitHubOctokit)

  return { api, listReceivedEventsForUser }
}

const NEXT_LINK = '<https://api.github.com/user/1/received_events?page=2>; rel="next"'

function rawEvent(type: string, payload: Record<string, unknown>) {
  return {
    id: '1000',
    type,
    actor: { login: 'antfu', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
    repo: { name: 'vitejs/vite' },
    payload,
    created_at: '2026-07-04T10:00:00Z',
  }
}

describe('ActivityApi.listReceivedEvents', () => {
  it('passes username, per_page and page to octokit', async () => {
    const { api, listReceivedEventsForUser } = createApi([])
    await api.listReceivedEvents({ username: 'acbox', page: 2, perPage: 50 })

    expect(listReceivedEventsForUser).toHaveBeenCalledWith({
      username: 'acbox',
      per_page: 50,
      page: 2,
    })
  })

  it('defaults to page 1 with per_page 100', async () => {
    const { api, listReceivedEventsForUser } = createApi([])
    await api.listReceivedEvents({ username: 'acbox' })

    expect(listReceivedEventsForUser).toHaveBeenCalledWith({
      username: 'acbox',
      per_page: 100,
      page: 1,
    })
  })

  it('reports hasMore from the Link header rel="next"', async () => {
    const withNext = createApi([], NEXT_LINK)
    expect((await withNext.api.listReceivedEvents({ username: 'acbox' })).hasMore).toBe(true)

    const withoutNext = createApi([])
    expect((await withoutNext.api.listReceivedEvents({ username: 'acbox' })).hasMore).toBe(false)
  })

  it('caps hasMore at page 3 (API hard limit of 300 events)', async () => {
    const { api } = createApi([], NEXT_LINK)
    expect((await api.listReceivedEvents({ username: 'acbox', page: 3 })).hasMore).toBe(false)
  })
})

describe('normalizeFeedEvent', () => {
  it('normalizes a WatchEvent into a star payload', () => {
    expect(normalizeFeedEvent(rawEvent('WatchEvent', { action: 'started' }))).toEqual({
      id: '1000',
      type: 'WatchEvent',
      actor: { login: 'antfu', avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4' },
      repoFullName: 'vitejs/vite',
      createdAt: '2026-07-04T10:00:00Z',
      payload: { kind: 'star' },
    })
  })

  it('keeps the forkee full name for ForkEvent', () => {
    const event = normalizeFeedEvent(rawEvent('ForkEvent', { forkee: { full_name: 'antfu/vite' } }))
    expect(event.payload).toEqual({ kind: 'fork', forkFullName: 'antfu/vite' })
  })

  it('strips refs/heads/ from PushEvent and uses size as commit count', () => {
    const event = normalizeFeedEvent(rawEvent('PushEvent', { ref: 'refs/heads/main', size: 3 }))
    expect(event.payload).toEqual({ kind: 'push', branch: 'main', commitCount: 3 })
  })

  it('normalizes CreateEvent branch and repository variants', () => {
    expect(normalizeFeedEvent(rawEvent('CreateEvent', { ref_type: 'branch', ref: 'feat/x' })).payload)
      .toEqual({ kind: 'create', refType: 'branch', ref: 'feat/x' })
    expect(normalizeFeedEvent(rawEvent('CreateEvent', { ref_type: 'repository', ref: null })).payload)
      .toEqual({ kind: 'create', refType: 'repository', ref: null })
  })

  it('normalizes ReleaseEvent tag and name', () => {
    const event = normalizeFeedEvent(rawEvent('ReleaseEvent', { release: { tag_name: 'v3.2.0', name: 'vitest v3.2.0' } }))
    expect(event.payload).toEqual({ kind: 'release', tagName: 'v3.2.0', releaseName: 'vitest v3.2.0' })
  })

  it('flags IssueCommentEvent on pull requests', () => {
    const event = normalizeFeedEvent(rawEvent('IssueCommentEvent', {
      issue: { number: 7, title: 'Fix bug', pull_request: { url: 'x' } },
    }))
    expect(event.payload).toEqual({ kind: 'issue-comment', number: 7, title: 'Fix bug', isPullRequest: true })
  })

  it('keeps merged flag for closed PullRequestEvent', () => {
    const event = normalizeFeedEvent(rawEvent('PullRequestEvent', {
      action: 'closed',
      pull_request: { number: 9, title: 'Add feed', merged: true },
    }))
    expect(event.payload).toEqual({ kind: 'pull-request', action: 'closed', number: 9, title: 'Add feed', merged: true })
  })

  it('falls back to unknown payloads for unrecognized event types', () => {
    const event = normalizeFeedEvent(rawEvent('SomeNewEvent', {}))
    expect(event.payload).toEqual({ kind: 'unknown', type: 'SomeNewEvent' })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @oh-my-github/api exec vitest run src/modules/activity.test.ts`
Expected: FAIL，报错找不到 `./activity` 模块。

- [ ] **Step 3: 实现 `packages/api/src/modules/activity.ts`**

```ts
import type { GitHubOctokit } from '../transport'

export interface ListReceivedEventsOptions {
  username: string
  page?: number
  perPage?: number
}

export interface GitHubFeedEventActor {
  login: string
  avatarUrl: string | null
}

export type GitHubFeedEventPayload =
  | { kind: 'star' }
  | { kind: 'fork'; forkFullName: string | null }
  | { kind: 'create'; refType: 'repository' | 'branch' | 'tag'; ref: string | null }
  | { kind: 'delete'; refType: 'branch' | 'tag'; ref: string }
  | { kind: 'push'; branch: string; commitCount: number }
  | { kind: 'release'; tagName: string; releaseName: string | null }
  | { kind: 'public' }
  | { kind: 'member'; memberLogin: string | null }
  | { kind: 'issue'; action: string; number: number; title: string }
  | { kind: 'issue-comment'; number: number | null; title: string; isPullRequest: boolean }
  | { kind: 'pull-request'; action: string; number: number; title: string; merged: boolean }
  | { kind: 'pull-request-review'; number: number | null; title: string }
  | { kind: 'pull-request-review-comment'; number: number | null; title: string }
  | { kind: 'commit-comment'; commitSha: string | null }
  | { kind: 'discussion'; title: string | null }
  | { kind: 'wiki'; pageCount: number }
  | { kind: 'sponsorship' }
  | { kind: 'unknown'; type: string }

export interface GitHubFeedEvent {
  id: string
  type: string
  actor: GitHubFeedEventActor
  repoFullName: string
  createdAt: string
  payload: GitHubFeedEventPayload
}

export interface GitHubFeedEventPage {
  events: GitHubFeedEvent[]
  page: number
  hasMore: boolean
}

// received_events 上限 300 条（30 天），per_page=100 时最多 3 页
const MAX_FEED_PAGE = 3

interface RawFeedEvent {
  id: string
  type: string | null
  actor: { login: string; avatar_url?: string | null }
  repo: { name: string }
  payload: Record<string, any> | null
  created_at: string | null
}

export class ActivityApi {
  constructor(private readonly octokit: GitHubOctokit) {}

  async listReceivedEvents(options: ListReceivedEventsOptions): Promise<GitHubFeedEventPage> {
    const page = options.page ?? 1
    const perPage = options.perPage ?? 100
    const response = await this.octokit.rest.activity.listReceivedEventsForUser({
      username: options.username,
      per_page: perPage,
      page,
    })

    return {
      events: (response.data as unknown as RawFeedEvent[]).map(normalizeFeedEvent),
      page,
      hasMore: hasNextPage(response.headers.link) && page < MAX_FEED_PAGE,
    }
  }
}

export function normalizeFeedEvent(raw: RawFeedEvent): GitHubFeedEvent {
  return {
    id: raw.id,
    type: raw.type ?? 'UnknownEvent',
    actor: {
      login: raw.actor.login,
      avatarUrl: raw.actor.avatar_url ?? null,
    },
    repoFullName: raw.repo.name,
    createdAt: raw.created_at ?? '',
    payload: normalizeFeedEventPayload(raw.type, raw.payload ?? {}),
  }
}

function normalizeFeedEventPayload(
  type: string | null,
  payload: Record<string, any>,
): GitHubFeedEventPayload {
  switch (type) {
    case 'WatchEvent':
      return { kind: 'star' }
    case 'ForkEvent':
      return { kind: 'fork', forkFullName: payload.forkee?.full_name ?? null }
    case 'CreateEvent': {
      const refType = payload.ref_type === 'branch' || payload.ref_type === 'tag'
        ? payload.ref_type
        : 'repository'
      return { kind: 'create', refType, ref: payload.ref ?? null }
    }
    case 'DeleteEvent':
      return {
        kind: 'delete',
        refType: payload.ref_type === 'tag' ? 'tag' : 'branch',
        ref: String(payload.ref ?? ''),
      }
    case 'PushEvent':
      return {
        kind: 'push',
        branch: String(payload.ref ?? '').replace(/^refs\/heads\//, ''),
        commitCount: typeof payload.size === 'number' ? payload.size : (payload.commits?.length ?? 0),
      }
    case 'ReleaseEvent':
      return {
        kind: 'release',
        tagName: String(payload.release?.tag_name ?? ''),
        releaseName: payload.release?.name ?? null,
      }
    case 'PublicEvent':
      return { kind: 'public' }
    case 'MemberEvent':
      return { kind: 'member', memberLogin: payload.member?.login ?? null }
    case 'IssuesEvent':
      return {
        kind: 'issue',
        action: String(payload.action ?? ''),
        number: Number(payload.issue?.number ?? 0),
        title: String(payload.issue?.title ?? ''),
      }
    case 'IssueCommentEvent':
      return {
        kind: 'issue-comment',
        number: payload.issue?.number ?? null,
        title: String(payload.issue?.title ?? ''),
        isPullRequest: Boolean(payload.issue?.pull_request),
      }
    case 'PullRequestEvent':
      return {
        kind: 'pull-request',
        action: String(payload.action ?? ''),
        number: Number(payload.pull_request?.number ?? payload.number ?? 0),
        title: String(payload.pull_request?.title ?? ''),
        merged: Boolean(payload.pull_request?.merged),
      }
    case 'PullRequestReviewEvent':
      return {
        kind: 'pull-request-review',
        number: payload.pull_request?.number ?? null,
        title: String(payload.pull_request?.title ?? ''),
      }
    case 'PullRequestReviewCommentEvent':
      return {
        kind: 'pull-request-review-comment',
        number: payload.pull_request?.number ?? null,
        title: String(payload.pull_request?.title ?? ''),
      }
    case 'CommitCommentEvent':
      return { kind: 'commit-comment', commitSha: payload.comment?.commit_id ?? null }
    case 'DiscussionEvent':
      return { kind: 'discussion', title: payload.discussion?.title ?? null }
    case 'GollumEvent':
      return { kind: 'wiki', pageCount: Array.isArray(payload.pages) ? payload.pages.length : 0 }
    case 'SponsorshipEvent':
      return { kind: 'sponsorship' }
    default:
      return { kind: 'unknown', type: type ?? 'UnknownEvent' }
  }
}

function hasNextPage(link: string | undefined): boolean {
  return Boolean(link?.includes('rel="next"'))
}
```

- [ ] **Step 4: 接线 `client.ts` 和 `index.ts`**

`packages/api/src/client.ts` 三处修改（照 `InboxApi` 的样子）：

1. import 区（第 2 行 `ActionsApi` 之后）加：
```ts
import { ActivityApi } from './modules/activity'
```
2. `GitHubApi` interface 里 `readonly actions: ActionsApi` 之后加：
```ts
  readonly activity: ActivityApi
```
3. `createGitHubApi` 里 `const actions = new ActionsApi(octokit)` 之后加：
```ts
  const activity = new ActivityApi(octokit)
```
返回对象里 `actions,` 之后加 `activity,`。

`packages/api/src/index.ts` 在 `export * from './modules/actions'` 之后加：
```ts
export * from './modules/activity'
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @oh-my-github/api test`
Expected: 全部 PASS（含既有测试）。

- [ ] **Step 6: 类型检查 + commit**

Run: `pnpm --filter @oh-my-github/api typecheck`
Expected: 无错误。

```bash
git add packages/api/src/modules/activity.ts packages/api/src/modules/activity.test.ts packages/api/src/client.ts packages/api/src/index.ts
git commit -m "feat(api): add ActivityApi for received events feed"
```

---

### Task 2: main 进程 IPC + preload bridge + 全局类型

**Files:**
- Create: `packages/client/src/main/activity.ts`
- Modify: `packages/client/src/main/index.ts`（import + 注册各一行）
- Modify: `packages/client/src/preload/index.ts`（`inbox` block 之后加 `activity` block）
- Modify: `packages/client/src/renderer/env.d.ts`（全局类型 + `window.ohMyGithub.activity` 声明）

**Interfaces:**
- Consumes: Task 1 的 `api.activity.listReceivedEvents({ username, page })`；`getAuthenticatedViewerLogin()`（`main/auth.ts` 已存在）。
- Produces: `window.ohMyGithub.activity.listReceivedEvents(options?: { page?: number }): Promise<GitHubFeedEventPage>`；renderer 全局类型 `GitHubFeedEvent` / `GitHubFeedEventActor` / `GitHubFeedEventPayload` / `GitHubFeedEventPage`。

- [ ] **Step 1: 创建 `packages/client/src/main/activity.ts`**（照 `main/inbox.ts` 模板）：

```ts
import { createGitHubApi } from '@oh-my-github/api'
import { ipcMain } from 'electron'
import { getAuthenticatedAccessToken, getAuthenticatedViewerLogin } from './auth'
import { resolveGitHubProxyUrl } from './proxy'

interface ListReceivedEventsIpcOptions {
  page?: number
}

export function registerActivityIpc(): void {
  ipcMain.handle('activity:list-received-events', (_event, options?: ListReceivedEventsIpcOptions) =>
    listReceivedEvents(options),
  )
}

async function listReceivedEvents(options?: ListReceivedEventsIpcOptions) {
  const api = await createAuthenticatedGitHubApi()
  return api.activity.listReceivedEvents({
    username: getAuthenticatedViewerLogin(),
    page: options?.page,
  })
}

async function createAuthenticatedGitHubApi() {
  return createGitHubApi({
    token: getAuthenticatedAccessToken(),
    proxyUrl: await resolveGitHubProxyUrl(),
  })
}
```

- [ ] **Step 2: 注册 IPC** — `packages/client/src/main/index.ts`：

import 区 `import { registerAccountsIpc } from './accounts'` 附近加：
```ts
import { registerActivityIpc } from './activity'
```
`registerInboxIpc()`（约 134 行）后面加一行：
```ts
  registerActivityIpc()
```

- [ ] **Step 3: preload bridge** — `packages/client/src/preload/index.ts` 在 `inbox: { ... },` block（约 145-152 行）之后加：

```ts
  activity: {
    listReceivedEvents: (options?: { page?: number }) =>
      ipcRenderer.invoke('activity:list-received-events', options),
  },
```

- [ ] **Step 4: env.d.ts 全局类型** — `packages/client/src/renderer/env.d.ts`：

在 `type GitHubNotification = { ... }`（约 1241-1252 行）之后加：

```ts
type GitHubFeedEventActor = {
  login: string
  avatarUrl: string | null
}

type GitHubFeedEventPayload =
  | { kind: 'star' }
  | { kind: 'fork'; forkFullName: string | null }
  | { kind: 'create'; refType: 'repository' | 'branch' | 'tag'; ref: string | null }
  | { kind: 'delete'; refType: 'branch' | 'tag'; ref: string }
  | { kind: 'push'; branch: string; commitCount: number }
  | { kind: 'release'; tagName: string; releaseName: string | null }
  | { kind: 'public' }
  | { kind: 'member'; memberLogin: string | null }
  | { kind: 'issue'; action: string; number: number; title: string }
  | { kind: 'issue-comment'; number: number | null; title: string; isPullRequest: boolean }
  | { kind: 'pull-request'; action: string; number: number; title: string; merged: boolean }
  | { kind: 'pull-request-review'; number: number | null; title: string }
  | { kind: 'pull-request-review-comment'; number: number | null; title: string }
  | { kind: 'commit-comment'; commitSha: string | null }
  | { kind: 'discussion'; title: string | null }
  | { kind: 'wiki'; pageCount: number }
  | { kind: 'sponsorship' }
  | { kind: 'unknown'; type: string }

type GitHubFeedEvent = {
  id: string
  type: string
  actor: GitHubFeedEventActor
  repoFullName: string
  createdAt: string
  payload: GitHubFeedEventPayload
}

type GitHubFeedEventPage = {
  events: GitHubFeedEvent[]
  page: number
  hasMore: boolean
}
```

在 `interface Window` 的 `ohMyGithub` 里、`inbox: { ... }` 声明（约 1911-1917 行）之后加：

```ts
    activity: {
      listReceivedEvents: (options?: { page?: number }) => Promise<GitHubFeedEventPage>
    }
```

- [ ] **Step 5: 类型检查 + commit**

Run: `pnpm --filter @oh-my-github/client typecheck`
Expected: 无错误。

```bash
git add packages/client/src/main/activity.ts packages/client/src/main/index.ts packages/client/src/preload/index.ts packages/client/src/renderer/env.d.ts
git commit -m "feat(client): wire activity feed IPC bridge"
```

---

### Task 3: 相对时间工具 `formatRelativeTime`

**Files:**
- Modify: `packages/client/src/renderer/components/conversation/format.ts`
- Create: `packages/client/src/renderer/components/conversation/format.test.ts`（若已存在则追加 describe 块）

**Interfaces:**
- Produces: `formatRelativeTime(value?: string | null, options?: { locale?: string; now?: Date }): string | null`

- [ ] **Step 1: 写失败测试** — `format.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './format'

const now = new Date('2026-07-05T12:00:00Z')

describe('formatRelativeTime', () => {
  it('formats minutes and hours ago in narrow style', () => {
    expect(formatRelativeTime('2026-07-05T11:57:00Z', { locale: 'en', now })).toBe('3 min. ago')
    expect(formatRelativeTime('2026-07-05T09:00:00Z', { locale: 'en', now })).toBe('3 hr. ago')
  })

  it('uses natural wording for days', () => {
    expect(formatRelativeTime('2026-07-04T11:00:00Z', { locale: 'en', now })).toBe('yesterday')
  })

  it('returns null for missing or invalid input', () => {
    expect(formatRelativeTime(null, { locale: 'en', now })).toBeNull()
    expect(formatRelativeTime('not-a-date', { locale: 'en', now })).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @oh-my-github/client exec vitest run src/renderer/components/conversation/format.test.ts`
Expected: FAIL，`formatRelativeTime` 未导出。

- [ ] **Step 3: 实现** — 在 `format.ts` 末尾（`parseConversationDate` 之前均可，保持导出在前的文件风格）追加：

```ts
const relativeTimeDivisions: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
]

export function formatRelativeTime(
  value?: string | null,
  options?: { locale?: string; now?: Date },
): string | null {
  const date = parseConversationDate(value)
  if (!date) return null

  const now = options?.now ?? new Date()
  const formatter = new Intl.RelativeTimeFormat(options?.locale, { numeric: 'auto', style: 'narrow' })
  let duration = (date.getTime() - now.getTime()) / 1000

  for (const division of relativeTimeDivisions) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit)
    }
    duration /= division.amount
  }

  return null
}
```

注意：与 `formatConversationDate` 不同，这里不能用模块级单例 formatter，因为 locale 跟随用户设置动态变化。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @oh-my-github/client exec vitest run src/renderer/components/conversation/format.test.ts`
Expected: PASS。若 `'3 min. ago'` 这类 ICU 输出串在本机 Node 版本下不同，以实际输出修正断言（保持语义不变）。

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/renderer/components/conversation/format.ts packages/client/src/renderer/components/conversation/format.test.ts
git commit -m "feat(ui): add formatRelativeTime helper"
```

---

### Task 4: 渲染层纯函数 `activity-helpers.ts`（合并 / 分组 / 过滤 / 文案与目标）

**Files:**
- Create: `packages/client/src/renderer/pages/activity/activity-helpers.ts`
- Create: `packages/client/src/renderer/pages/activity/activity-helpers.test.ts`

**Interfaces:**
- Consumes: 全局类型 `GitHubFeedEvent`（Task 2）；`createRepositoryWorkspaceUrl` / `createCommitWorkspaceUrl` / `createAccountWorkspaceUrl`（`@/pages/workspace/workspace-url`）；`createReferenceWorkspaceUrl`（`@/components/github/github-reference`）。
- Produces（Task 6 组件依赖）:
  - `type ActivityFilterKey = 'stars' | 'forks' | 'repos' | 'releases' | 'commits' | 'issuesAndPrs'`；`const ACTIVITY_FILTER_KEYS: ActivityFilterKey[]`
  - `matchesActivityFilter(event: GitHubFeedEvent, filter: ActivityFilterKey | null): boolean`
  - `mergeFeedEvents(pages: GitHubFeedEvent[][]): GitHubFeedEvent[]`
  - `interface ActivityFeedGroup { id: string; kind: 'single' | 'star' | 'fork' | 'push'; actor: GitHubFeedEventActor; createdAt: string; events: GitHubFeedEvent[] }`
  - `groupFeedEvents(events: GitHubFeedEvent[]): ActivityFeedGroup[]`
  - `interface FeedSentencePart { label: string; url: string | null }`
  - `interface FeedEventPresentation { sentenceKey: string; pluralCount: number | null; parts: Record<string, FeedSentencePart>; subtitle: string | null; targetUrl: string | null }`
  - `presentFeedEvent(event: GitHubFeedEvent): FeedEventPresentation`
  - `interface FeedGroupPresentation { sentenceKey: string; pluralCount: number | null; parts: Record<string, FeedSentencePart>; targetUrl: string | null; expandable: boolean; children: Array<{ id: string; part: FeedSentencePart; createdAt: string }> }`
  - `presentFeedGroup(group: ActivityFeedGroup): FeedGroupPresentation`

- [ ] **Step 1: 写失败测试** — `activity-helpers.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_FILTER_KEYS,
  groupFeedEvents,
  matchesActivityFilter,
  mergeFeedEvents,
  presentFeedEvent,
  presentFeedGroup,
} from './activity-helpers'

let nextId = 1

function feedEvent(overrides: {
  payload: GitHubFeedEventPayload
  actorLogin?: string
  repoFullName?: string
  createdAt?: string
  id?: string
}): GitHubFeedEvent {
  return {
    id: overrides.id ?? String(nextId++),
    type: 'TestEvent',
    actor: { login: overrides.actorLogin ?? 'antfu', avatarUrl: null },
    repoFullName: overrides.repoFullName ?? 'vitejs/vite',
    createdAt: overrides.createdAt ?? '2026-07-04T10:00:00Z',
    payload: overrides.payload,
  }
}

const star = (login = 'antfu', repo = 'vitejs/vite', createdAt = '2026-07-04T10:00:00Z') =>
  feedEvent({ payload: { kind: 'star' }, actorLogin: login, repoFullName: repo, createdAt })

describe('mergeFeedEvents', () => {
  it('dedupes by id and sorts by createdAt desc', () => {
    const a = star('antfu', 'a/a', '2026-07-04T10:00:00Z')
    const b = star('posva', 'b/b', '2026-07-04T12:00:00Z')
    const merged = mergeFeedEvents([[a], [b, { ...a }]])

    expect(merged.map((event) => event.id)).toEqual([b.id, a.id])
  })
})

describe('groupFeedEvents', () => {
  it('groups adjacent stars by the same actor and downgrades singles', () => {
    const events = [star('antfu', 'a/a'), star('antfu', 'b/b'), star('posva', 'c/c')]
    const groups = groupFeedEvents(events)

    expect(groups).toHaveLength(2)
    expect(groups[0].kind).toBe('star')
    expect(groups[0].events).toHaveLength(2)
    expect(groups[1].kind).toBe('single')
  })

  it('does not group stars separated by another event', () => {
    const events = [
      star('antfu', 'a/a'),
      feedEvent({ payload: { kind: 'release', tagName: 'v1', releaseName: null }, actorLogin: 'antfu' }),
      star('antfu', 'b/b'),
    ]
    expect(groupFeedEvents(events)).toHaveLength(3)
  })

  it('sums commit counts for adjacent pushes to the same repo and branch', () => {
    const push = (count: number) =>
      feedEvent({ payload: { kind: 'push', branch: 'main', commitCount: count }, actorLogin: 'posva', repoFullName: 'vuejs/pinia' })
    const groups = groupFeedEvents([push(2), push(3)])

    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('push')
    expect(presentFeedGroup(groups[0]).pluralCount).toBe(5)
  })
})

describe('matchesActivityFilter', () => {
  it('maps each filter key to its payload kinds', () => {
    const releaseEvent = feedEvent({ payload: { kind: 'release', tagName: 'v1', releaseName: null } })
    expect(matchesActivityFilter(releaseEvent, 'releases')).toBe(true)
    expect(matchesActivityFilter(releaseEvent, 'stars')).toBe(false)
    expect(matchesActivityFilter(releaseEvent, null)).toBe(true)
    expect(ACTIVITY_FILTER_KEYS).toHaveLength(6)
  })

  it('hides unknown events behind any active filter', () => {
    const unknown = feedEvent({ payload: { kind: 'unknown', type: 'X' } })
    expect(matchesActivityFilter(unknown, null)).toBe(true)
    expect(matchesActivityFilter(unknown, 'repos')).toBe(false)
  })
})

describe('presentFeedEvent', () => {
  it('presents a star with the repo as link and row target', () => {
    const presentation = presentFeedEvent(star())

    expect(presentation.sentenceKey).toBe('workspace.activity.sentences.starred')
    expect(presentation.parts.repo).toEqual({ label: 'vitejs/vite', url: '/vitejs/vite' })
    expect(presentation.targetUrl).toBe('/vitejs/vite')
  })

  it('targets the commits section for pushes', () => {
    const event = feedEvent({ payload: { kind: 'push', branch: 'main', commitCount: 3 } })
    const presentation = presentFeedEvent(event)

    expect(presentation.sentenceKey).toBe('workspace.activity.sentences.pushed')
    expect(presentation.pluralCount).toBe(3)
    expect(presentation.targetUrl).toBe('/vitejs/vite?tab=commits')
  })

  it('links merged pull requests to the PR tab with title as subtitle', () => {
    const event = feedEvent({
      payload: { kind: 'pull-request', action: 'closed', number: 9, title: 'Add feed', merged: true },
    })
    const presentation = presentFeedEvent(event)

    expect(presentation.sentenceKey).toBe('workspace.activity.sentences.mergedPullRequest')
    expect(presentation.parts.target.url).toBe('/vitejs/vite/pull/9')
    expect(presentation.subtitle).toBe('Add feed')
  })

  it('routes PR comments to the pull request even for issue-comment payloads', () => {
    const event = feedEvent({
      payload: { kind: 'issue-comment', number: 7, title: 'Fix', isPullRequest: true },
    })
    const presentation = presentFeedEvent(event)

    expect(presentation.sentenceKey).toBe('workspace.activity.sentences.commentedPullRequest')
    expect(presentation.parts.target.url).toBe('/vitejs/vite/pull/7')
  })

  it('falls back to the repo for unknown events', () => {
    const presentation = presentFeedEvent(feedEvent({ payload: { kind: 'unknown', type: 'X' } }))
    expect(presentation.sentenceKey).toBe('workspace.activity.sentences.acted')
    expect(presentation.targetUrl).toBe('/vitejs/vite')
  })
})

describe('presentFeedGroup', () => {
  it('presents star groups as expandable with repo children', () => {
    const groups = groupFeedEvents([star('antfu', 'a/a'), star('antfu', 'b/b')])
    const presentation = presentFeedGroup(groups[0])

    expect(presentation.sentenceKey).toBe('workspace.activity.groups.starred')
    expect(presentation.expandable).toBe(true)
    expect(presentation.parts.count.label).toBe('2')
    expect(presentation.children.map((child) => child.part.label)).toEqual(['a/a', 'b/b'])
    expect(presentation.children[0].part.url).toBe('/a/a')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @oh-my-github/client exec vitest run src/renderer/pages/activity/activity-helpers.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `activity-helpers.ts`**：

```ts
import { createReferenceWorkspaceUrl } from '@/components/github/github-reference'
import {
  createAccountWorkspaceUrl,
  createCommitWorkspaceUrl,
  createRepositoryWorkspaceUrl,
} from '@/pages/workspace/workspace-url'

export type ActivityFilterKey = 'stars' | 'forks' | 'repos' | 'releases' | 'commits' | 'issuesAndPrs'

export const ACTIVITY_FILTER_KEYS: ActivityFilterKey[] = [
  'stars',
  'forks',
  'repos',
  'releases',
  'commits',
  'issuesAndPrs',
]

const FILTER_KINDS: Record<ActivityFilterKey, ReadonlySet<string>> = {
  stars: new Set(['star']),
  forks: new Set(['fork']),
  repos: new Set(['create', 'delete', 'public', 'member', 'wiki']),
  releases: new Set(['release']),
  commits: new Set(['push', 'commit-comment']),
  issuesAndPrs: new Set([
    'issue',
    'issue-comment',
    'pull-request',
    'pull-request-review',
    'pull-request-review-comment',
    'discussion',
  ]),
}

export function matchesActivityFilter(event: GitHubFeedEvent, filter: ActivityFilterKey | null): boolean {
  if (!filter) return true

  return FILTER_KINDS[filter].has(event.payload.kind)
}

export function mergeFeedEvents(pages: GitHubFeedEvent[][]): GitHubFeedEvent[] {
  const seen = new Set<string>()
  const merged: GitHubFeedEvent[] = []

  for (const page of pages) {
    for (const event of page) {
      if (seen.has(event.id)) continue

      seen.add(event.id)
      merged.push(event)
    }
  }

  return merged.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

export type ActivityGroupKind = 'single' | 'star' | 'fork' | 'push'

export interface ActivityFeedGroup {
  id: string
  kind: ActivityGroupKind
  actor: GitHubFeedEventActor
  createdAt: string
  events: GitHubFeedEvent[]
}

export function groupFeedEvents(events: GitHubFeedEvent[]): ActivityFeedGroup[] {
  const groups: ActivityFeedGroup[] = []
  let openKey: string | null = null

  for (const event of events) {
    const key = groupKeyForEvent(event)
    const lastGroup = groups[groups.length - 1]

    if (key && key === openKey && lastGroup) {
      lastGroup.events.push(event)
      continue
    }

    openKey = key
    groups.push({
      id: event.id,
      kind: key ? (event.payload.kind as Exclude<ActivityGroupKind, 'single'>) : 'single',
      actor: event.actor,
      createdAt: event.createdAt,
      events: [event],
    })
  }

  return groups.map((group) =>
    group.kind !== 'single' && group.events.length === 1 ? { ...group, kind: 'single' } : group,
  )
}

function groupKeyForEvent(event: GitHubFeedEvent): string | null {
  const { payload } = event

  if (payload.kind === 'star') return `star:${event.actor.login}`
  if (payload.kind === 'fork') return `fork:${event.actor.login}`
  if (payload.kind === 'push') return `push:${event.actor.login}:${event.repoFullName}:${payload.branch}`

  return null
}

export interface FeedSentencePart {
  label: string
  url: string | null
}

export interface FeedEventPresentation {
  sentenceKey: string
  pluralCount: number | null
  parts: Record<string, FeedSentencePart>
  subtitle: string | null
  targetUrl: string | null
}

const SENTENCE_PREFIX = 'workspace.activity.sentences'

export function presentFeedEvent(event: GitHubFeedEvent): FeedEventPresentation {
  const { payload } = event
  const { owner, repo } = splitRepoFullName(event.repoFullName)
  const repoUrl = owner && repo ? createRepositoryWorkspaceUrl(owner, repo) : null
  const repoPart: FeedSentencePart = { label: event.repoFullName, url: repoUrl }
  const base = { pluralCount: null, subtitle: null }

  switch (payload.kind) {
    case 'star':
      return { ...base, sentenceKey: `${SENTENCE_PREFIX}.starred`, parts: { repo: repoPart }, targetUrl: repoUrl }
    case 'fork': {
      const forkPart = payload.forkFullName
        ? { label: payload.forkFullName, url: repoUrlFor(payload.forkFullName) }
        : repoPart
      return {
        ...base,
        sentenceKey: `${SENTENCE_PREFIX}.forked`,
        parts: { repo: repoPart, fork: forkPart },
        targetUrl: forkPart.url ?? repoUrl,
      }
    }
    case 'create': {
      if (payload.refType === 'repository') {
        return { ...base, sentenceKey: `${SENTENCE_PREFIX}.createdRepository`, parts: { repo: repoPart }, targetUrl: repoUrl }
      }
      const branchesUrl = owner && repo ? createRepositoryWorkspaceUrl(owner, repo, 'branches') : null
      return {
        ...base,
        sentenceKey: payload.refType === 'tag' ? `${SENTENCE_PREFIX}.createdTag` : `${SENTENCE_PREFIX}.createdBranch`,
        parts: { repo: repoPart, ref: { label: payload.ref ?? '', url: null } },
        targetUrl: branchesUrl ?? repoUrl,
      }
    }
    case 'delete': {
      const branchesUrl = owner && repo ? createRepositoryWorkspaceUrl(owner, repo, 'branches') : null
      return {
        ...base,
        sentenceKey: payload.refType === 'tag' ? `${SENTENCE_PREFIX}.deletedTag` : `${SENTENCE_PREFIX}.deletedBranch`,
        parts: { repo: repoPart, ref: { label: payload.ref, url: null } },
        targetUrl: branchesUrl ?? repoUrl,
      }
    }
    case 'push': {
      const commitsUrl = owner && repo ? createRepositoryWorkspaceUrl(owner, repo, 'commits') : null
      return {
        sentenceKey: `${SENTENCE_PREFIX}.pushed`,
        pluralCount: payload.commitCount,
        parts: {
          repo: repoPart,
          branch: { label: payload.branch, url: commitsUrl },
          count: { label: String(payload.commitCount), url: null },
        },
        subtitle: null,
        targetUrl: commitsUrl ?? repoUrl,
      }
    }
    case 'release': {
      const releasesUrl = owner && repo ? createRepositoryWorkspaceUrl(owner, repo, 'releases') : null
      const label = payload.releaseName?.trim() || payload.tagName
      return {
        ...base,
        sentenceKey: `${SENTENCE_PREFIX}.published`,
        parts: { repo: repoPart, release: { label, url: releasesUrl } },
        targetUrl: releasesUrl ?? repoUrl,
      }
    }
    case 'public':
      return { ...base, sentenceKey: `${SENTENCE_PREFIX}.madePublic`, parts: { repo: repoPart }, targetUrl: repoUrl }
    case 'member': {
      const memberPart: FeedSentencePart = payload.memberLogin
        ? { label: payload.memberLogin, url: createAccountWorkspaceUrl(payload.memberLogin) }
        : { label: '', url: null }
      return {
        ...base,
        sentenceKey: `${SENTENCE_PREFIX}.addedMember`,
        parts: { repo: repoPart, member: memberPart },
        targetUrl: repoUrl,
      }
    }
    case 'issue': {
      const url = referenceUrl(owner, repo, 'issue', payload.number)
      return {
        ...base,
        sentenceKey: issueSentenceKey(payload.action),
        parts: { target: targetPart(event.repoFullName, payload.number, url, repoUrl) },
        subtitle: payload.title || null,
        targetUrl: url ?? repoUrl,
      }
    }
    case 'issue-comment': {
      const kind = payload.isPullRequest ? 'pull-request' : 'issue'
      const url = referenceUrl(owner, repo, kind, payload.number)
      return {
        ...base,
        sentenceKey: payload.isPullRequest
          ? `${SENTENCE_PREFIX}.commentedPullRequest`
          : `${SENTENCE_PREFIX}.commentedIssue`,
        parts: { target: targetPart(event.repoFullName, payload.number, url, repoUrl) },
        subtitle: payload.title || null,
        targetUrl: url ?? repoUrl,
      }
    }
    case 'pull-request': {
      const url = referenceUrl(owner, repo, 'pull-request', payload.number)
      return {
        ...base,
        sentenceKey: pullRequestSentenceKey(payload.action, payload.merged),
        parts: { target: targetPart(event.repoFullName, payload.number, url, repoUrl) },
        subtitle: payload.title || null,
        targetUrl: url ?? repoUrl,
      }
    }
    case 'pull-request-review':
    case 'pull-request-review-comment': {
      const url = referenceUrl(owner, repo, 'pull-request', payload.number)
      return {
        ...base,
        sentenceKey: payload.kind === 'pull-request-review'
          ? `${SENTENCE_PREFIX}.reviewedPullRequest`
          : `${SENTENCE_PREFIX}.commentedPullRequest`,
        parts: { target: targetPart(event.repoFullName, payload.number, url, repoUrl) },
        subtitle: payload.title || null,
        targetUrl: url ?? repoUrl,
      }
    }
    case 'commit-comment': {
      const url = owner && repo && payload.commitSha
        ? createCommitWorkspaceUrl(owner, repo, payload.commitSha)
        : null
      return {
        ...base,
        sentenceKey: `${SENTENCE_PREFIX}.commentedCommit`,
        parts: {
          target: {
            label: payload.commitSha ? `${event.repoFullName}@${payload.commitSha.slice(0, 7)}` : event.repoFullName,
            url: url ?? repoUrl,
          },
        },
        targetUrl: url ?? repoUrl,
      }
    }
    case 'discussion':
      return {
        ...base,
        sentenceKey: `${SENTENCE_PREFIX}.startedDiscussion`,
        parts: { repo: repoPart },
        subtitle: payload.title,
        targetUrl: repoUrl,
      }
    case 'wiki':
      return {
        sentenceKey: `${SENTENCE_PREFIX}.editedWiki`,
        pluralCount: payload.pageCount,
        parts: { repo: repoPart, count: { label: String(payload.pageCount), url: null } },
        subtitle: null,
        targetUrl: repoUrl,
      }
    case 'sponsorship':
      return { ...base, sentenceKey: `${SENTENCE_PREFIX}.sponsored`, parts: { repo: repoPart }, targetUrl: repoUrl }
    default:
      return { ...base, sentenceKey: `${SENTENCE_PREFIX}.acted`, parts: { repo: repoPart }, targetUrl: repoUrl }
  }
}

export interface FeedGroupPresentation {
  sentenceKey: string
  pluralCount: number | null
  parts: Record<string, FeedSentencePart>
  targetUrl: string | null
  expandable: boolean
  children: Array<{ id: string; part: FeedSentencePart; createdAt: string }>
}

export function presentFeedGroup(group: ActivityFeedGroup): FeedGroupPresentation {
  if (group.kind === 'push') {
    const first = presentFeedEvent(group.events[0])
    const total = group.events.reduce(
      (sum, event) => sum + (event.payload.kind === 'push' ? event.payload.commitCount : 0),
      0,
    )

    return {
      sentenceKey: `${SENTENCE_PREFIX}.pushed`,
      pluralCount: total,
      parts: { ...first.parts, count: { label: String(total), url: null } },
      targetUrl: first.targetUrl,
      expandable: false,
      children: [],
    }
  }

  return {
    sentenceKey: group.kind === 'fork' ? 'workspace.activity.groups.forked' : 'workspace.activity.groups.starred',
    pluralCount: null,
    parts: { count: { label: String(group.events.length), url: null } },
    targetUrl: null,
    expandable: true,
    children: group.events.map((event) => ({
      id: event.id,
      part: childPart(event),
      createdAt: event.createdAt,
    })),
  }
}

function childPart(event: GitHubFeedEvent): FeedSentencePart {
  if (event.payload.kind === 'fork' && event.payload.forkFullName) {
    return { label: event.payload.forkFullName, url: repoUrlFor(event.payload.forkFullName) }
  }

  return { label: event.repoFullName, url: repoUrlFor(event.repoFullName) }
}

function issueSentenceKey(action: string): string {
  if (action === 'opened') return `${SENTENCE_PREFIX}.openedIssue`
  if (action === 'closed') return `${SENTENCE_PREFIX}.closedIssue`
  if (action === 'reopened') return `${SENTENCE_PREFIX}.reopenedIssue`

  return `${SENTENCE_PREFIX}.updatedIssue`
}

function pullRequestSentenceKey(action: string, merged: boolean): string {
  if (action === 'closed' && merged) return `${SENTENCE_PREFIX}.mergedPullRequest`
  if (action === 'closed') return `${SENTENCE_PREFIX}.closedPullRequest`
  if (action === 'opened') return `${SENTENCE_PREFIX}.openedPullRequest`
  if (action === 'reopened') return `${SENTENCE_PREFIX}.reopenedPullRequest`

  return `${SENTENCE_PREFIX}.updatedPullRequest`
}

function targetPart(
  repoFullName: string,
  number: number | null,
  url: string | null,
  repoUrl: string | null,
): FeedSentencePart {
  return {
    label: number ? `${repoFullName}#${number}` : repoFullName,
    url: url ?? repoUrl,
  }
}

function referenceUrl(
  owner: string,
  repo: string,
  kind: 'issue' | 'pull-request',
  number: number | null,
): string | null {
  if (!owner || !repo || !number || number <= 0) return null

  return createReferenceWorkspaceUrl(owner, repo, kind, number)
}

function repoUrlFor(fullName: string): string | null {
  const { owner, repo } = splitRepoFullName(fullName)
  return owner && repo ? createRepositoryWorkspaceUrl(owner, repo) : null
}

function splitRepoFullName(fullName: string): { owner: string; repo: string } {
  const [owner = '', repo = ''] = fullName.split('/')
  return { owner, repo }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @oh-my-github/client exec vitest run src/renderer/pages/activity/activity-helpers.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/renderer/pages/activity/activity-helpers.ts packages/client/src/renderer/pages/activity/activity-helpers.test.ts
git commit -m "feat(activity): add feed merge/group/filter/presentation helpers"
```

---

### Task 5: i18n key（en + zh）

**Files:**
- Modify: `packages/client/src/renderer/i18n/locales/en.json`
- Modify: `packages/client/src/renderer/i18n/locales/zh.json`

**Interfaces:**
- Produces: `workspace.sidebar.items.activity`、`workspace.activity.*`（Task 4 的 sentenceKey 与 Task 6 组件消费）。
- 注意：`workspace.tabs.items.activity`、`workspace.panel.*.activity` 已存在，不动。

- [ ] **Step 1: en.json** — 两处修改：

1. `workspace.sidebar.items`（现只有 `"inbox": "Inbox"`）改为：
```json
      "items": {
        "activity": "Activity",
        "inbox": "Inbox"
      },
```
2. 在 `workspace` 对象内新增顶级子对象 `activity`（放在 `workspace.inbox` 兄弟位置）：
```json
    "activity": {
      "title": "Activity",
      "filters": {
        "stars": "Stars",
        "forks": "Forks",
        "repos": "Repositories",
        "releases": "Releases",
        "commits": "Commits",
        "issuesAndPrs": "Issues & PRs"
      },
      "sentences": {
        "starred": "starred {repo}",
        "forked": "forked {repo} to {fork}",
        "createdRepository": "created repository {repo}",
        "createdBranch": "created branch {ref} in {repo}",
        "createdTag": "created tag {ref} in {repo}",
        "deletedBranch": "deleted branch {ref} in {repo}",
        "deletedTag": "deleted tag {ref} in {repo}",
        "pushed": "pushed {count} commit to {repo} · {branch} | pushed {count} commits to {repo} · {branch}",
        "published": "published {release} in {repo}",
        "madePublic": "made {repo} public",
        "addedMember": "added {member} to {repo}",
        "openedIssue": "opened issue {target}",
        "closedIssue": "closed issue {target}",
        "reopenedIssue": "reopened issue {target}",
        "updatedIssue": "updated issue {target}",
        "commentedIssue": "commented on issue {target}",
        "openedPullRequest": "opened pull request {target}",
        "mergedPullRequest": "merged pull request {target}",
        "closedPullRequest": "closed pull request {target}",
        "reopenedPullRequest": "reopened pull request {target}",
        "updatedPullRequest": "updated pull request {target}",
        "reviewedPullRequest": "reviewed pull request {target}",
        "commentedPullRequest": "commented on pull request {target}",
        "commentedCommit": "commented on commit {target}",
        "startedDiscussion": "started a discussion in {repo}",
        "editedWiki": "edited {count} wiki page in {repo} | edited {count} wiki pages in {repo}",
        "sponsored": "created a sponsorship ({repo})",
        "acted": "had activity in {repo}"
      },
      "groups": {
        "starred": "starred {count} repositories",
        "forked": "forked {count} repositories"
      },
      "empty": {
        "title": "No activity yet",
        "description": "Follow people and star repositories on GitHub to fill this feed."
      },
      "error": {
        "title": "Could not load activity",
        "retry": "Retry"
      },
      "loadMore": "Load more",
      "loadingMore": "Loading…"
    },
```

- [ ] **Step 2: zh.json** — 对应两处：

1. `workspace.sidebar.items`：
```json
      "items": {
        "activity": "Activity",
        "inbox": "收件箱"
      },
```
2. `workspace.activity`：
```json
    "activity": {
      "title": "Activity",
      "filters": {
        "stars": "Star",
        "forks": "Fork",
        "repos": "仓库",
        "releases": "发布",
        "commits": "提交",
        "issuesAndPrs": "Issues 和 PR"
      },
      "sentences": {
        "starred": "star 了 {repo}",
        "forked": "将 {repo} fork 到 {fork}",
        "createdRepository": "创建了仓库 {repo}",
        "createdBranch": "在 {repo} 创建了分支 {ref}",
        "createdTag": "在 {repo} 创建了标签 {ref}",
        "deletedBranch": "删除了 {repo} 的分支 {ref}",
        "deletedTag": "删除了 {repo} 的标签 {ref}",
        "pushed": "向 {repo} · {branch} 推送了 {count} 个提交",
        "published": "在 {repo} 发布了 {release}",
        "madePublic": "公开了 {repo}",
        "addedMember": "邀请 {member} 加入 {repo}",
        "openedIssue": "创建了 issue {target}",
        "closedIssue": "关闭了 issue {target}",
        "reopenedIssue": "重新打开了 issue {target}",
        "updatedIssue": "更新了 issue {target}",
        "commentedIssue": "评论了 issue {target}",
        "openedPullRequest": "创建了 PR {target}",
        "mergedPullRequest": "合并了 PR {target}",
        "closedPullRequest": "关闭了 PR {target}",
        "reopenedPullRequest": "重新打开了 PR {target}",
        "updatedPullRequest": "更新了 PR {target}",
        "reviewedPullRequest": "评审了 PR {target}",
        "commentedPullRequest": "评论了 PR {target}",
        "commentedCommit": "评论了提交 {target}",
        "startedDiscussion": "在 {repo} 发起了讨论",
        "editedWiki": "编辑了 {repo} 的 {count} 个 wiki 页面",
        "sponsored": "发起了赞助（{repo}）",
        "acted": "在 {repo} 有新动态"
      },
      "groups": {
        "starred": "star 了 {count} 个仓库",
        "forked": "fork 了 {count} 个仓库"
      },
      "empty": {
        "title": "还没有动态",
        "description": "在 GitHub 上关注感兴趣的人或 star 仓库，动态会出现在这里。"
      },
      "error": {
        "title": "动态加载失败",
        "retry": "重试"
      },
      "loadMore": "加载更多",
      "loadingMore": "加载中…"
    },
```

- [ ] **Step 3: 跑 locale 守护测试**

Run: `pnpm --filter @oh-my-github/client exec vitest run src/renderer/i18n/locales.test.ts`
Expected: PASS（所有 key 可编译；`pushed`/`editedWiki` 的 `|` 是有意的复数分隔）。

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/renderer/i18n/locales/en.json packages/client/src/renderer/i18n/locales/zh.json
git commit -m "feat(activity): add activity feed locale strings"
```

---

### Task 6: composable + 行组件 + 页面 + 面板注册

**Files:**
- Create: `packages/client/src/renderer/composables/github/use-activity.ts`
- Create: `packages/client/src/renderer/pages/activity/components/activity-event-row.vue`
- Create: `packages/client/src/renderer/pages/activity/components/activity-group-row.vue`
- Create: `packages/client/src/renderer/pages/activity/activity-page.vue`
- Modify: `packages/client/src/renderer/pages/workspace/components/workspace-panel.vue`

**Interfaces:**
- Consumes: Task 2 bridge、Task 3 `formatRelativeTime`、Task 4 helpers、Task 5 i18n key；`GithubActorLink`（`@/components/github/github-actor-link.vue`）；`useToast`（`@/composables/use-toast`）。
- Produces: `useActivityFeedQuery(): UseQueryReturn<GitHubFeedEventPage>`；`fetchActivityFeedPage(page: number): Promise<GitHubFeedEventPage>`；`ActivityPage`（props `{ tab: WorkspaceTab }`）。

- [ ] **Step 1: composable `use-activity.ts`**（照 `use-inbox.ts`）：

```ts
import { useQuery } from '@pinia/colada'

function requireActivityBridge() {
  if (!window.ohMyGithub?.activity) {
    throw new Error('GitHub activity bridge is unavailable')
  }

  return window.ohMyGithub.activity
}

export function useActivityFeedQuery() {
  return useQuery<GitHubFeedEventPage>({
    key: ['github', 'activity', 'received-events'],
    // 对齐 GitHub 建议的 feed 轮询间隔：数据超过 60s 视为过期，
    // 在挂载 / 窗口聚焦 / 网络重连时自动 refetch（与 Inbox 相同的智能刷新）。
    staleTime: 1000 * 60,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    query: async () => requireActivityBridge().listReceivedEvents({ page: 1 }),
  })
}

export async function fetchActivityFeedPage(page: number): Promise<GitHubFeedEventPage> {
  return requireActivityBridge().listReceivedEvents({ page })
}
```

- [ ] **Step 2: `activity-event-row.vue`**：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import GithubActorLink from '@/components/github/github-actor-link.vue'
import { formatRelativeTime } from '@/components/conversation/format'
import { presentFeedEvent } from '../activity-helpers'

const props = defineProps<{
  event: GitHubFeedEvent
}>()

const { locale } = useI18n()
const router = useRouter()

const presentation = computed(() => presentFeedEvent(props.event))
const relativeTime = computed(() => formatRelativeTime(props.event.createdAt, { locale: locale.value }))

function openTarget(): void {
  if (presentation.value.targetUrl) void router.push(presentation.value.targetUrl)
}

function openPart(url: string | null): void {
  if (url) void router.push(url)
}
</script>

<template>
  <div
    class="group flex cursor-pointer items-start gap-3 border-b border-border px-4 py-2.5 transition-colors hover:bg-muted/50"
    role="button"
    tabindex="0"
    @click="openTarget"
    @keydown.enter.prevent="openTarget"
  >
    <GithubActorLink
      :login="event.actor.login"
      :avatar-url="event.actor.avatarUrl"
      avatar-size="sm"
      :show-username="false"
      class="mt-0.5 shrink-0"
    />

    <div class="grid min-w-0 flex-1 gap-0.5">
      <span class="min-w-0 text-label text-foreground">
        <GithubActorLink
          :login="event.actor.login"
          :show-avatar="false"
          class="align-baseline"
        />
        {{ ' ' }}
        <i18n-t
          :keypath="presentation.sentenceKey"
          :plural="presentation.pluralCount ?? undefined"
          scope="global"
          tag="span"
        >
          <template
            v-for="(part, name) in presentation.parts"
            :key="name"
            #[name]
          >
            <button
              v-if="part.url"
              class="font-medium underline-offset-4 hover:underline"
              type="button"
              @click.stop="openPart(part.url)"
            >{{ part.label }}</button>
            <span
              v-else
              class="font-medium"
            >{{ part.label }}</span>
          </template>
        </i18n-t>
      </span>
      <p
        v-if="presentation.subtitle"
        class="truncate text-caption text-muted-foreground"
      >
        {{ presentation.subtitle }}
      </p>
    </div>

    <span
      v-if="relativeTime"
      class="shrink-0 text-caption text-muted-foreground"
    >{{ relativeTime }}</span>
  </div>
</template>
```

- [ ] **Step 3: `activity-group-row.vue`**：

```vue
<script setup lang="ts">
import type { ActivityFeedGroup } from '../activity-helpers'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ChevronDown, ChevronRight } from 'lucide-vue-next'
import GithubActorLink from '@/components/github/github-actor-link.vue'
import { formatRelativeTime } from '@/components/conversation/format'
import { presentFeedGroup } from '../activity-helpers'

const props = defineProps<{
  group: ActivityFeedGroup
}>()

const { locale } = useI18n()
const router = useRouter()
const expanded = ref(false)

const presentation = computed(() => presentFeedGroup(props.group))
const relativeTime = computed(() => formatRelativeTime(props.group.createdAt, { locale: locale.value }))

function onRowClick(): void {
  if (presentation.value.expandable) {
    expanded.value = !expanded.value
  } else if (presentation.value.targetUrl) {
    void router.push(presentation.value.targetUrl)
  }
}

function openChild(url: string | null): void {
  if (url) void router.push(url)
}
</script>

<template>
  <div class="border-b border-border">
    <div
      class="group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
      role="button"
      tabindex="0"
      @click="onRowClick"
      @keydown.enter.prevent="onRowClick"
    >
      <GithubActorLink
        :login="group.actor.login"
        :avatar-url="group.actor.avatarUrl"
        avatar-size="sm"
        :show-username="false"
        class="shrink-0"
      />

      <span class="min-w-0 flex-1 text-label text-foreground">
        <GithubActorLink
          :login="group.actor.login"
          :show-avatar="false"
          class="align-baseline"
        />
        {{ ' ' }}
        <i18n-t
          :keypath="presentation.sentenceKey"
          :plural="presentation.pluralCount ?? undefined"
          scope="global"
          tag="span"
        >
          <template
            v-for="(part, name) in presentation.parts"
            :key="name"
            #[name]
          >
            <span class="font-medium">{{ part.label }}</span>
          </template>
        </i18n-t>
      </span>

      <component
        :is="expanded ? ChevronDown : ChevronRight"
        v-if="presentation.expandable"
        class="size-4 shrink-0 text-muted-foreground"
      />
      <span
        v-if="relativeTime"
        class="shrink-0 text-caption text-muted-foreground"
      >{{ relativeTime }}</span>
    </div>

    <div
      v-if="expanded && presentation.expandable"
      class="grid gap-0.5 pb-2 pl-14 pr-4"
    >
      <button
        v-for="child in presentation.children"
        :key="child.id"
        class="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-label text-foreground transition-colors hover:bg-muted/50"
        type="button"
        @click="openChild(child.part.url)"
      >
        <span class="min-w-0 truncate font-medium">{{ child.part.label }}</span>
        <span class="ml-auto shrink-0 text-caption text-muted-foreground">
          {{ formatRelativeTime(child.createdAt, { locale: locale }) }}
        </span>
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 4: `activity-page.vue`**（三态照 inbox-page 模板）：

```vue
<script setup lang="ts">
import type { WorkspaceTab } from '@/pages/workspace/types'
import type { ActivityFilterKey } from './activity-helpers'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Badge, Button, Empty, EmptyDescription, EmptyHeader, EmptyTitle, ScrollArea, Skeleton } from '@oh-my-github/ui'
import { Activity as ActivityIcon } from 'lucide-vue-next'
import { fetchActivityFeedPage, useActivityFeedQuery } from '@/composables/github/use-activity'
import { useToast } from '@/composables/use-toast'
import {
  ACTIVITY_FILTER_KEYS,
  groupFeedEvents,
  matchesActivityFilter,
  mergeFeedEvents,
} from './activity-helpers'
import ActivityEventRow from './components/activity-event-row.vue'
import ActivityGroupRow from './components/activity-group-row.vue'

defineProps<{
  tab: WorkspaceTab
}>()

const { t } = useI18n()
const { error: toastError } = useToast()

const filter = ref<ActivityFilterKey | null>(null)
const extraPages = ref<GitHubFeedEventPage[]>([])
const isLoadingMore = ref(false)

const feedQuery = useActivityFeedQuery()
const isLoading = computed(() => feedQuery.isLoading.value)
const hasError = computed(() => Boolean(feedQuery.error.value))

const events = computed(() => mergeFeedEvents([
  feedQuery.data.value?.events ?? [],
  ...extraPages.value.map((page) => page.events),
]))
const groups = computed(() =>
  groupFeedEvents(events.value.filter((event) => matchesActivityFilter(event, filter.value))),
)
const hasMore = computed(() => {
  const lastPage = extraPages.value[extraPages.value.length - 1] ?? feedQuery.data.value
  return lastPage?.hasMore ?? false
})

function toggleFilter(key: ActivityFilterKey): void {
  filter.value = filter.value === key ? null : key
}

function refresh(): void {
  void feedQuery.refetch()
}

async function loadMore(): Promise<void> {
  if (isLoadingMore.value) return

  isLoadingMore.value = true
  const nextPage = (extraPages.value[extraPages.value.length - 1]?.page ?? feedQuery.data.value?.page ?? 1) + 1

  try {
    extraPages.value = [...extraPages.value, await fetchActivityFeedPage(nextPage)]
  } catch {
    toastError(t('workspace.activity.error.title'))
  } finally {
    isLoadingMore.value = false
  }
}
</script>

<template>
  <section class="flex min-h-full flex-col bg-background">
    <header class="grid gap-3 border-b border-border px-6 py-4">
      <h1 class="select-none text-heading font-semibold text-foreground">
        {{ t('workspace.activity.title') }}
      </h1>

      <div class="flex flex-wrap items-center gap-2">
        <Badge
          v-for="key in ACTIVITY_FILTER_KEYS"
          :key="key"
          :variant="filter === key ? 'info' : 'secondary'"
          class="cursor-pointer"
          @click="toggleFilter(key)"
        >
          {{ t(`workspace.activity.filters.${key}`) }}
        </Badge>
      </div>
    </header>

    <ScrollArea class="flex-1">
      <div
        v-if="isLoading"
        class="grid gap-2 p-4"
      >
        <Skeleton
          v-for="index in 8"
          :key="index"
          class="h-10 w-full rounded-md"
        />
      </div>

      <div
        v-else-if="hasError"
        class="grid place-items-center gap-3 p-10 text-center"
      >
        <p class="text-label text-muted-foreground">{{ t('workspace.activity.error.title') }}</p>
        <Button
          variant="secondary"
          size="sm"
          @click="refresh"
        >
          {{ t('workspace.activity.error.retry') }}
        </Button>
      </div>

      <Empty
        v-else-if="groups.length === 0"
        class="p-10"
      >
        <EmptyHeader>
          <ActivityIcon class="size-6 text-muted-foreground" />
          <EmptyTitle>{{ t('workspace.activity.empty.title') }}</EmptyTitle>
          <EmptyDescription>{{ t('workspace.activity.empty.description') }}</EmptyDescription>
        </EmptyHeader>
      </Empty>

      <div v-else>
        <template
          v-for="group in groups"
          :key="group.id"
        >
          <ActivityEventRow
            v-if="group.kind === 'single'"
            :event="group.events[0]"
          />
          <ActivityGroupRow
            v-else
            :group="group"
          />
        </template>

        <div
          v-if="hasMore"
          class="flex justify-center p-4"
        >
          <Button
            variant="secondary"
            size="sm"
            :disabled="isLoadingMore"
            @click="loadMore"
          >
            {{ isLoadingMore ? t('workspace.activity.loadingMore') : t('workspace.activity.loadMore') }}
          </Button>
        </div>
      </div>
    </ScrollArea>
  </section>
</template>
```

- [ ] **Step 5: 面板注册** — `workspace-panel.vue`：

import 区 `import InboxPage ...` 之后加：
```ts
import ActivityPage from '@/pages/activity/activity-page.vue'
```
模板里 `<InboxPage v-else-if="tab.type === 'inbox'" :tab="tab" />` 之后、`<section v-else>` 之前加：
```vue
  <ActivityPage
    v-else-if="tab.type === 'activity'"
    :tab="tab"
  />
```

- [ ] **Step 6: 类型检查 + 全量测试 + commit**

Run: `pnpm --filter @oh-my-github/client typecheck && pnpm --filter @oh-my-github/client test`
Expected: 均 PASS。

```bash
git add packages/client/src/renderer/composables/github/use-activity.ts packages/client/src/renderer/pages/activity packages/client/src/renderer/pages/workspace/components/workspace-panel.vue
git commit -m "feat(activity): add activity feed page with grouped compact rows"
```

---

### Task 7: 侧边栏入口 + tab 图标

**Files:**
- Modify: `packages/client/src/renderer/pages/workspace/components/workspace-sidebar.vue`
- Modify: `packages/client/src/renderer/pages/workspace/tab-presentation.ts`

**Interfaces:**
- Consumes: Task 5 的 `workspace.sidebar.items.activity`；既有 `selectSidebarItem` / `syncActiveItem` 机制。
- Produces: 侧边栏 Inbox 下方的 Activity 入口，点击打开 `/activity`。

- [ ] **Step 1: `workspace-sidebar.vue` 四处修改**：

1. lucide import（第 12 行）改为：
```ts
import { Activity, ChevronDown, ChevronRight, Folder, Inbox, Plus, Search } from 'lucide-vue-next'
```
2. `const INBOX_ITEM_ID = 'workspace-sidebar:inbox'`（第 74 行）之后加：
```ts
const ACTIVITY_ITEM_ID = 'workspace-sidebar:activity'
```
3. `isInboxActive()`（264-266 行）之后加，并更新 `syncActiveItem()` 内的三元（281-288 行）：
```ts
function isActivityActive(): boolean {
  return activeItemId.value ? activeItemId.value === ACTIVITY_ITEM_ID : props.activeUrl === '/activity'
}
```
```ts
  const nextItemId = props.activeUrl === '/inbox'
    ? INBOX_ITEM_ID
    : props.activeUrl === '/activity'
      ? ACTIVITY_ITEM_ID
      : findFirstItemIdByUrl([
        ...bookmarkItems.value,
        ...pullRequestItems.value,
        ...issueItems.value,
        ...organizationItems.value,
      ], props.activeUrl)
```
4. 模板中 Inbox 的 `</SidebarMenuItem>`（第 502 行）之后、`</SidebarMenu>` 之前加：
```vue
        <SidebarMenuItem>
          <SidebarMenuButton
            class="before:hidden"
            size="sm"
            :is-active="isActivityActive()"
            :tooltip="t('workspace.sidebar.items.activity')"
            type="button"
            @click="selectSidebarItem('/activity', ACTIVITY_ITEM_ID)"
          >
            <Activity />
            <span>{{ t('workspace.sidebar.items.activity') }}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
```

- [ ] **Step 2: `tab-presentation.ts` 图标换成 Activity**（Bell 语义留给通知）：

lucide import（第 2-14 行）里把 `Bell,` 替换为 `Activity,`（保持字母序，`Activity` 放最前）；`tab.type === 'activity'` 分支（第 82 行）`icon: Bell,` 改为 `icon: Activity,`。确认文件内无其他 `Bell` 引用后移除该 import。

- [ ] **Step 3: 类型检查 + commit**

Run: `pnpm --filter @oh-my-github/client typecheck`
Expected: 无错误。

```bash
git add packages/client/src/renderer/pages/workspace/components/workspace-sidebar.vue packages/client/src/renderer/pages/workspace/tab-presentation.ts
git commit -m "feat(activity): add sidebar entry and Activity tab icon"
```

---

### Task 8: 最终验证

**Files:** 无新增。

- [ ] **Step 1: 全量测试与类型检查**

Run:
```bash
pnpm --filter @oh-my-github/api test
pnpm --filter @oh-my-github/client test
pnpm typecheck
```
Expected: 全部 PASS / 无类型错误。

- [ ] **Step 2: 手动验证**（用户通常开着 `pnpm dev` HMR）：
  1. 侧边栏 Inbox 下出现 Activity 条目，点击打开 `/activity` tab（tab 图标为 Activity 波形）。
  2. Feed 显示紧凑行：头像 + "actor 动作句子" + 右侧相对时间；同一人连续 star 折叠为 "starred N repositories"，点击展开仓库列表。
  3. 过滤 badge 单选可取消，本地即时过滤。
  4. 点击行/仓库/PR 链接均在应用内打开对应 tab；actor 头像/用户名进 account tab。
  5. 底部 Load more 追加下一页；窗口失焦再聚焦超过 60s 自动刷新且已加载页不丢。
  6. 中英文切换后句子与相对时间格式正确。

- [ ] **Step 3: 收尾**

如有问题回到对应 task 修复。全部通过后按 superpowers:finishing-a-development-branch 处理分支/合并。
