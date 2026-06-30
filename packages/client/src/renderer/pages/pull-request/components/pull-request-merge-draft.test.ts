import { describe, expect, it } from 'vitest'
import { createPullRequestMergeDraft } from './pull-request-merge-draft'

describe('createPullRequestMergeDraft', () => {
  it('uses the GitHub-style squash title and pull request body', () => {
    expect(createPullRequestMergeDraft({
      method: 'squash',
      number: 726,
      title: 'docs(skill): component system is not modelling clay + import audit',
      body: 'Two anti-patterns surfaced.',
      headBranch: 'docs/memoh-web-skill-clay-import',
    })).toEqual({
      title: 'docs(skill): component system is not modelling clay + import audit (#726)',
      message: 'Two anti-patterns surfaced.',
    })
  })

  it('uses a merge commit title with the head branch', () => {
    expect(createPullRequestMergeDraft({
      method: 'merge',
      number: 726,
      title: 'docs(skill): component system is not modelling clay + import audit',
      body: 'Two anti-patterns surfaced.',
      headBranch: 'docs/memoh-web-skill-clay-import',
    })).toEqual({
      title: 'Merge pull request #726 from docs/memoh-web-skill-clay-import',
      message: 'docs(skill): component system is not modelling clay + import audit\n\nTwo anti-patterns surfaced.',
    })
  })
})
