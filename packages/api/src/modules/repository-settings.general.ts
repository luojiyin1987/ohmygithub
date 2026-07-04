import type { GitHubOctokit } from '../transport'
import type {
  GitHubRepositoryGeneralSettings,
  RepositoryOptions,
  SetRepositoryFeatureNodeOptions,
  TransferRepositoryOptions,
  UpdateRepositoryGeneralSettingsInput,
} from '../types'

interface GeneralSettingsResponse {
  node_id?: string
  name?: string
  description?: string | null
  homepage?: string | null
  visibility?: string | null
  archived?: boolean
  is_template?: boolean
  web_commit_signoff_required?: boolean
  default_branch?: string | null
  topics?: string[]
  has_issues?: boolean
  has_wiki?: boolean
  has_projects?: boolean
  has_discussions?: boolean
  allow_merge_commit?: boolean
  allow_squash_merge?: boolean
  allow_rebase_merge?: boolean
  allow_auto_merge?: boolean
  delete_branch_on_merge?: boolean
  allow_update_branch?: boolean
  squash_merge_commit_title?: string | null
  squash_merge_commit_message?: string | null
  merge_commit_title?: string | null
  merge_commit_message?: string | null
}

interface SponsorshipsResponse {
  repository?: { hasSponsorshipsEnabled?: boolean | null } | null
}

const sponsorshipsQuery = `
  query RepositorySponsorships($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      hasSponsorshipsEnabled
    }
  }
`

const discussionsMutation = `
  mutation UpdateRepositoryDiscussions($repositoryId: ID!, $enabled: Boolean!) {
    updateRepository(input: { repositoryId: $repositoryId, hasDiscussionsEnabled: $enabled }) {
      repository { id }
    }
  }
`

const sponsorshipsMutation = `
  mutation UpdateRepositorySponsorships($repositoryId: ID!, $enabled: Boolean!) {
    updateRepository(input: { repositoryId: $repositoryId, hasSponsorshipsEnabled: $enabled }) {
      repository { id }
    }
  }
`

const GENERAL_SETTINGS_FIELD_MAP: Record<keyof UpdateRepositoryGeneralSettingsInput, string> = {
  name: 'name',
  description: 'description',
  homepage: 'homepage',
  visibility: 'visibility',
  archived: 'archived',
  isTemplate: 'is_template',
  webCommitSignoffRequired: 'web_commit_signoff_required',
  defaultBranch: 'default_branch',
  hasIssues: 'has_issues',
  hasWiki: 'has_wiki',
  hasProjects: 'has_projects',
  allowMergeCommit: 'allow_merge_commit',
  allowSquashMerge: 'allow_squash_merge',
  allowRebaseMerge: 'allow_rebase_merge',
  allowAutoMerge: 'allow_auto_merge',
  deleteBranchOnMerge: 'delete_branch_on_merge',
  allowUpdateBranch: 'allow_update_branch',
  squashMergeCommitTitle: 'squash_merge_commit_title',
  squashMergeCommitMessage: 'squash_merge_commit_message',
  mergeCommitTitle: 'merge_commit_title',
  mergeCommitMessage: 'merge_commit_message',
}

export class RepositorySettingsApi {
  constructor(private readonly octokit: GitHubOctokit) {}

  async getGeneralSettings(options: RepositoryOptions): Promise<GitHubRepositoryGeneralSettings> {
    const [response, hasSponsorships, immutableReleases] = await Promise.all([
      this.octokit.request('GET /repos/{owner}/{repo}', {
        owner: options.owner,
        repo: options.repo,
      }),
      this.getSponsorshipsEnabled(options),
      this.getImmutableReleases(options),
    ])
    const repository = response.data as GeneralSettingsResponse

    return {
      repositoryNodeId: repository.node_id ?? '',
      name: repository.name ?? options.repo,
      description: repository.description ?? null,
      homepage: repository.homepage?.trim() ? repository.homepage : null,
      visibility: repository.visibility === 'private' ? 'private' : 'public',
      isArchived: Boolean(repository.archived),
      isTemplate: Boolean(repository.is_template),
      webCommitSignoffRequired: Boolean(repository.web_commit_signoff_required),
      defaultBranch: repository.default_branch ?? null,
      topics: repository.topics ?? [],
      hasIssues: Boolean(repository.has_issues),
      hasWiki: Boolean(repository.has_wiki),
      hasProjects: Boolean(repository.has_projects),
      hasDiscussions: Boolean(repository.has_discussions),
      hasSponsorships,
      allowMergeCommit: Boolean(repository.allow_merge_commit),
      allowSquashMerge: Boolean(repository.allow_squash_merge),
      allowRebaseMerge: Boolean(repository.allow_rebase_merge),
      allowAutoMerge: Boolean(repository.allow_auto_merge),
      deleteBranchOnMerge: Boolean(repository.delete_branch_on_merge),
      allowUpdateBranch: Boolean(repository.allow_update_branch),
      squashMergeCommitTitle: normalizeEnum(repository.squash_merge_commit_title, ['PR_TITLE', 'COMMIT_OR_PR_TITLE']),
      squashMergeCommitMessage: normalizeEnum(repository.squash_merge_commit_message, ['PR_BODY', 'COMMIT_MESSAGES', 'BLANK']),
      mergeCommitTitle: normalizeEnum(repository.merge_commit_title, ['PR_TITLE', 'MERGE_MESSAGE']),
      mergeCommitMessage: normalizeEnum(repository.merge_commit_message, ['PR_BODY', 'PR_TITLE', 'BLANK']),
      immutableReleases,
    }
  }

  async updateGeneralSettings(
    options: RepositoryOptions & { input: UpdateRepositoryGeneralSettingsInput },
  ): Promise<void> {
    const payload: { owner: string; repo: string } & Record<string, unknown> = {
      owner: options.owner,
      repo: options.repo,
    }

    for (const [key, restField] of Object.entries(GENERAL_SETTINGS_FIELD_MAP)) {
      const value = options.input[key as keyof UpdateRepositoryGeneralSettingsInput]
      if (value !== undefined) {
        payload[restField] = value
      }
    }

    await this.octokit.request('PATCH /repos/{owner}/{repo}', payload)
  }

  async replaceTopics(options: RepositoryOptions & { names: string[] }): Promise<void> {
    await this.octokit.request('PUT /repos/{owner}/{repo}/topics', {
      owner: options.owner,
      repo: options.repo,
      names: options.names,
    })
  }

  async setDiscussionsEnabled(options: SetRepositoryFeatureNodeOptions): Promise<void> {
    await this.octokit.graphql(discussionsMutation, {
      repositoryId: options.repositoryNodeId,
      enabled: options.enabled,
    })
  }

  async setSponsorshipsEnabled(options: SetRepositoryFeatureNodeOptions): Promise<void> {
    await this.octokit.graphql(sponsorshipsMutation, {
      repositoryId: options.repositoryNodeId,
      enabled: options.enabled,
    })
  }

  async setImmutableReleases(options: RepositoryOptions & { enabled: boolean }): Promise<void> {
    const route = options.enabled
      ? 'PUT /repos/{owner}/{repo}/immutable-releases'
      : 'DELETE /repos/{owner}/{repo}/immutable-releases'

    await this.octokit.request(route, {
      owner: options.owner,
      repo: options.repo,
    })
  }

  async transferRepository(options: TransferRepositoryOptions): Promise<void> {
    const payload: { owner: string; repo: string; new_owner: string } & Record<string, unknown> = {
      owner: options.owner,
      repo: options.repo,
      new_owner: options.newOwner,
    }
    if (options.newName?.trim()) {
      payload.new_name = options.newName.trim()
    }

    await this.octokit.request('POST /repos/{owner}/{repo}/transfer', payload)
  }

  async deleteRepository(options: RepositoryOptions): Promise<void> {
    await this.octokit.request('DELETE /repos/{owner}/{repo}', {
      owner: options.owner,
      repo: options.repo,
    })
  }

  private async getSponsorshipsEnabled(options: RepositoryOptions): Promise<boolean | null> {
    try {
      const response = await this.octokit.graphql<SponsorshipsResponse>(sponsorshipsQuery, {
        owner: options.owner,
        repo: options.repo,
      })
      const enabled = response.repository?.hasSponsorshipsEnabled
      return typeof enabled === 'boolean' ? enabled : null
    } catch {
      return null
    }
  }

  private async getImmutableReleases(options: RepositoryOptions): Promise<boolean | null> {
    try {
      await this.octokit.request('GET /repos/{owner}/{repo}/immutable-releases', {
        owner: options.owner,
        repo: options.repo,
      })
      return true
    } catch (error) {
      if ((error as { status?: number }).status === 404) return false
      return null
    }
  }
}

function normalizeEnum<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | null {
  return allowed.includes(value as T) ? (value as T) : null
}
