<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ExternalLink, Plus, Trash2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  Switch,
} from '@oh-my-github/ui'
import {
  addUserEmail,
  deleteUserEmail,
  setPrimaryEmailVisibility,
  useUserEmailsQuery,
} from '@/composables/github/use-user-settings'
import { useToast } from '@/composables/use-toast'
import SettingsRow from '../appearance-settings/settings-row.vue'
import SettingsSection from '../appearance-settings/settings-section.vue'
import GithubTabError from './github-tab-error.vue'
import GithubTabShell from './github-tab-shell.vue'
import { resolveErrorMessage } from './github-settings-utils'

const { t } = useI18n()
const toast = useToast()
const { data: emails, error: emailsError, isPending, refetch } = useUserEmailsQuery()

const newEmail = ref('')
const isAdding = ref(false)
const deletingEmail = ref<string | null>(null)
const isDeleting = ref(false)
const isPrivate = ref(false)
const isSavingVisibility = ref(false)

const primaryEmail = computed(() => (emails.value ?? []).find((email) => email.primary))

watch(primaryEmail, (value) => {
  if (value) {
    isPrivate.value = value.visibility !== 'public'
  }
}, { immediate: true })

async function addEmail(): Promise<void> {
  const email = newEmail.value.trim()
  if (!email || isAdding.value) return

  isAdding.value = true

  try {
    await addUserEmail(email)
    newEmail.value = ''
    toast.success(t('settings.githubEmails.toasts.added'), {
      description: t('settings.githubEmails.toasts.addedDescription', { email }),
    })
    await refetch()
  } catch (error) {
    toast.error(t('settings.githubEmails.toasts.failed'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    isAdding.value = false
  }
}

async function confirmDelete(): Promise<void> {
  const email = deletingEmail.value
  if (!email || isDeleting.value) return

  isDeleting.value = true

  try {
    await deleteUserEmail(email)
    deletingEmail.value = null
    toast.success(t('settings.githubEmails.toasts.deleted'))
    await refetch()
  } catch (error) {
    toast.error(t('settings.githubEmails.toasts.failed'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    isDeleting.value = false
  }
}

async function toggleVisibility(value: boolean): Promise<void> {
  if (isSavingVisibility.value) return

  isSavingVisibility.value = true
  const previous = isPrivate.value
  isPrivate.value = value

  try {
    await setPrimaryEmailVisibility(value ? 'private' : 'public')
    await refetch()
  } catch (error) {
    isPrivate.value = previous
    toast.error(t('settings.githubEmails.toasts.failed'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    isSavingVisibility.value = false
  }
}

function openEmailsOnGitHub(): void {
  void window.ohMyGithub?.links?.openExternalUrl('https://github.com/settings/emails')
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
      v-else-if="emailsError"
      :error="emailsError"
      @retry="refetch"
    />
    <template v-else>
      <SettingsSection :title="t('settings.githubEmails.sections.emails')">
        <template #actions>
          <button
            class="inline-flex items-center gap-1 text-caption text-muted-foreground transition-colors hover:text-foreground"
            type="button"
            @click="openEmailsOnGitHub"
          >
            {{ t('settings.githubEmails.changePrimary') }}
            <ExternalLink class="size-3" />
          </button>
        </template>
        <div class="divide-y divide-border">
          <div
            v-for="email in emails ?? []"
            :key="email.email"
            class="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div class="flex min-w-0 items-center gap-2">
              <p class="truncate text-control text-foreground">
                {{ email.email }}
              </p>
              <Badge
                v-if="email.primary"
                variant="secondary"
              >
                {{ t('settings.githubEmails.badges.primary') }}
              </Badge>
              <Badge
                v-if="!email.verified"
                variant="outline"
              >
                {{ t('settings.githubEmails.badges.unverified') }}
              </Badge>
              <Badge
                v-if="email.visibility === 'public'"
                variant="outline"
              >
                {{ t('settings.githubEmails.badges.public') }}
              </Badge>
            </div>
            <Button
              v-if="!email.primary"
              size="icon-sm"
              variant="ghost"
              @click="deletingEmail = email.email"
            >
              <Trash2 class="size-4" />
            </Button>
          </div>
        </div>
      </SettingsSection>

      <form
        class="flex items-center gap-2"
        @submit.prevent="addEmail"
      >
        <Input
          v-model="newEmail"
          class="flex-1"
          :placeholder="t('settings.githubEmails.addPlaceholder')"
          type="email"
        />
        <Button
          :disabled="isAdding || !newEmail.trim()"
          size="sm"
          type="submit"
          variant="outline"
        >
          <Spinner
            v-if="isAdding"
            class="size-3.5"
          />
          <Plus
            v-else
            class="size-4"
          />
          {{ t('settings.githubEmails.add') }}
        </Button>
      </form>

      <SettingsSection :title="t('settings.githubEmails.sections.privacy')">
        <SettingsRow
          :description="t('settings.githubEmails.keepPrivateDescription')"
          :label="t('settings.githubEmails.keepPrivate')"
        >
          <Switch
            :disabled="isSavingVisibility"
            :model-value="isPrivate"
            @update:model-value="toggleVisibility"
          />
        </SettingsRow>
      </SettingsSection>

      <Dialog
        :open="deletingEmail !== null"
        @update:open="(open) => { if (!open) deletingEmail = null }"
      >
        <DialogContent class="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{{ t('settings.githubEmails.delete.title') }}</DialogTitle>
            <DialogDescription>
              {{ t('settings.githubEmails.delete.description', { email: deletingEmail ?? '' }) }}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              :disabled="isDeleting"
              size="sm"
              variant="outline"
              @click="deletingEmail = null"
            >
              {{ t('settings.githubEmails.delete.cancel') }}
            </Button>
            <Button
              :disabled="isDeleting"
              size="sm"
              variant="destructive"
              @click="confirmDelete"
            >
              <Spinner
                v-if="isDeleting"
                class="size-3.5"
              />
              {{ t('settings.githubEmails.delete.confirm') }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </template>
  </GithubTabShell>
</template>
