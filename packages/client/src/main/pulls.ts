import {
  createGitHubApi,
  type CreatePullRequestCommentOptions,
  type GetPullRequestDetailOptions,
  type GitHubPullRequestCategory,
  type GitHubPullRequestSearchState,
  type SearchRepositoryPullRequestsOptions,
} from '@oh-my-github/api'
import { ipcMain } from 'electron'
import { getAuthenticatedAccessToken } from './auth'
import { resolveGitHubProxyUrl } from './proxy'

export function registerPullsIpc(): void {
  ipcMain.handle('pulls:list-category', (_event, category: GitHubPullRequestCategory) =>
    listPullRequestCategory(category)
  )
  ipcMain.handle('pulls:list-viewer', () => listViewerPullRequests())
  ipcMain.handle('pulls:list-repository', (_event, owner: string, repo: string) =>
    listRepositoryPullRequests(owner, repo)
  )
  ipcMain.handle('pulls:search-repository', (_event, options: SearchRepositoryPullRequestsOptions) =>
    searchRepositoryPullRequests(options)
  )
  ipcMain.handle('pulls:get-detail', (_event, owner: string, repo: string, number: number) =>
    getPullRequestDetail(owner, repo, number)
  )
  ipcMain.handle('pulls:create-comment', (_event, owner: string, repo: string, number: number, body: string) =>
    createPullRequestComment(owner, repo, number, body)
  )
}

async function listPullRequestCategory(category: GitHubPullRequestCategory) {
  if (!isPullRequestCategory(category)) {
    throw new Error('Unknown pull request category')
  }

  const api = await createAuthenticatedGitHubApi()

  return api.pulls.listPullRequestCategory({ category })
}

async function listViewerPullRequests() {
  const api = await createAuthenticatedGitHubApi()

  return api.pulls.listViewerPullRequests()
}

function isPullRequestCategory(value: string): value is GitHubPullRequestCategory {
  return value === 'created-by-me'
    || value === 'needs-review'
    || value === 'inbox'
    || value === 'mentioned-me'
}

async function listRepositoryPullRequests(owner: string, repo: string) {
  const normalizedOwner = owner.trim()
  const normalizedRepo = repo.trim()

  if (!normalizedOwner || !normalizedRepo) {
    throw new Error('Repository owner and name are required')
  }

  const api = await createAuthenticatedGitHubApi()

  return api.pulls.listRepositoryPullRequests({
    owner: normalizedOwner,
    repo: normalizedRepo
  })
}

async function searchRepositoryPullRequests(options: SearchRepositoryPullRequestsOptions) {
  const normalizedOptions = normalizeSearchRepositoryPullRequestsOptions(options)
  const api = await createAuthenticatedGitHubApi()

  return api.pulls.searchRepositoryPullRequests(normalizedOptions)
}

async function getPullRequestDetail(owner: string, repo: string, number: number) {
  const normalizedOptions = normalizePullRequestDetailOptions({ owner, repo, number })
  const api = await createAuthenticatedGitHubApi()

  return api.pulls.getPullRequestDetail(normalizedOptions)
}

async function createPullRequestComment(owner: string, repo: string, number: number, body: string) {
  const normalizedOptions = normalizePullRequestCommentOptions({ owner, repo, number, body })
  const api = await createAuthenticatedGitHubApi()

  return api.pulls.createPullRequestComment(normalizedOptions)
}

function normalizeSearchRepositoryPullRequestsOptions(
  options: SearchRepositoryPullRequestsOptions
): SearchRepositoryPullRequestsOptions {
  const normalizedOwner = options.owner.trim()
  const normalizedRepo = options.repo.trim()

  if (!normalizedOwner || !normalizedRepo) {
    throw new Error('Repository owner and name are required')
  }

  return {
    owner: normalizedOwner,
    repo: normalizedRepo,
    state: normalizePullRequestSearchState(options.state),
    search: typeof options.search === 'string' ? options.search.trim() : '',
    page: normalizePositiveInteger(options.page, 1),
    perPage: normalizePositiveInteger(options.perPage, 20),
  }
}

function normalizePullRequestSearchState(
  state: GitHubPullRequestSearchState | undefined
): GitHubPullRequestSearchState {
  if (state === 'closed' || state === 'all') return state

  return 'open'
}

function normalizePullRequestDetailOptions(options: GetPullRequestDetailOptions): GetPullRequestDetailOptions {
  const normalizedOwner = options.owner.trim()
  const normalizedRepo = options.repo.trim()

  if (!normalizedOwner || !normalizedRepo) {
    throw new Error('Repository owner and name are required')
  }

  return {
    owner: normalizedOwner,
    repo: normalizedRepo,
    number: normalizePullRequestNumber(options.number)
  }
}

function normalizePullRequestCommentOptions(
  options: CreatePullRequestCommentOptions
): CreatePullRequestCommentOptions {
  const body = options.body.trim()

  if (!body) {
    throw new Error('Comment body is required')
  }

  return {
    ...normalizePullRequestDetailOptions(options),
    body
  }
}

function normalizePullRequestNumber(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('Pull request number must be a positive integer')
  }

  return value
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback

  return Math.max(1, Math.round(value))
}

async function createAuthenticatedGitHubApi() {
  return createGitHubApi({
    token: getAuthenticatedAccessToken(),
    proxyUrl: await resolveGitHubProxyUrl()
  })
}
