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
  const graphql = vi.fn().mockResolvedValue({
    markPullRequestReadyForReview: {
      pullRequest: {
        id: 'PR_kwDOExample',
      },
    },
  })
  const api = new PullsApi({
    graphql,
    rest: {
      issues: {
        update: updateIssue,
        updateComment,
      },
      pulls: {
        merge,
      },
    },
  } as unknown as GitHubOctokit)

  return { api, updateIssue, merge, updateComment, graphql }
}
