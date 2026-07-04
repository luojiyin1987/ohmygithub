<script setup lang="ts">
import { computed, ref } from 'vue'
import { ExternalLink, Plus, Trash2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  Textarea,
} from '@oh-my-github/ui'
import { useAccountRepositoriesQuery } from '@/composables/github/use-accounts'
import {
  deleteCodespacesSecret,
  upsertCodespacesSecret,
  useAuthStateQuery,
  useCodespacesSecretsQuery,
} from '@/composables/github/use-user-settings'
import { useToast } from '@/composables/use-toast'
import SettingsSection from '../appearance-settings/settings-section.vue'
import GithubTabError from './github-tab-error.vue'
import GithubTabShell from './github-tab-shell.vue'
import { formatDate, resolveErrorMessage } from './github-settings-utils'

const SECRET_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/i

const { t, locale } = useI18n()
const toast = useToast()
const { data: authState } = useAuthStateQuery()
const { data: secrets, error: secretsError, isPending, refetch } = useCodespacesSecretsQuery()

const isEditorOpen = ref(false)
const editingSecretName = ref<string | null>(null)
const secretName = ref('')
const secretValue = ref('')
const selectedRepositoryIds = ref<Set<number>>(new Set())
const repositorySearch = ref('')
const isSubmitting = ref(false)
const deletingSecret = ref<string | null>(null)
const isDeleting = ref(false)

const viewerLogin = computed(() => authState.value?.auth?.viewer.login ?? '')
const { data: repositoryPage } = useAccountRepositoriesQuery(
  viewerLogin,
  1,
  10,
  repositorySearch,
  computed(() => isEditorOpen.value && Boolean(viewerLogin.value)),
)

const isNameValid = computed(() =>
  SECRET_NAME_PATTERN.test(secretName.value.trim()) && !secretName.value.trim().startsWith('GITHUB_'))
const canSubmit = computed(() =>
  isNameValid.value && Boolean(secretValue.value) && !isSubmitting.value)

function openCreateDialog(): void {
  editingSecretName.value = null
  secretName.value = ''
  secretValue.value = ''
  selectedRepositoryIds.value = new Set()
  repositorySearch.value = ''
  isEditorOpen.value = true
}

function openUpdateDialog(secret: GitHubCodespacesSecret): void {
  editingSecretName.value = secret.name
  secretName.value = secret.name
  secretValue.value = ''
  selectedRepositoryIds.value = new Set(secret.selectedRepositoryIds)
  repositorySearch.value = ''
  isEditorOpen.value = true
}

function toggleRepository(id: number, checked: boolean): void {
  const next = new Set(selectedRepositoryIds.value)

  if (checked) {
    next.add(id)
  } else {
    next.delete(id)
  }

  selectedRepositoryIds.value = next
}

async function submitSecret(): Promise<void> {
  if (!canSubmit.value) return

  isSubmitting.value = true

  try {
    await upsertCodespacesSecret({
      name: secretName.value.trim().toUpperCase(),
      value: secretValue.value,
      selectedRepositoryIds: [...selectedRepositoryIds.value],
    })
    isEditorOpen.value = false
    toast.success(t('settings.githubCodespaces.toasts.saved'))
    await refetch()
  } catch (error) {
    toast.error(t('settings.githubCodespaces.toasts.failed'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    isSubmitting.value = false
  }
}

async function confirmDelete(): Promise<void> {
  const name = deletingSecret.value
  if (!name || isDeleting.value) return

  isDeleting.value = true

  try {
    await deleteCodespacesSecret(name)
    deletingSecret.value = null
    toast.success(t('settings.githubCodespaces.toasts.deleted'))
    await refetch()
  } catch (error) {
    toast.error(t('settings.githubCodespaces.toasts.failed'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    isDeleting.value = false
  }
}

function openCodespacesOnGitHub(): void {
  void window.ohMyGithub?.links?.openExternalUrl('https://github.com/settings/codespaces')
}
</script>

<template>
  <GithubTabShell :required-scopes="['codespace:secrets']">
    <div
      v-if="isPending"
      class="flex justify-center py-12"
    >
      <Spinner class="size-5" />
    </div>
    <GithubTabError
      v-else-if="secretsError"
      :error="secretsError"
      @retry="refetch"
    />
    <template v-else>
      <SettingsSection :title="t('settings.githubCodespaces.sections.secrets')">
        <template #actions>
          <Button
            size="sm"
            variant="outline"
            @click="openCreateDialog"
          >
            <Plus class="size-4" />
            {{ t('settings.githubCodespaces.newSecret') }}
          </Button>
        </template>
        <div class="divide-y divide-border">
          <p
            v-if="!secrets?.length"
            class="px-4 py-6 text-center text-body text-muted-foreground"
          >
            {{ t('settings.githubCodespaces.empty') }}
          </p>
          <div
            v-for="secret in secrets ?? []"
            :key="secret.name"
            class="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div class="min-w-0">
              <p class="truncate font-mono text-control font-medium text-foreground">
                {{ secret.name }}
              </p>
              <p class="text-caption text-muted-foreground">
                {{ t('settings.githubCodespaces.repositoryCount', { count: secret.selectedRepositoryIds.length }) }}
                <template v-if="secret.updatedAt">
                  · {{ t('settings.githubCodespaces.updatedOn', { date: formatDate(secret.updatedAt, locale) }) }}
                </template>
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                @click="openUpdateDialog(secret)"
              >
                {{ t('settings.githubCodespaces.update') }}
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                @click="deletingSecret = secret.name"
              >
                <Trash2 class="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </SettingsSection>

      <p class="flex items-center gap-1 px-2 text-caption text-muted-foreground">
        {{ t('settings.githubCodespaces.preferencesHint') }}
        <button
          class="inline-flex items-center gap-1 text-caption underline-offset-2 transition-colors hover:text-foreground hover:underline"
          type="button"
          @click="openCodespacesOnGitHub"
        >
          {{ t('settings.githubCodespaces.openOnGitHub') }}
          <ExternalLink class="size-3" />
        </button>
      </p>

      <Dialog
        v-model:open="isEditorOpen"
      >
        <DialogContent class="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {{ editingSecretName
                ? t('settings.githubCodespaces.editor.updateTitle', { name: editingSecretName })
                : t('settings.githubCodespaces.editor.createTitle') }}
            </DialogTitle>
            <DialogDescription>
              {{ t('settings.githubCodespaces.editor.description') }}
            </DialogDescription>
          </DialogHeader>
          <form
            class="space-y-4"
            @submit.prevent="submitSecret"
          >
            <label class="block space-y-1.5">
              <span class="text-control font-medium text-foreground">{{ t('settings.githubCodespaces.editor.name') }}</span>
              <Input
                v-model="secretName"
                class="font-mono"
                :disabled="editingSecretName !== null"
                placeholder="NPM_TOKEN"
              />
            </label>
            <label class="block space-y-1.5">
              <span class="text-control font-medium text-foreground">{{ t('settings.githubCodespaces.editor.value') }}</span>
              <Textarea
                v-model="secretValue"
                class="font-mono"
                rows="3"
              />
            </label>
            <div class="space-y-1.5">
              <span class="text-control font-medium text-foreground">
                {{ t('settings.githubCodespaces.editor.repositories', { count: selectedRepositoryIds.size }) }}
              </span>
              <Input
                v-model="repositorySearch"
                :placeholder="t('settings.githubCodespaces.editor.searchRepositories')"
              />
              <div class="max-h-40 space-y-1 overflow-auto rounded-md border border-border p-2">
                <label
                  v-for="repository in repositoryPage?.items ?? []"
                  :key="repository.id"
                  class="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-accent"
                >
                  <Checkbox
                    :model-value="selectedRepositoryIds.has(repository.id)"
                    @update:model-value="(value) => toggleRepository(repository.id, value === true)"
                  />
                  <span class="truncate text-body text-foreground">{{ repository.nameWithOwner }}</span>
                </label>
                <p
                  v-if="!repositoryPage?.items?.length"
                  class="px-1.5 py-2 text-caption text-muted-foreground"
                >
                  {{ t('settings.githubCodespaces.editor.noRepositories') }}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                :disabled="isSubmitting"
                size="sm"
                type="button"
                variant="outline"
                @click="isEditorOpen = false"
              >
                {{ t('settings.githubCodespaces.editor.cancel') }}
              </Button>
              <Button
                :disabled="!canSubmit"
                size="sm"
                type="submit"
              >
                <Spinner
                  v-if="isSubmitting"
                  class="size-3.5"
                />
                {{ t('settings.githubCodespaces.editor.confirm') }}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        :open="deletingSecret !== null"
        @update:open="(open) => { if (!open) deletingSecret = null }"
      >
        <DialogContent class="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{{ t('settings.githubCodespaces.delete.title') }}</DialogTitle>
            <DialogDescription>
              {{ t('settings.githubCodespaces.delete.description', { name: deletingSecret ?? '' }) }}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              :disabled="isDeleting"
              size="sm"
              variant="outline"
              @click="deletingSecret = null"
            >
              {{ t('settings.githubCodespaces.delete.cancel') }}
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
              {{ t('settings.githubCodespaces.delete.confirm') }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </template>
  </GithubTabShell>
</template>
