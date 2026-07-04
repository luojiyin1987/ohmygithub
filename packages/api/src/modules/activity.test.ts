import { describe, expect, it, vi } from 'vitest'
import type { GitHubOctokit } from '../transport'
import { ActivityApi, normalizeFeedEvent } from './activity'

function createApi(events: unknown[], linkHeader?: string) {
  const listReceivedEventsForUser = vi.fn().mockResolvedValue({
    data: events,
    headers: linkHeader ? { link: linkHeader } : {},
  })
  const api = new ActivityApi({
    rest: { activity: { listReceivedEventsForUser } },
  } as unknown as GitHubOctokit)

  return { api, listReceivedEventsForUser }
}

const NEXT_LINK = '<https://api.github.com/user/1/received_events?page=2>; rel="next"'

function rawEvent(type: string, payload: Record<string, unknown>) {
  return {
    id: '1000',
    type,
    actor: { login: 'antfu', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
    repo: { name: 'vitejs/vite' },
    payload,
    created_at: '2026-07-04T10:00:00Z',
  }
}

describe('ActivityApi.listReceivedEvents', () => {
  it('passes username, per_page and page to octokit', async () => {
    const { api, listReceivedEventsForUser } = createApi([])
    await api.listReceivedEvents({ username: 'acbox', page: 2, perPage: 50 })

    expect(listReceivedEventsForUser).toHaveBeenCalledWith({
      username: 'acbox',
      per_page: 50,
      page: 2,
    })
  })

  it('defaults to page 1 with per_page 100', async () => {
    const { api, listReceivedEventsForUser } = createApi([])
    await api.listReceivedEvents({ username: 'acbox' })

    expect(listReceivedEventsForUser).toHaveBeenCalledWith({
      username: 'acbox',
      per_page: 100,
      page: 1,
    })
  })

  it('reports hasMore from the Link header rel="next"', async () => {
    const withNext = createApi([], NEXT_LINK)
    expect((await withNext.api.listReceivedEvents({ username: 'acbox' })).hasMore).toBe(true)

    const withoutNext = createApi([])
    expect((await withoutNext.api.listReceivedEvents({ username: 'acbox' })).hasMore).toBe(false)
  })

  it('caps hasMore at page 3 (API hard limit of 300 events)', async () => {
    const { api } = createApi([], NEXT_LINK)
    expect((await api.listReceivedEvents({ username: 'acbox', page: 3 })).hasMore).toBe(false)
  })
})

describe('normalizeFeedEvent', () => {
  it('normalizes a WatchEvent into a star payload', () => {
    expect(normalizeFeedEvent(rawEvent('WatchEvent', { action: 'started' }))).toEqual({
      id: '1000',
      type: 'WatchEvent',
      actor: { login: 'antfu', avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4' },
      repoFullName: 'vitejs/vite',
      createdAt: '2026-07-04T10:00:00Z',
      payload: { kind: 'star' },
    })
  })

  it('keeps the forkee full name for ForkEvent', () => {
    const event = normalizeFeedEvent(rawEvent('ForkEvent', { forkee: { full_name: 'antfu/vite' } }))
    expect(event.payload).toEqual({ kind: 'fork', forkFullName: 'antfu/vite' })
  })

  it('strips refs/heads/ from PushEvent and uses size as commit count', () => {
    const event = normalizeFeedEvent(rawEvent('PushEvent', { ref: 'refs/heads/main', size: 3 }))
    expect(event.payload).toEqual({ kind: 'push', branch: 'main', commitCount: 3 })
  })

  it('normalizes CreateEvent branch and repository variants', () => {
    expect(normalizeFeedEvent(rawEvent('CreateEvent', { ref_type: 'branch', ref: 'feat/x' })).payload)
      .toEqual({ kind: 'create', refType: 'branch', ref: 'feat/x' })
    expect(normalizeFeedEvent(rawEvent('CreateEvent', { ref_type: 'repository', ref: null })).payload)
      .toEqual({ kind: 'create', refType: 'repository', ref: null })
  })

  it('normalizes ReleaseEvent tag and name', () => {
    const event = normalizeFeedEvent(rawEvent('ReleaseEvent', { release: { tag_name: 'v3.2.0', name: 'vitest v3.2.0' } }))
    expect(event.payload).toEqual({ kind: 'release', tagName: 'v3.2.0', releaseName: 'vitest v3.2.0' })
  })

  it('flags IssueCommentEvent on pull requests', () => {
    const event = normalizeFeedEvent(rawEvent('IssueCommentEvent', {
      issue: { number: 7, title: 'Fix bug', pull_request: { url: 'x' } },
    }))
    expect(event.payload).toEqual({ kind: 'issue-comment', number: 7, title: 'Fix bug', isPullRequest: true })
  })

  it('keeps merged flag for closed PullRequestEvent', () => {
    const event = normalizeFeedEvent(rawEvent('PullRequestEvent', {
      action: 'closed',
      pull_request: { number: 9, title: 'Add feed', merged: true },
    }))
    expect(event.payload).toEqual({ kind: 'pull-request', action: 'closed', number: 9, title: 'Add feed', merged: true })
  })

  it('falls back to unknown payloads for unrecognized event types', () => {
    const event = normalizeFeedEvent(rawEvent('SomeNewEvent', {}))
    expect(event.payload).toEqual({ kind: 'unknown', type: 'SomeNewEvent' })
  })
})
