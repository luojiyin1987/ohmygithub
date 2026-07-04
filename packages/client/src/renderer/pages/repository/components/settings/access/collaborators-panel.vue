<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Trash2, UserPlus } from 'lucide-vue-next'
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@oh-my-github/ui'
import {
  addCollaborator,
  cancelInvitation,
  removeCollaborator,
  updateInvitation,
} from '@/composables/github/use-repository-settings'
import { useToast } from '@/composables/use-toast'

const COLLABORATOR_ROLES: readonly GitHubRepositoryCollaboratorRole[] = ['pull', 'triage', 'push', 'maintain', 'admin']
const INVITATION_PERMISSIONS = ['read', 'triage', 'write', 'maintain', 'admin'] as const

const props = defineProps<{
  owner: string
  repo: string
  overview: GitHubRepositoryAccessOverview
}>()

const emit = defineEmits<{
  refresh: []
}>()

const { t } = useI18n()
const toast = useToast()

const newUsername = ref('')
const newRole = ref<GitHubRepositoryCollaboratorRole>('push')
const isAdding = ref(false)
const pendingKeys = ref(new Set<string>())

function isPending(key: string): boolean {
  return pendingKeys.value.has(key)
}

async function run(key: string, action: () => Promise<void>): Promise<void> {
  if (pendingKeys.value.has(key)) return
  pendingKeys.value = new Set([...pendingKeys.value, key])

  try {
    await action()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('repository.settings.access.error'))
  } finally {
    const next = new Set(pendingKeys.value)
    next.delete(key)
    pendingKeys.value = next
    emit('refresh')
  }
}

async function add(): Promise<void> {
  const username = newUsername.value.trim()
  if (!username || isAdding.value) return
  isAdding.value = true

  try {
    const result = await addCollaborator(props.owner, props.repo, username, newRole.value)
    toast.success(t(result === 'invited'
      ? 'repository.settings.access.collaborators.invited'
      : 'repository.settings.access.collaborators.added', { username }))
    newUsername.value = ''
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('repository.settings.access.error'))
  } finally {
    isAdding.value = false
    emit('refresh')
  }
}

function changeRole(login: string, value: unknown): void {
  if (typeof value !== 'string') return
  void run(`role:${login}`, () =>
    addCollaborator(props.owner, props.repo, login, value as GitHubRepositoryCollaboratorRole).then(() => undefined))
}

function remove(login: string): void {
  void run(`remove:${login}`, () => removeCollaborator(props.owner, props.repo, login))
}

function changeInvitation(id: number, value: unknown): void {
  if (typeof value !== 'string') return
  void run(`invitation:${id}`, () => updateInvitation(props.owner, props.repo, id, value))
}

function cancel(id: number): void {
  void run(`cancel:${id}`, () => cancelInvitation(props.owner, props.repo, id))
}
</script>

<template>
  <div class="grid gap-3">
    <form
      class="flex max-w-xl items-center gap-2"
      @submit.prevent="add"
    >
      <Input
        v-model="newUsername"
        autocomplete="off"
        class="flex-1"
        :placeholder="t('repository.settings.access.collaborators.addPlaceholder')"
        spellcheck="false"
      />
      <Select v-model="newRole">
        <SelectTrigger class="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="role in COLLABORATOR_ROLES"
            :key="role"
            :value="role"
          >
            {{ t(`repository.settings.access.roles.${role}`) }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Button
        :disabled="isAdding || !newUsername.trim()"
        size="sm"
        type="submit"
      >
        <Spinner
          v-if="isAdding"
          class="size-3.5"
        />
        <UserPlus
          v-else
          class="size-3.5"
          :stroke-width="1.75"
        />
        {{ t('repository.settings.access.collaborators.add') }}
      </Button>
    </form>

    <div
      v-if="overview.collaborators.length > 0 || overview.invitations.length > 0"
      class="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div
        v-for="(collaborator, index) in overview.collaborators"
        :key="collaborator.login"
        :class="[
          'flex items-center justify-between gap-4 px-4 py-2.5',
          index > 0 ? 'border-t border-border' : '',
        ]"
      >
        <div class="flex min-w-0 items-center gap-2.5">
          <img
            :alt="collaborator.login"
            class="size-6 rounded-full"
            :src="collaborator.avatarUrl"
          >
          <span class="truncate text-body font-medium text-foreground">{{ collaborator.login }}</span>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Select
            :disabled="isPending(`role:${collaborator.login}`)"
            :model-value="collaborator.roleName"
            @update:model-value="changeRole(collaborator.login, $event)"
          >
            <SelectTrigger class="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="role in COLLABORATOR_ROLES"
                :key="role"
                :value="role"
              >
                {{ t(`repository.settings.access.roles.${role}`) }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            :aria-label="t('repository.settings.access.collaborators.remove')"
            :disabled="isPending(`remove:${collaborator.login}`)"
            size="icon-sm"
            type="button"
            variant="outline"
            @click="remove(collaborator.login)"
          >
            <Trash2
              class="size-3.5 text-muted-foreground"
              :stroke-width="1.75"
            />
          </Button>
        </div>
      </div>

      <div
        v-for="invitation in overview.invitations"
        :key="invitation.id"
        class="flex items-center justify-between gap-4 border-t border-border px-4 py-2.5"
      >
        <div class="flex min-w-0 items-center gap-2.5">
          <img
            v-if="invitation.inviteeAvatarUrl"
            :alt="invitation.inviteeLogin ?? ''"
            class="size-6 rounded-full"
            :src="invitation.inviteeAvatarUrl"
          >
          <span class="truncate text-body font-medium text-foreground">
            {{ invitation.inviteeLogin ?? t('repository.settings.access.collaborators.unknownInvitee') }}
          </span>
          <span class="rounded-full bg-muted px-1.5 text-caption text-muted-foreground">
            {{ t('repository.settings.access.collaborators.pending') }}
          </span>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Select
            :disabled="isPending(`invitation:${invitation.id}`)"
            :model-value="invitation.permissions"
            @update:model-value="changeInvitation(invitation.id, $event)"
          >
            <SelectTrigger class="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="permission in INVITATION_PERMISSIONS"
                :key="permission"
                :value="permission"
              >
                {{ t(`repository.settings.access.invitationPermissions.${permission}`) }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            :aria-label="t('repository.settings.access.collaborators.cancelInvitation')"
            :disabled="isPending(`cancel:${invitation.id}`)"
            size="icon-sm"
            type="button"
            variant="outline"
            @click="cancel(invitation.id)"
          >
            <Trash2
              class="size-3.5 text-muted-foreground"
              :stroke-width="1.75"
            />
          </Button>
        </div>
      </div>
    </div>

    <p
      v-else
      class="text-body text-muted-foreground"
    >
      {{ t('repository.settings.access.collaborators.empty') }}
    </p>
  </div>
</template>
