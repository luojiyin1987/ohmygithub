export interface PullRequestMergeDraftInput {
  method: GitHubPullRequestMergeMethod
  number: number
  title: string
  body: string | null | undefined
  headBranch: string | null | undefined
}

export interface PullRequestMergeDraft {
  title: string
  message: string
}

export function createPullRequestMergeDraft(input: PullRequestMergeDraftInput): PullRequestMergeDraft {
  const pullRequestTitle = input.title.trim()
  const pullRequestBody = (input.body ?? '').trim()

  if (input.method === 'merge') {
    const branch = input.headBranch?.trim()
    const title = branch
      ? `Merge pull request #${input.number} from ${branch}`
      : `Merge pull request #${input.number}`
    const message = [pullRequestTitle, pullRequestBody].filter(Boolean).join('\n\n')

    return { title, message }
  }

  return {
    title: `${pullRequestTitle} (#${input.number})`,
    message: pullRequestBody,
  }
}
