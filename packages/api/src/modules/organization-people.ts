import type { GitHubOctokit } from '../transport'
import type {
  CancelOrganizationInvitationOptions,
  GitHubOrganizationInvitation,
  GitHubOrganizationMember,
  GitHubOrganizationMemberRole,
  GitHubOrganizationPeople,
  InviteOrganizationMemberOptions,
  OrganizationMemberOptions,
  SetOrganizationMemberRoleOptions,
  SetOrganizationMembershipVisibilityOptions,
} from '../types'

interface GraphOrganizationMembersResponse {
  organization: {
    viewerCanAdminister?: boolean
    membersWithRole?: {
      totalCount?: number
      pageInfo?: {
        hasNextPage?: boolean
        endCursor?: string | null
      } | null
      edges?: Array<{
        role?: string | null
        hasTwoFactorEnabled?: boolean | null
        node?: {
          databaseId?: number | null
          login?: string | null
          name?: string | null
          avatarUrl?: string | null
        } | null
      } | null>
    } | null
  } | null
}

interface OrganizationInvitationResponse {
  id?: number
  login?: string | null
  email?: string | null
  role?: string | null
  created_at?: string | null
  inviter?: {
    login?: string | null
  } | null
}

interface PublicMemberResponse {
  login?: string | null
}

interface UserLookupResponse {
  id?: number
}

const organizationMembersQuery = `
  query OrganizationMembers($login: String!, $first: Int!, $after: String) {
    organization(login: $login) {
      viewerCanAdminister
      membersWithRole(first: $first, after: $after) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          role
          hasTwoFactorEnabled
          node {
            databaseId
            login
            name
            avatarUrl
          }
        }
      }
    }
  }
`

const MEMBERS_FETCH_PAGE_SIZE = 100
const MEMBERS_MAX_TOTAL = 1000

export class OrganizationPeopleApi {
  constructor(private readonly octokit: GitHubOctokit) {}

  // Fetches the full member list (capped) in one go so the renderer can
  // filter, search, and paginate client-side; role and 2FA state are only
  // available per-edge on the GraphQL connection.
  async getPeople(org: string): Promise<GitHubOrganizationPeople> {
    const [membersResult, publicLogins] = await Promise.all([
      this.fetchMembersWithRole(org),
      this.fetchPublicMemberLogins(org),
    ])

    return {
      members: membersResult.members.map((member) => ({
        ...member,
        isPublic: publicLogins.has(member.login.toLowerCase()),
      })),
      totalCount: membersResult.totalCount,
      truncated: membersResult.truncated,
      viewerCanAdminister: membersResult.viewerCanAdminister,
    }
  }

  async listInvitations(org: string): Promise<GitHubOrganizationInvitation[]> {
    const invitations = await this.octokit.paginate('GET /orgs/{org}/invitations', {
      org,
      per_page: 100,
    }) as OrganizationInvitationResponse[]

    return invitations.map((invitation) => ({
      id: invitation.id ?? 0,
      login: invitation.login ?? null,
      email: invitation.email ?? null,
      role: invitation.role ?? 'direct_member',
      createdAt: invitation.created_at ?? null,
      inviterLogin: invitation.inviter?.login ?? null,
    }))
  }

  async inviteMember(options: InviteOrganizationMemberOptions): Promise<void> {
    const identifier = options.identifier.trim()
    const role = mapInvitationRole(options.role)

    if (isEmailInviteIdentifier(identifier)) {
      await this.octokit.request('POST /orgs/{org}/invitations', {
        org: options.org,
        email: identifier,
        role,
      })
      return
    }

    const response = await this.octokit.request('GET /users/{username}', {
      username: identifier,
    })
    const user = response.data as UserLookupResponse

    if (!user.id) {
      throw new Error(`GitHub user "${identifier}" was not found`)
    }

    await this.octokit.request('POST /orgs/{org}/invitations', {
      org: options.org,
      invitee_id: user.id,
      role,
    })
  }

  async setMemberRole(options: SetOrganizationMemberRoleOptions): Promise<void> {
    await this.octokit.request('PUT /orgs/{org}/memberships/{username}', {
      org: options.org,
      username: options.login,
      role: options.role,
    })
  }

  // DELETE memberships (not members) also covers cancelling a pending
  // invitation addressed to an existing user.
  async removeMember(options: OrganizationMemberOptions): Promise<void> {
    await this.octokit.request('DELETE /orgs/{org}/memberships/{username}', {
      org: options.org,
      username: options.login,
    })
  }

  async cancelInvitation(options: CancelOrganizationInvitationOptions): Promise<void> {
    await this.octokit.request('DELETE /orgs/{org}/invitations/{invitation_id}', {
      org: options.org,
      invitation_id: options.invitationId,
    })
  }

  // GitHub only lets the authenticated user publicize their own membership.
  async setMembershipVisibility(options: SetOrganizationMembershipVisibilityOptions): Promise<void> {
    if (options.publicized) {
      await this.octokit.request('PUT /orgs/{org}/public_members/{username}', {
        org: options.org,
        username: options.login,
      })
      return
    }

    await this.octokit.request('DELETE /orgs/{org}/public_members/{username}', {
      org: options.org,
      username: options.login,
    })
  }

  private async fetchMembersWithRole(org: string): Promise<{
    members: Array<Omit<GitHubOrganizationMember, 'isPublic'>>
    totalCount: number
    truncated: boolean
    viewerCanAdminister: boolean
  }> {
    const members: Array<Omit<GitHubOrganizationMember, 'isPublic'>> = []
    let viewerCanAdminister = false
    let totalCount = 0
    let after: string | null = null
    let hasNextPage = true

    while (hasNextPage && members.length < MEMBERS_MAX_TOTAL) {
      const response: GraphOrganizationMembersResponse = await this.octokit.graphql<GraphOrganizationMembersResponse>(
        organizationMembersQuery,
        {
          login: org,
          first: MEMBERS_FETCH_PAGE_SIZE,
          after,
        },
      )
      const organization = response.organization
      const connection = organization?.membersWithRole

      viewerCanAdminister = Boolean(organization?.viewerCanAdminister)
      totalCount = connection?.totalCount ?? 0

      for (const edge of connection?.edges ?? []) {
        const login = edge?.node?.login?.trim()
        if (!login) continue

        members.push({
          id: edge?.node?.databaseId ?? 0,
          login,
          name: edge?.node?.name ?? null,
          avatarUrl: edge?.node?.avatarUrl ?? `https://github.com/${encodeURIComponent(login)}.png?size=96`,
          role: edge?.role === 'ADMIN' ? 'admin' : 'member',
          hasTwoFactorEnabled: edge?.hasTwoFactorEnabled ?? null,
        })
      }

      hasNextPage = Boolean(connection?.pageInfo?.hasNextPage)
      after = connection?.pageInfo?.endCursor ?? null
      if (!after) break
    }

    return {
      members: members.slice(0, MEMBERS_MAX_TOTAL),
      totalCount,
      truncated: hasNextPage || members.length > MEMBERS_MAX_TOTAL,
      viewerCanAdminister,
    }
  }

  private async fetchPublicMemberLogins(org: string): Promise<Set<string>> {
    try {
      const publicMembers = await this.octokit.paginate('GET /orgs/{org}/public_members', {
        org,
        per_page: 100,
      }) as PublicMemberResponse[]

      return new Set(
        publicMembers
          .map((member) => member.login?.toLowerCase() ?? '')
          .filter(Boolean),
      )
    } catch {
      return new Set()
    }
  }
}

export function isEmailInviteIdentifier(identifier: string): boolean {
  return identifier.includes('@')
}

function mapInvitationRole(role: GitHubOrganizationMemberRole): 'direct_member' | 'admin' {
  return role === 'admin' ? 'admin' : 'direct_member'
}
