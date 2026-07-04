<script setup lang="ts">
import { ref } from 'vue'
import { ExternalLink } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Spinner,
  Switch,
} from '@oh-my-github/ui'
import {
  acceptOrganizationInvitation,
  setOrganizationMembershipVisibility,
  useOrganizationMembershipsQuery,
} from '@/composables/github/use-user-settings'
import { useToast } from '@/composables/use-toast'
import SettingsSection from '../appearance-settings/settings-section.vue'
import GithubTabError from './github-tab-error.vue'
import GithubTabShell from './github-tab-shell.vue'
import { resolveErrorMessage } from './github-settings-utils'

const { t } = useI18n()
const toast = useToast()
const { data: memberships, error: membershipsError, isPending, refetch } = useOrganizationMembershipsQuery()

const acceptingOrg = ref<string | null>(null)
const savingVisibilityOrg = ref<string | null>(null)

async function acceptInvitation(org: string): Promise<void> {
  if (acceptingOrg.value) return

  acceptingOrg.value = org

  try {
    await acceptOrganizationInvitation(org)
    toast.success(t('settings.githubOrganizations.toasts.accepted', { org }))
    await refetch()
  } catch (error) {
    toast.error(t('settings.githubOrganizations.toasts.failed'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    acceptingOrg.value = null
  }
}

async function toggleVisibility(org: string, isPublic: boolean): Promise<void> {
  if (savingVisibilityOrg.value) return

  savingVisibilityOrg.value = org

  try {
    await setOrganizationMembershipVisibility(org, isPublic)
    await refetch()
  } catch (error) {
    toast.error(t('settings.githubOrganizations.toasts.failed'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    savingVisibilityOrg.value = null
  }
}

function openOrganizationsOnGitHub(): void {
  void window.ohMyGithub?.links?.openExternalUrl('https://github.com/settings/organizations')
}
</script>

<template>
  <GithubTabShell :required-scopes="['admin:org']">
    <div
      v-if="isPending"
      class="flex justify-center py-12"
    >
      <Spinner class="size-5" />
    </div>
    <GithubTabError
      v-else-if="membershipsError"
      :error="membershipsError"
      @retry="refetch"
    />
    <template v-else>
      <SettingsSection :title="t('settings.githubOrganizations.sections.memberships')">
        <template #actions>
          <button
            class="inline-flex items-center gap-1 text-caption text-muted-foreground transition-colors hover:text-foreground"
            type="button"
            @click="openOrganizationsOnGitHub"
          >
            {{ t('settings.githubOrganizations.manageOnGitHub') }}
            <ExternalLink class="size-3" />
          </button>
        </template>
        <div class="divide-y divide-border">
          <p
            v-if="!memberships?.length"
            class="px-4 py-6 text-center text-body text-muted-foreground"
          >
            {{ t('settings.githubOrganizations.empty') }}
          </p>
          <div
            v-for="membership in memberships ?? []"
            :key="membership.orgLogin"
            class="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div class="flex min-w-0 items-center gap-3">
              <Avatar class="size-8 rounded-md">
                <AvatarImage
                  :alt="membership.orgLogin"
                  :src="membership.orgAvatarUrl"
                />
                <AvatarFallback>{{ membership.orgLogin.slice(0, 2).toUpperCase() }}</AvatarFallback>
              </Avatar>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <p class="truncate text-control font-medium text-foreground">
                    {{ membership.orgLogin }}
                  </p>
                  <Badge variant="secondary">
                    {{ membership.role === 'admin'
                      ? t('settings.githubOrganizations.roles.admin')
                      : t('settings.githubOrganizations.roles.member') }}
                  </Badge>
                  <Badge
                    v-if="membership.state === 'pending'"
                    variant="outline"
                  >
                    {{ t('settings.githubOrganizations.pending') }}
                  </Badge>
                </div>
                <p
                  v-if="membership.orgDescription"
                  class="truncate text-caption text-muted-foreground"
                >
                  {{ membership.orgDescription }}
                </p>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-3">
              <Button
                v-if="membership.state === 'pending'"
                :disabled="acceptingOrg === membership.orgLogin"
                size="sm"
                @click="acceptInvitation(membership.orgLogin)"
              >
                <Spinner
                  v-if="acceptingOrg === membership.orgLogin"
                  class="size-3.5"
                />
                {{ t('settings.githubOrganizations.accept') }}
              </Button>
              <label
                v-else
                class="flex items-center gap-2"
              >
                <span class="text-caption text-muted-foreground">
                  {{ t('settings.githubOrganizations.publicMembership') }}
                </span>
                <Switch
                  :disabled="savingVisibilityOrg === membership.orgLogin"
                  :model-value="membership.isPublic"
                  @update:model-value="(value) => toggleVisibility(membership.orgLogin, value === true)"
                />
              </label>
            </div>
          </div>
        </div>
      </SettingsSection>
    </template>
  </GithubTabShell>
</template>
