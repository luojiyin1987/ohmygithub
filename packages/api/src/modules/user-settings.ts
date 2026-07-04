import type { GitHubOctokit } from '../transport'
import type {
  GitHubBlockedUser,
  GitHubCodespacesSecret,
  GitHubGpgKey,
  GitHubInteractionLimitExpiry,
  GitHubInteractionLimitGroup,
  GitHubInteractionLimits,
  GitHubOrganizationMembership,
  GitHubSavedReply,
  GitHubSocialAccount,
  GitHubSshKey,
  GitHubSshSigningKey,
  GitHubUserEmail,
  GitHubUserSettingsProfile,
  UpdateUserSettingsProfileInput,
  UpsertCodespacesSecretInput,
} from '../types'

interface ProfileResponse {
  login?: string | null
  name?: string | null
  email?: string | null
  bio?: string | null
  company?: string | null
  location?: string | null
  blog?: string | null
  twitter_username?: string | null
  hireable?: boolean | null
  avatar_url?: string | null
  html_url?: string | null
}

interface SocialAccountResponse {
  provider?: string | null
  url?: string | null
}

interface EmailResponse {
  email?: string | null
  primary?: boolean | null
  verified?: boolean | null
  visibility?: string | null
}

interface SshKeyResponse {
  id?: number
  title?: string | null
  key?: string | null
  created_at?: string | null
}

interface GpgKeyResponse {
  id?: number
  key_id?: string | null
  name?: string | null
  emails?: Array<{ email?: string | null; verified?: boolean | null }> | null
  created_at?: string | null
  expires_at?: string | null
}

interface BlockedUserResponse {
  login?: string | null
  avatar_url?: string | null
  html_url?: string | null
}

interface InteractionLimitsResponse {
  limit?: string | null
  origin?: string | null
  expires_at?: string | null
}

interface OrganizationMembershipResponse {
  state?: string | null
  role?: string | null
  organization?: {
    login?: string | null
    avatar_url?: string | null
    description?: string | null
  } | null
}

interface CodespacesSecretResponse {
  name?: string | null
  created_at?: string | null
  updated_at?: string | null
}

interface SavedRepliesGraphResponse {
  viewer?: {
    savedReplies?: {
      nodes?: Array<{
        id?: string | null
        databaseId?: number | null
        title?: string | null
        body?: string | null
      } | null> | null
    } | null
  } | null
}

const savedRepliesQuery = `
  query SavedReplies($first: Int!) {
    viewer {
      savedReplies(first: $first, orderBy: { field: UPDATED_AT, direction: DESC }) {
        nodes {
          id
          databaseId
          title
          body
        }
      }
    }
  }
`

const MAX_PAGE_SIZE = 100

export class UserSettingsApi {
  constructor(private readonly octokit: GitHubOctokit) {}

  async getProfile(): Promise<GitHubUserSettingsProfile> {
    const response = await this.octokit.request('GET /user')

    return normalizeProfile(response.data as ProfileResponse)
  }

  async updateProfile(input: UpdateUserSettingsProfileInput): Promise<GitHubUserSettingsProfile> {
    const response = await this.octokit.request('PATCH /user', {
      name: input.name,
      email: input.email,
      bio: input.bio,
      company: input.company,
      location: input.location,
      blog: input.blog,
      twitter_username: input.twitterUsername,
      hireable: input.hireable,
    })

    return normalizeProfile(response.data as ProfileResponse)
  }

  async listSocialAccounts(): Promise<GitHubSocialAccount[]> {
    const response = await this.octokit.request('GET /user/social_accounts', {
      per_page: MAX_PAGE_SIZE,
    })

    return ((response.data ?? []) as SocialAccountResponse[]).map((account) => ({
      provider: account.provider ?? 'generic',
      url: account.url ?? '',
    }))
  }

  async addSocialAccounts(urls: string[]): Promise<GitHubSocialAccount[]> {
    const response = await this.octokit.request('POST /user/social_accounts', {
      account_urls: urls,
    })

    return ((response.data ?? []) as SocialAccountResponse[]).map((account) => ({
      provider: account.provider ?? 'generic',
      url: account.url ?? '',
    }))
  }

  async deleteSocialAccounts(urls: string[]): Promise<void> {
    await this.octokit.request('DELETE /user/social_accounts', {
      account_urls: urls,
    })
  }

  async listEmails(): Promise<GitHubUserEmail[]> {
    const response = await this.octokit.request('GET /user/emails', {
      per_page: MAX_PAGE_SIZE,
    })

    return ((response.data ?? []) as EmailResponse[]).map((email) => ({
      email: email.email ?? '',
      primary: Boolean(email.primary),
      verified: Boolean(email.verified),
      visibility: email.visibility ?? null,
    }))
  }

  async addEmail(email: string): Promise<void> {
    await this.octokit.request('POST /user/emails', {
      emails: [email],
    })
  }

  async deleteEmail(email: string): Promise<void> {
    await this.octokit.request('DELETE /user/emails', {
      emails: [email],
    })
  }

  async setPrimaryEmailVisibility(visibility: 'public' | 'private'): Promise<void> {
    await this.octokit.request('PATCH /user/email/visibility', {
      visibility,
    })
  }

  async listSshKeys(): Promise<GitHubSshKey[]> {
    const response = await this.octokit.request('GET /user/keys', {
      per_page: MAX_PAGE_SIZE,
    })

    return ((response.data ?? []) as SshKeyResponse[]).map(normalizeSshKey)
  }

  async addSshKey(title: string, key: string): Promise<GitHubSshKey> {
    const response = await this.octokit.request('POST /user/keys', {
      title,
      key,
    })

    return normalizeSshKey(response.data as SshKeyResponse)
  }

  async deleteSshKey(keyId: number): Promise<void> {
    await this.octokit.request('DELETE /user/keys/{key_id}', {
      key_id: keyId,
    })
  }

  async listGpgKeys(): Promise<GitHubGpgKey[]> {
    const response = await this.octokit.request('GET /user/gpg_keys', {
      per_page: MAX_PAGE_SIZE,
    })

    return ((response.data ?? []) as GpgKeyResponse[]).map(normalizeGpgKey)
  }

  async addGpgKey(armoredPublicKey: string, name?: string): Promise<GitHubGpgKey> {
    const response = await this.octokit.request('POST /user/gpg_keys', {
      armored_public_key: armoredPublicKey,
      name,
    })

    return normalizeGpgKey(response.data as GpgKeyResponse)
  }

  async deleteGpgKey(gpgKeyId: number): Promise<void> {
    await this.octokit.request('DELETE /user/gpg_keys/{gpg_key_id}', {
      gpg_key_id: gpgKeyId,
    })
  }

  async listSshSigningKeys(): Promise<GitHubSshSigningKey[]> {
    const response = await this.octokit.request('GET /user/ssh_signing_keys', {
      per_page: MAX_PAGE_SIZE,
    })

    return ((response.data ?? []) as SshKeyResponse[]).map(normalizeSshKey)
  }

  async addSshSigningKey(title: string, key: string): Promise<GitHubSshSigningKey> {
    const response = await this.octokit.request('POST /user/ssh_signing_keys', {
      title,
      key,
    })

    return normalizeSshKey(response.data as SshKeyResponse)
  }

  async deleteSshSigningKey(keyId: number): Promise<void> {
    await this.octokit.request('DELETE /user/ssh_signing_keys/{ssh_signing_key_id}', {
      ssh_signing_key_id: keyId,
    })
  }

  async listBlockedUsers(): Promise<GitHubBlockedUser[]> {
    const response = await this.octokit.request('GET /user/blocks', {
      per_page: MAX_PAGE_SIZE,
    })

    return ((response.data ?? []) as BlockedUserResponse[]).map((user) => ({
      login: user.login ?? '',
      avatarUrl: user.avatar_url ?? '',
      htmlUrl: user.html_url ?? '',
    }))
  }

  async blockUser(username: string): Promise<void> {
    await this.octokit.request('PUT /user/blocks/{username}', {
      username,
    })
  }

  async unblockUser(username: string): Promise<void> {
    await this.octokit.request('DELETE /user/blocks/{username}', {
      username,
    })
  }

  async getInteractionLimits(): Promise<GitHubInteractionLimits | null> {
    const response = await this.octokit.request('GET /user/interaction-limits')
    const data = response.data as InteractionLimitsResponse | undefined

    if (!data?.limit) return null

    return {
      limit: data.limit as GitHubInteractionLimitGroup,
      origin: data.origin ?? null,
      expiresAt: data.expires_at ?? null,
    }
  }

  async setInteractionLimits(
    limit: GitHubInteractionLimitGroup,
    expiry?: GitHubInteractionLimitExpiry,
  ): Promise<GitHubInteractionLimits | null> {
    const response = await this.octokit.request('PUT /user/interaction-limits', {
      limit,
      expiry,
    })
    const data = response.data as InteractionLimitsResponse | undefined

    if (!data?.limit) return null

    return {
      limit: data.limit as GitHubInteractionLimitGroup,
      origin: data.origin ?? null,
      expiresAt: data.expires_at ?? null,
    }
  }

  async clearInteractionLimits(): Promise<void> {
    await this.octokit.request('DELETE /user/interaction-limits')
  }

  async listOrganizationMemberships(viewerLogin: string): Promise<GitHubOrganizationMembership[]> {
    const response = await this.octokit.request('GET /user/memberships/orgs', {
      per_page: MAX_PAGE_SIZE,
    })
    const memberships = ((response.data ?? []) as OrganizationMembershipResponse[])
      .filter((membership) => Boolean(membership.organization?.login))

    return Promise.all(
      memberships.map(async (membership) => {
        const orgLogin = membership.organization?.login ?? ''
        const state = membership.state === 'pending' ? 'pending' : 'active'

        return {
          orgLogin,
          orgAvatarUrl: membership.organization?.avatar_url ?? '',
          orgDescription: membership.organization?.description ?? null,
          role: membership.role ?? 'member',
          state,
          isPublic:
            state === 'active'
              ? await this.isOrganizationMembershipPublic(orgLogin, viewerLogin)
              : false,
        } satisfies GitHubOrganizationMembership
      }),
    )
  }

  async acceptOrganizationInvitation(org: string): Promise<void> {
    await this.octokit.request('PATCH /user/memberships/orgs/{org}', {
      org,
      state: 'active',
    })
  }

  async setOrganizationMembershipVisibility(
    org: string,
    viewerLogin: string,
    isPublic: boolean,
  ): Promise<void> {
    if (isPublic) {
      await this.octokit.request('PUT /orgs/{org}/public_members/{username}', {
        org,
        username: viewerLogin,
      })
      return
    }

    await this.octokit.request('DELETE /orgs/{org}/public_members/{username}', {
      org,
      username: viewerLogin,
    })
  }

  async listCodespacesSecrets(): Promise<GitHubCodespacesSecret[]> {
    const response = await this.octokit.request('GET /user/codespaces/secrets', {
      per_page: MAX_PAGE_SIZE,
    })
    const secrets = ((response.data as { secrets?: CodespacesSecretResponse[] } | undefined)
      ?.secrets ?? [])

    return Promise.all(
      secrets
        .filter((secret) => Boolean(secret.name))
        .map(async (secret) => ({
          name: secret.name ?? '',
          createdAt: secret.created_at ?? null,
          updatedAt: secret.updated_at ?? null,
          selectedRepositoryIds: await this.listCodespacesSecretRepositoryIds(secret.name ?? ''),
        })),
    )
  }

  async upsertCodespacesSecret(input: UpsertCodespacesSecretInput): Promise<void> {
    const publicKeyResponse = await this.octokit.request(
      'GET /user/codespaces/secrets/public-key',
    )
    const publicKey = publicKeyResponse.data as { key?: string; key_id?: string }

    if (!publicKey.key || !publicKey.key_id) {
      throw new Error('GitHub Codespaces public key is unavailable')
    }

    await this.octokit.request('PUT /user/codespaces/secrets/{secret_name}', {
      secret_name: input.name,
      encrypted_value: await sealSecret(input.value, publicKey.key),
      key_id: publicKey.key_id,
      selected_repository_ids: input.selectedRepositoryIds.map(String),
    })
  }

  async deleteCodespacesSecret(name: string): Promise<void> {
    await this.octokit.request('DELETE /user/codespaces/secrets/{secret_name}', {
      secret_name: name,
    })
  }

  async listSavedReplies(): Promise<GitHubSavedReply[]> {
    const response = await this.octokit.graphql<SavedRepliesGraphResponse>(savedRepliesQuery, {
      first: MAX_PAGE_SIZE,
    })
    const nodes = response.viewer?.savedReplies?.nodes ?? []

    return nodes
      .filter((node): node is NonNullable<typeof node> => Boolean(node))
      .map((node) => ({
        id: node.id ?? '',
        databaseId: node.databaseId ?? null,
        title: node.title ?? '',
        body: node.body ?? '',
      }))
  }

  private async isOrganizationMembershipPublic(
    org: string,
    viewerLogin: string,
  ): Promise<boolean> {
    try {
      await this.octokit.request('GET /orgs/{org}/public_members/{username}', {
        org,
        username: viewerLogin,
      })
      return true
    } catch (error) {
      if (isNotFoundError(error)) return false
      throw error
    }
  }

  private async listCodespacesSecretRepositoryIds(name: string): Promise<number[]> {
    try {
      const response = await this.octokit.request(
        'GET /user/codespaces/secrets/{secret_name}/repositories',
        { secret_name: name },
      )
      const repositories = (response.data as {
        repositories?: Array<{ id?: number }>
      } | undefined)?.repositories ?? []

      return repositories
        .map((repository) => repository.id)
        .filter((id): id is number => typeof id === 'number')
    } catch {
      return []
    }
  }
}

async function sealSecret(value: string, base64PublicKey: string): Promise<string> {
  const sodium = (await import('libsodium-wrappers')).default
  await sodium.ready

  const publicKey = sodium.from_base64(base64PublicKey, sodium.base64_variants.ORIGINAL)
  const sealed = sodium.crypto_box_seal(sodium.from_string(value), publicKey)

  return sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL)
}

function normalizeProfile(profile: ProfileResponse): GitHubUserSettingsProfile {
  return {
    login: profile.login ?? '',
    name: profile.name ?? null,
    email: profile.email ?? null,
    bio: profile.bio ?? null,
    company: profile.company ?? null,
    location: profile.location ?? null,
    blog: profile.blog ?? null,
    twitterUsername: profile.twitter_username ?? null,
    hireable: Boolean(profile.hireable),
    avatarUrl: profile.avatar_url ?? '',
    htmlUrl: profile.html_url ?? '',
  }
}

function normalizeSshKey(key: SshKeyResponse): GitHubSshKey {
  return {
    id: key.id ?? 0,
    title: key.title ?? '',
    key: key.key ?? '',
    createdAt: key.created_at ?? null,
  }
}

function normalizeGpgKey(key: GpgKeyResponse): GitHubGpgKey {
  return {
    id: key.id ?? 0,
    keyId: key.key_id ?? '',
    name: key.name ?? null,
    emails: (key.emails ?? []).map((email) => ({
      email: email.email ?? '',
      verified: Boolean(email.verified),
    })),
    createdAt: key.created_at ?? null,
    expiresAt: key.expires_at ?? null,
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status?: number }).status === 404
  )
}
