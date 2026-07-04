import { describe, expect, it, vi } from 'vitest'
import type { GitHubOctokit } from '../transport'
import { RepositorySettingsApi } from './repository-settings.general'

describe('RepositorySettingsApi general', () => {
  it('maps general settings from REST, GraphQL, and immutable releases probes', async () => {
    const { api, request, graphql } = createApi()

    const settings = await api.getGeneralSettings({ owner: 'octo-org', repo: 'hello-world' })

    expect(request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}', {
      owner: 'octo-org',
      repo: 'hello-world',
    })
    expect(graphql).toHaveBeenCalledWith(expect.stringContaining('hasSponsorshipsEnabled'), {
      owner: 'octo-org',
      repo: 'hello-world',
    })
    expect(settings).toMatchObject({
      repositoryNodeId: 'R_node1',
      name: 'hello-world',
      description: 'A test repository',
      homepage: 'https://example.dev',
      visibility: 'public',
      isArchived: false,
      isTemplate: false,
      webCommitSignoffRequired: true,
      defaultBranch: 'main',
      topics: ['vue', 'electron'],
      hasIssues: true,
      hasWiki: false,
      hasProjects: true,
      hasDiscussions: true,
      hasSponsorships: true,
      allowMergeCommit: true,
      allowSquashMerge: true,
      allowRebaseMerge: false,
      allowAutoMerge: true,
      deleteBranchOnMerge: true,
      allowUpdateBranch: true,
      squashMergeCommitTitle: 'PR_TITLE',
      squashMergeCommitMessage: 'COMMIT_MESSAGES',
      mergeCommitTitle: 'MERGE_MESSAGE',
      mergeCommitMessage: 'PR_TITLE',
      immutableReleases: true,
    })
  })

  it('tolerates missing sponsorships data and immutable releases probe failures', async () => {
    const { api } = createApi({ sponsorshipsError: true, immutableStatus: 'error' })

    const settings = await api.getGeneralSettings({ owner: 'octo-org', repo: 'hello-world' })

    expect(settings.hasSponsorships).toBeNull()
    expect(settings.immutableReleases).toBeNull()
  })

  it('reports immutable releases disabled on 404', async () => {
    const { api } = createApi({ immutableStatus: 404 })

    const settings = await api.getGeneralSettings({ owner: 'octo-org', repo: 'hello-world' })

    expect(settings.immutableReleases).toBe(false)
  })

  it('patches only the provided general settings fields with snake_case names', async () => {
    const { api, request } = createApi()

    await api.updateGeneralSettings({
      owner: 'octo-org',
      repo: 'hello-world',
      input: {
        description: 'new description',
        hasWiki: false,
        allowSquashMerge: true,
        squashMergeCommitTitle: 'COMMIT_OR_PR_TITLE',
        webCommitSignoffRequired: false,
      },
    })

    expect(request).toHaveBeenCalledWith('PATCH /repos/{owner}/{repo}', {
      owner: 'octo-org',
      repo: 'hello-world',
      description: 'new description',
      has_wiki: false,
      allow_squash_merge: true,
      squash_merge_commit_title: 'COMMIT_OR_PR_TITLE',
      web_commit_signoff_required: false,
    })
  })

  it('replaces topics, toggles immutable releases, transfers, and deletes', async () => {
    const { api, request } = createApi()

    await api.replaceTopics({ owner: 'octo-org', repo: 'hello-world', names: ['vue'] })
    expect(request).toHaveBeenCalledWith('PUT /repos/{owner}/{repo}/topics', {
      owner: 'octo-org',
      repo: 'hello-world',
      names: ['vue'],
    })

    await api.setImmutableReleases({ owner: 'octo-org', repo: 'hello-world', enabled: true })
    expect(request).toHaveBeenCalledWith('PUT /repos/{owner}/{repo}/immutable-releases', {
      owner: 'octo-org',
      repo: 'hello-world',
    })

    await api.setImmutableReleases({ owner: 'octo-org', repo: 'hello-world', enabled: false })
    expect(request).toHaveBeenCalledWith('DELETE /repos/{owner}/{repo}/immutable-releases', {
      owner: 'octo-org',
      repo: 'hello-world',
    })

    await api.transferRepository({ owner: 'octo-org', repo: 'hello-world', newOwner: 'acbox', newName: 'renamed' })
    expect(request).toHaveBeenCalledWith('POST /repos/{owner}/{repo}/transfer', {
      owner: 'octo-org',
      repo: 'hello-world',
      new_owner: 'acbox',
      new_name: 'renamed',
    })

    await api.deleteRepository({ owner: 'octo-org', repo: 'hello-world' })
    expect(request).toHaveBeenCalledWith('DELETE /repos/{owner}/{repo}', {
      owner: 'octo-org',
      repo: 'hello-world',
    })
  })

  it('toggles discussions and sponsorships through the GraphQL updateRepository mutation', async () => {
    const { api, graphql } = createApi()

    await api.setDiscussionsEnabled({ repositoryNodeId: 'R_node1', enabled: true })
    expect(graphql).toHaveBeenCalledWith(expect.stringContaining('hasDiscussionsEnabled'), {
      repositoryId: 'R_node1',
      enabled: true,
    })

    await api.setSponsorshipsEnabled({ repositoryNodeId: 'R_node1', enabled: false })
    expect(graphql).toHaveBeenCalledWith(expect.stringContaining('hasSponsorshipsEnabled'), {
      repositoryId: 'R_node1',
      enabled: false,
    })
  })
})

function createApi(overrides: { sponsorshipsError?: boolean; immutableStatus?: 204 | 404 | 'error' } = {}) {
  const immutableStatus = overrides.immutableStatus ?? 204
  const request = vi.fn(async (route: string) => {
    if (route === 'GET /repos/{owner}/{repo}') {
      return {
        data: {
          node_id: 'R_node1',
          name: 'hello-world',
          description: 'A test repository',
          homepage: 'https://example.dev',
          visibility: 'public',
          archived: false,
          is_template: false,
          web_commit_signoff_required: true,
          default_branch: 'main',
          topics: ['vue', 'electron'],
          has_issues: true,
          has_wiki: false,
          has_projects: true,
          has_discussions: true,
          allow_merge_commit: true,
          allow_squash_merge: true,
          allow_rebase_merge: false,
          allow_auto_merge: true,
          delete_branch_on_merge: true,
          allow_update_branch: true,
          squash_merge_commit_title: 'PR_TITLE',
          squash_merge_commit_message: 'COMMIT_MESSAGES',
          merge_commit_title: 'MERGE_MESSAGE',
          merge_commit_message: 'PR_TITLE',
        },
      }
    }

    if (route === 'GET /repos/{owner}/{repo}/immutable-releases') {
      if (immutableStatus === 204) return { status: 204 }
      const error = new Error(immutableStatus === 404 ? 'Not Found' : 'boom') as Error & { status?: number }
      if (immutableStatus === 404) error.status = 404
      throw error
    }

    return { data: {}, status: 204 }
  })
  const graphql = vi.fn(async (document: string) => {
    if (document.includes('hasSponsorshipsEnabled') && !document.includes('mutation')) {
      if (overrides.sponsorshipsError) throw new Error('forbidden')
      return { repository: { hasSponsorshipsEnabled: true } }
    }
    return { updateRepository: { repository: { id: 'R_node1' } } }
  })
  const octokit = { request, graphql } as unknown as GitHubOctokit

  return { api: new RepositorySettingsApi(octokit), request, graphql }
}
