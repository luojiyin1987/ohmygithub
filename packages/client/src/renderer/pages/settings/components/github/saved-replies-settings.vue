<script setup lang="ts">
import { ExternalLink } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { Spinner } from '@oh-my-github/ui'
import { useSavedRepliesQuery } from '@/composables/github/use-user-settings'
import SettingsSection from '../appearance-settings/settings-section.vue'
import GithubTabError from './github-tab-error.vue'
import GithubTabShell from './github-tab-shell.vue'

const { t } = useI18n()
const { data: savedReplies, error: savedRepliesError, isPending, refetch } = useSavedRepliesQuery()

function openSavedRepliesOnGitHub(): void {
  void window.ohMyGithub?.links?.openExternalUrl('https://github.com/settings/replies')
}
</script>

<template>
  <GithubTabShell>
    <div
      v-if="isPending"
      class="flex justify-center py-12"
    >
      <Spinner class="size-5" />
    </div>
    <GithubTabError
      v-else-if="savedRepliesError"
      :error="savedRepliesError"
      @retry="refetch"
    />
    <template v-else>
      <p class="px-2 text-body text-muted-foreground">
        {{ t('settings.githubSavedReplies.readOnlyNote') }}
        <button
          class="inline-flex items-center gap-1 text-body underline-offset-2 transition-colors hover:text-foreground hover:underline"
          type="button"
          @click="openSavedRepliesOnGitHub"
        >
          {{ t('settings.githubSavedReplies.editOnGitHub') }}
          <ExternalLink class="size-3" />
        </button>
      </p>

      <SettingsSection :title="t('settings.githubSavedReplies.sections.replies')">
        <div class="divide-y divide-border">
          <p
            v-if="!savedReplies?.length"
            class="px-4 py-6 text-center text-body text-muted-foreground"
          >
            {{ t('settings.githubSavedReplies.empty') }}
          </p>
          <div
            v-for="reply in savedReplies ?? []"
            :key="reply.id"
            class="space-y-1 px-4 py-3"
          >
            <p class="text-control font-medium text-foreground">
              {{ reply.title }}
            </p>
            <p class="whitespace-pre-wrap text-body text-muted-foreground">
              {{ reply.body }}
            </p>
          </div>
        </div>
      </SettingsSection>
    </template>
  </GithubTabShell>
</template>
