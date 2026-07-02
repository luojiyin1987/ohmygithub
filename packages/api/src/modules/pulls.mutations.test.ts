import { describe, expect, it, vi } from 'vitest'
import type { GitHubOctokit } from '../transport'
import { PullsApi, resolvePullRequestMergeMethods } from './pulls'

describe('PullsApi mutations', () => {
  it('closes a pull request through the issues endpoint', async () => {
    const { api, updateIssue } = createApi()

    await api.closePullRequest({
      owner: 'octo-org',
      repo: 'hello-world',
      number: 24,
    })

    expect(updateIssue).toHaveBeenCalledWith({
      owner: 'octo-org',
      repo: 'hello-world',
      issue_number: 24,
      state: 'closed',
    })
  })

  it('merges with the selected method and expected head sha', async () => {
    const { api, merge } = createApi()

    await api.mergePullRequest({
      owner: 'octo-org',
      repo: 'hello-world',
      number: 24,
      method: 'squash',
      expectedHeadSha: 'abc123',
      commitTitle: 'Squash title',
      commitMessage: 'Squash body',
    })

    expect(merge).toHaveBeenCalledWith({
      owner: 'octo-org',
      repo: 'hello-world',
      pull_number: 24,
      merge_method: 'squash',
      sha: 'abc123',
      commit_title: 'Squash title',
      commit_message: 'Squash body',
    })
  })

  it('updates pull request comments by numeric id', async () => {
    const { api, updateComment } = createApi()

    await api.updatePullRequestComment({
      owner: 'octo-org',
      repo: 'hello-world',
      commentId: 'pull-request-comment:987654',
      body: 'Edited comment',
    })

    expect(updateComment).toHaveBeenCalledWith({
      owner: 'octo-org',
      repo: 'hello-world',
      comment_id: 987654,
      body: 'Edited comment',
    })
  })

  it('marks a draft pull request ready for review by node id', async () => {
    const { api, graphql } = createApi()

    await api.markPullRequestReadyForReview({
      owner: 'octo-org',
      repo: 'hello-world',
      number: 24,
      id: 'PR_kwDOExample',
    })

    expect(graphql).toHaveBeenCalledWith(expect.stringContaining('markPullRequestReadyForReview'), {
      pullRequestId: 'PR_kwDOExample',
    })
  })

  it('marks a draft pull request ready for review from a local display id', async () => {
    const { api, graphql } = createApi()

    await api.markPullRequestReadyForReview({
      owner: 'octo-org',
      repo: 'hello-world',
      number: 24,
      id: 'pull-request:PR_kwDOExample',
    })

    expect(graphql).toHaveBeenCalledWith(expect.stringContaining('markPullRequestReadyForReview'), {
      pullRequestId: 'PR_kwDOExample',
    })
  })

  it('submits a review with the event and body', async () => {
    const { api, createReview } = createApi()

    await api.submitPullRequestReview({
      owner: 'octo-org',
      repo: 'hello-world',
      number: 24,
      event: 'REQUEST_CHANGES',
      body: 'needs work',
    })

    expect(createReview).toHaveBeenCalledWith({
      owner: 'octo-org',
      repo: 'hello-world',
      pull_number: 24,
      event: 'REQUEST_CHANGES',
      body: 'needs work',
    })
  })

  it('submits an approval without a body', async () => {
    const { api, createReview } = createApi()

    await api.submitPullRequestReview({
      owner: 'octo-org',
      repo: 'hello-world',
      number: 24,
      event: 'APPROVE',
    })

    expect(createReview).toHaveBeenCalledWith({
      owner: 'octo-org',
      repo: 'hello-world',
      pull_number: 24,
      event: 'APPROVE',
    })
  })

  it('lists pull request commits with pagination flags', async () => {
    const { api, listCommits } = createApi()
    listCommits.mockResolvedValue({
      data: [
        {
          sha: 'abc1234000000000000000000000000000000000',
          html_url: 'https://github.com/octo-org/hello-world/commit/abc1234',
          commit: {
            message: 'First line\nBody',
            author: { name: 'The Octocat', date: '2026-01-01T00:00:00Z' },
            committer: { name: 'The Octocat', date: '2026-01-02T00:00:00Z' },
          },
          author: { login: 'octocat', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
        },
      ],
    })

    const result = await api.listPullRequestCommits({
      owner: 'octo-org',
      repo: 'hello-world',
      number: 24,
      page: 2,
      perPage: 30,
    })

    expect(listCommits).toHaveBeenCalledWith({
      owner: 'octo-org',
      repo: 'hello-world',
      pull_number: 24,
      page: 2,
      per_page: 30,
    })
    expect(result.page).toBe(2)
    expect(result.hasPreviousPage).toBe(true)
    expect(result.hasNextPage).toBe(false)
    expect(result.items).toEqual([
      {
        sha: 'abc1234000000000000000000000000000000000',
        shortSha: 'abc1234',
        message: 'First line\nBody',
        headline: 'First line',
        author: {
          login: 'octocat',
          name: 'The Octocat',
          avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
        },
        committedDate: '2026-01-02T00:00:00Z',
        htmlUrl: 'https://github.com/octo-org/hello-world/commit/abc1234',
        ciState: null,
      },
    ])
  })

  it('lists pull request files with normalized statuses', async () => {
    const { api, paginate, listFiles } = createApi()
    paginate.mockResolvedValue([
      {
        filename: 'src/renamed.ts',
        previous_filename: 'src/old.ts',
        status: 'renamed',
        additions: 1,
        deletions: 2,
        patch: '@@ -1 +1 @@',
      },
      {
        filename: 'src/unknown.ts',
        status: 'copied',
        additions: 3,
        deletions: 0,
      },
      {
        status: 'modified',
      },
    ])

    const files = await api.listPullRequestFiles({
      owner: 'octo-org',
      repo: 'hello-world',
      number: 24,
    })

    expect(paginate).toHaveBeenCalledWith(listFiles, {
      owner: 'octo-org',
      repo: 'hello-world',
      pull_number: 24,
      per_page: 100,
    })
    expect(files).toEqual([
      {
        filename: 'src/renamed.ts',
        previousFilename: 'src/old.ts',
        status: 'renamed',
        additions: 1,
        deletions: 2,
        patch: '@@ -1 +1 @@',
      },
      {
        filename: 'src/unknown.ts',
        previousFilename: undefined,
        status: 'modified',
        additions: 3,
        deletions: 0,
        patch: undefined,
      },
    ])
  })
})

describe('resolvePullRequestMergeMethods', () => {
  it('keeps only repository-allowed methods and chooses the viewer default', () => {
    expect(resolvePullRequestMergeMethods({
      mergeCommitAllowed: true,
      squashMergeAllowed: true,
      rebaseMergeAllowed: false,
      viewerDefaultMergeMethod: 'merge',
    })).toEqual({
      methods: ['merge', 'squash'],
      defaultMethod: 'merge',
    })
  })

  it('falls back to squash, merge, then rebase when viewer default is unavailable', () => {
    expect(resolvePullRequestMergeMethods({
      mergeCommitAllowed: true,
      squashMergeAllowed: false,
      rebaseMergeAllowed: true,
      viewerDefaultMergeMethod: 'squash',
    })).toEqual({
      methods: ['merge', 'rebase'],
      defaultMethod: 'merge',
    })
  })
})

describe('PullsApi detail mapping', () => {
  it('keeps the GraphQL node id separately from the local display id', async () => {
    const graphql = vi.fn().mockResolvedValue({
      repository: {
        pullRequest: {
          id: 'PR_kwDOExample',
          title: 'Draft pull request',
          number: 24,
          state: 'OPEN',
          url: 'https://github.com/octo-org/hello-world/pull/24',
          updatedAt: '2026-06-30T10:00:00Z',
          createdAt: '2026-06-30T09:00:00Z',
          isDraft: true,
          merged: false,
          author: {
            login: 'octocat',
            avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
          },
          repository: {
            nameWithOwner: 'octo-org/hello-world',
          },
          body: 'Draft body',
          additions: 10,
          deletions: 2,
          changedFiles: 3,
          baseRefName: 'main',
          headRefName: 'feature',
          isCrossRepository: false,
          maintainerCanModify: true,
        },
        mergeCommitAllowed: true,
        squashMergeAllowed: true,
        rebaseMergeAllowed: true,
        viewerDefaultMergeMethod: 'SQUASH',
      },
    })
    const api = new PullsApi({ graphql } as unknown as GitHubOctokit)

    const detail = await api.getPullRequestDetail({
      owner: 'octo-org',
      repo: 'hello-world',
      number: 24,
    })

    expect(detail.id).toBe('pull-request:PR_kwDOExample')
    expect((detail as { nodeId?: string }).nodeId).toBe('PR_kwDOExample')
  })
})

function createApi() {
  const updateIssue = vi.fn().mockResolvedValue({ data: {} })
  const merge = vi.fn().mockResolvedValue({ data: {} })
  const updateComment = vi.fn().mockResolvedValue({ data: {} })
  const createReview = vi.fn().mockResolvedValue({ data: {} })
  const listCommits = vi.fn().mockResolvedValue({ data: [] })
  const listFiles = vi.fn()
  const paginate = vi.fn().mockResolvedValue([])
  const graphql = vi.fn().mockResolvedValue({
    markPullRequestReadyForReview: {
      pullRequest: {
        id: 'PR_kwDOExample',
      },
    },
  })
  const api = new PullsApi({
    graphql,
    paginate,
    rest: {
      issues: {
        update: updateIssue,
        updateComment,
      },
      pulls: {
        merge,
        createReview,
        listCommits,
        listFiles,
      },
    },
  } as unknown as GitHubOctokit)

  return { api, updateIssue, merge, updateComment, createReview, listCommits, listFiles, paginate, graphql }
}
