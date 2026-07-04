<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ExternalLink, Plus, Trash2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Textarea,
} from '@oh-my-github/ui'
import {
  addSocialAccounts,
  deleteSocialAccounts,
  updateUserProfile,
  useSocialAccountsQuery,
  useUserEmailsQuery,
  useUserSettingsProfileQuery,
} from '@/composables/github/use-user-settings'
import { useToast } from '@/composables/use-toast'
import GithubTabError from './github-tab-error.vue'
import GithubTabShell from './github-tab-shell.vue'
import { resolveErrorMessage } from './github-settings-utils'

const BIO_MAX_LENGTH = 160
const MAX_SOCIAL_ACCOUNTS = 4
const PUBLIC_EMAIL_NONE = 'none'

const { t } = useI18n()
const toast = useToast()
const { data: profile, error: profileError, isPending, refetch: refetchProfile } = useUserSettingsProfileQuery()
const { data: socialAccounts, refetch: refetchSocialAccounts } = useSocialAccountsQuery()
const { data: emails } = useUserEmailsQuery()

const form = reactive({
  name: '',
  email: PUBLIC_EMAIL_NONE,
  bio: '',
  blog: '',
  company: '',
  location: '',
  twitterUsername: '',
  hireable: false,
})
const isSaving = ref(false)
const newSocialAccountUrl = ref('')
const isAddingSocialAccount = ref(false)
const deletingSocialAccountUrl = ref<string | null>(null)

const verifiedEmails = computed(() =>
  (emails.value ?? []).filter((email) => email.verified).map((email) => email.email))
const canAddSocialAccount = computed(() =>
  (socialAccounts.value?.length ?? 0) < MAX_SOCIAL_ACCOUNTS)

watch(profile, (value) => {
  if (!value) return

  form.name = value.name ?? ''
  form.email = value.email ?? PUBLIC_EMAIL_NONE
  form.bio = value.bio ?? ''
  form.blog = value.blog ?? ''
  form.company = value.company ?? ''
  form.location = value.location ?? ''
  form.twitterUsername = value.twitterUsername ?? ''
  form.hireable = value.hireable
}, { immediate: true })

async function saveProfile(): Promise<void> {
  if (isSaving.value) return

  isSaving.value = true

  try {
    await updateUserProfile({
      name: form.name,
      email: form.email === PUBLIC_EMAIL_NONE ? '' : form.email,
      bio: form.bio.slice(0, BIO_MAX_LENGTH),
      blog: form.blog,
      company: form.company,
      location: form.location,
      twitterUsername: form.twitterUsername,
      hireable: form.hireable,
    })
    toast.success(t('settings.githubProfile.toasts.updated'))
    await refetchProfile()
  } catch (error) {
    toast.error(t('settings.githubProfile.toasts.updateFailed'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    isSaving.value = false
  }
}

async function addSocialAccount(): Promise<void> {
  const url = newSocialAccountUrl.value.trim()
  if (!url || isAddingSocialAccount.value) return

  isAddingSocialAccount.value = true

  try {
    await addSocialAccounts([url])
    newSocialAccountUrl.value = ''
    await refetchSocialAccounts()
  } catch (error) {
    toast.error(t('settings.githubProfile.toasts.socialAccountFailed'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    isAddingSocialAccount.value = false
  }
}

async function removeSocialAccount(url: string): Promise<void> {
  if (deletingSocialAccountUrl.value) return

  deletingSocialAccountUrl.value = url

  try {
    await deleteSocialAccounts([url])
    await refetchSocialAccounts()
  } catch (error) {
    toast.error(t('settings.githubProfile.toasts.socialAccountFailed'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    deletingSocialAccountUrl.value = null
  }
}

function openProfileOnGitHub(): void {
  void window.ohMyGithub?.links?.openExternalUrl('https://github.com/settings/profile')
}
</script>

<template>
  <GithubTabShell :required-scopes="['user']">
    <div
      v-if="isPending"
      class="flex justify-center py-12"
    >
      <Spinner class="size-5" />
    </div>
    <GithubTabError
      v-else-if="profileError"
      :error="profileError"
      @retry="refetchProfile"
    />
    <template v-else-if="profile">
      <div class="flex items-center gap-4">
        <Avatar class="size-16">
          <AvatarImage
            :alt="profile.login"
            :src="profile.avatarUrl"
          />
          <AvatarFallback>{{ profile.login.slice(0, 2).toUpperCase() }}</AvatarFallback>
        </Avatar>
        <div class="min-w-0">
          <p class="truncate text-control font-medium text-foreground">
            {{ profile.login }}
          </p>
          <button
            class="mt-0.5 inline-flex items-center gap-1 text-body text-muted-foreground transition-colors hover:text-foreground"
            type="button"
            @click="openProfileOnGitHub"
          >
            {{ t('settings.githubProfile.changeAvatar') }}
            <ExternalLink class="size-3" />
          </button>
        </div>
      </div>

      <form
        class="space-y-4"
        @submit.prevent="saveProfile"
      >
          <div class="grid grid-cols-2 gap-4">
            <label class="space-y-1.5">
              <span class="text-control font-medium text-foreground">{{ t('settings.githubProfile.fields.name') }}</span>
              <Input
                v-model="form.name"
                :placeholder="t('settings.githubProfile.fields.namePlaceholder')"
              />
            </label>
            <label class="space-y-1.5">
              <span class="text-control font-medium text-foreground">{{ t('settings.githubProfile.fields.publicEmail') }}</span>
              <Select v-model="form.email">
                <SelectTrigger class="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="PUBLIC_EMAIL_NONE">
                    {{ t('settings.githubProfile.fields.publicEmailNone') }}
                  </SelectItem>
                  <SelectItem
                    v-for="email in verifiedEmails"
                    :key="email"
                    :value="email"
                  >
                    {{ email }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>

          <label class="block space-y-1.5">
            <span class="flex items-baseline justify-between text-control font-medium text-foreground">
              {{ t('settings.githubProfile.fields.bio') }}
              <span class="text-caption font-normal text-muted-foreground">{{ form.bio.length }}/{{ BIO_MAX_LENGTH }}</span>
            </span>
            <Textarea
              v-model="form.bio"
              :maxlength="BIO_MAX_LENGTH"
              :placeholder="t('settings.githubProfile.fields.bioPlaceholder')"
              rows="3"
            />
          </label>

          <div class="grid grid-cols-2 gap-4">
            <label class="space-y-1.5">
              <span class="text-control font-medium text-foreground">{{ t('settings.githubProfile.fields.url') }}</span>
              <Input
                v-model="form.blog"
                placeholder="https://"
              />
            </label>
            <label class="space-y-1.5">
              <span class="text-control font-medium text-foreground">{{ t('settings.githubProfile.fields.twitter') }}</span>
              <Input
                v-model="form.twitterUsername"
                :placeholder="t('settings.githubProfile.fields.twitterPlaceholder')"
              />
            </label>
            <label class="space-y-1.5">
              <span class="text-control font-medium text-foreground">{{ t('settings.githubProfile.fields.company') }}</span>
              <Input
                v-model="form.company"
                :placeholder="t('settings.githubProfile.fields.companyPlaceholder')"
              />
            </label>
            <label class="space-y-1.5">
              <span class="text-control font-medium text-foreground">{{ t('settings.githubProfile.fields.location') }}</span>
              <Input
                v-model="form.location"
                :placeholder="t('settings.githubProfile.fields.locationPlaceholder')"
              />
            </label>
          </div>

          <label class="flex items-center gap-2">
            <Checkbox
              :model-value="form.hireable"
              @update:model-value="(value) => form.hireable = value === true"
            />
            <span class="text-control text-foreground">{{ t('settings.githubProfile.fields.hireable') }}</span>
          </label>

          <div class="flex justify-end">
            <Button
              :disabled="isSaving"
              size="sm"
              type="submit"
            >
              <Spinner
                v-if="isSaving"
                class="size-3.5"
              />
              {{ t('settings.githubProfile.update') }}
            </Button>
          </div>
      </form>

      <section class="space-y-2.5">
        <h3 class="select-none text-caption font-medium text-muted-foreground">
          {{ t('settings.githubProfile.sections.socialAccounts') }}
        </h3>
        <div
          v-for="account in socialAccounts ?? []"
          :key="account.url"
          class="flex items-center justify-between gap-4 border-b border-border py-2 last:border-b-0"
        >
          <div class="min-w-0">
            <p class="truncate text-control text-foreground">
              {{ account.url }}
            </p>
            <p class="text-caption text-muted-foreground">
              {{ account.provider }}
            </p>
          </div>
          <Button
            :disabled="deletingSocialAccountUrl === account.url"
            size="icon-sm"
            variant="ghost"
            @click="removeSocialAccount(account.url)"
          >
            <Trash2 class="size-4" />
          </Button>
        </div>
        <form
          v-if="canAddSocialAccount"
          class="flex items-center gap-2"
          @submit.prevent="addSocialAccount"
        >
          <Input
            v-model="newSocialAccountUrl"
            class="flex-1"
            :placeholder="t('settings.githubProfile.socialAccountPlaceholder')"
            type="url"
          />
          <Button
            :disabled="isAddingSocialAccount || !newSocialAccountUrl.trim()"
            size="sm"
            type="submit"
            variant="outline"
          >
            <Plus class="size-4" />
            {{ t('settings.githubProfile.addSocialAccount') }}
          </Button>
        </form>
      </section>
    </template>
  </GithubTabShell>
</template>
