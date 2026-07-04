import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'
import { useQuery, useQueryCache } from '@pinia/colada'
import { REPOSITORY_OVERVIEW_QUERY_VERSION } from './use-repositories'

export function useRepositoryGeneralSettingsQuery(
  owner: MaybeRefOrGetter<string>,
  repo: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery<GitHubRepositoryGeneralSettings>({
    key: () => ['github', 'repository', 'settings', 'general', toValue(owner), toValue(repo)],
    enabled: () => Boolean(toValue(owner)) && Boolean(toValue(repo)) && toValue(enabled),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    query: async () => requireBridge().getGeneral(toValue(owner), toValue(repo)),
  })
}

export function useRepositoryAccessOverviewQuery(
  owner: MaybeRefOrGetter<string>,
  repo: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery<GitHubRepositoryAccessOverview>({
    key: () => ['github', 'repository', 'settings', 'access', toValue(owner), toValue(repo)],
    enabled: () => Boolean(toValue(owner)) && Boolean(toValue(repo)) && toValue(enabled),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    query: async () => requireAccessBridge().getOverview(toValue(owner), toValue(repo)),
  })
}

export function useRepositoryInteractionLimitsQuery(
  owner: MaybeRefOrGetter<string>,
  repo: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery<GitHubInteractionLimits | null>({
    key: () => ['github', 'repository', 'settings', 'interaction-limits', toValue(owner), toValue(repo)],
    enabled: () => Boolean(toValue(owner)) && Boolean(toValue(repo)) && toValue(enabled),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    query: async () => requireAccessBridge().getInteractionLimits(toValue(owner), toValue(repo)),
  })
}

export function useRepositorySettingsInvalidation() {
  const queryCache = useQueryCache()

  return {
    invalidateGeneralSettings(owner: string, repo: string): void {
      void queryCache.invalidateQueries({
        key: ['github', 'repository', 'settings', 'general', owner, repo],
      })
    },
    invalidateAccessOverview(owner: string, repo: string): void {
      void queryCache.invalidateQueries({
        key: ['github', 'repository', 'settings', 'access', owner, repo],
      })
    },
    invalidateInteractionLimits(owner: string, repo: string): void {
      void queryCache.invalidateQueries({
        key: ['github', 'repository', 'settings', 'interaction-limits', owner, repo],
      })
    },
    invalidateRepositoryOverview(owner: string, repo: string): void {
      void queryCache.invalidateQueries({
        key: ['github', 'repository', 'overview', REPOSITORY_OVERVIEW_QUERY_VERSION, owner, repo],
      })
    },
  }
}

function requireBridge() {
  const bridge = window.ohMyGithub?.repositorySettings
  if (!bridge) throw new Error('GitHub repository settings bridge is unavailable')
  return bridge
}

export function updateGeneralSettings(
  owner: string,
  repo: string,
  input: UpdateRepositoryGeneralSettingsInput,
): Promise<void> {
  return requireBridge().updateGeneral(owner, repo, input)
}

export function replaceTopics(owner: string, repo: string, names: string[]): Promise<void> {
  return requireBridge().replaceTopics(owner, repo, names)
}

export function setDiscussionsEnabled(repositoryNodeId: string, enabled: boolean): Promise<void> {
  return requireBridge().setDiscussions(repositoryNodeId, enabled)
}

export function setSponsorshipsEnabled(repositoryNodeId: string, enabled: boolean): Promise<void> {
  return requireBridge().setSponsorships(repositoryNodeId, enabled)
}

export function setImmutableReleases(owner: string, repo: string, enabled: boolean): Promise<void> {
  return requireBridge().setImmutableReleases(owner, repo, enabled)
}

export function transferRepository(
  owner: string,
  repo: string,
  newOwner: string,
  newName?: string,
): Promise<void> {
  return requireBridge().transfer(owner, repo, newOwner, newName)
}

export function deleteRepository(owner: string, repo: string): Promise<void> {
  return requireBridge().deleteRepository(owner, repo)
}

function requireAccessBridge() {
  const bridge = window.ohMyGithub?.repositorySettings?.access
  if (!bridge) throw new Error('GitHub repository settings bridge is unavailable')
  return bridge
}

export function addCollaborator(
  owner: string,
  repo: string,
  username: string,
  permission: GitHubRepositoryCollaboratorRole,
): Promise<'invited' | 'added'> {
  return requireAccessBridge().addCollaborator(owner, repo, username, permission)
}

export function removeCollaborator(owner: string, repo: string, username: string): Promise<void> {
  return requireAccessBridge().removeCollaborator(owner, repo, username)
}

export function updateInvitation(
  owner: string,
  repo: string,
  invitationId: number,
  permissions: string,
): Promise<void> {
  return requireAccessBridge().updateInvitation(owner, repo, invitationId, permissions)
}

export function cancelInvitation(owner: string, repo: string, invitationId: number): Promise<void> {
  return requireAccessBridge().cancelInvitation(owner, repo, invitationId)
}

export function setTeamAccess(
  org: string,
  teamSlug: string,
  owner: string,
  repo: string,
  permission: string,
): Promise<void> {
  return requireAccessBridge().setTeam(org, teamSlug, owner, repo, permission)
}

export function removeTeamAccess(org: string, teamSlug: string, owner: string, repo: string): Promise<void> {
  return requireAccessBridge().removeTeam(org, teamSlug, owner, repo)
}

export function setRepositoryInteractionLimits(
  owner: string,
  repo: string,
  limit: GitHubInteractionLimitGroup,
  expiry?: GitHubInteractionLimitExpiry,
): Promise<void> {
  return requireAccessBridge().setInteractionLimits(owner, repo, limit, expiry)
}

export function clearRepositoryInteractionLimits(owner: string, repo: string): Promise<void> {
  return requireAccessBridge().clearInteractionLimits(owner, repo)
}
