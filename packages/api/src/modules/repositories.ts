import { RequestError, type GitHubOctokit } from '../transport'
import type {
  GitHubCiState,
  GitHubCommitDetail,
  GitHubCommitFile,
  GitHubRepositoryBranch,
  GitHubRepositoryCommit,
  GitHubRepositoryCommitPage,
  GitHubRepositoryCustomProperty,
  GitHubRepositoryDocument,
  GitHubRepositoryDocumentFormat,
  GitHubRepositoryDocumentKind,
  GitHubRepositoryFileNode,
  GitHubRepositoryFilePreview,
  GitHubRepositoryFileTree,
  GitHubRepositoryLanguage,
  GitHubRepositoryLicense,
  GitHubRepositoryOverview,
  GitHubRepositoryOverviewCounts,
  GitHubRepositoryViewerState,
  GitHubRepositoryVisibility,
  RepositoryBranchesOptions,
  RepositoryCommitOptions,
  RepositoryCommitsOptions,
  RepositoryFilePreviewOptions,
  RepositoryFilesOptions,
  RepositoryOptions,
  SetRepositoryStarredOptions,
  SetRepositoryWatchingOptions,
} from '../types'

interface RepositoryResponse {
  id?: number
  name?: string
  full_name?: string
  owner?: { login?: string | null } | null
  description?: string | null
  homepage?: string | null
  html_url?: string | null
  visibility?: string | null
  private?: boolean
  fork?: boolean
  archived?: boolean
  is_template?: boolean
  default_branch?: string | null
  language?: string | null
  topics?: string[]
  license?: {
    key?: string | null
    name?: string | null
    spdx_id?: string | null
    url?: string | null
  } | null
  stargazers_count?: number
  subscribers_count?: number
  watchers_count?: number
  forks_count?: number
  open_issues_count?: number
  pushed_at?: string | null
  updated_at?: string | null
}

interface RepositoryContentFile {
  type?: string
  name?: string
  path?: string
  html_url?: string | null
  download_url?: string | null
  content?: string
  encoding?: string
  size?: number
}

interface RepositoryTreeResponse {
  tree?: RepositoryTreeEntry[]
  truncated?: boolean
}

interface RepositoryTreeEntry {
  path?: string
  mode?: string
  type?: string
  sha?: string
  size?: number
}

interface CommitListItemResponse {
  sha?: string
  html_url?: string | null
  commit?: {
    message?: string | null
    author?: { name?: string | null; date?: string | null } | null
    committer?: { name?: string | null; date?: string | null } | null
  } | null
  author?: { login?: string | null; avatar_url?: string | null } | null
}

interface BranchListItemResponse {
  name?: string
  commit?: { sha?: string } | null
}

interface CommitFileResponse {
  filename?: string
  previous_filename?: string
  status?: string
  additions?: number
  deletions?: number
  patch?: string
}

interface CommitDetailResponse {
  sha?: string
  html_url?: string | null
  commit?: {
    message?: string | null
    author?: { name?: string | null; date?: string | null } | null
    committer?: { name?: string | null; date?: string | null } | null
    verification?: { verified?: boolean; reason?: string | null } | null
  } | null
  author?: { login?: string | null; avatar_url?: string | null } | null
  committer?: { login?: string | null; avatar_url?: string | null } | null
  parents?: { sha?: string }[]
  stats?: { additions?: number; deletions?: number; total?: number } | null
  files?: CommitFileResponse[]
}

interface CommitCiStatesResponse {
  repository: Record<string, { statusCheckRollup?: { state?: string | null } | null } | null> | null
}

interface CommunityFile {
  path?: string | null
}

interface CommunityProfile {
  files?: Record<string, CommunityFile | null | undefined> | null
}

interface GraphRepositoryCountsResponse {
  repository: {
    pullRequests: { totalCount: number }
    releases: { totalCount: number }
    branchRefs: { totalCount: number }
    tagRefs: { totalCount: number }
  } | null
}

interface GraphRepositoryPackagesResponse {
  repository: {
    packages?: { totalCount: number } | null
  } | null
}

interface RepositoryGraphCounts {
  openPullRequests: number | null
  releases: number | null
  branches: number | null
  tags: number | null
}

const FILE_PREVIEW_SIZE_LIMIT = 1024 * 1024

const repositoryCountsQuery = `
  query RepositoryOverviewCounts($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      pullRequests(states: OPEN) {
        totalCount
      }
      releases {
        totalCount
      }
      branchRefs: refs(refPrefix: "refs/heads/", first: 1) {
        totalCount
      }
      tagRefs: refs(refPrefix: "refs/tags/", first: 1) {
        totalCount
      }
    }
  }
`

const repositoryPackagesQuery = `
  query RepositoryOverviewPackages($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      packages(first: 1) {
        totalCount
      }
    }
  }
`

export class RepositoriesApi {
  constructor(private readonly octokit: GitHubOctokit) {}

  async getViewerState(options: RepositoryOptions): Promise<GitHubRepositoryViewerState> {
    const [isStarred, isWatching, starCount] = await Promise.all([
      this.isRepositoryStarred(options),
      this.isRepositoryWatching(options),
      this.getRepositoryStarCount(options),
    ])

    return {
      isStarred,
      isWatching,
      starCount,
    }
  }

  async getOverview(options: RepositoryOptions): Promise<GitHubRepositoryOverview> {
    const warnings: string[] = []
    const repository = await this.getRepository(options)
    const [languages, topics, graphCounts, packageCount, communityProfile, customProperties] = await Promise.all([
      this.getLanguages(options).catch(() => {
        warnings.push('languages_unavailable')
        return []
      }),
      this.getTopics(options).catch(() => repository.topics ?? []),
      this.getGraphCounts(options).catch(() => {
        warnings.push('counts_unavailable')
        return {
          openPullRequests: null,
          releases: null,
          branches: null,
          tags: null,
        }
      }),
      this.getPackageCount(options).catch(() => null),
      this.getCommunityProfile(options).catch(() => {
        warnings.push('community_unavailable')
        return null
      }),
      this.getCustomProperties(options).catch(() => []),
    ])
    const documents = await this.getDocuments(options, communityProfile, repository.default_branch ?? null)

    return {
      id: repository.id ?? 0,
      name: repository.name ?? options.repo,
      nameWithOwner: repository.full_name ?? `${options.owner}/${options.repo}`,
      owner: repository.owner?.login ?? options.owner,
      description: repository.description ?? null,
      homepageUrl: normalizeHomepage(repository.homepage),
      url: repository.html_url ?? `https://github.com/${options.owner}/${options.repo}`,
      visibility: normalizeVisibility(repository),
      isFork: Boolean(repository.fork),
      isArchived: Boolean(repository.archived),
      isTemplate: Boolean(repository.is_template),
      defaultBranch: repository.default_branch ?? null,
      primaryLanguage: repository.language ?? languages[0]?.name ?? null,
      languages,
      topics,
      license: normalizeLicense(repository.license),
      counts: normalizeCounts(repository, graphCounts, packageCount),
      pushedAt: repository.pushed_at ?? null,
      updatedAt: repository.updated_at ?? null,
      documents,
      customProperties,
      missingScopes: [],
      warnings,
    }
  }

  async listFiles(options: RepositoryFilesOptions): Promise<GitHubRepositoryFileTree> {
    const ref = await this.resolveRepositoryRef(options)
    const response = await this.octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
      owner: options.owner,
      repo: options.repo,
      tree_sha: ref,
      recursive: '1',
    })
    const payload = response.data as RepositoryTreeResponse

    return {
      ref,
      truncated: Boolean(payload.truncated),
      items: buildRepositoryFileTree({
        entries: payload.tree ?? [],
        owner: options.owner,
        ref,
        repo: options.repo,
      }),
    }
  }

  async listCommits(options: RepositoryCommitsOptions): Promise<GitHubRepositoryCommitPage> {
    const ref = await this.resolveRepositoryRef(options)
    const page = Math.max(1, Math.floor(options.page ?? 1))
    const perPage = Math.max(1, Math.min(100, Math.floor(options.perPage ?? 30)))
    const response = await this.octokit.request('GET /repos/{owner}/{repo}/commits', {
      owner: options.owner,
      repo: options.repo,
      sha: ref,
      page,
      per_page: perPage,
    })
    const baseItems = (response.data as CommitListItemResponse[]).map((item) =>
      mapRepositoryCommit(options, item)
    )
    const ciStates = await this.fetchCommitCiStates(options, baseItems.map((item) => item.sha))
    const items = baseItems.map((item) => ({
      ...item,
      ciState: ciStates.get(item.sha) ?? null,
    }))

    return {
      items,
      page,
      perPage,
      hasPreviousPage: page > 1,
      hasNextPage: items.length === perPage,
    }
  }

  private async fetchCommitCiStates(
    options: RepositoryOptions,
    shas: string[],
  ): Promise<Map<string, GitHubCiState | null>> {
    const result = new Map<string, GitHubCiState | null>()
    const uniqueShas = [...new Set(shas.filter(Boolean))]
    if (uniqueShas.length === 0) return result

    const fields = uniqueShas
      .map((sha, index) => `c${index}: object(oid: "${sha}") { ... on Commit { statusCheckRollup { state } } }`)
      .join('\n')
    const query = `query CommitCiStates($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        ${fields}
      }
    }`

    try {
      const response = await this.octokit.graphql<CommitCiStatesResponse>(query, {
        owner: options.owner,
        repo: options.repo,
      })
      const repository = response.repository ?? {}

      uniqueShas.forEach((sha, index) => {
        result.set(sha, normalizeCiState(repository[`c${index}`]?.statusCheckRollup?.state))
      })
    } catch {
      // CI state is best-effort; leave it unset on failure.
    }

    return result
  }

  async listBranches(options: RepositoryBranchesOptions): Promise<GitHubRepositoryBranch[]> {
    const response = await this.octokit.request('GET /repos/{owner}/{repo}/branches', {
      owner: options.owner,
      repo: options.repo,
      per_page: 100,
    })

    return (response.data as BranchListItemResponse[]).flatMap((branch) => {
      if (!branch.name) return []

      return [{ name: branch.name, commitSha: branch.commit?.sha ?? '' }]
    })
  }

  async getCommit(options: RepositoryCommitOptions): Promise<GitHubCommitDetail> {
    const response = await this.octokit.request('GET /repos/{owner}/{repo}/commits/{ref}', {
      owner: options.owner,
      repo: options.repo,
      ref: options.sha,
    })
    const data = response.data as CommitDetailResponse
    const sha = data.sha ?? options.sha
    const message = data.commit?.message ?? ''
    const ciStates = await this.fetchCommitCiStates(options, [sha])

    return {
      sha,
      shortSha: sha.slice(0, 7),
      headline: message.split('\n', 1)[0] ?? '',
      message,
      htmlUrl: data.html_url ?? `https://github.com/${options.owner}/${options.repo}/commit/${sha}`,
      author: {
        login: data.author?.login ?? null,
        name: data.commit?.author?.name ?? null,
        avatarUrl: data.author?.avatar_url ?? null,
        date: data.commit?.author?.date ?? null,
      },
      committer: {
        login: data.committer?.login ?? null,
        name: data.commit?.committer?.name ?? null,
        avatarUrl: data.committer?.avatar_url ?? null,
        date: data.commit?.committer?.date ?? null,
      },
      parents: (data.parents ?? []).flatMap((parent) => {
        if (!parent.sha) return []

        return [{ sha: parent.sha, shortSha: parent.sha.slice(0, 7) }]
      }),
      verification: data.commit?.verification
        ? {
            verified: Boolean(data.commit.verification.verified),
            reason: data.commit.verification.reason ?? null,
          }
        : null,
      stats: {
        additions: data.stats?.additions ?? 0,
        deletions: data.stats?.deletions ?? 0,
        total: data.stats?.total ?? 0,
      },
      files: (data.files ?? []).flatMap((file): GitHubCommitFile[] => {
        if (!file.filename) return []

        const status: GitHubCommitFile['status'] =
          file.status === 'added'
          || file.status === 'removed'
          || file.status === 'renamed'
          || file.status === 'changed'
            ? file.status
            : 'modified'

        return [{
          filename: file.filename,
          previousFilename: file.previous_filename,
          status,
          additions: file.additions ?? 0,
          deletions: file.deletions ?? 0,
          patch: file.patch,
        }]
      }),
      ciState: ciStates.get(sha) ?? null,
    }
  }

  async getFilePreview(options: RepositoryFilePreviewOptions): Promise<GitHubRepositoryFilePreview> {
    const path = normalizeInputPath(options.path)
    if (!path) {
      throw new Error('Repository file path is required')
    }

    const ref = await this.resolveRepositoryRef(options)
    const response = await this.octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner: options.owner,
      repo: options.repo,
      path,
      ref,
    })
    const file = response.data as RepositoryContentFile | RepositoryContentFile[]
    const context = { defaultBranch: ref, owner: options.owner, repo: options.repo }

    return mapRepositoryFilePreview(context, path, file)
  }

  async setStarred(options: SetRepositoryStarredOptions): Promise<void> {
    if (options.starred) {
      await this.octokit.request('PUT /user/starred/{owner}/{repo}', {
        owner: options.owner,
        repo: options.repo,
      })
      return
    }

    await this.octokit.request('DELETE /user/starred/{owner}/{repo}', {
      owner: options.owner,
      repo: options.repo,
    })
  }

  async setWatching(options: SetRepositoryWatchingOptions): Promise<void> {
    if (options.watching) {
      await this.octokit.request('PUT /repos/{owner}/{repo}/subscription', {
        owner: options.owner,
        repo: options.repo,
        subscribed: true,
        ignored: false,
      })
      return
    }

    await this.octokit.request('DELETE /repos/{owner}/{repo}/subscription', {
      owner: options.owner,
      repo: options.repo,
    })
  }

  private async getRepository(options: RepositoryOptions): Promise<RepositoryResponse> {
    const response = await this.octokit.request('GET /repos/{owner}/{repo}', {
      owner: options.owner,
      repo: options.repo,
    })

    return response.data as RepositoryResponse
  }

  private async resolveRepositoryRef(options: RepositoryFilesOptions): Promise<string> {
    const ref = options.ref?.trim()
    if (ref) return ref

    const repository = await this.getRepository(options)
    return repository.default_branch?.trim() || 'HEAD'
  }

  private async getLanguages(options: RepositoryOptions): Promise<GitHubRepositoryLanguage[]> {
    const response = await this.octokit.request('GET /repos/{owner}/{repo}/languages', {
      owner: options.owner,
      repo: options.repo,
    })
    const languages = response.data as Record<string, number>

    return Object.entries(languages)
      .map(([name, bytes]) => ({ name, bytes }))
      .sort((a, b) => b.bytes - a.bytes)
  }

  private async getTopics(options: RepositoryOptions): Promise<string[]> {
    const response = await this.octokit.request('GET /repos/{owner}/{repo}/topics', {
      owner: options.owner,
      repo: options.repo,
    })
    const payload = response.data as { names?: string[] }

    return payload.names ?? []
  }

  private async getGraphCounts(options: RepositoryOptions): Promise<RepositoryGraphCounts> {
    const response = await this.octokit.graphql<GraphRepositoryCountsResponse>(repositoryCountsQuery, {
      owner: options.owner,
      repo: options.repo,
    })
    const repository = response.repository

    return {
      openPullRequests: repository?.pullRequests.totalCount ?? null,
      releases: repository?.releases.totalCount ?? null,
      branches: repository?.branchRefs.totalCount ?? null,
      tags: repository?.tagRefs.totalCount ?? null,
    }
  }

  private async getPackageCount(options: RepositoryOptions): Promise<number | null> {
    const response = await this.octokit.graphql<GraphRepositoryPackagesResponse>(repositoryPackagesQuery, {
      owner: options.owner,
      repo: options.repo,
    })

    return response.repository?.packages?.totalCount ?? null
  }

  private async getCommunityProfile(options: RepositoryOptions): Promise<CommunityProfile | null> {
    const response = await this.octokit.request('GET /repos/{owner}/{repo}/community/profile', {
      owner: options.owner,
      repo: options.repo,
    })

    return response.data as CommunityProfile
  }

  private async getCustomProperties(options: RepositoryOptions): Promise<GitHubRepositoryCustomProperty[]> {
    const response = await this.octokit.request('GET /repos/{owner}/{repo}/properties/values', {
      owner: options.owner,
      repo: options.repo,
    })
    const values = response.data as Array<{ property_name?: string; value?: unknown }>

    return values.flatMap((item) => {
      if (!item.property_name) return []

      return [
        {
          name: item.property_name,
          value: stringifyCustomPropertyValue(item.value),
        },
      ]
    })
  }

  private async getDocuments(
    options: RepositoryOptions,
    communityProfile: CommunityProfile | null,
    defaultBranch: string | null,
  ): Promise<GitHubRepositoryDocument[]> {
    const communityFiles = communityProfile?.files ?? {}
    const documents = await Promise.all([
      this.getReadmeDocument(options),
      this.getContributingDocument(options, communityFiles),
      this.getLicenseDocument(options, communityFiles),
      this.fetchFirstDocument(options, 'codeOfConduct', 'Code of conduct', [
        communityFilePath(communityFiles.code_of_conduct),
        'CODE_OF_CONDUCT.md',
        '.github/CODE_OF_CONDUCT.md',
        'docs/CODE_OF_CONDUCT.md',
      ]),
      this.fetchFirstDocument(options, 'security', 'Security', [
        'SECURITY.md',
        '.github/SECURITY.md',
        'docs/SECURITY.md',
      ]),
      this.fetchFirstDocument(options, 'citation', 'Citation', [
        'CITATION.cff',
        'CITATION.bib',
        'CITATION.md',
        'docs/CITATION.md',
      ]),
      this.fetchFirstDocument(options, 'funding', 'Funding', [
        '.github/FUNDING.yml',
        'FUNDING.yml',
      ]),
      this.fetchFirstDocument(options, 'issueTemplate', 'Issue template', [
        communityFilePath(communityFiles.issue_template),
        '.github/ISSUE_TEMPLATE.md',
        'ISSUE_TEMPLATE.md',
      ]),
      this.fetchFirstDocument(options, 'pullRequestTemplate', 'Pull request template', [
        communityFilePath(communityFiles.pull_request_template),
        '.github/PULL_REQUEST_TEMPLATE.md',
        'PULL_REQUEST_TEMPLATE.md',
        'docs/PULL_REQUEST_TEMPLATE.md',
      ]),
    ])

    const availableDocuments = documents.filter(isDocument)

    return Promise.all(
      availableDocuments.map((document) =>
        this.resolveDocumentResources(options, defaultBranch, document)
      )
    )
  }

  private async getReadmeDocument(options: RepositoryOptions): Promise<GitHubRepositoryDocument | null> {
    try {
      const response = await this.octokit.request('GET /repos/{owner}/{repo}/readme', {
        owner: options.owner,
        repo: options.repo,
      })

      return mapContentDocument('readme', 'README', response.data)
    } catch (error) {
      if (isNotFoundError(error)) return null
      throw error
    }
  }

  private async getContributingDocument(
    options: RepositoryOptions,
    communityFiles: Record<string, CommunityFile | null | undefined>,
  ): Promise<GitHubRepositoryDocument | null> {
    return this.fetchFirstDocument(options, 'contributing', 'Contributing', [
      communityFilePath(communityFiles.contributing),
      'CONTRIBUTING.md',
      '.github/CONTRIBUTING.md',
      'docs/CONTRIBUTING.md',
      'CONTRIBUTING',
    ])
  }

  private async getLicenseDocument(
    options: RepositoryOptions,
    communityFiles: Record<string, CommunityFile | null | undefined>,
  ): Promise<GitHubRepositoryDocument | null> {
    try {
      const response = await this.octokit.request('GET /repos/{owner}/{repo}/license', {
        owner: options.owner,
        repo: options.repo,
      })

      return mapContentDocument('license', 'License', response.data)
    } catch (error) {
      if (!isNotFoundError(error)) throw error
    }

    return this.fetchFirstDocument(options, 'license', 'License', [
      communityFilePath(communityFiles.license),
      'LICENSE',
      'LICENSE.md',
      'COPYING',
      'COPYING.md',
    ])
  }

  private async fetchFirstDocument(
    options: RepositoryOptions,
    kind: GitHubRepositoryDocumentKind,
    title: string,
    paths: Array<string | null | undefined>,
  ): Promise<GitHubRepositoryDocument | null> {
    const seen = new Set<string>()

    for (const path of paths) {
      if (!path || seen.has(path)) continue
      seen.add(path)

      const document = await this.fetchDocumentByPath(options, kind, title, path)
      if (document) return document
    }

    return null
  }

  private async fetchDocumentByPath(
    options: RepositoryOptions,
    kind: GitHubRepositoryDocumentKind,
    title: string,
    path: string,
  ): Promise<GitHubRepositoryDocument | null> {
    try {
      const response = await this.octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: options.owner,
        repo: options.repo,
        path,
      })

      return mapContentDocument(kind, title, response.data)
    } catch (error) {
      if (isNotFoundError(error)) return null
      throw error
    }
  }

  private async resolveDocumentResources(
    options: RepositoryOptions,
    defaultBranch: string | null,
    document: GitHubRepositoryDocument,
  ): Promise<GitHubRepositoryDocument> {
    if (document.format !== 'markdown' || !defaultBranch) return document

    const content = await rewriteRepositoryMarkdownResources({
      content: document.content,
      defaultBranch,
      documentPath: document.path,
      fetchAssetDataUrl: (path) => this.fetchAssetDataUrl(options, path),
      owner: options.owner,
      repo: options.repo,
    })

    return {
      ...document,
      content,
    }
  }

  private async fetchAssetDataUrl(options: RepositoryOptions, path: string): Promise<string | null> {
    try {
      const response = await this.octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: options.owner,
        repo: options.repo,
        path,
      })
      const file = response.data as RepositoryContentFile | RepositoryContentFile[]

      if (Array.isArray(file) || file.type !== 'file' || typeof file.content !== 'string') return null

      const content = file.encoding === 'base64'
        ? file.content.replace(/\s/g, '')
        : ''

      if (!content) return null

      return `data:${mimeTypeForPath(path)};base64,${content}`
    } catch (error) {
      if (isNotFoundError(error)) return null
      return null
    }
  }

  private async isRepositoryStarred(options: RepositoryOptions): Promise<boolean> {
    try {
      await this.octokit.request('GET /user/starred/{owner}/{repo}', {
        owner: options.owner,
        repo: options.repo,
      })
      return true
    } catch (error) {
      if (isNotFoundError(error)) return false
      throw error
    }
  }

  private async isRepositoryWatching(options: RepositoryOptions): Promise<boolean> {
    try {
      const response = await this.octokit.request('GET /repos/{owner}/{repo}/subscription', {
        owner: options.owner,
        repo: options.repo,
      })
      const subscription = response.data as { subscribed?: boolean }

      return Boolean(subscription.subscribed)
    } catch (error) {
      if (isNotFoundError(error)) return false
      throw error
    }
  }

  private async getRepositoryStarCount(options: RepositoryOptions): Promise<number> {
    const repository = await this.getRepository(options)

    return repository.stargazers_count ?? 0
  }
}

function buildRepositoryFileTree(options: {
  entries: RepositoryTreeEntry[]
  owner: string
  ref: string
  repo: string
}): GitHubRepositoryFileNode[] {
  const root = new Map<string, GitHubRepositoryFileNode>()
  const nodesByPath = new Map<string, GitHubRepositoryFileNode>()
  const context = { defaultBranch: options.ref, owner: options.owner, repo: options.repo }

  function ensureFolder(path: string, sha = ''): GitHubRepositoryFileNode {
    const existing = nodesByPath.get(path)
    if (existing) return existing

    const node: GitHubRepositoryFileNode = {
      type: 'tree',
      name: path.split('/').pop() ?? path,
      path,
      sha,
      size: null,
      downloadUrl: null,
      htmlUrl: repositoryTreeUrl(context, path),
      children: [],
    }
    nodesByPath.set(path, node)

    const parentPath = parentRepositoryPath(path)
    if (parentPath) {
      ensureFolder(parentPath).children.push(node)
    } else {
      root.set(path, node)
    }

    return node
  }

  for (const entry of options.entries) {
    const path = normalizeInputPath(entry.path ?? '')
    if (!path) continue

    if (entry.type === 'tree') {
      const existing = ensureFolder(path, entry.sha ?? '')
      existing.sha = entry.sha ?? existing.sha
      continue
    }

    if (entry.type !== 'blob') continue

    const parentPath = parentRepositoryPath(path)
    const node: GitHubRepositoryFileNode = {
      type: 'file',
      name: path.split('/').pop() ?? path,
      path,
      sha: entry.sha ?? '',
      size: entry.size ?? null,
      downloadUrl: repositoryRawUrl(context, path),
      htmlUrl: repositoryBlobUrl(context, path),
      children: [],
    }

    nodesByPath.set(path, node)
    if (parentPath) {
      ensureFolder(parentPath).children.push(node)
    } else {
      root.set(path, node)
    }
  }

  return sortRepositoryFileNodes(Array.from(root.values()))
}

function sortRepositoryFileNodes(nodes: GitHubRepositoryFileNode[]): GitHubRepositoryFileNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: sortRepositoryFileNodes(node.children),
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'tree' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
}

function mapRepositoryFilePreview(
  context: { defaultBranch: string; owner: string; repo: string },
  requestedPath: string,
  input: RepositoryContentFile | RepositoryContentFile[],
): GitHubRepositoryFilePreview {
  const path = Array.isArray(input) ? requestedPath : input.path ?? requestedPath
  const name = path.split('/').pop() ?? path
  const htmlUrl = Array.isArray(input) ? repositoryBlobUrl(context, path) : input.html_url ?? repositoryBlobUrl(context, path)
  const downloadUrl = Array.isArray(input)
    ? repositoryRawUrl(context, path)
    : input.download_url ?? repositoryRawUrl(context, path)
  const title = path

  if (Array.isArray(input) || (input.type && input.type !== 'file')) {
    return createDownloadPreview({
      description: 'This repository item cannot be previewed.',
      downloadUrl,
      htmlUrl,
      name,
      path,
      title,
    })
  }

  if (isImagePath(path)) {
    return {
      type: 'image',
      path,
      name,
      title,
      url: previewDataUrl(input, path) ?? downloadUrl,
      downloadUrl,
      htmlUrl,
    }
  }

  if (isVideoPath(path)) {
    return {
      type: 'video',
      path,
      name,
      title,
      url: previewDataUrl(input, path) ?? downloadUrl,
      posterUrl: null,
      downloadUrl,
      htmlUrl,
    }
  }

  if ((input.size ?? 0) > FILE_PREVIEW_SIZE_LIMIT) {
    return createDownloadPreview({
      description: 'This file is too large to preview.',
      downloadUrl,
      htmlUrl,
      name,
      path,
      title,
    })
  }

  if (typeof input.content !== 'string') {
    return createDownloadPreview({
      description: 'This file is available for download.',
      downloadUrl,
      htmlUrl,
      name,
      path,
      title,
    })
  }

  const content = decodeContent(input)
  if (!isLikelyTextContent(content)) {
    return createDownloadPreview({
      description: 'This file type is not supported for preview.',
      downloadUrl,
      htmlUrl,
      name,
      path,
      title,
    })
  }

  if (documentFormatForPath(path) === 'markdown') {
    return {
      type: 'markdown',
      path,
      name,
      title,
      content,
      downloadUrl,
      htmlUrl,
    }
  }

  return {
    type: 'code',
    path,
    name,
    title,
    content,
    language: languageForPath(path),
    downloadUrl,
    htmlUrl,
  }
}

function normalizeCiState(value: string | null | undefined): GitHubCiState | null {
  if (value === 'SUCCESS') return 'success'
  if (value === 'FAILURE' || value === 'ERROR') return 'failure'
  if (value === 'PENDING' || value === 'EXPECTED') return 'pending'

  return null
}

function mapRepositoryCommit(
  context: { owner: string; repo: string },
  item: CommitListItemResponse,
): GitHubRepositoryCommit {
  const sha = item.sha ?? ''
  const message = item.commit?.message ?? ''
  const headline = message.split('\n', 1)[0] ?? ''
  const committedDate = item.commit?.committer?.date ?? item.commit?.author?.date ?? ''

  return {
    sha,
    shortSha: sha.slice(0, 7),
    message,
    headline,
    author: {
      login: item.author?.login ?? null,
      name: item.commit?.author?.name ?? null,
      avatarUrl: item.author?.avatar_url ?? null,
    },
    committedDate,
    htmlUrl: item.html_url ?? `https://github.com/${context.owner}/${context.repo}/commit/${sha}`,
    ciState: null,
  }
}

function createDownloadPreview(options: {
  description: string
  downloadUrl: string | null
  htmlUrl: string | null
  name: string
  path: string
  title: string
}): GitHubRepositoryFilePreview {
  const url = options.downloadUrl ?? options.htmlUrl ?? ''

  return {
    type: 'download',
    path: options.path,
    name: options.name,
    title: options.title,
    description: options.description,
    url,
    downloadUrl: options.downloadUrl,
    htmlUrl: options.htmlUrl,
  }
}

function previewDataUrl(file: RepositoryContentFile, path: string): string | null {
  if (typeof file.content !== 'string') return null
  if ((file.size ?? 0) > FILE_PREVIEW_SIZE_LIMIT) return null

  const content = file.encoding === 'base64'
    ? file.content.replace(/\s/g, '')
    : Buffer.from(file.content).toString('base64')

  return `data:${mimeTypeForPath(path)};base64,${content}`
}

function normalizeInputPath(path: string): string {
  return path.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}

function parentRepositoryPath(path: string): string | null {
  const index = path.lastIndexOf('/')
  return index === -1 ? null : path.slice(0, index)
}

function isLikelyTextContent(content: string): boolean {
  if (content.includes('\0')) return false
  if (!content.includes('\uFFFD')) return true

  const replacementCount = Array.from(content).filter((character) => character === '\uFFFD').length
  return replacementCount / Math.max(content.length, 1) < 0.01
}

function isImagePath(path: string): boolean {
  return /\.(?:apng|avif|gif|jpe?g|png|svg|webp)$/i.test(path)
}

function isVideoPath(path: string): boolean {
  return /\.(?:mov|mp4|m4v|ogg|ogv|webm)$/i.test(path)
}

function languageForPath(path: string): string {
  const filename = path.toLowerCase().split('/').pop() ?? path.toLowerCase()
  const extension = filename.includes('.') ? filename.split('.').pop() ?? '' : ''

  if (filename === 'cargo.lock') return 'toml'
  if (filename === 'dockerfile') return 'docker'
  if (extension === 'cjs' || extension === 'js' || extension === 'mjs') return 'javascript'
  if (extension === 'cts' || extension === 'mts' || extension === 'ts') return 'typescript'
  if (extension === 'h') return 'c'
  if (extension === 'hpp') return 'cpp'
  if (extension === 'md') return 'markdown'
  if (extension === 'sh') return 'shellscript'
  if (extension === 'toml') return 'toml'
  if (extension === 'yml') return 'yaml'

  return extension || 'plaintext'
}

function normalizeHomepage(value: string | null | undefined): string | null {
  const homepage = value?.trim()
  if (!homepage) return null

  return /^https?:\/\//i.test(homepage) ? homepage : `https://${homepage}`
}

function normalizeVisibility(repository: RepositoryResponse): GitHubRepositoryVisibility {
  if (repository.visibility === 'private' || repository.visibility === 'internal') {
    return repository.visibility
  }

  return repository.private ? 'private' : 'public'
}

function normalizeLicense(
  license: RepositoryResponse['license'],
): GitHubRepositoryLicense | null {
  if (!license?.key && !license?.name) return null

  return {
    key: license.key ?? '',
    name: license.name ?? license.spdx_id ?? license.key ?? '',
    spdxId: license.spdx_id ?? null,
    url: license.url ?? null,
  }
}

function normalizeCounts(
  repository: RepositoryResponse,
  graphCounts: RepositoryGraphCounts,
  packageCount: number | null,
): GitHubRepositoryOverviewCounts {
  return {
    stars: repository.stargazers_count ?? 0,
    watchers: repository.subscribers_count ?? 0,
    forks: repository.forks_count ?? 0,
    openIssues: repository.open_issues_count ?? 0,
    openPullRequests: graphCounts.openPullRequests,
    releases: graphCounts.releases,
    branches: graphCounts.branches,
    tags: graphCounts.tags,
    packages: packageCount,
  }
}

function mapContentDocument(
  kind: GitHubRepositoryDocumentKind,
  title: string,
  input: unknown,
): GitHubRepositoryDocument | null {
  if (Array.isArray(input)) return null

  const file = input as RepositoryContentFile
  if (file.type && file.type !== 'file') return null
  if (!file.path || typeof file.content !== 'string') return null

  return {
    kind,
    title,
    path: file.path,
    url: file.html_url ?? null,
    format: documentFormatForPath(file.path),
    content: decodeContent(file),
  }
}

function decodeContent(file: RepositoryContentFile): string {
  if (file.encoding === 'base64') {
    return Buffer.from(file.content?.replace(/\s/g, '') ?? '', 'base64').toString('utf8')
  }

  return file.content ?? ''
}

async function rewriteRepositoryMarkdownResources(options: {
  content: string
  defaultBranch: string
  documentPath: string
  fetchAssetDataUrl: (path: string) => Promise<string | null>
  owner: string
  repo: string
}): Promise<string> {
  const context = {
    defaultBranch: options.defaultBranch,
    documentPath: options.documentPath,
    owner: options.owner,
    repo: options.repo,
  }
  let content = await replaceAsync(
    options.content,
    /(!\[[^\]]*]\()(<[^>]+>|[^\s)]+)((?:\s+["'][^"']*["'])?\))/g,
    async (match, prefix: string, rawTarget: string, suffix: string) => {
      const resolved = resolveRepositoryTarget(options.documentPath, rawTarget)
      if (!resolved) return match

      const dataUrl = await options.fetchAssetDataUrl(resolved.path)
      const url = dataUrl ?? repositoryRawUrl(context, resolved.path, resolved.suffix)

      return `${prefix}${formatMarkdownTarget(rawTarget, url)}${suffix}`
    },
  )

  content = content.replace(
    /(^|[^!])(\[[^\]]*]\()(<[^>]+>|[^\s)]+)((?:\s+["'][^"']*["'])?\))/g,
    (match, leading: string, prefix: string, rawTarget: string, suffix: string) => {
      const resolved = resolveRepositoryTarget(options.documentPath, rawTarget)
      if (!resolved) return match

      return `${leading}${prefix}${formatMarkdownTarget(
        rawTarget,
        repositoryBlobUrl(context, resolved.path, resolved.suffix),
      )}${suffix}`
    },
  )

  content = await replaceAsync(
    content,
    /(<(?:img|source|video)\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
    async (match, prefix: string, rawTarget: string, suffix: string) => {
      const resolved = resolveRepositoryTarget(options.documentPath, rawTarget)
      if (!resolved) return match

      const dataUrl = await options.fetchAssetDataUrl(resolved.path)
      const url = dataUrl ?? repositoryRawUrl(context, resolved.path, resolved.suffix)

      return `${prefix}${url}${suffix}`
    },
  )

  content = await replaceAsync(
    content,
    /(<(?:img|source)\b[^>]*\bsrcset=["'])([^"']+)(["'][^>]*>)/gi,
    async (match, prefix: string, rawSrcset: string, suffix: string) => {
      const rewrittenSrcset = await rewriteHtmlSrcset(rawSrcset, {
        ...context,
        documentPath: options.documentPath,
      })

      return rewrittenSrcset === rawSrcset ? match : `${prefix}${rewrittenSrcset}${suffix}`
    },
  )

  content = content.replace(
    /(<a\b[^>]*\bhref=["'])([^"']+)(["'][^>]*>)/gi,
    (match, prefix: string, rawTarget: string, suffix: string) => {
      const resolved = resolveRepositoryTarget(options.documentPath, rawTarget)
      if (!resolved) return match

      return `${prefix}${repositoryBlobUrl(context, resolved.path, resolved.suffix)}${suffix}`
    },
  )

  return content.replace(/<img\b[^>]*>/gi, preserveHtmlImageDimensions)
}

async function replaceAsync(
  input: string,
  pattern: RegExp,
  replacer: (...args: string[]) => Promise<string>,
): Promise<string> {
  const replacements = await Promise.all(
    Array.from(input.matchAll(pattern), (match) => replacer(...match))
  )
  let index = 0

  return input.replace(pattern, () => replacements[index++] ?? '')
}

function resolveRepositoryTarget(
  documentPath: string,
  rawTarget: string,
): { path: string; suffix: string } | null {
  const target = unwrapMarkdownTarget(rawTarget.trim())
  if (!target || isExternalTarget(target)) return null

  const suffixIndex = target.search(/[?#]/)
  const targetPath = suffixIndex === -1 ? target : target.slice(0, suffixIndex)
  const suffix = suffixIndex === -1 ? '' : target.slice(suffixIndex)
  if (!targetPath) return null

  return {
    path: normalizeRepositoryPath(documentPath, targetPath),
    suffix,
  }
}

function unwrapMarkdownTarget(value: string): string {
  if (value.startsWith('<') && value.endsWith('>')) {
    return value.slice(1, -1)
  }

  return value
}

function isExternalTarget(value: string): boolean {
  return (
    value.startsWith('#') ||
    value.startsWith('//') ||
    /^[a-z][a-z\d+.-]*:/i.test(value)
  )
}

function normalizeRepositoryPath(documentPath: string, targetPath: string): string {
  const baseParts = targetPath.startsWith('/')
    ? []
    : documentPath.split('/').slice(0, -1)
  const parts = [...baseParts, ...targetPath.replace(/^\/+/, '').split('/')]
  const normalized: string[] = []

  for (const part of parts) {
    const segment = safeDecodeURIComponent(part)
    if (!segment || segment === '.') continue

    if (segment === '..') {
      normalized.pop()
      continue
    }

    normalized.push(segment)
  }

  return normalized.join('/')
}

function repositoryRawUrl(
  context: { defaultBranch: string; owner: string; repo: string },
  path: string,
  suffix = '',
): string {
  return `https://raw.githubusercontent.com/${encodePathSegment(context.owner)}/${encodePathSegment(context.repo)}/${encodePathSegment(context.defaultBranch)}/${encodeRepositoryPath(path)}${suffix}`
}

function repositoryBlobUrl(
  context: { defaultBranch: string; owner: string; repo: string },
  path: string,
  suffix = '',
): string {
  return `https://github.com/${encodePathSegment(context.owner)}/${encodePathSegment(context.repo)}/blob/${encodePathSegment(context.defaultBranch)}/${encodeRepositoryPath(path)}${suffix}`
}

function repositoryTreeUrl(
  context: { defaultBranch: string; owner: string; repo: string },
  path: string,
): string {
  return `https://github.com/${encodePathSegment(context.owner)}/${encodePathSegment(context.repo)}/tree/${encodePathSegment(context.defaultBranch)}/${encodeRepositoryPath(path)}`
}

function formatMarkdownTarget(originalTarget: string, url: string): string {
  return originalTarget.startsWith('<') && originalTarget.endsWith('>') ? `<${url}>` : url
}

function encodeRepositoryPath(path: string): string {
  return path.split('/').map(encodePathSegment).join('/')
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value)
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

async function rewriteHtmlSrcset(
  rawSrcset: string,
  context: {
    defaultBranch: string
    documentPath: string
    owner: string
    repo: string
  },
): Promise<string> {
  const candidates = rawSrcset.split(',')
  const rewrittenCandidates = await Promise.all(
    candidates.map(async (candidate) => {
      const trimmedCandidate = candidate.trim()
      if (!trimmedCandidate) return candidate

      const [rawTarget, ...descriptorParts] = trimmedCandidate.split(/\s+/)
      const resolved = resolveRepositoryTarget(context.documentPath, rawTarget)
      if (!resolved) return candidate

      const descriptor = descriptorParts.join(' ')
      const rewrittenTarget = repositoryRawUrl(context, resolved.path, resolved.suffix)

      return descriptor ? `${rewrittenTarget} ${descriptor}` : rewrittenTarget
    }),
  )

  return rewrittenCandidates.join(', ')
}

function preserveHtmlImageDimensions(tag: string): string {
  const styleMatch = tag.match(/\sstyle=(["'])(.*?)\1/i)
  const heightValue = htmlAttributeValue(tag, 'height')
  const widthValue = htmlAttributeValue(tag, 'width')
  const additions: string[] = []
  const existingStyle = styleMatch?.[2] ?? ''

  if (heightValue && !/\bheight\s*:/i.test(existingStyle)) {
    additions.push(`height: ${dimensionToCssValue(heightValue)}`)
  }

  if (widthValue && !/\bwidth\s*:/i.test(existingStyle)) {
    additions.push(`width: ${dimensionToCssValue(widthValue)}`)
  }

  if (additions.length === 0) return tag

  if (styleMatch) {
    const separator = existingStyle.trim().endsWith(';') || !existingStyle.trim() ? ' ' : '; '
    const nextStyle = `${existingStyle}${separator}${additions.join('; ')}`
    return tag.replace(styleMatch[0], ` style=${styleMatch[1]}${nextStyle}${styleMatch[1]}`)
  }

  return tag.replace(/\s*\/?>$/, (ending) => ` style="${additions.join('; ')}"${ending}`)
}

function htmlAttributeValue(tag: string, attribute: string): string | null {
  const pattern = new RegExp(`\\s${attribute}=(["']?)([^\\s"'<>]+)\\1`, 'i')
  return tag.match(pattern)?.[2] ?? null
}

function dimensionToCssValue(value: string): string {
  return /^\d+(?:\.\d+)?$/.test(value) ? `${value}px` : value
}

function mimeTypeForPath(path: string): string {
  const extension = path.toLowerCase().split('.').pop()

  if (extension === 'apng') return 'image/apng'
  if (extension === 'avif') return 'image/avif'
  if (extension === 'gif') return 'image/gif'
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'png') return 'image/png'
  if (extension === 'svg') return 'image/svg+xml'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'm4v') return 'video/x-m4v'
  if (extension === 'mov') return 'video/quicktime'
  if (extension === 'mp4') return 'video/mp4'
  if (extension === 'ogg' || extension === 'ogv') return 'video/ogg'
  if (extension === 'webm') return 'video/webm'

  return 'application/octet-stream'
}

function documentFormatForPath(path: string): GitHubRepositoryDocumentFormat {
  const normalizedPath = path.toLowerCase()

  if (
    normalizedPath.endsWith('.md') ||
    normalizedPath.endsWith('.mdx') ||
    normalizedPath.endsWith('.markdown')
  ) {
    return 'markdown'
  }

  return 'text'
}

function communityFilePath(file: CommunityFile | null | undefined): string | null {
  return file?.path?.trim() || null
}

function stringifyCustomPropertyValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(', ')
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)

  return String(value)
}

function isDocument(document: GitHubRepositoryDocument | null): document is GitHubRepositoryDocument {
  return Boolean(document)
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof RequestError && error.status === 404
}
