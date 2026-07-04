import { computed } from 'vue'
import { useQuery } from '@pinia/colada'

const SCOPE_ANCESTORS: Record<string, string[]> = {
  'read:user': ['user'],
  'user:email': ['user'],
  'user:follow': ['user'],
  'read:org': ['write:org', 'admin:org'],
  'write:org': ['admin:org'],
  'read:public_key': ['write:public_key', 'admin:public_key'],
  'write:public_key': ['admin:public_key'],
  'read:gpg_key': ['write:gpg_key', 'admin:gpg_key'],
  'write:gpg_key': ['admin:gpg_key'],
  'read:ssh_signing_key': ['write:ssh_signing_key', 'admin:ssh_signing_key'],
  'write:ssh_signing_key': ['admin:ssh_signing_key'],
  'codespace:secrets': ['codespace'],
}

export function useAuthStateQuery() {
  return useQuery<AuthState | null>({
    key: () => ['github', 'auth-state'],
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 30,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    query: async () => {
      if (!window.ohMyGithub?.auth) return null

      return window.ohMyGithub.auth.get()
    },
  })
}

export function findMissingScopes(auth: AuthState | null, requiredScopes: string[]): string[] {
  if (!auth?.isAuthenticated || !auth.auth) return []
  // Personal tokens store no scope list; assume the user granted what they need
  // and let API errors surface instead of blocking the UI.
  if (auth.auth.method === 'personal_token') return []

  const granted = new Set(auth.auth.scopes)

  return requiredScopes.filter((scope) => !isScopeSatisfied(granted, scope))
}

function isScopeSatisfied(granted: Set<string>, scope: string): boolean {
  if (granted.has(scope)) return true

  return (SCOPE_ANCESTORS[scope] ?? []).some((ancestor) => granted.has(ancestor))
}

function useUserSettingsQuery<T>(keySuffix: string, run: () => Promise<T>) {
  const { data: authState } = useAuthStateQuery()
  const isAuthenticated = computed(() => Boolean(authState.value?.isAuthenticated))

  return useQuery<T>({
    key: () => ['github', 'user-settings', keySuffix],
    enabled: () => isAuthenticated.value,
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 30,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    query: () => {
      assertUserSettingsBridge()
      return run()
    },
  })
}

export function useUserSettingsProfileQuery() {
  return useUserSettingsQuery('profile', () => window.ohMyGithub.userSettings.getProfile())
}

export function useSocialAccountsQuery() {
  return useUserSettingsQuery('social-accounts', () =>
    window.ohMyGithub.userSettings.listSocialAccounts())
}

export function useUserEmailsQuery() {
  return useUserSettingsQuery('emails', () => window.ohMyGithub.userSettings.listEmails())
}

export function useSshKeysQuery() {
  return useUserSettingsQuery('ssh-keys', () => window.ohMyGithub.userSettings.listSshKeys())
}

export function useGpgKeysQuery() {
  return useUserSettingsQuery('gpg-keys', () => window.ohMyGithub.userSettings.listGpgKeys())
}

export function useSshSigningKeysQuery() {
  return useUserSettingsQuery('ssh-signing-keys', () =>
    window.ohMyGithub.userSettings.listSshSigningKeys())
}

export function useBlockedUsersQuery() {
  return useUserSettingsQuery('blocked-users', () =>
    window.ohMyGithub.userSettings.listBlockedUsers())
}

export function useInteractionLimitsQuery() {
  return useUserSettingsQuery('interaction-limits', () =>
    window.ohMyGithub.userSettings.getInteractionLimits())
}

export function useOrganizationMembershipsQuery() {
  return useUserSettingsQuery('organization-memberships', () =>
    window.ohMyGithub.userSettings.listOrganizationMemberships())
}

export function useCodespacesSecretsQuery() {
  return useUserSettingsQuery('codespaces-secrets', () =>
    window.ohMyGithub.userSettings.listCodespacesSecrets())
}

export function useSavedRepliesQuery() {
  return useUserSettingsQuery('saved-replies', () =>
    window.ohMyGithub.userSettings.listSavedReplies())
}

export async function updateUserProfile(
  input: UpdateUserSettingsProfileInput,
): Promise<GitHubUserSettingsProfile> {
  assertUserSettingsBridge()

  return window.ohMyGithub.userSettings.updateProfile(input)
}

export async function addSocialAccounts(urls: string[]): Promise<GitHubSocialAccount[]> {
  assertUserSettingsBridge()

  return window.ohMyGithub.userSettings.addSocialAccounts(urls)
}

export async function deleteSocialAccounts(urls: string[]): Promise<void> {
  assertUserSettingsBridge()

  await window.ohMyGithub.userSettings.deleteSocialAccounts(urls)
}

export async function addUserEmail(email: string): Promise<void> {
  assertUserSettingsBridge()

  await window.ohMyGithub.userSettings.addEmail(email)
}

export async function deleteUserEmail(email: string): Promise<void> {
  assertUserSettingsBridge()

  await window.ohMyGithub.userSettings.deleteEmail(email)
}

export async function setPrimaryEmailVisibility(visibility: 'public' | 'private'): Promise<void> {
  assertUserSettingsBridge()

  await window.ohMyGithub.userSettings.setPrimaryEmailVisibility(visibility)
}

export async function addSshKey(title: string, key: string): Promise<GitHubSshKey> {
  assertUserSettingsBridge()

  return window.ohMyGithub.userSettings.addSshKey(title, key)
}

export async function deleteSshKey(keyId: number): Promise<void> {
  assertUserSettingsBridge()

  await window.ohMyGithub.userSettings.deleteSshKey(keyId)
}

export async function addGpgKey(key: string, name?: string): Promise<GitHubGpgKey> {
  assertUserSettingsBridge()

  return window.ohMyGithub.userSettings.addGpgKey(key, name)
}

export async function deleteGpgKey(keyId: number): Promise<void> {
  assertUserSettingsBridge()

  await window.ohMyGithub.userSettings.deleteGpgKey(keyId)
}

export async function addSshSigningKey(title: string, key: string): Promise<GitHubSshKey> {
  assertUserSettingsBridge()

  return window.ohMyGithub.userSettings.addSshSigningKey(title, key)
}

export async function deleteSshSigningKey(keyId: number): Promise<void> {
  assertUserSettingsBridge()

  await window.ohMyGithub.userSettings.deleteSshSigningKey(keyId)
}

export async function blockUser(username: string): Promise<void> {
  assertUserSettingsBridge()

  await window.ohMyGithub.userSettings.blockUser(username)
}

export async function unblockUser(username: string): Promise<void> {
  assertUserSettingsBridge()

  await window.ohMyGithub.userSettings.unblockUser(username)
}

export async function setInteractionLimits(
  limit: GitHubInteractionLimitGroup,
  expiry?: GitHubInteractionLimitExpiry,
): Promise<GitHubInteractionLimits | null> {
  assertUserSettingsBridge()

  return window.ohMyGithub.userSettings.setInteractionLimits(limit, expiry)
}

export async function clearInteractionLimits(): Promise<void> {
  assertUserSettingsBridge()

  await window.ohMyGithub.userSettings.clearInteractionLimits()
}

export async function acceptOrganizationInvitation(org: string): Promise<void> {
  assertUserSettingsBridge()

  await window.ohMyGithub.userSettings.acceptOrganizationInvitation(org)
}

export async function setOrganizationMembershipVisibility(
  org: string,
  isPublic: boolean,
): Promise<void> {
  assertUserSettingsBridge()

  await window.ohMyGithub.userSettings.setOrganizationMembershipVisibility(org, isPublic)
}

export async function upsertCodespacesSecret(input: UpsertCodespacesSecretInput): Promise<void> {
  assertUserSettingsBridge()

  await window.ohMyGithub.userSettings.upsertCodespacesSecret(input)
}

export async function deleteCodespacesSecret(name: string): Promise<void> {
  assertUserSettingsBridge()

  await window.ohMyGithub.userSettings.deleteCodespacesSecret(name)
}

function assertUserSettingsBridge(): void {
  if (!window.ohMyGithub?.userSettings) {
    throw new Error('GitHub user settings bridge is unavailable')
  }
}
