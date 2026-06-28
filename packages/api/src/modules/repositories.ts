import { RequestError, type GitHubOctokit } from '../transport'
import type {
  GitHubRepositoryViewerState,
  RepositoryOptions,
  SetRepositoryStarredOptions,
  SetRepositoryWatchingOptions,
} from '../types'

export class RepositoriesApi {
  constructor(private readonly octokit: GitHubOctokit) {}

  async getViewerState(options: RepositoryOptions): Promise<GitHubRepositoryViewerState> {
    const [isStarred, isWatching, starCount] = await Promise.all([
      this.isRepositoryStarred(options),
      this.isRepositoryWatching(options),
      this.getRepositoryStarCount(options),
    ])

    return {
      isStarred,
      isWatching,
      starCount,
    }
  }

  async setStarred(options: SetRepositoryStarredOptions): Promise<void> {
    if (options.starred) {
      await this.octokit.request('PUT /user/starred/{owner}/{repo}', {
        owner: options.owner,
        repo: options.repo,
      })
      return
    }

    await this.octokit.request('DELETE /user/starred/{owner}/{repo}', {
      owner: options.owner,
      repo: options.repo,
    })
  }

  async setWatching(options: SetRepositoryWatchingOptions): Promise<void> {
    if (options.watching) {
      await this.octokit.request('PUT /repos/{owner}/{repo}/subscription', {
        owner: options.owner,
        repo: options.repo,
        subscribed: true,
        ignored: false,
      })
      return
    }

    await this.octokit.request('DELETE /repos/{owner}/{repo}/subscription', {
      owner: options.owner,
      repo: options.repo,
    })
  }

  private async isRepositoryStarred(options: RepositoryOptions): Promise<boolean> {
    try {
      await this.octokit.request('GET /user/starred/{owner}/{repo}', {
        owner: options.owner,
        repo: options.repo,
      })
      return true
    } catch (error) {
      if (isNotFoundError(error)) return false
      throw error
    }
  }

  private async isRepositoryWatching(options: RepositoryOptions): Promise<boolean> {
    try {
      const response = await this.octokit.request('GET /repos/{owner}/{repo}/subscription', {
        owner: options.owner,
        repo: options.repo,
      })
      const subscription = response.data as { subscribed?: boolean }

      return Boolean(subscription.subscribed)
    } catch (error) {
      if (isNotFoundError(error)) return false
      throw error
    }
  }

  private async getRepositoryStarCount(options: RepositoryOptions): Promise<number> {
    const response = await this.octokit.request('GET /repos/{owner}/{repo}', {
      owner: options.owner,
      repo: options.repo,
    })
    const repository = response.data as { stargazers_count?: number }

    return repository.stargazers_count ?? 0
  }
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof RequestError && error.status === 404
}
