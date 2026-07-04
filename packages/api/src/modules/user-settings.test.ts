import { describe, expect, it, vi } from 'vitest'
import type { GitHubOctokit } from '../transport'
import { UserSettingsApi } from './user-settings'

function createApi() {
  const request = vi.fn().mockResolvedValue({ data: {} })
  const graphql = vi.fn().mockResolvedValue({})
  const api = new UserSettingsApi({ request, graphql } as unknown as GitHubOctokit)
  return { api, request, graphql }
}

describe('UserSettingsApi profile', () => {
  it('normalizes the authenticated profile', async () => {
    const { api, request } = createApi()
    request.mockResolvedValueOnce({
      data: {
        login: 'octocat',
        name: 'The Octocat',
        email: 'octocat@github.com',
        bio: null,
        company: '@github',
        location: 'San Francisco',
        blog: 'https://github.blog',
        twitter_username: 'github',
        hireable: null,
        avatar_url: 'https://example.com/a.png',
        html_url: 'https://github.com/octocat',
      },
    })

    const profile = await api.getProfile()

    expect(request).toHaveBeenCalledWith('GET /user')
    expect(profile).toEqual({
      login: 'octocat',
      name: 'The Octocat',
      email: 'octocat@github.com',
      bio: null,
      company: '@github',
      location: 'San Francisco',
      blog: 'https://github.blog',
      twitterUsername: 'github',
      hireable: false,
      avatarUrl: 'https://example.com/a.png',
      htmlUrl: 'https://github.com/octocat',
    })
  })

  it('maps update fields onto the PATCH /user payload', async () => {
    const { api, request } = createApi()

    await api.updateProfile({
      name: 'New Name',
      bio: 'Hello',
      twitterUsername: 'newhandle',
      hireable: true,
    })

    expect(request).toHaveBeenCalledWith('PATCH /user', {
      name: 'New Name',
      email: undefined,
      bio: 'Hello',
      company: undefined,
      location: undefined,
      blog: undefined,
      twitter_username: 'newhandle',
      hireable: true,
    })
  })

  it('adds and removes social accounts by url', async () => {
    const { api, request } = createApi()
    request.mockResolvedValueOnce({ data: [{ provider: 'mastodon', url: 'https://m.social/@octo' }] })

    const accounts = await api.addSocialAccounts(['https://m.social/@octo'])

    expect(request).toHaveBeenCalledWith('POST /user/social_accounts', {
      account_urls: ['https://m.social/@octo'],
    })
    expect(accounts).toEqual([{ provider: 'mastodon', url: 'https://m.social/@octo' }])

    await api.deleteSocialAccounts(['https://m.social/@octo'])

    expect(request).toHaveBeenCalledWith('DELETE /user/social_accounts', {
      account_urls: ['https://m.social/@octo'],
    })
  })
})

describe('UserSettingsApi emails', () => {
  it('normalizes emails and sends add/delete payloads', async () => {
    const { api, request } = createApi()
    request.mockResolvedValueOnce({
      data: [
        { email: 'a@example.com', primary: true, verified: true, visibility: 'private' },
        { email: 'b@example.com', primary: false, verified: false, visibility: null },
      ],
    })

    const emails = await api.listEmails()

    expect(emails).toEqual([
      { email: 'a@example.com', primary: true, verified: true, visibility: 'private' },
      { email: 'b@example.com', primary: false, verified: false, visibility: null },
    ])

    await api.addEmail('c@example.com')
    expect(request).toHaveBeenCalledWith('POST /user/emails', { emails: ['c@example.com'] })

    await api.deleteEmail('b@example.com')
    expect(request).toHaveBeenCalledWith('DELETE /user/emails', { emails: ['b@example.com'] })

    await api.setPrimaryEmailVisibility('public')
    expect(request).toHaveBeenCalledWith('PATCH /user/email/visibility', { visibility: 'public' })
  })
})

describe('UserSettingsApi keys', () => {
  it('creates and deletes ssh keys', async () => {
    const { api, request } = createApi()
    request.mockResolvedValueOnce({
      data: { id: 7, title: 'laptop', key: 'ssh-ed25519 AAA', created_at: '2026-01-01T00:00:00Z' },
    })

    const key = await api.addSshKey('laptop', 'ssh-ed25519 AAA')

    expect(request).toHaveBeenCalledWith('POST /user/keys', {
      title: 'laptop',
      key: 'ssh-ed25519 AAA',
    })
    expect(key).toEqual({
      id: 7,
      title: 'laptop',
      key: 'ssh-ed25519 AAA',
      createdAt: '2026-01-01T00:00:00Z',
    })

    await api.deleteSshKey(7)
    expect(request).toHaveBeenCalledWith('DELETE /user/keys/{key_id}', { key_id: 7 })
  })

  it('normalizes gpg keys with emails', async () => {
    const { api, request } = createApi()
    request.mockResolvedValueOnce({
      data: [
        {
          id: 3,
          key_id: '3262EFF25BA0D270',
          name: 'Octocat GPG',
          emails: [{ email: 'octocat@github.com', verified: true }],
          created_at: '2026-01-01T00:00:00Z',
          expires_at: null,
        },
      ],
    })

    const keys = await api.listGpgKeys()

    expect(keys).toEqual([
      {
        id: 3,
        keyId: '3262EFF25BA0D270',
        name: 'Octocat GPG',
        emails: [{ email: 'octocat@github.com', verified: true }],
        createdAt: '2026-01-01T00:00:00Z',
        expiresAt: null,
      },
    ])
  })

  it('deletes ssh signing keys with the dedicated path param', async () => {
    const { api, request } = createApi()

    await api.deleteSshSigningKey(9)

    expect(request).toHaveBeenCalledWith('DELETE /user/ssh_signing_keys/{ssh_signing_key_id}', {
      ssh_signing_key_id: 9,
    })
  })
})

describe('UserSettingsApi blocking and interaction limits', () => {
  it('blocks and unblocks users', async () => {
    const { api, request } = createApi()

    await api.blockUser('spammer')
    expect(request).toHaveBeenCalledWith('PUT /user/blocks/{username}', { username: 'spammer' })

    await api.unblockUser('spammer')
    expect(request).toHaveBeenCalledWith('DELETE /user/blocks/{username}', { username: 'spammer' })
  })

  it('returns null when no interaction limits are active', async () => {
    const { api, request } = createApi()
    request.mockResolvedValueOnce({ data: {} })

    expect(await api.getInteractionLimits()).toBeNull()
  })

  it('sets interaction limits with expiry', async () => {
    const { api, request } = createApi()
    request.mockResolvedValueOnce({
      data: { limit: 'contributors_only', origin: 'user', expires_at: '2026-08-01T00:00:00Z' },
    })

    const limits = await api.setInteractionLimits('contributors_only', 'one_month')

    expect(request).toHaveBeenCalledWith('PUT /user/interaction-limits', {
      limit: 'contributors_only',
      expiry: 'one_month',
    })
    expect(limits).toEqual({
      limit: 'contributors_only',
      origin: 'user',
      expiresAt: '2026-08-01T00:00:00Z',
    })
  })
})

describe('UserSettingsApi organizations', () => {
  it('resolves membership visibility via public_members', async () => {
    const { api, request } = createApi()
    request.mockResolvedValueOnce({
      data: [
        {
          state: 'active',
          role: 'admin',
          organization: { login: 'octo-org', avatar_url: 'https://example.com/o.png', description: null },
        },
        {
          state: 'pending',
          role: 'member',
          organization: { login: 'other-org', avatar_url: '', description: 'Pending org' },
        },
      ],
    })
    request.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }))

    const memberships = await api.listOrganizationMemberships('octocat')

    expect(memberships).toEqual([
      {
        orgLogin: 'octo-org',
        orgAvatarUrl: 'https://example.com/o.png',
        orgDescription: null,
        role: 'admin',
        state: 'active',
        isPublic: false,
      },
      {
        orgLogin: 'other-org',
        orgAvatarUrl: '',
        orgDescription: 'Pending org',
        role: 'member',
        state: 'pending',
        isPublic: false,
      },
    ])
    expect(request).toHaveBeenCalledWith('GET /orgs/{org}/public_members/{username}', {
      org: 'octo-org',
      username: 'octocat',
    })
  })

  it('accepts pending invitations', async () => {
    const { api, request } = createApi()

    await api.acceptOrganizationInvitation('octo-org')

    expect(request).toHaveBeenCalledWith('PATCH /user/memberships/orgs/{org}', {
      org: 'octo-org',
      state: 'active',
    })
  })
})

describe('UserSettingsApi codespaces secrets', () => {
  it('seals the secret value with the account public key', async () => {
    const { api, request } = createApi()
    const sodium = (await import('libsodium-wrappers')).default
    await sodium.ready
    const keyPair = sodium.crypto_box_keypair()

    request.mockResolvedValueOnce({
      data: {
        key: sodium.to_base64(keyPair.publicKey, sodium.base64_variants.ORIGINAL),
        key_id: 'key-1',
      },
    })

    await api.upsertCodespacesSecret({
      name: 'NPM_TOKEN',
      value: 'super-secret',
      selectedRepositoryIds: [123],
    })

    const putCall = request.mock.calls.find(([route]) =>
      route === 'PUT /user/codespaces/secrets/{secret_name}')
    expect(putCall).toBeDefined()
    const payload = putCall?.[1] as {
      secret_name: string
      encrypted_value: string
      key_id: string
      selected_repository_ids: string[]
    }
    expect(payload.secret_name).toBe('NPM_TOKEN')
    expect(payload.key_id).toBe('key-1')
    expect(payload.selected_repository_ids).toEqual(['123'])

    const sealed = sodium.from_base64(payload.encrypted_value, sodium.base64_variants.ORIGINAL)
    const opened = sodium.crypto_box_seal_open(sealed, keyPair.publicKey, keyPair.privateKey)
    expect(sodium.to_string(opened)).toBe('super-secret')
  })

  it('lists secrets with their selected repository ids', async () => {
    const { api, request } = createApi()
    request.mockResolvedValueOnce({
      data: {
        secrets: [
          { name: 'NPM_TOKEN', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z' },
        ],
      },
    })
    request.mockResolvedValueOnce({
      data: { repositories: [{ id: 123 }, { id: 456 }] },
    })

    const secrets = await api.listCodespacesSecrets()

    expect(secrets).toEqual([
      {
        name: 'NPM_TOKEN',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-02-01T00:00:00Z',
        selectedRepositoryIds: [123, 456],
      },
    ])
  })
})

describe('UserSettingsApi saved replies', () => {
  it('reads saved replies through GraphQL', async () => {
    const { api, graphql } = createApi()
    graphql.mockResolvedValueOnce({
      viewer: {
        savedReplies: {
          nodes: [
            { id: 'SR_1', databaseId: 11, title: 'LGTM', body: 'Looks good!' },
            null,
          ],
        },
      },
    })

    const replies = await api.listSavedReplies()

    expect(graphql).toHaveBeenCalledWith(expect.stringContaining('savedReplies'), { first: 100 })
    expect(replies).toEqual([{ id: 'SR_1', databaseId: 11, title: 'LGTM', body: 'Looks good!' }])
  })
})
