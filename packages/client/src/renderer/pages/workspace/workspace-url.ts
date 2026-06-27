import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { WorkspaceTab, WorkspaceTabType } from './types'

export const DEFAULT_WORKSPACE_URL = '/inbox'

const INTERNAL_TYPES = new Set<WorkspaceTabType>(['inbox', 'reviews', 'activity'])
const VALID_TYPES = new Set<WorkspaceTabType>([
  'inbox',
  'reviews',
  'activity',
  'draft',
  'account',
  'org',
  'repo',
])

export function isWorkspaceTabType(value: string): value is WorkspaceTabType {
  return VALID_TYPES.has(value as WorkspaceTabType)
}

export function routeToWorkspaceUrl(route: RouteLocationNormalizedLoaded): string {
  const path = normalizeWorkspacePath(route.path)
  if (path === '/') return path

  const type = typeof route.query.type === 'string' ? route.query.type : ''
  if (!type || isReservedInternalPath(path)) return path
  if (!isWorkspaceTabType(type)) return path

  return `${path}?type=${encodeURIComponent(type)}`
}

export function createWorkspaceTabFromUrl(url: string): WorkspaceTab {
  const parsed = parseWorkspaceUrl(url)
  return {
    ...parsed,
    title: titleForWorkspaceTab(parsed),
  }
}

export function normalizeWorkspaceUrl(url: string): string {
  const [rawPath, rawSearch = ''] = url.split('?')
  const path = normalizeWorkspacePath(rawPath)
  const search = new URLSearchParams(rawSearch)
  const type = search.get('type')

  if (type !== 'org' || isReservedInternalPath(path)) {
    return path
  }

  return `${path}?type=org`
}

export function isReservedInternalPath(path: string): boolean {
  const [firstSegment] = normalizeWorkspacePath(path).split('/').filter(Boolean)
  return firstSegment === 'draft' || INTERNAL_TYPES.has(firstSegment as WorkspaceTabType)
}

function parseWorkspaceUrl(url: string): Omit<WorkspaceTab, 'title'> {
  const normalizedUrl = normalizeWorkspaceUrl(url)
  const [rawPath, rawSearch = ''] = normalizedUrl.split('?')
  const path = normalizeWorkspacePath(rawPath)
  const segments = path.split('/').filter(Boolean).map(decodeURIComponent)
  const query = new URLSearchParams(rawSearch)
  const queryType = query.get('type')

  if (segments.length === 0) {
    return { url: DEFAULT_WORKSPACE_URL, type: 'inbox' }
  }

  const firstSegment = segments[0]

  if (firstSegment === 'draft') {
    const draftId = sanitizeSegment(segments[1]) || '1'
    return {
      url: `/draft/${draftId}`,
      type: 'draft',
      draftId,
    }
  }

  if (INTERNAL_TYPES.has(firstSegment as WorkspaceTabType)) {
    return {
      url: `/${firstSegment}`,
      type: firstSegment as WorkspaceTabType,
    }
  }

  const owner = sanitizeSegment(firstSegment)
  const repo = sanitizeSegment(segments[1])

  if (owner && repo) {
    return {
      url: `/${owner}/${repo}`,
      type: 'repo',
      owner,
      repo,
    }
  }

  const ownerType = queryType === 'org' ? 'org' : 'account'

  return {
    url: ownerType === 'org' ? `/${owner}?type=org` : `/${owner}`,
    type: ownerType,
    owner,
  }
}

function titleForWorkspaceTab(tab: Omit<WorkspaceTab, 'title'>): string {
  if (tab.type === 'inbox') return 'Inbox'
  if (tab.type === 'reviews') return 'Review Queue'
  if (tab.type === 'activity') return 'Activity'
  if (tab.type === 'draft') return `Draft ${tab.draftId ?? '1'}`
  if (tab.type === 'repo') return `${tab.owner}/${tab.repo}`
  if (tab.type === 'org') return tab.owner ?? 'Organization'
  return tab.owner ?? 'Account'
}

function normalizeWorkspacePath(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const trimmed = cleanPath.replace(/\/+/g, '/').replace(/\/$/, '')
  return trimmed || '/'
}

function sanitizeSegment(value: string | undefined): string {
  return String(value ?? '').trim()
}
