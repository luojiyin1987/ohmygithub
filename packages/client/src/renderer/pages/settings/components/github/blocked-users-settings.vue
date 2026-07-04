<script setup lang="ts">
import { ref } from 'vue'
import { Plus } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
} from '@oh-my-github/ui'
import {
  blockUser,
  unblockUser,
  useBlockedUsersQuery,
} from '@/composables/github/use-user-settings'
import { useToast } from '@/composables/use-toast'
import SettingsSection from '../appearance-settings/settings-section.vue'
import GithubTabError from './github-tab-error.vue'
import GithubTabShell from './github-tab-shell.vue'
import { resolveErrorMessage } from './github-settings-utils'

const { t } = useI18n()
const toast = useToast()
const { data: blockedUsers, error: blockedUsersError, isPending, refetch } = useBlockedUsersQuery()

const blockingUsername = ref('')
const confirmingBlock = ref(false)
const isBlocking = ref(false)
const unblockingLogin = ref<string | null>(null)

async function confirmBlock(): Promise<void> {
  const username = blockingUsername.value.trim()
  if (!username || isBlocking.value) return

  isBlocking.value = true

  try {
    await blockUser(username)
    blockingUsername.value = ''
    confirmingBlock.value = false
    toast.success(t('settings.githubBlockedUsers.toasts.blocked', { username }))
    await refetch()
  } catch (error) {
    toast.error(t('settings.githubBlockedUsers.toasts.failed'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    isBlocking.value = false
  }
}

async function unblock(login: string): Promise<void> {
  if (unblockingLogin.value) return

  unblockingLogin.value = login

  try {
    await unblockUser(login)
    toast.success(t('settings.githubBlockedUsers.toasts.unblocked', { username: login }))
    await refetch()
  } catch (error) {
    toast.error(t('settings.githubBlockedUsers.toasts.failed'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    unblockingLogin.value = null
  }
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
      v-else-if="blockedUsersError"
      :error="blockedUsersError"
      @retry="refetch"
    />
    <template v-else>
      <p class="px-2 text-body text-muted-foreground">
        {{ t('settings.githubBlockedUsers.description') }}
      </p>

      <SettingsSection :title="t('settings.githubBlockedUsers.sections.blocked')">
        <div class="divide-y divide-border">
          <p
            v-if="!blockedUsers?.length"
            class="px-4 py-6 text-center text-body text-muted-foreground"
          >
            {{ t('settings.githubBlockedUsers.empty') }}
          </p>
          <div
            v-for="user in blockedUsers ?? []"
            :key="user.login"
            class="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div class="flex min-w-0 items-center gap-3">
              <Avatar class="size-7">
                <AvatarImage
                  :alt="user.login"
                  :src="user.avatarUrl"
                />
                <AvatarFallback>{{ user.login.slice(0, 2).toUpperCase() }}</AvatarFallback>
              </Avatar>
              <p class="truncate text-control text-foreground">
                {{ user.login }}
              </p>
            </div>
            <Button
              :disabled="unblockingLogin === user.login"
              size="sm"
              variant="outline"
              @click="unblock(user.login)"
            >
              <Spinner
                v-if="unblockingLogin === user.login"
                class="size-3.5"
              />
              {{ t('settings.githubBlockedUsers.unblock') }}
            </Button>
          </div>
        </div>
      </SettingsSection>

      <form
        class="flex items-center gap-2"
        @submit.prevent="confirmingBlock = true"
      >
        <Input
          v-model="blockingUsername"
          class="flex-1"
          :placeholder="t('settings.githubBlockedUsers.blockPlaceholder')"
        />
        <Button
          :disabled="!blockingUsername.trim()"
          size="sm"
          type="submit"
          variant="outline"
        >
          <Plus class="size-4" />
          {{ t('settings.githubBlockedUsers.block') }}
        </Button>
      </form>

      <Dialog
        v-model:open="confirmingBlock"
      >
        <DialogContent class="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{{ t('settings.githubBlockedUsers.confirm.title') }}</DialogTitle>
            <DialogDescription>
              {{ t('settings.githubBlockedUsers.confirm.description', { username: blockingUsername.trim() }) }}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              :disabled="isBlocking"
              size="sm"
              variant="outline"
              @click="confirmingBlock = false"
            >
              {{ t('settings.githubBlockedUsers.confirm.cancel') }}
            </Button>
            <Button
              :disabled="isBlocking"
              size="sm"
              variant="destructive"
              @click="confirmBlock"
            >
              <Spinner
                v-if="isBlocking"
                class="size-3.5"
              />
              {{ t('settings.githubBlockedUsers.confirm.confirm') }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </template>
  </GithubTabShell>
</template>
