import { describe, expect, it, vi } from 'vitest'
import type { GitHubOctokit } from '../transport'
import { isEmailInviteIdentifier, OrganizationPeopleApi } from './organization-people'

function createApi() {
  const request = vi.fn()
  const graphql = vi.fn()
  const paginate = vi.fn()
  const api = new OrganizationPeopleApi({ request, graphql, paginate } as unknown as GitHubOctokit)
  return { api, request, graphql, paginate }
}

function createMemberEdge(overrides: Record<string, unknown> = {}) {
  return {
    role: 'MEMBER',
    hasTwoFactorEnabled: true,
    node: {
      databaseId: 1,
      login: 'octocat',
      name: 'The Octocat',
      avatarUrl: 'https://example.com/octocat.png',
    },
    ...overrides,
  }
}

describe('OrganizationPeopleApi getPeople', () => {
  it('merges member roles with public membership visibility', async () => {
    const { api, graphql, paginate } = createApi()
    graphql.mockResolvedValueOnce({
      organization: {
        viewerCanAdminister: true,
        membersWithRole: {
          totalCount: 2,
          pageInfo: { hasNextPage: false, endCursor: null },
          edges: [
            createMemberEdge(),
            createMemberEdge({
              role: 'ADMIN',
              hasTwoFactorEnabled: null,
              node: { databaseId: 2, login: 'boss', name: null, avatarUrl: 'https://example.com/boss.png' },
            }),
          ],
        },
      },
    })
    paginate.mockResolvedValueOnce([{ login: 'BOSS' }])

    const people = await api.getPeople('octo-org')

    expect(paginate).toHaveBeenCalledWith('GET /orgs/{org}/public_members', {
      org: 'octo-org',
      per_page: 100,
    })
    expect(people.viewerCanAdminister).toBe(true)
    expect(people.totalCount).toBe(2)
    expect(people.truncated).toBe(false)
    expect(people.members).toEqual([
      {
        id: 1,
        login: 'octocat',
        name: 'The Octocat',
        avatarUrl: 'https://example.com/octocat.png',
        role: 'member',
        hasTwoFactorEnabled: true,
        isPublic: false,
      },
      {
        id: 2,
        login: 'boss',
        name: null,
        avatarUrl: 'https://example.com/boss.png',
        role: 'admin',
        hasTwoFactorEnabled: null,
        isPublic: true,
      },
    ])
  })

  it('follows GraphQL pagination cursors until exhausted', async () => {
    const { api, graphql, paginate } = createApi()
    graphql
      .mockResolvedValueOnce({
        organization: {
          viewerCanAdminister: false,
          membersWithRole: {
            totalCount: 2,
            pageInfo: { hasNextPage: true, endCursor: 'CURSOR' },
            edges: [createMemberEdge()],
          },
        },
      })
      .mockResolvedValueOnce({
        organization: {
          viewerCanAdminister: false,
          membersWithRole: {
            totalCount: 2,
            pageInfo: { hasNextPage: false, endCursor: null },
            edges: [createMemberEdge({ node: { databaseId: 2, login: 'second', name: null, avatarUrl: '' } })],
          },
        },
      })
    paginate.mockResolvedValueOnce([])

    const people = await api.getPeople('octo-org')

    expect(graphql).toHaveBeenCalledTimes(2)
    expect(graphql.mock.calls[1][1]).toMatchObject({ after: 'CURSOR' })
    expect(people.members).toHaveLength(2)
  })

  it('treats a failing public members lookup as private-only visibility', async () => {
    const { api, graphql, paginate } = createApi()
    graphql.mockResolvedValueOnce({
      organization: {
        viewerCanAdminister: false,
        membersWithRole: {
          totalCount: 1,
          pageInfo: { hasNextPage: false, endCursor: null },
          edges: [createMemberEdge()],
        },
      },
    })
    paginate.mockRejectedValueOnce(new Error('403'))

    const people = await api.getPeople('octo-org')

    expect(people.members[0].isPublic).toBe(false)
  })
})

describe('OrganizationPeopleApi invitations', () => {
  it('lists pending invitations', async () => {
    const { api, paginate } = createApi()
    paginate.mockResolvedValueOnce([
      {
        id: 7,
        login: 'invitee',
        email: null,
        role: 'direct_member',
        created_at: '2026-01-01T00:00:00Z',
        inviter: { login: 'boss' },
      },
    ])

    const invitations = await api.listInvitations('octo-org')

    expect(paginate).toHaveBeenCalledWith('GET /orgs/{org}/invitations', {
      org: 'octo-org',
      per_page: 100,
    })
    expect(invitations).toEqual([{
      id: 7,
      login: 'invitee',
      email: null,
      role: 'direct_member',
      createdAt: '2026-01-01T00:00:00Z',
      inviterLogin: 'boss',
    }])
  })

  it('invites by email without resolving a user id', async () => {
    const { api, request } = createApi()
    request.mockResolvedValueOnce({ data: {} })

    await api.inviteMember({ org: 'octo-org', identifier: ' person@example.com ', role: 'member' })

    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('POST /orgs/{org}/invitations', {
      org: 'octo-org',
      email: 'person@example.com',
      role: 'direct_member',
    })
  })

  it('resolves a username to invitee_id and maps the admin role', async () => {
    const { api, request } = createApi()
    request
      .mockResolvedValueOnce({ data: { id: 42 } })
      .mockResolvedValueOnce({ data: {} })

    await api.inviteMember({ org: 'octo-org', identifier: 'octocat', role: 'admin' })

    expect(request).toHaveBeenNthCalledWith(1, 'GET /users/{username}', { username: 'octocat' })
    expect(request).toHaveBeenNthCalledWith(2, 'POST /orgs/{org}/invitations', {
      org: 'octo-org',
      invitee_id: 42,
      role: 'admin',
    })
  })

  it('cancels an invitation', async () => {
    const { api, request } = createApi()
    request.mockResolvedValueOnce({ data: {} })

    await api.cancelInvitation({ org: 'octo-org', invitationId: 7 })

    expect(request).toHaveBeenCalledWith('DELETE /orgs/{org}/invitations/{invitation_id}', {
      org: 'octo-org',
      invitation_id: 7,
    })
  })
})

describe('OrganizationPeopleApi membership mutations', () => {
  it('updates a member role', async () => {
    const { api, request } = createApi()
    request.mockResolvedValueOnce({ data: {} })

    await api.setMemberRole({ org: 'octo-org', login: 'octocat', role: 'admin' })

    expect(request).toHaveBeenCalledWith('PUT /orgs/{org}/memberships/{username}', {
      org: 'octo-org',
      username: 'octocat',
      role: 'admin',
    })
  })

  it('removes a member through the memberships endpoint', async () => {
    const { api, request } = createApi()
    request.mockResolvedValueOnce({ data: {} })

    await api.removeMember({ org: 'octo-org', login: 'octocat' })

    expect(request).toHaveBeenCalledWith('DELETE /orgs/{org}/memberships/{username}', {
      org: 'octo-org',
      username: 'octocat',
    })
  })

  it('toggles the viewer membership visibility', async () => {
    const { api, request } = createApi()
    request.mockResolvedValue({ data: {} })

    await api.setMembershipVisibility({ org: 'octo-org', login: 'me', publicized: true })
    await api.setMembershipVisibility({ org: 'octo-org', login: 'me', publicized: false })

    expect(request).toHaveBeenNthCalledWith(1, 'PUT /orgs/{org}/public_members/{username}', {
      org: 'octo-org',
      username: 'me',
    })
    expect(request).toHaveBeenNthCalledWith(2, 'DELETE /orgs/{org}/public_members/{username}', {
      org: 'octo-org',
      username: 'me',
    })
  })
})

describe('isEmailInviteIdentifier', () => {
  it('detects email identifiers', () => {
    expect(isEmailInviteIdentifier('person@example.com')).toBe(true)
    expect(isEmailInviteIdentifier('octocat')).toBe(false)
  })
})
