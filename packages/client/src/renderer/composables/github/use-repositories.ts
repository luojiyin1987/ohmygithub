import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'
import { useQuery } from '@pinia/colada'

const REPOSITORY_OVERVIEW_QUERY_VERSION = 'resource-rendering-v3'

export function useRepositoryOverviewQuery(
  owner: MaybeRefOrGetter<string>,
  repo: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery<GitHubRepositoryOverview>({
    key: () => [
      'github',
      'repository',
      'overview',
      REPOSITORY_OVERVIEW_QUERY_VERSION,
      toValue(owner),
      toValue(repo),
    ],
    enabled: () => Boolean(toValue(owner)) && Boolean(toValue(repo)) && toValue(enabled),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    query: async () => {
      if (!window.ohMyGithub?.repositories) {
        throw new Error('GitHub repositories bridge is unavailable')
      }

      return window.ohMyGithub.repositories.getOverview(toValue(owner), toValue(repo))
    },
  })
}

export function useRepositoryFilesQuery(
  owner: MaybeRefOrGetter<string>,
  repo: MaybeRefOrGetter<string>,
  ref: MaybeRefOrGetter<string | null | undefined>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery<GitHubRepositoryFileTree>({
    key: () => ['github', 'repository', 'files', toValue(owner), toValue(repo), toValue(ref) ?? ''],
    enabled: () => Boolean(toValue(owner)) && Boolean(toValue(repo)) && toValue(enabled),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    query: async () => {
      if (!window.ohMyGithub?.repositories) {
        throw new Error('GitHub repositories bridge is unavailable')
      }

      return window.ohMyGithub.repositories.listFiles(
        toValue(owner),
        toValue(repo),
        toValue(ref) ?? null,
      )
    },
  })
}

export function useRepositoryBranchesQuery(
  owner: MaybeRefOrGetter<string>,
  repo: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery<GitHubRepositoryBranch[]>({
    key: () => ['github', 'repository', 'branches', toValue(owner), toValue(repo)],
    enabled: () => Boolean(toValue(owner)) && Boolean(toValue(repo)) && toValue(enabled),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    query: async () => {
      if (!window.ohMyGithub?.repositories) {
        throw new Error('GitHub repositories bridge is unavailable')
      }

      return window.ohMyGithub.repositories.listBranches(toValue(owner), toValue(repo))
    },
  })
}

export function useRepositoryCommitsQuery(
  owner: MaybeRefOrGetter<string>,
  repo: MaybeRefOrGetter<string>,
  ref: MaybeRefOrGetter<string | null>,
  page: MaybeRefOrGetter<number>,
  perPage: MaybeRefOrGetter<number>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery<GitHubRepositoryCommitPage>({
    key: () => [
      'github',
      'repository',
      'commits',
      toValue(owner),
      toValue(repo),
      toValue(ref) ?? '',
      toValue(page),
      toValue(perPage),
    ],
    enabled: () => Boolean(toValue(owner)) && Boolean(toValue(repo)) && toValue(enabled),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    query: async () => {
      if (!window.ohMyGithub?.repositories) {
        throw new Error('GitHub repositories bridge is unavailable')
      }

      return window.ohMyGithub.repositories.listCommits(
        toValue(owner),
        toValue(repo),
        toValue(ref),
        toValue(page),
        toValue(perPage),
      )
    },
  })
}

export function useRepositoryCommitQuery(
  owner: MaybeRefOrGetter<string>,
  repo: MaybeRefOrGetter<string>,
  sha: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery<GitHubCommitDetail>({
    key: () => ['github', 'repository', 'commit', toValue(owner), toValue(repo), toValue(sha)],
    enabled: () =>
      Boolean(toValue(owner)) && Boolean(toValue(repo)) && Boolean(toValue(sha)) && toValue(enabled),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    query: async () => {
      if (!window.ohMyGithub?.repositories) {
        throw new Error('GitHub repositories bridge is unavailable')
      }

      return window.ohMyGithub.repositories.getCommit(toValue(owner), toValue(repo), toValue(sha))
    },
  })
}
