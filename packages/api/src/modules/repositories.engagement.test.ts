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
