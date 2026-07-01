import { describe, expect, it, vi } from 'vitest'
import type { GitHubOctokit } from '../transport'
import { InboxApi, notificationHtmlUrl, parseSubjectNumber } from './inbox'

function createApi(notifications: unknown[]) {
  const listNotificationsForAuthenticatedUser = vi.fn()
  const paginate = vi.fn().mockResolvedValue(notifications)
  const api = new InboxApi({
    paginate,
    rest: {
      activity: { listNotificationsForAuthenticatedUser },
    },
  } as unknown as GitHubOctokit)

  return { api, paginate, listNotificationsForAuthenticatedUser }
}

const pullRequestNotification = {
  id: '42',
  unread: true,
  reason: 'review_requested',
  updated_at: '2026-06-30T10:00:00Z',
  subject: {
    title: 'Add inbox page',
    type: 'PullRequest',
    url: 'https://api.github.com/repos/acme/widgets/pulls/7',
    latest_comment_url: null,
  },
  repository: { full_name: 'acme/widgets', html_url: 'https://github.com/acme/widgets' },
}

describe('notificationHtmlUrl', () => {
  it('maps pull request subject urls to github.com pull links', () => {
    expect(
      notificationHtmlUrl('https://api.github.com/repos/acme/widgets/pulls/7', 'https://github.com/acme/widgets'),
    ).toBe('https://github.com/acme/widgets/pull/7')
  })

  it('keeps issue subject urls as issues', () => {
    expect(
      notificationHtmlUrl('https://api.github.com/repos/acme/widgets/issues/9', 'https://github.com/acme/widgets'),
    ).toBe('https://github.com/acme/widgets/issues/9')
  })

  it('maps commit subject urls to github.com commit links', () => {
    expect(
      notificationHtmlUrl('https://api.github.com/repos/acme/widgets/commits/abc123', 'https://github.com/acme/widgets'),
    ).toBe('https://github.com/acme/widgets/commit/abc123')
  })

  it('falls back to the repository html url for unknown or missing subject urls', () => {
    expect(notificationHtmlUrl(null, 'https://github.com/acme/widgets')).toBe('https://github.com/acme/widgets')
    expect(
      notificationHtmlUrl('https://api.github.com/repos/acme/widgets/releases/5', 'https://github.com/acme/widgets'),
    ).toBe('https://github.com/acme/widgets')
  })
})

describe('parseSubjectNumber', () => {
  it('extracts the number from pull and issue urls', () => {
    expect(parseSubjectNumber('https://api.github.com/repos/acme/widgets/pulls/7')).toBe(7)
    expect(parseSubjectNumber('https://api.github.com/repos/acme/widgets/issues/9')).toBe(9)
  })

  it('returns undefined for non-numbered urls', () => {
    expect(parseSubjectNumber(undefined)).toBeUndefined()
    expect(parseSubjectNumber('https://api.github.com/repos/acme/widgets/commits/abc123')).toBeUndefined()
  })
})

describe('InboxApi.listInboxNotifications', () => {
  it('maps notification threads into GitHubNotification objects', async () => {
    const { api } = createApi([pullRequestNotification])
    const [notification] = await api.listInboxNotifications()

    expect(notification).toEqual({
      id: '42',
      unread: true,
      reason: 'review_requested',
      updatedAt: '2026-06-30T10:00:00Z',
      subjectType: 'PullRequest',
      subjectTitle: 'Add inbox page',
      repositoryFullName: 'acme/widgets',
      repositoryHtmlUrl: 'https://github.com/acme/widgets',
      number: 7,
      htmlUrl: 'https://github.com/acme/widgets/pull/7',
    })
  })

  it('passes all and participating options through to paginate', async () => {
    const { api, paginate, listNotificationsForAuthenticatedUser } = createApi([])
    await api.listInboxNotifications({ all: true, participating: true, limit: 10 })

    expect(paginate).toHaveBeenCalledWith(listNotificationsForAuthenticatedUser, {
      all: true,
      participating: true,
      per_page: 10,
    })
  })
})
