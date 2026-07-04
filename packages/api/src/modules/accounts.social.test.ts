import { describe, expect, it, vi } from 'vitest'
import type { GitHubOctokit } from '../transport'
import { AccountsApi } from './accounts'

function createApi() {
  const request = vi.fn()
  const graphql = vi.fn()
  const api = new AccountsApi({ request, graphql } as unknown as GitHubOctokit)
  return { api, request, graphql }
}

function createFollowUserResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    login: 'octocat',
    avatar_url: 'https://example.com/octocat.png',
    type: 'User',
    ...overrides,
  }
}

describe('AccountsApi listFollowers', () => {
  it('returns the list newest-first and merges GraphQL enrichment', async () => {
    const { api, request, graphql } = createApi()
    request.mockResolvedValueOnce({
      data: [
        createFollowUserResponse({ id: 1, login: 'oldest' }),
        createFollowUserResponse({ id: 2, login: 'newest' }),
      ],
      headers: {},
    })
    graphql.mockResolvedValueOnce({
      o0: {
        __typename: 'User',
        name: 'The Newest',
        bio: 'Mascot',
        viewerIsFollowing: true,
        viewerCanFollow: true,
        isFollowingViewer: true,
        isViewer: false,
      },
      o1: null,
    })

    const result = await api.listFollowers('octo')

    expect(request).toHaveBeenCalledWith('GET /users/{username}/followers', {
      username: 'octo',
      page: 1,
      per_page: 100,
    })
    // REST returns oldest-first; the result is reversed.
    expect(graphql.mock.calls[0][0]).toContain('o0: repositoryOwner(login: "newest")')
    expect(result.totalCount).toBe(2)
    expect(result.truncated).toBe(false)
    expect(result.items.map((item) => item.login)).toEqual(['newest', 'oldest'])
    expect(result.items[0]).toMatchObject({
      name: 'The Newest',
      viewerIsFollowing: true,
      viewerCanFollow: true,
      isFollowingViewer: true,
    })
  })

  it('fetches every page and computes the total from the last page', async () => {
    const { api, request, graphql } = createApi()
    request.mockImplementation((_route: string, params: { page: number }) => {
      if (params.page === 1) {
        return Promise.resolve({
          data: [createFollowUserResponse({ login: 'first-page' })],
          headers: { link: '<https://api.github.com/users/octo/followers?page=3&per_page=100>; rel="last"' },
        })
      }
      return Promise.resolve({
        data: [createFollowUserResponse({ login: `page-${params.page}` })],
        headers: {},
      })
    })
    graphql.mockResolvedValue({})

    const result = await api.listFollowers('octo')

    expect(request).toHaveBeenCalledTimes(3)
    expect(result.truncated).toBe(false)
    expect(result.totalCount).toBe(201)
    expect(result.items.map((item) => item.login)).toEqual(['page-3', 'page-2', 'first-page'])
  })

  it('keeps only the newest pages when the list exceeds the cap', async () => {
    const { api, request, graphql } = createApi()
    request.mockImplementation((_route: string, params: { page: number }) => {
      if (params.page === 1) {
        return Promise.resolve({
          data: [createFollowUserResponse({ login: 'first-page' })],
          headers: { link: '<https://api.github.com/users/octo/followers?page=12&per_page=100>; rel="last"' },
        })
      }
      return Promise.resolve({
        data: [createFollowUserResponse({ login: `page-${params.page}` })],
        headers: {},
      })
    })
    graphql.mockResolvedValue({})

    const result = await api.listFollowers('octo')

    // Page 1 plus the newest window: pages 3..12.
    expect(request).toHaveBeenCalledTimes(11)
    const fetchedPages = request.mock.calls.map((call) => call[1].page)
    expect(fetchedPages).toContain(3)
    expect(fetchedPages).toContain(12)
    expect(fetchedPages).not.toContain(2)
    expect(result.truncated).toBe(true)
    expect(result.totalCount).toBe(1101)
    expect(result.items[0].login).toBe('page-12')
    expect(result.items.some((item) => item.login === 'first-page')).toBe(false)
  })

  it('maps organization nodes in the following list', async () => {
    const { api, request, graphql } = createApi()
    request.mockResolvedValueOnce({
      data: [createFollowUserResponse({ login: 'octo-org', type: 'Organization' })],
      headers: {},
    })
    graphql.mockResolvedValueOnce({
      o0: {
        __typename: 'Organization',
        name: 'Octo Org',
        description: 'An organization',
        viewerIsFollowing: false,
      },
    })

    const result = await api.listFollowing('octo')

    expect(request).toHaveBeenCalledWith('GET /users/{username}/following', {
      username: 'octo',
      page: 1,
      per_page: 100,
    })
    expect(result.items[0]).toMatchObject({
      login: 'octo-org',
      name: 'Octo Org',
      bio: 'An organization',
      type: 'Organization',
      viewerCanFollow: true,
      viewerIsFollowing: false,
    })
  })

  it('degrades gracefully when enrichment fails', async () => {
    const { api, request, graphql } = createApi()
    request.mockResolvedValueOnce({
      data: [createFollowUserResponse()],
      headers: {},
    })
    graphql.mockRejectedValueOnce(new Error('boom'))

    const result = await api.listFollowers('octo')

    expect(result.items[0]).toMatchObject({
      login: 'octocat',
      name: null,
      viewerCanFollow: false,
      viewerIsFollowing: false,
    })
  })

  it('skips enrichment lookups for logins that would break the query', async () => {
    const { api, request, graphql } = createApi()
    request.mockResolvedValueOnce({
      data: [createFollowUserResponse({ login: 'bad"login' })],
      headers: {},
    })

    await api.listFollowers('octo')

    expect(graphql).not.toHaveBeenCalled()
  })
})

describe('AccountsApi sponsorships', () => {
  it('fetches the sponsors summary', async () => {
    const { api, graphql } = createApi()
    graphql.mockResolvedValueOnce({
      repositoryOwner: {
        hasSponsorsListing: true,
        sponsors: { totalCount: 12 },
        sponsoring: { totalCount: 3 },
      },
    })

    const summary = await api.getSponsorsSummary('octo')

    expect(summary).toEqual({
      hasSponsorsListing: true,
      sponsorsCount: 12,
      sponsoringCount: 3,
    })
  })

  it('treats accounts without a sponsors listing as empty', async () => {
    const { api, graphql } = createApi()
    graphql.mockResolvedValueOnce({ repositoryOwner: {} })

    const summary = await api.getSponsorsSummary('octo')

    expect(summary).toEqual({
      hasSponsorsListing: false,
      sponsorsCount: 0,
      sponsoringCount: 0,
    })
  })

  it('paginates sponsors with an offset cursor and maps tiers', async () => {
    const { api, graphql } = createApi()
    graphql.mockResolvedValueOnce({
      repositoryOwner: {
        sponsorships: {
          totalCount: 42,
          pageInfo: { hasNextPage: true },
          nodes: [
            {
              privacyLevel: 'PUBLIC',
              isOneTimePayment: false,
              createdAt: '2026-01-01T00:00:00Z',
              tier: { name: '$5 a month', monthlyPriceInDollars: 5, isOneTime: false },
              sponsorEntity: {
                __typename: 'User',
                login: 'sponsor-user',
                name: 'Sponsor User',
                avatarUrl: 'https://example.com/sponsor.png',
                bio: 'Supporter',
              },
            },
          ],
        },
      },
    })

    const result = await api.listSponsorships({ login: 'octo', role: 'maintainer', page: 3, perPage: 20 })

    expect(graphql.mock.calls[0][0]).toContain('sponsorshipsAsMaintainer')
    // Offset cursor: base64("40") for page 3 with 20 per page.
    expect(graphql.mock.calls[0][1]).toMatchObject({
      login: 'octo',
      first: 20,
      after: Buffer.from('40', 'utf8').toString('base64').replace(/=+$/, ''),
    })
    expect(result.totalCount).toBe(42)
    expect(result.hasNextPage).toBe(true)
    expect(result.items[0]).toMatchObject({
      login: 'sponsor-user',
      type: 'User',
      isPrivate: false,
      tier: { name: '$5 a month', monthlyPriceInDollars: 5, isOneTime: false },
    })
  })

  it('omits the cursor on the first page and maps private sponsorships', async () => {
    const { api, graphql } = createApi()
    graphql.mockResolvedValueOnce({
      repositoryOwner: {
        sponsorships: {
          totalCount: 1,
          pageInfo: { hasNextPage: false },
          nodes: [
            {
              privacyLevel: 'PRIVATE',
              isOneTimePayment: true,
              sponsorEntity: null,
            },
          ],
        },
      },
    })

    const result = await api.listSponsorships({ login: 'octo', role: 'sponsor', page: 1, perPage: 20 })

    expect(graphql.mock.calls[0][0]).toContain('sponsorshipsAsSponsor')
    expect(graphql.mock.calls[0][1]).toMatchObject({ after: undefined })
    expect(result.items[0]).toMatchObject({
      login: null,
      isPrivate: true,
      isOneTimePayment: true,
      tier: null,
    })
  })

  it('maps organization sponsor targets from the sponsorable field', async () => {
    const { api, graphql } = createApi()
    graphql.mockResolvedValueOnce({
      repositoryOwner: {
        sponsorships: {
          totalCount: 1,
          pageInfo: { hasNextPage: false },
          nodes: [
            {
              privacyLevel: 'PUBLIC',
              sponsorable: {
                __typename: 'Organization',
                login: 'octo-org',
                name: 'Octo Org',
                avatarUrl: 'https://example.com/org.png',
                description: 'An org',
              },
            },
          ],
        },
      },
    })

    const result = await api.listSponsorships({ login: 'octo', role: 'sponsor', page: 1, perPage: 20 })

    expect(result.items[0]).toMatchObject({
      login: 'octo-org',
      type: 'Organization',
      bio: 'An org',
      isPrivate: false,
    })
  })
})
