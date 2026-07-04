<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
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
  Textarea,
} from '@oh-my-github/ui'
import {
  addGpgKey,
  addSshKey,
  addSshSigningKey,
  deleteGpgKey,
  deleteSshKey,
  deleteSshSigningKey,
  useGpgKeysQuery,
  useSshKeysQuery,
  useSshSigningKeysQuery,
} from '@/composables/github/use-user-settings'
import { useToast } from '@/composables/use-toast'
import SettingsSection from '../appearance-settings/settings-section.vue'
import GithubTabError from './github-tab-error.vue'
import GithubTabShell from './github-tab-shell.vue'
import { formatDate, resolveErrorMessage } from './github-settings-utils'

type KeyKind = 'ssh' | 'signing' | 'gpg'

const { t, locale } = useI18n()
const toast = useToast()
const sshKeys = useSshKeysQuery()
const signingKeys = useSshSigningKeysQuery()
const gpgKeys = useGpgKeysQuery()

const addingKind = ref<KeyKind | null>(null)
const newKeyTitle = ref('')
const newKeyBody = ref('')
const isSubmitting = ref(false)
const deletingKey = ref<{ kind: KeyKind; id: number; label: string } | null>(null)
const isDeleting = ref(false)

const isLoading = computed(() =>
  sshKeys.isPending.value || signingKeys.isPending.value || gpgKeys.isPending.value)
const loadError = computed(() =>
  sshKeys.error.value ?? signingKeys.error.value ?? gpgKeys.error.value)

function refetchAll(): void {
  void sshKeys.refetch()
  void signingKeys.refetch()
  void gpgKeys.refetch()
}

const addDialogTitle = computed(() => {
  if (addingKind.value === 'gpg') return t('settings.githubKeys.add.gpgTitle')
  if (addingKind.value === 'signing') return t('settings.githubKeys.add.signingTitle')
  return t('settings.githubKeys.add.sshTitle')
})

function openAddDialog(kind: KeyKind): void {
  addingKind.value = kind
  newKeyTitle.value = ''
  newKeyBody.value = ''
}

async function submitNewKey(): Promise<void> {
  const kind = addingKind.value
  const body = newKeyBody.value.trim()
  if (!kind || !body || isSubmitting.value) return

  isSubmitting.value = true

  try {
    if (kind === 'ssh') {
      await addSshKey(newKeyTitle.value.trim(), body)
      await sshKeys.refetch()
    } else if (kind === 'signing') {
      await addSshSigningKey(newKeyTitle.value.trim(), body)
      await signingKeys.refetch()
    } else {
      await addGpgKey(body, newKeyTitle.value.trim() || undefined)
      await gpgKeys.refetch()
    }

    addingKind.value = null
    toast.success(t('settings.githubKeys.toasts.added'))
  } catch (error) {
    toast.error(t('settings.githubKeys.toasts.failed'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    isSubmitting.value = false
  }
}

async function confirmDelete(): Promise<void> {
  const target = deletingKey.value
  if (!target || isDeleting.value) return

  isDeleting.value = true

  try {
    if (target.kind === 'ssh') {
      await deleteSshKey(target.id)
      await sshKeys.refetch()
    } else if (target.kind === 'signing') {
      await deleteSshSigningKey(target.id)
      await signingKeys.refetch()
    } else {
      await deleteGpgKey(target.id)
      await gpgKeys.refetch()
    }

    deletingKey.value = null
    toast.success(t('settings.githubKeys.toasts.deleted'))
  } catch (error) {
    toast.error(t('settings.githubKeys.toasts.failed'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    isDeleting.value = false
  }
}

function keyFingerprint(key: string): string {
  const parts = key.split(' ')
  const material = parts.length > 1 ? parts[1] : key

  return `${material.slice(0, 20)}…${material.slice(-8)}`
}
</script>

<template>
  <GithubTabShell :required-scopes="['admin:public_key', 'admin:gpg_key', 'admin:ssh_signing_key']">
    <div
      v-if="isLoading"
      class="flex justify-center py-12"
    >
      <Spinner class="size-5" />
    </div>
    <GithubTabError
      v-else-if="loadError"
      :error="loadError"
      @retry="refetchAll"
    />
    <template v-else>
      <SettingsSection :title="t('settings.githubKeys.sections.ssh')">
        <template #actions>
          <Button
            size="sm"
            variant="outline"
            @click="openAddDialog('ssh')"
          >
            <Plus class="size-4" />
            {{ t('settings.githubKeys.newKey') }}
          </Button>
        </template>
        <div class="divide-y divide-border">
          <p
            v-if="!sshKeys.data.value?.length"
            class="px-4 py-6 text-center text-body text-muted-foreground"
          >
            {{ t('settings.githubKeys.empty.ssh') }}
          </p>
          <div
            v-for="key in sshKeys.data.value ?? []"
            :key="key.id"
            class="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div class="min-w-0">
              <p class="truncate text-control font-medium text-foreground">
                {{ key.title || t('settings.githubKeys.untitled') }}
              </p>
              <p class="truncate font-mono text-caption text-muted-foreground">
                {{ keyFingerprint(key.key) }}
              </p>
              <p
                v-if="key.createdAt"
                class="text-caption text-muted-foreground"
              >
                {{ t('settings.githubKeys.addedOn', { date: formatDate(key.createdAt, locale) }) }}
              </p>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              @click="deletingKey = { kind: 'ssh', id: key.id, label: key.title || keyFingerprint(key.key) }"
            >
              <Trash2 class="size-4" />
            </Button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection :title="t('settings.githubKeys.sections.signing')">
        <template #actions>
          <Button
            size="sm"
            variant="outline"
            @click="openAddDialog('signing')"
          >
            <Plus class="size-4" />
            {{ t('settings.githubKeys.newKey') }}
          </Button>
        </template>
        <div class="divide-y divide-border">
          <p
            v-if="!signingKeys.data.value?.length"
            class="px-4 py-6 text-center text-body text-muted-foreground"
          >
            {{ t('settings.githubKeys.empty.signing') }}
          </p>
          <div
            v-for="key in signingKeys.data.value ?? []"
            :key="key.id"
            class="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div class="min-w-0">
              <p class="truncate text-control font-medium text-foreground">
                {{ key.title || t('settings.githubKeys.untitled') }}
              </p>
              <p class="truncate font-mono text-caption text-muted-foreground">
                {{ keyFingerprint(key.key) }}
              </p>
              <p
                v-if="key.createdAt"
                class="text-caption text-muted-foreground"
              >
                {{ t('settings.githubKeys.addedOn', { date: formatDate(key.createdAt, locale) }) }}
              </p>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              @click="deletingKey = { kind: 'signing', id: key.id, label: key.title || keyFingerprint(key.key) }"
            >
              <Trash2 class="size-4" />
            </Button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection :title="t('settings.githubKeys.sections.gpg')">
        <template #actions>
          <Button
            size="sm"
            variant="outline"
            @click="openAddDialog('gpg')"
          >
            <Plus class="size-4" />
            {{ t('settings.githubKeys.newKey') }}
          </Button>
        </template>
        <div class="divide-y divide-border">
          <p
            v-if="!gpgKeys.data.value?.length"
            class="px-4 py-6 text-center text-body text-muted-foreground"
          >
            {{ t('settings.githubKeys.empty.gpg') }}
          </p>
          <div
            v-for="key in gpgKeys.data.value ?? []"
            :key="key.id"
            class="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <p class="truncate font-mono text-control text-foreground">
                  {{ key.keyId }}
                </p>
                <Badge
                  v-for="email in key.emails.filter((entry) => entry.verified)"
                  :key="email.email"
                  variant="outline"
                >
                  {{ email.email }}
                </Badge>
              </div>
              <p
                v-if="key.createdAt"
                class="text-caption text-muted-foreground"
              >
                {{ t('settings.githubKeys.addedOn', { date: formatDate(key.createdAt, locale) }) }}
                <template v-if="key.expiresAt">
                  · {{ t('settings.githubKeys.expiresOn', { date: formatDate(key.expiresAt, locale) }) }}
                </template>
              </p>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              @click="deletingKey = { kind: 'gpg', id: key.id, label: key.keyId }"
            >
              <Trash2 class="size-4" />
            </Button>
          </div>
        </div>
      </SettingsSection>

      <Dialog
        :open="addingKind !== null"
        @update:open="(open) => { if (!open) addingKind = null }"
      >
        <DialogContent class="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{{ addDialogTitle }}</DialogTitle>
            <DialogDescription>
              {{ addingKind === 'gpg' ? t('settings.githubKeys.add.gpgDescription') : t('settings.githubKeys.add.sshDescription') }}
            </DialogDescription>
          </DialogHeader>
          <form
            class="space-y-4"
            @submit.prevent="submitNewKey"
          >
            <label class="block space-y-1.5">
              <span class="text-control font-medium text-foreground">
                {{ addingKind === 'gpg' ? t('settings.githubKeys.add.nameOptional') : t('settings.githubKeys.add.title') }}
              </span>
              <Input
                v-model="newKeyTitle"
                :placeholder="t('settings.githubKeys.add.titlePlaceholder')"
              />
            </label>
            <label class="block space-y-1.5">
              <span class="text-control font-medium text-foreground">{{ t('settings.githubKeys.add.key') }}</span>
              <Textarea
                v-model="newKeyBody"
                class="font-mono"
                :placeholder="addingKind === 'gpg'
                  ? t('settings.githubKeys.add.gpgKeyPlaceholder')
                  : t('settings.githubKeys.add.sshKeyPlaceholder')"
                rows="6"
              />
            </label>
            <DialogFooter>
              <Button
                :disabled="isSubmitting"
                size="sm"
                type="button"
                variant="outline"
                @click="addingKind = null"
              >
                {{ t('settings.githubKeys.add.cancel') }}
              </Button>
              <Button
                :disabled="isSubmitting || !newKeyBody.trim()"
                size="sm"
                type="submit"
              >
                <Spinner
                  v-if="isSubmitting"
                  class="size-3.5"
                />
                {{ t('settings.githubKeys.add.confirm') }}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        :open="deletingKey !== null"
        @update:open="(open) => { if (!open) deletingKey = null }"
      >
        <DialogContent class="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{{ t('settings.githubKeys.delete.title') }}</DialogTitle>
            <DialogDescription>
              {{ t('settings.githubKeys.delete.description', { key: deletingKey?.label ?? '' }) }}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              :disabled="isDeleting"
              size="sm"
              variant="outline"
              @click="deletingKey = null"
            >
              {{ t('settings.githubKeys.delete.cancel') }}
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
              {{ t('settings.githubKeys.delete.confirm') }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </template>
  </GithubTabShell>
</template>
