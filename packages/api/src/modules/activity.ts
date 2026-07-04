import type { GitHubOctokit } from '../transport'

export interface ListReceivedEventsOptions {
  username: string
  page?: number
  perPage?: number
}

export interface GitHubFeedEventActor {
  login: string
  avatarUrl: string | null
}

export type GitHubFeedEventPayload =
  | { kind: 'star' }
  | { kind: 'fork'; forkFullName: string | null }
  | { kind: 'create'; refType: 'repository' | 'branch' | 'tag'; ref: string | null }
  | { kind: 'delete'; refType: 'branch' | 'tag'; ref: string }
  | { kind: 'push'; branch: string; commitCount: number }
  | { kind: 'release'; tagName: string; releaseName: string | null }
  | { kind: 'public' }
  | { kind: 'member'; memberLogin: string | null }
  | { kind: 'issue'; action: string; number: number; title: string }
  | { kind: 'issue-comment'; number: number | null; title: string; isPullRequest: boolean }
  | { kind: 'pull-request'; action: string; number: number; title: string; merged: boolean }
  | { kind: 'pull-request-review'; number: number | null; title: string }
  | { kind: 'pull-request-review-comment'; number: number | null; title: string }
  | { kind: 'commit-comment'; commitSha: string | null }
  | { kind: 'discussion'; title: string | null }
  | { kind: 'wiki'; pageCount: number }
  | { kind: 'sponsorship' }
  | { kind: 'unknown'; type: string }

export interface GitHubFeedEvent {
  id: string
  type: string
  actor: GitHubFeedEventActor
  repoFullName: string
  createdAt: string
  payload: GitHubFeedEventPayload
}

export interface GitHubFeedEventPage {
  events: GitHubFeedEvent[]
  page: number
  hasMore: boolean
}

// received_events 上限 300 条（30 天），per_page=100 时最多 3 页
const MAX_FEED_PAGE = 3

interface RawFeedEvent {
  id: string
  type: string | null
  actor: { login: string; avatar_url?: string | null }
  repo: { name: string }
  payload: Record<string, any> | null
  created_at: string | null
}

export class ActivityApi {
  constructor(private readonly octokit: GitHubOctokit) {}

  async listReceivedEvents(options: ListReceivedEventsOptions): Promise<GitHubFeedEventPage> {
    const page = options.page ?? 1
    const perPage = options.perPage ?? 100
    const response = await this.octokit.rest.activity.listReceivedEventsForUser({
      username: options.username,
      per_page: perPage,
      page,
    })

    return {
      events: (response.data as unknown as RawFeedEvent[]).map(normalizeFeedEvent),
      page,
      hasMore: hasNextPage(response.headers.link) && page < MAX_FEED_PAGE,
    }
  }
}

export function normalizeFeedEvent(raw: RawFeedEvent): GitHubFeedEvent {
  return {
    id: raw.id,
    type: raw.type ?? 'UnknownEvent',
    actor: {
      login: raw.actor.login,
      avatarUrl: raw.actor.avatar_url ?? null,
    },
    repoFullName: raw.repo.name,
    createdAt: raw.created_at ?? '',
    payload: normalizeFeedEventPayload(raw.type, raw.payload ?? {}),
  }
}

function normalizeFeedEventPayload(
  type: string | null,
  payload: Record<string, any>,
): GitHubFeedEventPayload {
  switch (type) {
    case 'WatchEvent':
      return { kind: 'star' }
    case 'ForkEvent':
      return { kind: 'fork', forkFullName: payload.forkee?.full_name ?? null }
    case 'CreateEvent': {
      const refType = payload.ref_type === 'branch' || payload.ref_type === 'tag'
        ? payload.ref_type
        : 'repository'
      return { kind: 'create', refType, ref: payload.ref ?? null }
    }
    case 'DeleteEvent':
      return {
        kind: 'delete',
        refType: payload.ref_type === 'tag' ? 'tag' : 'branch',
        ref: String(payload.ref ?? ''),
      }
    case 'PushEvent':
      return {
        kind: 'push',
        branch: String(payload.ref ?? '').replace(/^refs\/heads\//, ''),
        commitCount: typeof payload.size === 'number' ? payload.size : (payload.commits?.length ?? 0),
      }
    case 'ReleaseEvent':
      return {
        kind: 'release',
        tagName: String(payload.release?.tag_name ?? ''),
        releaseName: payload.release?.name ?? null,
      }
    case 'PublicEvent':
      return { kind: 'public' }
    case 'MemberEvent':
      return { kind: 'member', memberLogin: payload.member?.login ?? null }
    case 'IssuesEvent':
      return {
        kind: 'issue',
        action: String(payload.action ?? ''),
        number: Number(payload.issue?.number ?? 0),
        title: String(payload.issue?.title ?? ''),
      }
    case 'IssueCommentEvent':
      return {
        kind: 'issue-comment',
        number: payload.issue?.number ?? null,
        title: String(payload.issue?.title ?? ''),
        isPullRequest: Boolean(payload.issue?.pull_request),
      }
    case 'PullRequestEvent':
      return {
        kind: 'pull-request',
        action: String(payload.action ?? ''),
        number: Number(payload.pull_request?.number ?? payload.number ?? 0),
        title: String(payload.pull_request?.title ?? ''),
        merged: Boolean(payload.pull_request?.merged),
      }
    case 'PullRequestReviewEvent':
      return {
        kind: 'pull-request-review',
        number: payload.pull_request?.number ?? null,
        title: String(payload.pull_request?.title ?? ''),
      }
    case 'PullRequestReviewCommentEvent':
      return {
        kind: 'pull-request-review-comment',
        number: payload.pull_request?.number ?? null,
        title: String(payload.pull_request?.title ?? ''),
      }
    case 'CommitCommentEvent':
      return { kind: 'commit-comment', commitSha: payload.comment?.commit_id ?? null }
    case 'DiscussionEvent':
      return { kind: 'discussion', title: payload.discussion?.title ?? null }
    case 'GollumEvent':
      return { kind: 'wiki', pageCount: Array.isArray(payload.pages) ? payload.pages.length : 0 }
    case 'SponsorshipEvent':
      return { kind: 'sponsorship' }
    default:
      return { kind: 'unknown', type: type ?? 'UnknownEvent' }
  }
}

function hasNextPage(link: string | undefined): boolean {
  return Boolean(link?.includes('rel="next"'))
}
