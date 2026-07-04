import type { GitHubOctokit } from '../transport'
import type { GitHubRepositoryAutolink, RepositoryOptions } from '../types'

export class RepositorySettingsIntegrationsApi {
  constructor(private readonly octokit: GitHubOctokit) {}

  async listAutolinks(options: RepositoryOptions): Promise<GitHubRepositoryAutolink[]> {
    const response = await this.octokit.request('GET /repos/{owner}/{repo}/autolinks', {
      owner: options.owner,
      repo: options.repo,
    })

    return ((response.data ?? []) as Array<{
      id?: number
      key_prefix?: string | null
      url_template?: string | null
      is_alphanumeric?: boolean | null
    }>).map((autolink) => ({
      id: autolink.id ?? 0,
      keyPrefix: autolink.key_prefix ?? '',
      urlTemplate: autolink.url_template ?? '',
      isAlphanumeric: Boolean(autolink.is_alphanumeric),
    }))
  }

  async createAutolink(
    options: RepositoryOptions & { keyPrefix: string; urlTemplate: string; isAlphanumeric: boolean },
  ): Promise<void> {
    await this.octokit.request('POST /repos/{owner}/{repo}/autolinks', {
      owner: options.owner,
      repo: options.repo,
      key_prefix: options.keyPrefix,
      url_template: options.urlTemplate,
      is_alphanumeric: options.isAlphanumeric,
    })
  }

  async deleteAutolink(options: RepositoryOptions & { autolinkId: number }): Promise<void> {
    await this.octokit.request('DELETE /repos/{owner}/{repo}/autolinks/{autolink_id}', {
      owner: options.owner,
      repo: options.repo,
      autolink_id: options.autolinkId,
    })
  }
}
