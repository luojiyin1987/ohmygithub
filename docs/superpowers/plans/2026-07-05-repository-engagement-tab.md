# Repository Engagement Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Engagement"（互动）section to the repository page — a TabSwitcher over Stargazers / Forks / Watchers, inserted above Contributors in the sidebar.

**Architecture:** Four-layer flow, same as every list feature in this app: renderer composable (pinia-colada query) → preload IPC bridge → main-process handler → `@oh-my-github/api` module. The API side reuses the followers "capped tail window" pattern (fetch the newest 10×100 REST rows, flag `truncated`) plus the followers GraphQL enrichment for user rows. The shared window/enrichment logic is extracted out of `accounts.ts` into a new `social-users.ts` module so `repositories.ts` can use it too.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, pinia-colada (`useQuery`), Octokit REST + GraphQL, vitest, vue-i18n, Electron IPC.

Spec: `docs/superpowers/specs/2026-07-05-repository-engagement-tab-design.md`

## Global Constraints

- Section id is exactly `engagement`; English label "Engagement", Chinese label "互动". It sits between `releases` and `contributors` everywhere sections are ordered.
- Window cap: page size 100, max 10 pages (1,000 rows), newest rows kept, `truncated: true` beyond that — identical to the followers list behavior.
- Forks REST is called with `sort: 'newest'`; fork rows keep source order (no reverse). Stargazers/watchers REST returns oldest-first and is tail-windowed + reversed, exactly like followers.
- vue-i18n: a bare `@` in locale strings crashes message compile — write `{'@'}` if ever needed. Every key added to `en.json` must also be added to `zh.json` (guarded by `locales.test.ts`).
- Sub-tab state is memory-only; it does NOT go into the workspace URL. No overview card is added.
- Test commands: `pnpm --filter @oh-my-github/api test`, `pnpm --filter @oh-my-github/client test`. Typecheck: `pnpm --filter @oh-my-github/api typecheck`, `pnpm --filter @oh-my-github/client typecheck`.
- Run all commands from the repo root `/Users/acboxliu/projects/oh-my-github`.
- Commit after every task with a conventional-commit message.

---

### Task 1: Extract shared window + enrichment helpers into `social-users.ts`

Pure refactor: move the followers list plumbing out of `accounts.ts` into a shared module so Task 2/3 can reuse it from `repositories.ts`. No behavior change; the existing `accounts.social.test.ts` suite is the safety net.

**Files:**
- Create: `packages/api/src/modules/social-users.ts`
- Modify: `packages/api/src/modules/accounts.ts`

**Interfaces:**
- Consumes: `GitHubOctokit` (from `../transport`), `GitHubAccountFollowUser` (from `../types`)
- Produces (used by Tasks 2–3):
  - `interface FollowUserResponse { id?: number; login?: string; avatar_url?: string | null; type?: string | null }`
  - `interface GraphFollowEnrichmentNode` (same shape as the one currently in `accounts.ts`)
  - `parseLastPage(link: string): number`
  - `fetchListWindow<T>(fetchPage: (page: number, perPage: number) => Promise<{ items: T[]; link: string }>, options?: { perPage?: number; maxPages?: number }): Promise<{ items: T[]; totalCount: number; truncated: boolean }>` — ascending-source tail window, newest-first result
  - `enrichFollowAccounts(octokit: GitHubOctokit, users: FollowUserResponse[]): Promise<Map<string, GraphFollowEnrichmentNode>>`
  - `mapFollowUser(user: FollowUserResponse, enrichment: GraphFollowEnrichmentNode | undefined): GitHubAccountFollowUser[]`

- [ ] **Step 1: Run the existing social tests to confirm a green baseline**

Run: `pnpm --filter @oh-my-github/api test accounts.social`
Expected: PASS (all tests green before touching anything)

- [ ] **Step 2: Create `packages/api/src/modules/social-users.ts`**

The interfaces, the enrichment GraphQL body, and `mapFollowUser` are moved **verbatim** from `accounts.ts` (currently: `FollowUserResponse` at ~line 290, `GraphFollowEnrichmentNode` at ~line 301, `enrichFollowAccounts` private method at ~line 758, `mapFollowUser` at ~line 1002, `parseLastPage` at ~line 1224). Only `enrichFollowAccounts` changes shape: it becomes a free function taking `octokit` as its first parameter instead of using `this.octokit`.

```ts
import type { GitHubOctokit } from '../transport'
import type { GitHubAccountFollowUser } from '../types'

export interface FollowUserResponse {
  id?: number
  login?: string
  avatar_url?: string | null
  type?: string | null
}

export interface GraphFollowEnrichmentNode {
  __typename?: string
  name?: string | null
  bio?: string | null
  description?: string | null
  viewerIsFollowing?: boolean
  viewerCanFollow?: boolean
  isFollowingViewer?: boolean
  isViewer?: boolean
}

const ENRICH_CHUNK_SIZE = 100
const WINDOW_FETCH_PAGE_SIZE = 100
const WINDOW_MAX_PAGES = 10

export interface ListWindowPage<T> {
  items: T[]
  link: string
}

export interface ListWindowResult<T> {
  items: T[]
  totalCount: number
  truncated: boolean
}

export interface ListWindowOptions {
  perPage?: number
  maxPages?: number
}

export function parseLastPage(link: string): number {
  const lastPageMatch = link.match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/)
  return lastPageMatch ? Number(lastPageMatch[1]) : 1
}

// REST list endpoints return rows oldest-first with no ordering options, so
// the whole (capped) list is fetched from the tail and reversed to render
// newest-first; search and paging then happen client-side.
export async function fetchListWindow<T>(
  fetchPage: (page: number, perPage: number) => Promise<ListWindowPage<T>>,
  options: ListWindowOptions = {},
): Promise<ListWindowResult<T>> {
  const perPage = options.perPage ?? WINDOW_FETCH_PAGE_SIZE
  const maxPages = options.maxPages ?? WINDOW_MAX_PAGES
  const first = await fetchPage(1, perPage)
  const lastPage = parseLastPage(first.link)
  const truncated = lastPage > maxPages
  // When truncated, keep the newest maxPages pages (the tail).
  const windowStart = truncated ? lastPage - maxPages + 1 : 2
  const extraPageNumbers: number[] = []
  for (let pageNumber = windowStart; pageNumber <= lastPage; pageNumber += 1) {
    extraPageNumbers.push(pageNumber)
  }
  const extraPages = await Promise.all(
    extraPageNumbers.map(async (pageNumber) => (await fetchPage(pageNumber, perPage)).items),
  )
  const ascending = truncated ? extraPages.flat() : [...first.items, ...extraPages.flat()]
  const lastPageItems = extraPages.length > 0 ? extraPages[extraPages.length - 1] : first.items

  return {
    items: [...ascending].reverse(),
    totalCount: (lastPage - 1) * perPage + lastPageItems.length,
    truncated,
  }
}

// One aliased repositoryOwner lookup per row adds name/bio and the viewer's
// follow relationship to a plain REST user list, batched 100 logins per query.
export async function enrichFollowAccounts(
  octokit: GitHubOctokit,
  users: FollowUserResponse[],
): Promise<Map<string, GraphFollowEnrichmentNode>> {
  const logins = users
    .map((user) => user.login ?? '')
    .filter((login) => /^[a-zA-Z0-9-]+$/.test(login))
  const enrichments = new Map<string, GraphFollowEnrichmentNode>()

  for (let offset = 0; offset < logins.length; offset += ENRICH_CHUNK_SIZE) {
    const chunk = logins.slice(offset, offset + ENRICH_CHUNK_SIZE)
    const selections = chunk.map((login, index) => `
      o${index}: repositoryOwner(login: "${login}") {
        __typename
        ... on User {
          name
          bio
          viewerIsFollowing
          viewerCanFollow
          isFollowingViewer
          isViewer
        }
        ... on Organization {
          name
          description
          viewerIsFollowing
        }
      }
    `)
    const response = await octokit.graphql<Record<string, GraphFollowEnrichmentNode | null>>(
      `query FollowEnrichment {${selections.join('\n')}}`,
    )

    chunk.forEach((login, index) => {
      const node = response[`o${index}`]
      if (node) enrichments.set(login.toLowerCase(), node)
    })
  }

  return enrichments
}

export function mapFollowUser(
  user: FollowUserResponse,
  enrichment: GraphFollowEnrichmentNode | undefined,
): GitHubAccountFollowUser[] {
  const login = user.login?.trim()
  if (!login) return []

  const isOrganization = (enrichment?.__typename ?? user.type) === 'Organization'

  return [{
    id: user.id ?? 0,
    login,
    name: enrichment?.name ?? null,
    avatarUrl: user.avatar_url ?? `https://github.com/${encodeURIComponent(login)}.png?size=96`,
    bio: (isOrganization ? enrichment?.description : enrichment?.bio) ?? null,
    type: user.type ?? (isOrganization ? 'Organization' : 'User'),
    isViewer: Boolean(enrichment?.isViewer),
    viewerIsFollowing: Boolean(enrichment?.viewerIsFollowing),
    // Organizations expose no viewerCanFollow field; anyone can follow an org.
    viewerCanFollow: enrichment ? (isOrganization ? true : Boolean(enrichment.viewerCanFollow)) : false,
    isFollowingViewer: Boolean(enrichment?.isFollowingViewer),
  }]
}
```

Note: `mapFollowUser` must be copied **character-for-character** from `accounts.ts` (including the `type:` line). If the compiler complains about the `type` field after the move, mirror whatever the original file did — do not invent casts the original didn't have.

- [ ] **Step 3: Rewire `accounts.ts` to use the shared module**

In `packages/api/src/modules/accounts.ts`:

1. Add the import at the top with the other module imports:

```ts
import {
  enrichFollowAccounts,
  fetchListWindow,
  mapFollowUser,
  type FollowUserResponse,
  type GraphFollowEnrichmentNode,
} from './social-users'
```

2. Delete the now-duplicated pieces:
   - the local `interface FollowUserResponse` (~line 290)
   - the local `interface GraphFollowEnrichmentNode` (~line 301)
   - the constants `FOLLOWS_FETCH_PAGE_SIZE`, `FOLLOWS_MAX_PAGES`, `FOLLOWS_ENRICH_CHUNK_SIZE`
   - the private method `enrichFollowAccounts` (the whole method including its comment)
   - the module-level function `mapFollowUser`
   - the module-level function `parseLastPage` (keep `parseLinkPagination` — it has its own inline regex and stays)

3. Replace the body of the private `listFollowAccounts` method with:

```ts
  private async listFollowAccounts(
    route: 'GET /users/{username}/followers' | 'GET /users/{username}/following',
    login: string,
  ): Promise<GitHubAccountFollowList> {
    const window = await fetchListWindow<FollowUserResponse>(async (page, perPage) => {
      const response = await this.octokit.request(route, {
        username: login,
        page,
        per_page: perPage,
      })
      return { items: response.data as FollowUserResponse[], link: String(response.headers.link ?? '') }
    })
    const enrichments = await enrichFollowAccounts(this.octokit, window.items)
      .catch(() => new Map<string, GraphFollowEnrichmentNode>())

    return {
      items: window.items.flatMap((user) => mapFollowUser(user, enrichments.get(user.login?.toLowerCase() ?? ''))),
      totalCount: window.totalCount,
      truncated: window.truncated,
    }
  }
```

Keep the existing comment above the method ("REST returns follow relationships oldest-first…").

- [ ] **Step 4: Verify tests still pass and the package typechecks**

Run: `pnpm --filter @oh-my-github/api test accounts.social && pnpm --filter @oh-my-github/api typecheck`
Expected: PASS / no type errors. If a test fails, the refactor changed behavior — fix the refactor, not the test.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/social-users.ts packages/api/src/modules/accounts.ts
git commit -m "refactor(api): extract follow-list window and enrichment helpers into social-users"
```

---

### Task 2: API — `listStargazers` / `listWatchers` on `RepositoriesApi`

**Files:**
- Create: `packages/api/src/modules/repositories.engagement.test.ts`
- Modify: `packages/api/src/modules/repositories.ts` (class `RepositoriesApi` starts at ~line 394)

**Interfaces:**
- Consumes: `fetchListWindow`, `enrichFollowAccounts`, `mapFollowUser`, `FollowUserResponse`, `GraphFollowEnrichmentNode` from `./social-users` (Task 1); `RepositoryOptions`, `GitHubAccountFollowList` from `../types` (both already exist).
- Produces: `RepositoriesApi.listStargazers(options: RepositoryOptions): Promise<GitHubAccountFollowList>` and `RepositoriesApi.listWatchers(options: RepositoryOptions): Promise<GitHubAccountFollowList>` — consumed by Task 4's IPC handlers.

- [ ] **Step 1: Write the failing tests**

Create `packages/api/src/modules/repositories.engagement.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { GitHubOctokit } from '../transport'
import { RepositoriesApi } from './repositories'

function createApi() {
  const request = vi.fn()
  const graphql = vi.fn()
  const api = new RepositoriesApi({ request, graphql } as unknown as GitHubOctokit)
  return { api, request, graphql }
}

function createUserResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    login: 'octocat',
    avatar_url: 'https://example.com/octocat.png',
    type: 'User',
    ...overrides,
  }
}

describe('RepositoriesApi listStargazers', () => {
  it('returns stargazers newest-first and merges GraphQL enrichment', async () => {
    const { api, request, graphql } = createApi()
    request.mockResolvedValueOnce({
      data: [
        createUserResponse({ id: 1, login: 'oldest' }),
        createUserResponse({ id: 2, login: 'newest' }),
      ],
      headers: {},
    })
    graphql.mockResolvedValueOnce({
      o0: {
        __typename: 'User',
        name: 'The Newest',
        bio: 'Star person',
        viewerIsFollowing: true,
        viewerCanFollow: true,
        isFollowingViewer: false,
        isViewer: false,
      },
      o1: null,
    })

    const result = await api.listStargazers({ owner: 'acme', repo: 'widget' })

    expect(request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/stargazers', {
      owner: 'acme',
      repo: 'widget',
      page: 1,
      per_page: 100,
    })
    // REST returns oldest-first; the result is reversed.
    expect(graphql.mock.calls[0][0]).toContain('o0: repositoryOwner(login: "newest")')
    expect(result.truncated).toBe(false)
    expect(result.totalCount).toBe(2)
    expect(result.items.map((item) => item.login)).toEqual(['newest', 'oldest'])
    expect(result.items[0]).toMatchObject({ name: 'The Newest', viewerIsFollowing: true })
  })

  it('keeps the newest window and flags truncation on large lists', async () => {
    const { api, request, graphql } = createApi()
    request.mockImplementation((_route: string, params: { page: number }) => {
      if (params.page === 1) {
        return Promise.resolve({
          data: [createUserResponse({ login: 'first-page' })],
          headers: { link: '<https://api.github.com/repos/acme/widget/stargazers?page=12&per_page=100>; rel="last"' },
        })
      }
      return Promise.resolve({
        data: [createUserResponse({ login: `page-${params.page}` })],
        headers: {},
      })
    })
    graphql.mockResolvedValue({})

    const result = await api.listStargazers({ owner: 'acme', repo: 'widget' })

    expect(result.truncated).toBe(true)
    // Tail window is pages 3..12, reversed to newest-first; page-1 rows are discarded.
    expect(result.items.map((item) => item.login)).toEqual([
      'page-12', 'page-11', 'page-10', 'page-9', 'page-8',
      'page-7', 'page-6', 'page-5', 'page-4', 'page-3',
    ])
    expect(result.totalCount).toBe(1101)
  })

  it('degrades to plain REST rows when enrichment fails', async () => {
    const { api, request, graphql } = createApi()
    request.mockResolvedValueOnce({
      data: [createUserResponse({ login: 'octocat' })],
      headers: {},
    })
    graphql.mockRejectedValueOnce(new Error('boom'))

    const result = await api.listStargazers({ owner: 'acme', repo: 'widget' })

    expect(result.items[0]).toMatchObject({
      login: 'octocat',
      name: null,
      bio: null,
      viewerCanFollow: false,
    })
  })
})

describe('RepositoriesApi listWatchers', () => {
  it('lists subscribers through the same windowed pipeline', async () => {
    const { api, request, graphql } = createApi()
    request.mockResolvedValueOnce({
      data: [createUserResponse({ login: 'watcher' })],
      headers: {},
    })
    graphql.mockResolvedValueOnce({ o0: null })

    const result = await api.listWatchers({ owner: 'acme', repo: 'widget' })

    expect(request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/subscribers', {
      owner: 'acme',
      repo: 'widget',
      page: 1,
      per_page: 100,
    })
    expect(result.items.map((item) => item.login)).toEqual(['watcher'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @oh-my-github/api test repositories.engagement`
Expected: FAIL — `api.listStargazers is not a function`

- [ ] **Step 3: Implement the two methods**

In `packages/api/src/modules/repositories.ts`:

1. Add to the imports at the top:

```ts
import {
  enrichFollowAccounts,
  fetchListWindow,
  mapFollowUser,
  type FollowUserResponse,
  type GraphFollowEnrichmentNode,
} from './social-users'
```

Also add `GitHubAccountFollowList` to the existing `import type { ... } from '../types'` list.

2. Add these methods to the `RepositoriesApi` class, right after `listContributors` (~line 777):

```ts
  async listStargazers(options: RepositoryOptions): Promise<GitHubAccountFollowList> {
    return this.listEngagementUsers('GET /repos/{owner}/{repo}/stargazers', options)
  }

  async listWatchers(options: RepositoryOptions): Promise<GitHubAccountFollowList> {
    return this.listEngagementUsers('GET /repos/{owner}/{repo}/subscribers', options)
  }

  // Stargazers and subscribers are plain ascending REST user lists; window the
  // tail and enrich rows exactly like the account followers list.
  private async listEngagementUsers(
    route: 'GET /repos/{owner}/{repo}/stargazers' | 'GET /repos/{owner}/{repo}/subscribers',
    options: RepositoryOptions,
  ): Promise<GitHubAccountFollowList> {
    const window = await fetchListWindow<FollowUserResponse>(async (page, perPage) => {
      const response = await this.octokit.request(route, {
        owner: options.owner,
        repo: options.repo,
        page,
        per_page: perPage,
      })
      return { items: response.data as FollowUserResponse[], link: String(response.headers.link ?? '') }
    })
    const enrichments = await enrichFollowAccounts(this.octokit, window.items)
      .catch(() => new Map<string, GraphFollowEnrichmentNode>())

    return {
      items: window.items.flatMap((user) => mapFollowUser(user, enrichments.get(user.login?.toLowerCase() ?? ''))),
      totalCount: window.totalCount,
      truncated: window.truncated,
    }
  }
```

(`RepositoryOptions` is already imported in this file — it's used by `listContributors`. If not present in the import list, add it.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @oh-my-github/api test repositories.engagement && pnpm --filter @oh-my-github/api typecheck`
Expected: PASS / no type errors

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/repositories.ts packages/api/src/modules/repositories.engagement.test.ts
git commit -m "feat(api): list repository stargazers and watchers with capped window"
```

---

### Task 3: API — `listForks` + fork types + descending window order

Forks come from REST already sorted newest-first (`sort=newest`), so the window keeps the **head** pages in source order instead of tail+reverse. This adds an `order` option to `fetchListWindow`.

**Files:**
- Modify: `packages/api/src/types.ts` (add fork types near `GitHubRepositoryOverviewCounts`, ~line 320)
- Modify: `packages/api/src/modules/social-users.ts` (add `order` option)
- Modify: `packages/api/src/modules/repositories.ts`
- Test: `packages/api/src/modules/repositories.engagement.test.ts` (extend)

**Interfaces:**
- Consumes: `fetchListWindow` (Task 1), `RepositoryOptions`.
- Produces:
  - types: `GitHubRepositoryForkItem { id: number; owner: string; ownerAvatarUrl: string; name: string; fullName: string; description: string | null; stars: number; pushedAt: string | null }` and `GitHubRepositoryForkList { items: GitHubRepositoryForkItem[]; totalCount: number; truncated: boolean }`
  - `RepositoriesApi.listForks(options: RepositoryOptions): Promise<GitHubRepositoryForkList>` — consumed by Task 4.
  - `fetchListWindow` gains `options.order?: 'ascending' | 'descending'` (default `'ascending'`, existing callers unchanged).

- [ ] **Step 1: Write the failing tests**

Append to `packages/api/src/modules/repositories.engagement.test.ts`:

```ts
function createForkResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    name: 'widget',
    full_name: 'alice/widget',
    description: 'A fork',
    stargazers_count: 5,
    pushed_at: '2026-07-01T00:00:00Z',
    owner: { login: 'alice', avatar_url: 'https://example.com/alice.png' },
    ...overrides,
  }
}

describe('RepositoriesApi listForks', () => {
  it('lists forks newest-first with sort=newest and maps repository fields', async () => {
    const { api, request } = createApi()
    request.mockResolvedValueOnce({ data: [createForkResponse()], headers: {} })

    const result = await api.listForks({ owner: 'acme', repo: 'widget' })

    expect(request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/forks', {
      owner: 'acme',
      repo: 'widget',
      sort: 'newest',
      page: 1,
      per_page: 100,
    })
    expect(result.truncated).toBe(false)
    expect(result.totalCount).toBe(1)
    expect(result.items).toEqual([{
      id: 10,
      owner: 'alice',
      ownerAvatarUrl: 'https://example.com/alice.png',
      name: 'widget',
      fullName: 'alice/widget',
      description: 'A fork',
      stars: 5,
      pushedAt: '2026-07-01T00:00:00Z',
    }])
  })

  it('keeps the head window in source order when truncated', async () => {
    const { api, request } = createApi()
    request.mockImplementation((_route: string, params: { page: number }) =>
      Promise.resolve({
        data: [createForkResponse({ owner: { login: `owner-${params.page}` } })],
        headers: params.page === 1
          ? { link: '<https://api.github.com/repos/acme/widget/forks?page=12&per_page=100>; rel="last"' }
          : {},
      }))

    const result = await api.listForks({ owner: 'acme', repo: 'widget' })

    expect(result.truncated).toBe(true)
    // Head window: pages 1..10, source order preserved (newest first), no reverse.
    expect(result.items.map((item) => item.owner)).toEqual([
      'owner-1', 'owner-2', 'owner-3', 'owner-4', 'owner-5',
      'owner-6', 'owner-7', 'owner-8', 'owner-9', 'owner-10',
    ])
    // The true last page is never fetched when truncated; the count is a floor.
    expect(result.totalCount).toBe(1100)
  })

  it('drops forks without an owner login', async () => {
    const { api, request } = createApi()
    request.mockResolvedValueOnce({ data: [createForkResponse({ owner: null })], headers: {} })

    const result = await api.listForks({ owner: 'acme', repo: 'widget' })

    expect(result.items).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @oh-my-github/api test repositories.engagement`
Expected: FAIL — `api.listForks is not a function` (the Task 2 tests must still pass)

- [ ] **Step 3: Add the fork types to `packages/api/src/types.ts`**

Insert after `GitHubRepositoryOverviewCounts` (~line 335):

```ts
export interface GitHubRepositoryForkItem {
  id: number
  owner: string
  ownerAvatarUrl: string
  name: string
  fullName: string
  description: string | null
  stars: number
  pushedAt: string | null
}

export interface GitHubRepositoryForkList {
  items: GitHubRepositoryForkItem[]
  totalCount: number
  truncated: boolean
}
```

- [ ] **Step 4: Add the `order` option to `fetchListWindow` in `social-users.ts`**

Replace `ListWindowOptions` and `fetchListWindow` with:

```ts
export interface ListWindowOptions {
  perPage?: number
  maxPages?: number
  /**
   * Order the REST endpoint returns rows in. 'ascending' (oldest-first, e.g.
   * followers/stargazers) keeps the newest tail and reverses it; 'descending'
   * (newest-first, e.g. forks?sort=newest) keeps the head as-is.
   */
  order?: 'ascending' | 'descending'
}

export async function fetchListWindow<T>(
  fetchPage: (page: number, perPage: number) => Promise<ListWindowPage<T>>,
  options: ListWindowOptions = {},
): Promise<ListWindowResult<T>> {
  const perPage = options.perPage ?? WINDOW_FETCH_PAGE_SIZE
  const maxPages = options.maxPages ?? WINDOW_MAX_PAGES
  const first = await fetchPage(1, perPage)
  const lastPage = parseLastPage(first.link)
  const truncated = lastPage > maxPages

  if (options.order === 'descending') {
    const windowEnd = Math.min(lastPage, maxPages)
    const extraPages = await fetchPageRange(fetchPage, 2, windowEnd, perPage)
    const lastPageItems = extraPages.length > 0 ? extraPages[extraPages.length - 1] : first.items

    return {
      items: [...first.items, ...extraPages.flat()],
      // When truncated the true last page is never fetched; the count is a floor.
      totalCount: truncated ? (lastPage - 1) * perPage : (lastPage - 1) * perPage + lastPageItems.length,
      truncated,
    }
  }

  // When truncated, keep the newest maxPages pages (the tail) and reverse.
  const windowStart = truncated ? lastPage - maxPages + 1 : 2
  const extraPages = await fetchPageRange(fetchPage, windowStart, lastPage, perPage)
  const ascending = truncated ? extraPages.flat() : [...first.items, ...extraPages.flat()]
  const lastPageItems = extraPages.length > 0 ? extraPages[extraPages.length - 1] : first.items

  return {
    items: [...ascending].reverse(),
    totalCount: (lastPage - 1) * perPage + lastPageItems.length,
    truncated,
  }
}

async function fetchPageRange<T>(
  fetchPage: (page: number, perPage: number) => Promise<ListWindowPage<T>>,
  start: number,
  end: number,
  perPage: number,
): Promise<T[][]> {
  const pageNumbers: number[] = []
  for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
    pageNumbers.push(pageNumber)
  }

  return Promise.all(pageNumbers.map(async (pageNumber) => (await fetchPage(pageNumber, perPage)).items))
}
```

(The docstring comment that sat above `fetchListWindow` in Task 1 stays.)

- [ ] **Step 5: Implement `listForks` in `repositories.ts`**

Add `GitHubRepositoryForkItem` and `GitHubRepositoryForkList` to the `../types` import. Add a response interface next to the other REST response interfaces near the top of the file:

```ts
interface ForkRepositoryResponse {
  id?: number
  name?: string
  full_name?: string
  description?: string | null
  stargazers_count?: number
  pushed_at?: string | null
  owner?: {
    login?: string
    avatar_url?: string | null
  } | null
}
```

Add the method to `RepositoriesApi` right after `listWatchers`:

```ts
  async listForks(options: RepositoryOptions): Promise<GitHubRepositoryForkList> {
    const window = await fetchListWindow<ForkRepositoryResponse>(async (page, perPage) => {
      const response = await this.octokit.request('GET /repos/{owner}/{repo}/forks', {
        owner: options.owner,
        repo: options.repo,
        sort: 'newest',
        page,
        per_page: perPage,
      })
      return { items: response.data as ForkRepositoryResponse[], link: String(response.headers.link ?? '') }
    }, { order: 'descending' })

    return {
      items: window.items.flatMap(mapForkItem),
      totalCount: window.totalCount,
      truncated: window.truncated,
    }
  }
```

Add the mapper as a module-level function near the other `map*` helpers at the bottom of the file:

```ts
function mapForkItem(fork: ForkRepositoryResponse): GitHubRepositoryForkItem[] {
  const owner = fork.owner?.login?.trim()
  const name = fork.name?.trim()
  if (!owner || !name) return []

  return [{
    id: fork.id ?? 0,
    owner,
    ownerAvatarUrl: fork.owner?.avatar_url ?? `https://github.com/${encodeURIComponent(owner)}.png?size=96`,
    name,
    fullName: fork.full_name ?? `${owner}/${name}`,
    description: fork.description ?? null,
    stars: fork.stargazers_count ?? 0,
    pushedAt: fork.pushed_at ?? null,
  }]
}
```

- [ ] **Step 6: Run the full api suite to verify everything passes**

Run: `pnpm --filter @oh-my-github/api test && pnpm --filter @oh-my-github/api typecheck`
Expected: PASS — including the untouched `accounts.social` suite (proves the `order` refactor didn't disturb ascending behavior)

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/types.ts packages/api/src/modules/social-users.ts packages/api/src/modules/repositories.ts packages/api/src/modules/repositories.engagement.test.ts
git commit -m "feat(api): list repository forks newest-first with head window"
```

---

### Task 4: IPC plumbing — main handlers, preload bridge, ambient types

Thin pass-through layer; no unit tests (matches how every other repository IPC method is wired). Verified by typecheck.

**Files:**
- Modify: `packages/client/src/main/repositories.ts`
- Modify: `packages/client/src/preload/index.ts` (repositories block, ~line 170)
- Modify: `packages/client/src/renderer/env.d.ts` (ambient types near `GitHubAccountFollowList` ~line 275; bridge methods in the `repositories:` block ~line 1933)

**Interfaces:**
- Consumes: `api.repositories.listStargazers/listWatchers/listForks` (Tasks 2–3); existing `normalizeRepository` and `createAuthenticatedGitHubApi` helpers in `main/repositories.ts`.
- Produces: `window.ohMyGithub.repositories.listStargazers(owner, repo): Promise<GitHubAccountFollowList>`, `.listWatchers(owner, repo): Promise<GitHubAccountFollowList>`, `.listForks(owner, repo): Promise<GitHubRepositoryForkList>` — consumed by Task 5's composables. Ambient renderer types `GitHubRepositoryForkItem` / `GitHubRepositoryForkList`.

- [ ] **Step 1: Register the IPC handlers in `packages/client/src/main/repositories.ts`**

Inside `registerRepositoriesIpc()`, after the `repositories:list-contributors` handler:

```ts
  ipcMain.handle('repositories:list-stargazers', (_event, owner: string, repo: string) =>
    listRepositoryStargazers(owner, repo)
  )
  ipcMain.handle('repositories:list-watchers', (_event, owner: string, repo: string) =>
    listRepositoryWatchers(owner, repo)
  )
  ipcMain.handle('repositories:list-forks', (_event, owner: string, repo: string) =>
    listRepositoryForks(owner, repo)
  )
```

After the `listRepositoryContributors` function, add:

```ts
async function listRepositoryStargazers(owner: string, repo: string) {
  const repository = normalizeRepository(owner, repo)
  const api = await createAuthenticatedGitHubApi()

  return api.repositories.listStargazers(repository)
}

async function listRepositoryWatchers(owner: string, repo: string) {
  const repository = normalizeRepository(owner, repo)
  const api = await createAuthenticatedGitHubApi()

  return api.repositories.listWatchers(repository)
}

async function listRepositoryForks(owner: string, repo: string) {
  const repository = normalizeRepository(owner, repo)
  const api = await createAuthenticatedGitHubApi()

  return api.repositories.listForks(repository)
}
```

(Match the exact local helper names this file already uses — if the repository-normalizing helper has a different name in this file, follow it.)

- [ ] **Step 2: Expose the bridge methods in `packages/client/src/preload/index.ts`**

In the `repositories` object, after `listContributors`:

```ts
    listStargazers: (owner: string, repo: string) =>
      ipcRenderer.invoke('repositories:list-stargazers', owner, repo),
    listWatchers: (owner: string, repo: string) =>
      ipcRenderer.invoke('repositories:list-watchers', owner, repo),
    listForks: (owner: string, repo: string) =>
      ipcRenderer.invoke('repositories:list-forks', owner, repo),
```

- [ ] **Step 3: Declare ambient types in `packages/client/src/renderer/env.d.ts`**

Near the existing `GitHubAccountFollowList` type (~line 275), add:

```ts
type GitHubRepositoryForkItem = {
  id: number
  owner: string
  ownerAvatarUrl: string
  name: string
  fullName: string
  description: string | null
  stars: number
  pushedAt: string | null
}

type GitHubRepositoryForkList = {
  items: GitHubRepositoryForkItem[]
  totalCount: number
  truncated: boolean
}
```

In the `repositories:` bridge declaration (~line 1933), after `listContributors`:

```ts
      listStargazers: (owner: string, repo: string) => Promise<GitHubAccountFollowList>
      listWatchers: (owner: string, repo: string) => Promise<GitHubAccountFollowList>
      listForks: (owner: string, repo: string) => Promise<GitHubRepositoryForkList>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @oh-my-github/client typecheck`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/main/repositories.ts packages/client/src/preload/index.ts packages/client/src/renderer/env.d.ts
git commit -m "feat(client): wire repository engagement lists through IPC bridge"
```

---

### Task 5: Renderer queries + i18n copy

**Files:**
- Modify: `packages/client/src/renderer/composables/github/use-repositories.ts`
- Modify: `packages/client/src/renderer/i18n/locales/en.json`
- Modify: `packages/client/src/renderer/i18n/locales/zh.json`

**Interfaces:**
- Consumes: bridge methods from Task 4.
- Produces (used by Task 6):
  - `useRepositoryStargazersQuery(owner, repo, enabled)` / `useRepositoryWatchersQuery(owner, repo, enabled)` → `useQuery<GitHubAccountFollowList>`
  - `useRepositoryForksQuery(owner, repo, enabled)` → `useQuery<GitHubRepositoryForkList>`
  - all params are `MaybeRefOrGetter<string>` / `MaybeRefOrGetter<boolean>`, mirroring `useRepositoryContributorsQuery`
  - locale keys under `repository.sections.engagement` and `repository.engagement`

- [ ] **Step 1: Add the three query composables**

In `packages/client/src/renderer/composables/github/use-repositories.ts`, after `useRepositoryContributorsQuery`:

```ts
export function useRepositoryStargazersQuery(
  owner: MaybeRefOrGetter<string>,
  repo: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery<GitHubAccountFollowList>({
    key: () => ['github', 'repository-stargazers', toValue(owner), toValue(repo)],
    enabled: () => Boolean(toValue(owner) && toValue(repo)) && toValue(enabled),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    query: async () => {
      if (!window.ohMyGithub?.repositories) {
        throw new Error('GitHub repositories bridge is unavailable')
      }

      return window.ohMyGithub.repositories.listStargazers(toValue(owner), toValue(repo))
    },
  })
}

export function useRepositoryWatchersQuery(
  owner: MaybeRefOrGetter<string>,
  repo: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery<GitHubAccountFollowList>({
    key: () => ['github', 'repository-watchers', toValue(owner), toValue(repo)],
    enabled: () => Boolean(toValue(owner) && toValue(repo)) && toValue(enabled),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    query: async () => {
      if (!window.ohMyGithub?.repositories) {
        throw new Error('GitHub repositories bridge is unavailable')
      }

      return window.ohMyGithub.repositories.listWatchers(toValue(owner), toValue(repo))
    },
  })
}

export function useRepositoryForksQuery(
  owner: MaybeRefOrGetter<string>,
  repo: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery<GitHubRepositoryForkList>({
    key: () => ['github', 'repository-forks', toValue(owner), toValue(repo)],
    enabled: () => Boolean(toValue(owner) && toValue(repo)) && toValue(enabled),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    query: async () => {
      if (!window.ohMyGithub?.repositories) {
        throw new Error('GitHub repositories bridge is unavailable')
      }

      return window.ohMyGithub.repositories.listForks(toValue(owner), toValue(repo))
    },
  })
}
```

- [ ] **Step 2: Add English copy to `en.json`**

Inside `repository.sections` (the block at ~line 1084 that contains `"contributors": { "title": "Contributors" }`), add:

```json
      "engagement": {
        "title": "Engagement"
      },
```

Inside the `repository` object, next to the existing `"contributors"` block (~line 1292), add a sibling block:

```json
    "engagement": {
      "empty": {
        "stargazers": {
          "title": "No stargazers yet",
          "description": "People who star this repository will show up here."
        },
        "forks": {
          "title": "No forks yet",
          "description": "Forks of this repository will show up here."
        },
        "watchers": {
          "title": "No watchers yet",
          "description": "People watching this repository will show up here."
        }
      },
      "error": {
        "title": "Couldn't load this list",
        "description": "Something went wrong while loading this list. Try again."
      },
      "forkUpdated": "Updated {date}",
      "pagination": {
        "accounts": "Page {page} of {pageCount} · {totalCount} accounts",
        "forks": "Page {page} of {pageCount} · {totalCount} forks"
      },
      "searchEmpty": {
        "title": "No matches",
        "description": "Nothing matches the current search."
      },
      "searchPlaceholder": "Find a person or fork…",
      "tabs": {
        "stargazers": "Stargazers",
        "forks": "Forks",
        "watchers": "Watchers"
      },
      "tabsLabel": "Stargazers, forks, and watchers",
      "truncated": "Showing the most recent 1,000 entries. Use search to narrow the list."
    },
```

- [ ] **Step 3: Add Chinese copy to `zh.json`**

Inside `repository.sections`, add:

```json
      "engagement": {
        "title": "互动"
      },
```

Inside the `repository` object, sibling to `"contributors"`:

```json
    "engagement": {
      "empty": {
        "stargazers": {
          "title": "还没有人标星",
          "description": "给这个仓库标星的人会显示在这里。"
        },
        "forks": {
          "title": "还没有复刻",
          "description": "这个仓库的复刻会显示在这里。"
        },
        "watchers": {
          "title": "还没有人订阅",
          "description": "订阅（Watch）这个仓库的人会显示在这里。"
        }
      },
      "error": {
        "title": "列表加载失败",
        "description": "加载列表时出错，请重试。"
      },
      "forkUpdated": "更新于 {date}",
      "pagination": {
        "accounts": "第 {page} / {pageCount} 页 · 共 {totalCount} 个账号",
        "forks": "第 {page} / {pageCount} 页 · 共 {totalCount} 个复刻"
      },
      "searchEmpty": {
        "title": "没有匹配结果",
        "description": "没有符合当前搜索的条目。"
      },
      "searchPlaceholder": "查找用户或复刻…",
      "tabs": {
        "stargazers": "标星",
        "forks": "复刻",
        "watchers": "订阅"
      },
      "tabsLabel": "标星、复刻与订阅",
      "truncated": "仅显示最近的 1,000 条记录，可使用搜索缩小范围。"
    },
```

- [ ] **Step 4: Run the client test suite (locale parity is test-enforced) and typecheck**

Run: `pnpm --filter @oh-my-github/client test && pnpm --filter @oh-my-github/client typecheck`
Expected: PASS — `locales.test.ts` fails loudly if en/zh keys diverge or a bare `@` slipped in

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/renderer/composables/github/use-repositories.ts packages/client/src/renderer/i18n/locales/en.json packages/client/src/renderer/i18n/locales/zh.json
git commit -m "feat(client): add engagement list queries and locale copy"
```

---

### Task 6: Engagement section components

Three new components under `pages/repository/components/engagement/`. `section.vue` is a close adaptation of `packages/client/src/renderer/pages/account/components/account-followers-section.vue` (read it first — the states, search debounce, and follow-override logic come from there). Rows are split into their own files so the section stays readable.

This repo does not unit-test Vue components; verification is typecheck + live app (the user runs HMR — see Task 7 verification).

**Files:**
- Create: `packages/client/src/renderer/pages/repository/components/engagement/account-row.vue`
- Create: `packages/client/src/renderer/pages/repository/components/engagement/fork-row.vue`
- Create: `packages/client/src/renderer/pages/repository/components/engagement/section.vue`

**Interfaces:**
- Consumes: queries from Task 5; `TabSwitcher` (`@/components/navigation/tab-switcher.vue`), `AppPagination` (`@/components/navigation/app-pagination.vue`); `setAccountFollowed`, `useAccountListInvalidation` from `@/composables/github/use-accounts`; `createAccountWorkspaceUrl`, `createRepositoryWorkspaceUrl` from `@/pages/workspace/workspace-url`; `useToast` from `@/composables/use-toast`; ambient types `GitHubAccountFollowUser`, `GitHubRepositoryForkItem`, `GitHubRepositoryOverviewCounts`.
- Produces (used by Task 7): `section.vue` with props `{ counts: GitHubRepositoryOverviewCounts | null; owner: string; repo: string }`, no emits (navigation via `router.push` internally, same as the commits section).

- [ ] **Step 1: Create `account-row.vue`**

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { UserRound } from 'lucide-vue-next'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Spinner,
} from '@oh-my-github/ui'

defineProps<{
  followDisabled: boolean
  followPending: boolean
  item: GitHubAccountFollowUser
}>()

const emit = defineEmits<{
  select: [login: string]
  toggleFollow: [item: GitHubAccountFollowUser]
}>()

const { t } = useI18n()

function fallbackInitials(login: string): string {
  return login.slice(0, 2).toUpperCase()
}
</script>

<template>
  <div
    class="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-3 outline-hidden transition-colors hover:bg-[color:var(--ui-hover)] focus-visible:bg-[color:var(--ui-hover)] focus-visible:ring-2 focus-visible:ring-ring/30"
    role="button"
    tabindex="0"
    @click="emit('select', item.login)"
    @keydown.enter.prevent="emit('select', item.login)"
  >
    <Avatar class="size-10 shrink-0">
      <AvatarImage
        :alt="item.login"
        :src="item.avatarUrl"
      />
      <AvatarFallback class="text-label">
        {{ fallbackInitials(item.login) }}
      </AvatarFallback>
    </Avatar>

    <div class="grid min-w-0 flex-1 gap-0.5">
      <div class="flex min-w-0 items-center gap-2">
        <span class="truncate text-label font-medium text-foreground">
          {{ item.name || item.login }}
        </span>
        <span class="truncate text-body text-muted-foreground">
          {{ item.login }}
        </span>
        <Badge
          v-if="item.isFollowingViewer"
          class="shrink-0"
          variant="secondary"
        >
          {{ t('account.followers.followsYou') }}
        </Badge>
      </div>
      <p
        v-if="item.bio"
        class="truncate text-body text-muted-foreground"
      >
        {{ item.bio }}
      </p>
    </div>

    <Button
      v-if="item.viewerCanFollow && !item.isViewer"
      :aria-pressed="item.viewerIsFollowing"
      class="shrink-0"
      :disabled="followDisabled"
      size="sm"
      type="button"
      variant="outline"
      @click.stop="emit('toggleFollow', item)"
    >
      <Spinner
        v-if="followPending"
        class="size-3.5"
      />
      <UserRound
        v-else
        class="size-3.5"
      />
      <span>{{ t(item.viewerIsFollowing ? 'account.actions.unfollow' : 'account.actions.follow') }}</span>
    </Button>
  </div>
</template>
```

- [ ] **Step 2: Create `fork-row.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Star } from 'lucide-vue-next'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@oh-my-github/ui'

const props = defineProps<{
  item: GitHubRepositoryForkItem
}>()

const emit = defineEmits<{
  select: [item: GitHubRepositoryForkItem]
}>()

const { t } = useI18n()

const updatedLabel = computed(() => {
  if (!props.item.pushedAt) return null

  const date = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(props.item.pushedAt))

  return t('repository.engagement.forkUpdated', { date })
})

function fallbackInitials(owner: string): string {
  return owner.slice(0, 2).toUpperCase()
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value)
}
</script>

<template>
  <div
    class="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-3 outline-hidden transition-colors hover:bg-[color:var(--ui-hover)] focus-visible:bg-[color:var(--ui-hover)] focus-visible:ring-2 focus-visible:ring-ring/30"
    role="button"
    tabindex="0"
    @click="emit('select', item)"
    @keydown.enter.prevent="emit('select', item)"
  >
    <Avatar class="size-10 shrink-0">
      <AvatarImage
        :alt="item.owner"
        :src="item.ownerAvatarUrl"
      />
      <AvatarFallback class="text-label">
        {{ fallbackInitials(item.owner) }}
      </AvatarFallback>
    </Avatar>

    <div class="grid min-w-0 flex-1 gap-0.5">
      <span class="truncate text-label font-medium text-foreground">
        {{ item.fullName }}
      </span>
      <p
        v-if="item.description"
        class="truncate text-body text-muted-foreground"
      >
        {{ item.description }}
      </p>
      <div class="flex min-w-0 items-center gap-2 text-body text-muted-foreground">
        <span class="inline-flex items-center gap-1">
          <Star class="size-3.5" />
          {{ formatNumber(item.stars) }}
        </span>
        <template v-if="updatedLabel">
          <span aria-hidden="true">·</span>
          <span class="truncate">{{ updatedLabel }}</span>
        </template>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Create `section.vue`**

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Eye, GitFork, Search, Star } from 'lucide-vue-next'
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Skeleton,
} from '@oh-my-github/ui'
import AppPagination from '@/components/navigation/app-pagination.vue'
import TabSwitcher, { type TabSwitcherItem } from '@/components/navigation/tab-switcher.vue'
import {
  setAccountFollowed,
  useAccountListInvalidation,
} from '@/composables/github/use-accounts'
import {
  useRepositoryForksQuery,
  useRepositoryStargazersQuery,
  useRepositoryWatchersQuery,
} from '@/composables/github/use-repositories'
import { useToast } from '@/composables/use-toast'
import {
  createAccountWorkspaceUrl,
  createRepositoryWorkspaceUrl,
} from '@/pages/workspace/workspace-url'
import AccountRow from './account-row.vue'
import ForkRow from './fork-row.vue'

const props = defineProps<{
  counts: GitHubRepositoryOverviewCounts | null
  owner: string
  repo: string
}>()

type EngagementTabId = 'stargazers' | 'forks' | 'watchers'

const PER_PAGE = 20
const SEARCH_DEBOUNCE_MS = 300

const { t } = useI18n()
const router = useRouter()
const toast = useToast()
const { invalidateAccountProfile } = useAccountListInvalidation()

const activeTab = ref<EngagementTabId>('stargazers')
const page = ref(1)
const searchInput = ref('')
const search = ref('')
const followOverrides = ref<Record<string, boolean>>({})
const pendingFollowLogin = ref<string | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | null = null

const hasIdentity = computed(() => Boolean(props.owner && props.repo))
const stargazersQuery = useRepositoryStargazersQuery(
  () => props.owner,
  () => props.repo,
  () => hasIdentity.value && activeTab.value === 'stargazers',
)
const watchersQuery = useRepositoryWatchersQuery(
  () => props.owner,
  () => props.repo,
  () => hasIdentity.value && activeTab.value === 'watchers',
)
const forksQuery = useRepositoryForksQuery(
  () => props.owner,
  () => props.repo,
  () => hasIdentity.value && activeTab.value === 'forks',
)

const activeQuery = computed(() => {
  if (activeTab.value === 'forks') return forksQuery
  return activeTab.value === 'watchers' ? watchersQuery : stargazersQuery
})
const isLoading = computed(() => activeQuery.value.isLoading.value)
const hasError = computed(() => Boolean(activeQuery.value.error.value))
const truncated = computed(() => Boolean(activeQuery.value.data.value?.truncated))

const accountItems = computed(() => {
  const query = activeTab.value === 'watchers' ? watchersQuery : stargazersQuery
  return (query.data.value?.items ?? []).map((item) => {
    const override = followOverrides.value[item.login]
    return override === undefined ? item : { ...item, viewerIsFollowing: override }
  })
})
const filteredAccountItems = computed(() => {
  const terms = search.value.toLowerCase()
  if (!terms) return accountItems.value

  return accountItems.value.filter((item) =>
    item.login.toLowerCase().includes(terms)
    || (item.name ?? '').toLowerCase().includes(terms)
    || (item.bio ?? '').toLowerCase().includes(terms)
  )
})

const forkItems = computed(() => forksQuery.data.value?.items ?? [])
const filteredForkItems = computed(() => {
  const terms = search.value.toLowerCase()
  if (!terms) return forkItems.value

  return forkItems.value.filter((item) =>
    item.fullName.toLowerCase().includes(terms)
    || (item.description ?? '').toLowerCase().includes(terms)
  )
})

const filteredCount = computed(() =>
  activeTab.value === 'forks' ? filteredForkItems.value.length : filteredAccountItems.value.length
)
const pagedAccountItems = computed(() => {
  const offset = (page.value - 1) * PER_PAGE
  return filteredAccountItems.value.slice(offset, offset + PER_PAGE)
})
const pagedForkItems = computed(() => {
  const offset = (page.value - 1) * PER_PAGE
  return filteredForkItems.value.slice(offset, offset + PER_PAGE)
})
const paginationSummaryKey = computed(() =>
  activeTab.value === 'forks'
    ? 'repository.engagement.pagination.forks'
    : 'repository.engagement.pagination.accounts'
)

const tabs = computed<TabSwitcherItem[]>(() => [
  {
    id: 'stargazers',
    icon: Star,
    label: t('repository.engagement.tabs.stargazers'),
    count: props.counts?.stars ?? null,
  },
  {
    id: 'forks',
    icon: GitFork,
    label: t('repository.engagement.tabs.forks'),
    count: props.counts?.forks ?? null,
  },
  {
    id: 'watchers',
    icon: Eye,
    label: t('repository.engagement.tabs.watchers'),
    count: props.counts?.watchers ?? null,
  },
])

watch(
  () => [props.owner, props.repo] as const,
  () => {
    activeTab.value = 'stargazers'
    page.value = 1
    searchInput.value = ''
    search.value = ''
    followOverrides.value = {}
  },
)

watch(activeTab, () => {
  page.value = 1
})

watch(searchInput, (value) => {
  clearSearchTimer()

  searchTimer = setTimeout(() => {
    search.value = value.trim()
    page.value = 1
    searchTimer = null
  }, SEARCH_DEBOUNCE_MS)
})

watch(
  () => [stargazersQuery.data.value, watchersQuery.data.value] as const,
  () => {
    followOverrides.value = {}
  },
)

onBeforeUnmount(() => {
  clearSearchTimer()
})

function clearSearchTimer(): void {
  if (!searchTimer) return

  clearTimeout(searchTimer)
  searchTimer = null
}

function openAccount(login: string): void {
  void router.push(createAccountWorkspaceUrl(login))
}

function openFork(item: GitHubRepositoryForkItem): void {
  void router.push(createRepositoryWorkspaceUrl(item.owner, item.name))
}

async function toggleFollow(item: GitHubAccountFollowUser): Promise<void> {
  if (pendingFollowLogin.value) return

  const nextFollowing = !(followOverrides.value[item.login] ?? item.viewerIsFollowing)
  pendingFollowLogin.value = item.login
  followOverrides.value = { ...followOverrides.value, [item.login]: nextFollowing }

  try {
    await setAccountFollowed(item.login, nextFollowing)
    invalidateAccountProfile(item.login)
  } catch (error) {
    const { [item.login]: _removed, ...rest } = followOverrides.value
    followOverrides.value = rest
    toast.error(t('account.followers.toasts.errorTitle'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    pendingFollowLogin.value = null
  }
}

function resolveErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined

  const message = error.message
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .replace(/^Error:\s*/, '')
    .trim()

  return message || undefined
}
</script>

<template>
  <section class="grid gap-3">
    <div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <TabSwitcher
        :active-id="activeTab"
        :navigation-label="t('repository.engagement.tabsLabel')"
        :tabs="tabs"
        @update:active-id="activeTab = $event as EngagementTabId"
      />

      <InputGroup
        class="w-full sm:max-w-xs"
        size="sm"
      >
        <InputGroupAddon>
          <Search class="size-3.5 text-muted-foreground" />
        </InputGroupAddon>
        <InputGroupInput
          v-model="searchInput"
          :placeholder="t('repository.engagement.searchPlaceholder')"
          type="search"
        />
      </InputGroup>
    </div>

    <div
      v-if="isLoading && filteredCount === 0"
      class="grid gap-2"
    >
      <Skeleton
        v-for="index in 6"
        :key="index"
        class="h-16 rounded-lg"
      />
    </div>

    <Empty
      v-else-if="hasError"
      class="min-h-[18rem] border border-border bg-card"
    >
      <EmptyHeader>
        <EmptyTitle>
          {{ t('repository.engagement.error.title') }}
        </EmptyTitle>
        <EmptyDescription>
          {{ t('repository.engagement.error.description') }}
        </EmptyDescription>
        <Button
          class="justify-self-center"
          size="sm"
          type="button"
          variant="outline"
          @click="activeQuery.refetch()"
        >
          {{ t('account.error.retry') }}
        </Button>
      </EmptyHeader>
    </Empty>

    <Empty
      v-else-if="filteredCount === 0"
      class="min-h-[18rem] border border-border bg-card"
    >
      <EmptyHeader>
        <EmptyTitle>
          {{ t(search
            ? 'repository.engagement.searchEmpty.title'
            : `repository.engagement.empty.${activeTab}.title`) }}
        </EmptyTitle>
        <EmptyDescription>
          {{ t(search
            ? 'repository.engagement.searchEmpty.description'
            : `repository.engagement.empty.${activeTab}.description`) }}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>

    <template v-else>
      <p
        v-if="truncated"
        class="text-body text-muted-foreground"
      >
        {{ t('repository.engagement.truncated') }}
      </p>

      <ul
        v-if="activeTab === 'forks'"
        class="grid gap-2"
      >
        <li
          v-for="item in pagedForkItems"
          :key="item.id"
        >
          <ForkRow
            :item="item"
            @select="openFork"
          />
        </li>
      </ul>

      <ul
        v-else
        class="grid gap-2"
      >
        <li
          v-for="item in pagedAccountItems"
          :key="item.login"
        >
          <AccountRow
            :follow-disabled="pendingFollowLogin !== null"
            :follow-pending="pendingFollowLogin === item.login"
            :item="item"
            @select="openAccount"
            @toggle-follow="toggleFollow"
          />
        </li>
      </ul>

      <AppPagination
        v-model:page="page"
        :disabled="isLoading"
        hide-when-single-page
        :max-total="Math.max(filteredCount, PER_PAGE)"
        :per-page="PER_PAGE"
        :summary-key="paginationSummaryKey"
        :total-count="filteredCount"
      />
    </template>
  </section>
</template>
```

Note: `account.error.retry` and `account.followers.toasts.errorTitle` / `account.followers.followsYou` / `account.actions.follow` / `account.actions.unfollow` are existing keys reused deliberately — do not duplicate them under `repository.engagement`.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @oh-my-github/client typecheck`
Expected: no errors (components are not referenced yet — that's fine, Vue SFCs typecheck standalone via vue-tsc)

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/renderer/pages/repository/components/engagement
git commit -m "feat(repository): add engagement section components"
```

---

### Task 7: Navigation wiring + live verification

**Files:**
- Modify: `packages/client/src/renderer/pages/workspace/types.ts` (`RepositoryTabId`, line 5)
- Modify: `packages/client/src/renderer/pages/workspace/workspace-url.ts` (`sanitizeRepositorySection`, ~line 437)
- Modify: `packages/client/src/renderer/pages/repository/repository-page.vue` (sections array ~line 68, section rendering ~line 536, lucide import)

**Interfaces:**
- Consumes: `EngagementSection` from Task 6 (props `counts` / `owner` / `repo`).
- Produces: `'engagement'` as a valid `RepositoryTabId`; URL query `?tab=engagement` round-trips; sidebar entry between Releases and Contributors.

- [ ] **Step 1: Add `'engagement'` to `RepositoryTabId`**

In `packages/client/src/renderer/pages/workspace/types.ts`, insert between `'releases'` and `'contributors'`:

```ts
export type RepositoryTabId =
  | 'overview'
  | 'files'
  | 'commits'
  | 'branches'
  | 'pullRequests'
  | 'issues'
  | 'actions'
  | 'releases'
  | 'engagement'
  | 'contributors'
  | 'packages'
  | 'deployments'
  | 'settings'
```

- [ ] **Step 2: Accept `engagement` in the URL sanitizer**

In `packages/client/src/renderer/pages/workspace/workspace-url.ts`, inside `sanitizeRepositorySection`, insert between the `releases` and `contributors` lines:

```ts
  if (value === 'engagement') return 'engagement'
```

- [ ] **Step 3: Register the section in `repository-page.vue`**

1. Add `Sparkles` to the existing `lucide-vue-next` import.
2. Add the section import next to `ContributorsSection` (~line 54):

```ts
import EngagementSection from './components/engagement/section.vue'
```

3. In the `repositorySections` array, insert between `releases` and `contributors`:

```ts
  { id: 'engagement', icon: Sparkles },
```

4. In the template, insert immediately BEFORE the `<ContributorsSection ...>` branch (~line 536):

```vue
        <EngagementSection
          v-else-if="activeSection === 'engagement'"
          :counts="overview?.counts ?? null"
          :owner="owner"
          :repo="repository"
        />
```

- [ ] **Step 4: Full verification — typecheck and both test suites**

Run: `pnpm --filter @oh-my-github/api test && pnpm --filter @oh-my-github/api typecheck && pnpm --filter @oh-my-github/client test && pnpm --filter @oh-my-github/client typecheck`
Expected: all PASS

- [ ] **Step 5: Verify live in the app**

The user typically has `pnpm dev` (HMR) running. In the running app, open any repository tab and confirm:
1. Sidebar shows "Engagement"（互动）between Releases and Contributors.
2. The section opens on Stargazers with the count badges from overview counts; rows show avatar/name/bio and follow buttons work.
3. The Forks sub-tab shows repo rows (owner avatar, `owner/name`, description, star count, updated date); clicking one opens that fork's repository tab.
4. The Watchers sub-tab loads; search filters locally; pagination appears past 20 rows.
5. `?tab=engagement` in the tab URL restores the section after navigating away and back.

If the app is not running, launch it per the project's run setup (Electron dev: `pnpm dev`) or ask the user to check via HMR.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/renderer/pages/workspace/types.ts packages/client/src/renderer/pages/workspace/workspace-url.ts packages/client/src/renderer/pages/repository/repository-page.vue
git commit -m "feat(repository): add engagement tab with stargazers, forks, and watchers"
```
