import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'
import { useQuery, useQueryCache } from '@pinia/colada'

function requireBridge() {
  const bridge = window.ohMyGithub?.organizationPeople

  if (!bridge) {
    throw new Error('GitHub organization people bridge is unavailable')
  }

  return bridge
}

export function useOrganizationPeopleQuery(
  org: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery<GitHubOrganizationPeople>({
    key: () => ['github', 'organization-people', toValue(org)],
    enabled: () => Boolean(toValue(org)) && toValue(enabled),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    query: async () => requireBridge().getPeople(toValue(org)),
  })
}

export function useOrganizationInvitationsQuery(
  org: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery<GitHubOrganizationInvitation[]>({
    key: () => ['github', 'organization-invitations', toValue(org)],
    enabled: () => Boolean(toValue(org)) && toValue(enabled),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    query: async () => requireBridge().listInvitations(toValue(org)),
  })
}

export async function inviteOrganizationMember(options: InviteOrganizationMemberOptions): Promise<void> {
  await requireBridge().inviteMember(options)
}

export async function setOrganizationMemberRole(options: SetOrganizationMemberRoleOptions): Promise<void> {
  await requireBridge().setMemberRole(options)
}

export async function removeOrganizationMember(options: OrganizationMemberOptions): Promise<void> {
  await requireBridge().removeMember(options)
}

export async function cancelOrganizationInvitation(options: CancelOrganizationInvitationOptions): Promise<void> {
  await requireBridge().cancelInvitation(options)
}

export async function setOrganizationMembershipVisibility(
  options: SetOrganizationMembershipVisibilityOptions,
): Promise<void> {
  await requireBridge().setMembershipVisibility(options)
}

// Mutations land on lists rendered by a possibly unmounted route with
// refetchOnMount:false; force refetchActive:'all' like the other modules.
export function useOrganizationPeopleInvalidation() {
  const queryCache = useQueryCache()

  return {
    invalidatePeople(org: string): void {
      void queryCache.invalidateQueries({ key: ['github', 'organization-people', org] }, 'all')
    },
    invalidateInvitations(org: string): void {
      void queryCache.invalidateQueries({ key: ['github', 'organization-invitations', org] }, 'all')
    },
  }
}
