import { RequestError, type GitHubOctokit } from '../transport'
import type {
  AccountContributionsOptions,
  GitHubAccountContributionYear,
  GitHubAccountOverview,
  GitHubAccountProfile,
  GitHubAccountRepository,
  GitHubAccountRepositoryPage,
  GitHubAccountSocialAccount,
  GitHubAccountViewerState,
  GitHubOrganization,
  GitHubRepository,
  GitHubRepositoryDocument,
  GitHubRepositoryVisibility,
  ListAccountRepositoriesOptions,
  SetAccountFollowedOptions,
} from '../types'

interface UserProfileResponse {
  id?: number
  login?: string
  name?: string | null
  avatar_url?: string | null
  bio?: string | null
  company?: string | null
  location?: string | null
  blog?: string | null
  email?: string | null
  twitter_username?: string | null
  html_url?: string | null
  followers?: number
  following?: number
  public_repos?: number
  public_gists?: number
  created_at?: string | null
  updated_at?: string | null
  hireable?: boolean | null
  type?: string | null
}

interface RepositoryOwnerResponse {
  login?: string | null
  avatar_url?: string | null
}

interface RepositoryResponse {
  id?: number
  name?: string
  full_name?: string
  owner?: RepositoryOwnerResponse | null
  description?: string | null
  html_url?: string | null
  homepage?: string | null
  visibility?: string | null
  private?: boolean
  fork?: boolean
  archived?: boolean
  is_template?: boolean
  language?: string | null
  stargazers_count?: number
  forks_count?: number
  topics?: string[]
  pushed_at?: string | null
  updated_at?: string | null
}

interface SearchRepositoriesResponse {
  total_count?: number
  incomplete_results?: boolean
  items?: RepositoryResponse[]
}

interface RepositoryContentFile {
  type?: string
  name?: string
  path?: string
  html_url?: string | null
  content?: string
  encoding?: string
}

interface GraphAccountOverviewResponse {
  user: {
    contributionsCollection?: {
      contributionYears?: number[]
    } | null
    organizations?: {
      nodes?: GraphOrganizationNode[]
    } | null
    pinnedItems?: {
      nodes?: Array<GraphRepositoryNode | null>
    } | null
    socialAccounts?: {
      nodes?: Array<GraphSocialAccountNode | null>
    } | null
  } | null
}

interface GraphOrganizationOverviewResponse {
  organization: {
    pinnedItems?: {
      nodes?: Array<GraphRepositoryNode | null>
    } | null
  } | null
}

interface GraphAccountContributionsResponse {
  user: {
    contributionsCollection?: {
      contributionCalendar?: {
        totalContributions?: number
        weeks?: Array<{
          firstDay?: string
          contributionDays?: Array<{
            color?: string
            contributionCount?: number
            date?: string
            weekday?: number
          }>
        }>
      } | null
      restrictedContributionsCount?: number
      totalCommitContributions?: number
      totalIssueContributions?: number
      totalPullRequestContributions?: number
      totalPullRequestReviewContributions?: number
    } | null
  } | null
}

interface GraphOrganizationNode {
  id?: string | number
  databaseId?: number | null
  login?: string | null
  avatarUrl?: string | null
  description?: string | null
}

interface GraphSocialAccountNode {
  provider?: string | null
  displayName?: string | null
  url?: string | null
}

interface GraphRepositoryNode {
  id?: string | number
  databaseId?: number | null
  name?: string | null
  nameWithOwner?: string | null
  owner?: {
    login?: string | null
    avatarUrl?: string | null
  } | null
  description?: string | null
  isPrivate?: boolean
  visibility?: string | null
  isFork?: boolean
  isArchived?: boolean
  isTemplate?: boolean
  primaryLanguage?: {
    name?: string | null
    color?: string | null
  } | null
  stargazerCount?: number
  forkCount?: number
  repositoryTopics?: {
    nodes?: Array<{
      topic?: {
        name?: string | null
      } | null
    } | null>
  } | null
  homepageUrl?: string | null
  pushedAt?: string | null
  updatedAt?: string | null
  url?: string | null
}

const accountOverviewQuery = `
  query AccountOverview($login: String!, $pinnedFirst: Int!, $orgFirst: Int!, $socialFirst: Int!) {
    user(login: $login) {
      contributionsCollection {
        contributionYears
      }
      organizations(first: $orgFirst) {
        nodes {
          databaseId
          login
          avatarUrl
          description
        }
      }
      socialAccounts(first: $socialFirst) {
        nodes {
          provider
          displayName
          url
        }
      }
      pinnedItems(first: $pinnedFirst, types: REPOSITORY) {
        nodes {
          ... on Repository {
            databaseId
            name
            nameWithOwner
            owner {
              login
              avatarUrl
            }
            description
            isPrivate
            visibility
            isFork
            isArchived
            isTemplate
            primaryLanguage {
              name
              color
            }
            stargazerCount
            forkCount
            repositoryTopics(first: 8) {
              nodes {
                topic {
                  name
                }
              }
            }
            homepageUrl
            pushedAt
            updatedAt
            url
          }
        }
      }
    }
  }
`

const organizationOverviewQuery = `
  query OrganizationOverview($login: String!, $pinnedFirst: Int!) {
    organization(login: $login) {
      pinnedItems(first: $pinnedFirst, types: REPOSITORY) {
        nodes {
          ... on Repository {
            databaseId
            name
            nameWithOwner
            owner {
              login
              avatarUrl
            }
            description
            isPrivate
            visibility
            isFork
            isArchived
            isTemplate
            primaryLanguage {
              name
              color
            }
            stargazerCount
            forkCount
            repositoryTopics(first: 8) {
              nodes {
                topic {
                  name
                }
              }
            }
            homepageUrl
            pushedAt
            updatedAt
            url
          }
        }
      }
    }
  }
`

const accountContributionsQuery = `
  query AccountContributions($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        restrictedContributionsCount
        totalCommitContributions
        totalIssueContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        contributionCalendar {
          totalContributions
          weeks {
            firstDay
            contributionDays {
              color
              contributionCount
              date
              weekday
            }
          }
        }
      }
    }
  }
`

export class AccountsApi {
  constructor(private readonly octokit: GitHubOctokit) {}

  async getProfile(login: string): Promise<GitHubAccountProfile> {
    const response = await this.octokit.request('GET /users/{username}', {
      username: login,
    })
    const user = response.data as UserProfileResponse

    return mapUserProfile(user, login)
  }

  async getOverview(login: string): Promise<GitHubAccountOverview> {
    const profile = await this.getProfile(login)

    if (profile.type === 'Organization') {
      const [graphOverview, readme] = await Promise.all([
        this.getGraphOrganizationOverview(profile.login).catch(() => null),
        this.getOrganizationProfileReadme(profile.login).catch(() => null),
      ])

      return {
        profile,
        organizations: [],
        socialAccounts: [],
        pinnedRepositories: graphOverview?.pinnedRepositories ?? [],
        readme,
        contributionYears: [],
      }
    }

    const [graphOverview, readme] = await Promise.all([
      this.getGraphOverview(profile.login).catch(() => null),
      this.getProfileReadme(profile.login).catch(() => null),
    ])

    return {
      profile,
      organizations: graphOverview?.organizations ?? [],
      socialAccounts: graphOverview?.socialAccounts ?? [],
      pinnedRepositories: graphOverview?.pinnedRepositories ?? [],
      readme,
      contributionYears: normalizeContributionYears(graphOverview?.contributionYears),
    }
  }

  async getContributions(options: AccountContributionsOptions): Promise<GitHubAccountContributionYear> {
    const year = normalizeContributionYear(options.year)
    const response = await this.octokit.graphql<GraphAccountContributionsResponse>(
      accountContributionsQuery,
      {
        login: options.login,
        from: `${year}-01-01T00:00:00Z`,
        to: `${year}-12-31T23:59:59Z`,
      },
    )
    const collection = response.user?.contributionsCollection
    const calendar = collection?.contributionCalendar

    return {
      year,
      totalContributions: calendar?.totalContributions ?? 0,
      restrictedContributionsCount: collection?.restrictedContributionsCount ?? 0,
      commitContributions: collection?.totalCommitContributions ?? 0,
      issueContributions: collection?.totalIssueContributions ?? 0,
      pullRequestContributions: collection?.totalPullRequestContributions ?? 0,
      pullRequestReviewContributions: collection?.totalPullRequestReviewContributions ?? 0,
      weeks: (calendar?.weeks ?? []).map((week) => ({
        firstDay: week.firstDay ?? '',
        days: (week.contributionDays ?? []).map((day) => ({
          date: day.date ?? '',
          contributionCount: day.contributionCount ?? 0,
          color: day.color ?? '',
          weekday: day.weekday ?? 0,
        })),
      })),
    }
  }

  async listRepositories(options: ListAccountRepositoriesOptions): Promise<GitHubAccountRepositoryPage> {
    const page = normalizePage(options.page)
    const perPage = normalizePerPage(options.perPage)
    const login = options.login.trim()
    const search = normalizeSearch(options.search)
    if (search) {
      const profile = await this.getProfile(login).catch(() => null)
      const ownerQualifier = profile?.type === 'Organization' ? `org:${login}` : `user:${login}`

      return this.searchAccountRepositories(ownerQualifier, search, page, perPage)
    }

    const viewerLogin = await this.getViewerLogin().catch(() => null)
    const isViewer = Boolean(viewerLogin && viewerLogin.toLowerCase() === login.toLowerCase())
    const profile = isViewer ? null : await this.getProfile(login).catch(() => null)
    let response: Awaited<ReturnType<GitHubOctokit['request']>>

    if (isViewer) {
      response = await this.octokit.request('GET /user/repos', {
        visibility: 'all',
        affiliation: 'owner,collaborator,organization_member',
        sort: 'updated',
        direction: 'desc',
        page,
        per_page: perPage,
      })
    } else if (profile?.type === 'Organization') {
      response = await this.octokit.request('GET /orgs/{org}/repos', {
        org: login,
        type: 'all',
        sort: 'updated',
        direction: 'desc',
        page,
        per_page: perPage,
      })
    } else {
      response = await this.octokit.request('GET /users/{username}/repos', {
        username: login,
        type: 'owner',
        sort: 'updated',
        direction: 'desc',
        page,
        per_page: perPage,
      })
    }

    return mapRepositoryPage(response.data as RepositoryResponse[], response.headers.link, page, perPage)
  }

  async listStarredRepositories(options: ListAccountRepositoriesOptions): Promise<GitHubAccountRepositoryPage> {
    const page = normalizePage(options.page)
    const perPage = normalizePerPage(options.perPage)
    const search = normalizeSearch(options.search)
    if (search) {
      return this.searchStarredRepositories(options.login.trim(), search, page, perPage)
    }

    const response = await this.octokit.request('GET /users/{username}/starred', {
      username: options.login,
      sort: 'updated',
      direction: 'desc',
      page,
      per_page: perPage,
    })

    return mapRepositoryPage(response.data as RepositoryResponse[], response.headers.link, page, perPage)
  }

  private async searchAccountRepositories(
    ownerQualifier: string,
    search: string,
    page: number,
    perPage: number,
  ): Promise<GitHubAccountRepositoryPage> {
    const response = await this.octokit.request('GET /search/repositories', {
      q: buildRepositorySearchQuery(search, [ownerQualifier, 'in:name,description']),
      sort: 'updated',
      order: 'desc',
      page,
      per_page: perPage,
    })

    return mapSearchRepositoryPage(response.data as SearchRepositoriesResponse, page, perPage)
  }

  private async searchStarredRepositories(
    login: string,
    search: string,
    page: number,
    perPage: number,
  ): Promise<GitHubAccountRepositoryPage> {
    const matches: GitHubAccountRepository[] = []
    const fetchPerPage = 100
    const maxScannedRepositories = 1000
    let nextPage = 1
    let scannedRepositories = 0
    let hasMoreRepositories = false

    while (scannedRepositories < maxScannedRepositories) {
      const response = await this.octokit.request('GET /users/{username}/starred', {
        username: login,
        sort: 'updated',
        direction: 'desc',
        page: nextPage,
        per_page: fetchPerPage,
      })
      const repositories = response.data as RepositoryResponse[]

      scannedRepositories += repositories.length
      matches.push(
        ...repositories
          .map(mapRestRepository)
          .filter((repository) => repositoryMatchesSearch(repository, search)),
      )

      hasMoreRepositories = /rel="next"/.test(String(response.headers.link ?? ''))
      if (!hasMoreRepositories || repositories.length === 0) break

      nextPage += 1
    }

    const offset = (page - 1) * perPage
    const incompleteResults = hasMoreRepositories && scannedRepositories >= maxScannedRepositories

    return {
      items: matches.slice(offset, offset + perPage),
      totalCount: matches.length,
      page,
      perPage,
      hasNextPage: offset + perPage < matches.length,
      incompleteResults,
    }
  }

  async getViewerState(login: string): Promise<GitHubAccountViewerState> {
    return {
      isFollowing: await this.isFollowing(login),
      missingScopes: [],
    }
  }

  async setFollowed(options: SetAccountFollowedOptions): Promise<void> {
    if (options.followed) {
      await this.octokit.request('PUT /user/following/{username}', {
        username: options.login,
      })
      return
    }

    await this.octokit.request('DELETE /user/following/{username}', {
      username: options.login,
    })
  }

  async listViewerOrganizations(): Promise<GitHubOrganization[]> {
    const organizations = await this.octokit.paginate(
      this.octokit.rest.orgs.listForAuthenticatedUser,
      {
        per_page: 100,
      },
    )

    return organizations.map((organization) => ({
      id: organization.id,
      login: organization.login,
      avatarUrl: organization.avatar_url ?? '',
      description: organization.description ?? null,
    }))
  }

  async listOrganizationRepositories(owner: string): Promise<GitHubRepository[]> {
    const repositories = await this.octokit.paginate(
      this.octokit.rest.repos.listForOrg,
      {
        org: owner,
        type: 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: 100,
      },
    )

    return repositories.map((repository) => {
      const repositoryOwner = repository.owner?.login ?? owner

      return {
        id: repository.id,
        name: repository.name,
        nameWithOwner: repository.full_name ?? `${repositoryOwner}/${repository.name}`,
        owner: repositoryOwner,
        description: repository.description ?? null,
        isPrivate: repository.private,
        updatedAt: repository.updated_at ?? '',
        url: repository.html_url ?? '',
      }
    })
  }

  private async getGraphOverview(login: string): Promise<Omit<GitHubAccountOverview, 'profile' | 'readme'>> {
    const response = await this.octokit.graphql<GraphAccountOverviewResponse>(
      accountOverviewQuery,
      {
        login,
        orgFirst: 20,
        pinnedFirst: 6,
        socialFirst: 20,
      },
    )
    const user = response.user

    return {
      organizations: (user?.organizations?.nodes ?? []).flatMap(mapGraphOrganization),
      socialAccounts: (user?.socialAccounts?.nodes ?? []).flatMap(mapGraphSocialAccount),
      pinnedRepositories: (user?.pinnedItems?.nodes ?? []).flatMap(mapGraphRepository),
      contributionYears: user?.contributionsCollection?.contributionYears ?? [],
    }
  }

  private async getGraphOrganizationOverview(login: string): Promise<Pick<GitHubAccountOverview, 'pinnedRepositories'>> {
    const response = await this.octokit.graphql<GraphOrganizationOverviewResponse>(
      organizationOverviewQuery,
      {
        login,
        pinnedFirst: 6,
      },
    )

    return {
      pinnedRepositories: (response.organization?.pinnedItems?.nodes ?? []).flatMap(mapGraphRepository),
    }
  }

  private async getProfileReadme(login: string): Promise<GitHubRepositoryDocument | null> {
    try {
      const response = await this.octokit.request('GET /repos/{owner}/{repo}/readme', {
        owner: login,
        repo: login,
      })

      return mapReadmeDocument(response.data as RepositoryContentFile)
    } catch (error) {
      if (isNotFoundError(error)) return null
      throw error
    }
  }

  private async getOrganizationProfileReadme(login: string): Promise<GitHubRepositoryDocument | null> {
    try {
      const response = await this.octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: login,
        repo: '.github',
        path: 'profile/README.md',
      })
      const file = response.data as RepositoryContentFile | RepositoryContentFile[]

      if (Array.isArray(file)) return null

      return mapReadmeDocument(file)
    } catch (error) {
      if (isNotFoundError(error)) return null
      throw error
    }
  }

  private async isFollowing(login: string): Promise<boolean> {
    try {
      await this.octokit.request('GET /user/following/{username}', {
        username: login,
      })
      return true
    } catch (error) {
      if (isNotFoundError(error)) return false
      throw error
    }
  }

  private async getViewerLogin(): Promise<string> {
    const response = await this.octokit.request('GET /user')
    const viewer = response.data as UserProfileResponse

    return viewer.login ?? ''
  }
}

function mapUserProfile(user: UserProfileResponse, fallbackLogin: string): GitHubAccountProfile {
  const normalizedLogin = user.login?.trim() || fallbackLogin

  return {
    id: user.id ?? 0,
    login: normalizedLogin,
    name: user.name ?? null,
    avatarUrl: user.avatar_url ?? `https://github.com/${encodeURIComponent(normalizedLogin)}.png?size=96`,
    bio: user.bio ?? null,
    company: user.company ?? null,
    location: user.location ?? null,
    blog: user.blog ?? null,
    email: user.email ?? null,
    twitterUsername: user.twitter_username ?? null,
    url: user.html_url ?? `https://github.com/${encodeURIComponent(normalizedLogin)}`,
    followers: user.followers ?? 0,
    following: user.following ?? 0,
    publicRepos: user.public_repos ?? 0,
    publicGists: user.public_gists ?? 0,
    createdAt: user.created_at ?? null,
    updatedAt: user.updated_at ?? null,
    hireable: user.hireable ?? null,
    type: user.type ?? 'User',
  }
}

function mapGraphOrganization(node: GraphOrganizationNode | null | undefined): GitHubOrganization[] {
  if (!node?.login) return []

  return [{
    id: Number(node.databaseId ?? node.id ?? 0),
    login: node.login,
    avatarUrl: node.avatarUrl ?? '',
    description: node.description ?? null,
  }]
}

function mapGraphSocialAccount(node: GraphSocialAccountNode | null | undefined): GitHubAccountSocialAccount[] {
  const url = node?.url?.trim()
  if (!url) return []

  const provider = node?.provider?.trim() || 'social'

  return [{
    provider,
    displayName: node?.displayName?.trim() || url,
    url,
  }]
}

function mapGraphRepository(node: GraphRepositoryNode | null | undefined): GitHubAccountRepository[] {
  if (!node?.name) return []

  const owner = node.owner?.login ?? node.nameWithOwner?.split('/')[0] ?? ''

  return [{
    id: Number(node.databaseId ?? 0),
    name: node.name,
    nameWithOwner: node.nameWithOwner ?? `${owner}/${node.name}`,
    owner,
    ownerAvatarUrl: node.owner?.avatarUrl ?? null,
    description: node.description ?? null,
    isPrivate: Boolean(node.isPrivate),
    visibility: normalizeVisibility(node.visibility, Boolean(node.isPrivate)),
    isFork: Boolean(node.isFork),
    isArchived: Boolean(node.isArchived),
    isTemplate: Boolean(node.isTemplate),
    primaryLanguage: node.primaryLanguage?.name ?? null,
    primaryLanguageColor: node.primaryLanguage?.color ?? null,
    stars: node.stargazerCount ?? 0,
    forks: node.forkCount ?? 0,
    topics: (node.repositoryTopics?.nodes ?? [])
      .flatMap((item) => item?.topic?.name ? [item.topic.name] : []),
    homepageUrl: normalizeHomepage(node.homepageUrl),
    pushedAt: node.pushedAt ?? null,
    updatedAt: node.updatedAt ?? null,
    url: node.url ?? `https://github.com/${owner}/${node.name}`,
  }]
}

function mapRepositoryPage(
  repositories: RepositoryResponse[],
  linkHeader: string | string[] | number | undefined,
  page: number,
  perPage: number,
): GitHubAccountRepositoryPage {
  const items = repositories.map(mapRestRepository)
  const pagination = parseLinkPagination(String(linkHeader ?? ''), page, perPage, items.length)

  return {
    items,
    totalCount: pagination.totalCount,
    page,
    perPage,
    hasNextPage: pagination.hasNextPage,
    incompleteResults: false,
  }
}

function mapSearchRepositoryPage(
  payload: SearchRepositoriesResponse,
  page: number,
  perPage: number,
): GitHubAccountRepositoryPage {
  const items = (payload.items ?? []).map(mapRestRepository)
  const totalCount = payload.total_count ?? items.length
  const searchableTotalCount = Math.min(totalCount, 1000)

  return {
    items,
    totalCount,
    page,
    perPage,
    hasNextPage: page * perPage < searchableTotalCount,
    incompleteResults: Boolean(payload.incomplete_results),
  }
}

function mapRestRepository(repository: RepositoryResponse): GitHubAccountRepository {
  const owner = repository.owner?.login ?? repository.full_name?.split('/')[0] ?? ''
  const name = repository.name ?? repository.full_name?.split('/').pop() ?? ''

  return {
    id: repository.id ?? 0,
    name,
    nameWithOwner: repository.full_name ?? `${owner}/${name}`,
    owner,
    ownerAvatarUrl: repository.owner?.avatar_url ?? null,
    description: repository.description ?? null,
    isPrivate: Boolean(repository.private),
    visibility: normalizeVisibility(repository.visibility, Boolean(repository.private)),
    isFork: Boolean(repository.fork),
    isArchived: Boolean(repository.archived),
    isTemplate: Boolean(repository.is_template),
    primaryLanguage: repository.language ?? null,
    primaryLanguageColor: null,
    stars: repository.stargazers_count ?? 0,
    forks: repository.forks_count ?? 0,
    topics: repository.topics ?? [],
    homepageUrl: normalizeHomepage(repository.homepage),
    pushedAt: repository.pushed_at ?? null,
    updatedAt: repository.updated_at ?? null,
    url: repository.html_url ?? `https://github.com/${owner}/${name}`,
  }
}

function mapReadmeDocument(file: RepositoryContentFile): GitHubRepositoryDocument | null {
  if (file.type && file.type !== 'file') return null

  const path = file.path ?? file.name ?? 'README.md'
  const content = decodeContent(file.content, file.encoding)

  if (!content) return null

  return {
    kind: 'readme',
    title: 'README',
    path,
    url: file.html_url ?? null,
    format: isMarkdownPath(path) ? 'markdown' : 'text',
    content,
  }
}

function decodeContent(content: string | undefined, encoding: string | undefined): string {
  if (!content) return ''

  if (encoding === 'base64') {
    return Buffer.from(content.replace(/\s/g, ''), 'base64').toString('utf8')
  }

  return content
}

function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown|mdown|mkdn)$/i.test(path)
}

function parseLinkPagination(link: string, page: number, perPage: number, itemCount: number) {
  const hasNextPage = /rel="next"/.test(link)
  const lastPageMatch = link.match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/)
  const lastPage = lastPageMatch ? Number(lastPageMatch[1]) : null
  const totalCount = lastPage
    ? Math.max(itemCount, (lastPage - 1) * perPage + (hasNextPage ? perPage : itemCount))
    : (page - 1) * perPage + itemCount + (hasNextPage ? perPage : 0)

  return {
    hasNextPage,
    totalCount,
  }
}

function normalizeContributionYears(years: number[] | undefined): number[] {
  const currentYear = new Date().getFullYear()
  const normalized = [...new Set((years ?? []).filter((year) => Number.isInteger(year) && year > 0))]
    .sort((a, b) => b - a)

  return normalized.length > 0 ? normalized : [currentYear]
}

function normalizeContributionYear(year: number | undefined): number {
  const currentYear = new Date().getFullYear()
  if (!year || !Number.isInteger(year)) return currentYear

  return Math.min(currentYear, Math.max(2008, year))
}

function normalizePage(value: number | undefined): number {
  return Math.max(1, Math.floor(value ?? 1))
}

function normalizePerPage(value: number | undefined): number {
  return Math.max(1, Math.min(100, Math.floor(value ?? 12)))
}

function normalizeSearch(value: string | undefined): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function buildRepositorySearchQuery(search: string, qualifiers: string[]): string {
  const terms = search
    .split(/\s+/)
    .map((term) => term.replace(/[^\p{L}\p{N}._:/@+-]/gu, ''))
    .filter(Boolean)

  return [...terms, ...qualifiers].join(' ')
}

function repositoryMatchesSearch(repository: GitHubAccountRepository, search: string): boolean {
  const terms = normalizeSearch(search).toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true

  const haystack = [
    repository.name,
    repository.nameWithOwner,
    repository.owner,
    repository.description ?? '',
    repository.primaryLanguage ?? '',
    ...repository.topics,
  ].join(' ').toLowerCase()

  return terms.every((term) => haystack.includes(term))
}

function normalizeVisibility(value: string | null | undefined, isPrivate: boolean): GitHubRepositoryVisibility {
  const normalized = value?.toLowerCase()
  if (normalized === 'private' || normalized === 'internal' || normalized === 'public') {
    return normalized
  }

  return isPrivate ? 'private' : 'public'
}

function normalizeHomepage(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed || null
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof RequestError && error.status === 404
}
