<script setup lang="ts">
import type { PullRequestCommitSummary } from './types'
import type { ConversationActor } from '../../../components'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  GitCommitHorizontal,
} from 'lucide-vue-next'
import { GitHubActorLink } from '../../../components'
import CommitActionsDialog from '../../../components/actions/commit-actions-dialog.vue'
import CommitCiStatusButton from '../../../components/actions/commit-ci-status-button.vue'
import {
  formatConversationDate,
  toConversationDateTime,
} from '../../../components/conversation/format'

const props = defineProps<{
  actor: ConversationActor
  createdAt?: string | null
  commits: PullRequestCommitSummary[]
  owner: string
  repo: string
}>()

const { t } = useI18n()

const createdLabel = computed(() => formatConversationDate(props.createdAt))
const createdDateTime = computed(() => toConversationDateTime(props.createdAt))
const checksDialogOpen = ref(false)
const selectedCommitSha = ref<string | null>(null)
const commitCountLabel = computed(() => {
  if (props.commits.length === 1) return t('pullRequest.timeline.addedCommit')

  return t('pullRequest.timeline.addedCommits', { count: props.commits.length })
})

function preventPlaceholderNavigation(event: MouseEvent): void {
  event.preventDefault()
}

function openCommitActions(commit: PullRequestCommitSummary): void {
  selectedCommitSha.value = commit.oid
  checksDialogOpen.value = true
}
</script>

<template>
  <div class="grid min-w-0 gap-1">
    <div class="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-start gap-3">
      <div class="flex h-8 items-center justify-center">
        <span class="flex size-8 items-center justify-center rounded-full border border-border bg-background">
          <GitCommitHorizontal class="size-4 text-muted-foreground" />
        </span>
      </div>

      <div class="min-h-8 min-w-0 py-1 text-body leading-6">
        <GitHubActorLink
          class="mr-2 text-label align-middle"
          avatar-size="sm"
          :avatar-url="actor.avatarUrl"
          :login="actor.login"
        />
        <span class="text-muted-foreground">
          {{ commitCountLabel }}
        </span>
        <time
          v-if="createdLabel"
          class="ml-2 whitespace-nowrap text-body text-muted-foreground align-baseline"
          :datetime="createdDateTime"
        >
          {{ createdLabel }}
        </time>
      </div>
    </div>

    <div
      v-for="commit in commits"
      :key="commit.id"
      class="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-center gap-3"
    >
      <div class="flex h-9 items-center justify-center">
        <span class="size-3 rounded-full border-2 border-border bg-background" />
      </div>

      <div class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_6.5rem] items-center gap-2 py-1">
        <GitHubActorLink
          avatar-size="sm"
          :avatar-url="commit.author.avatarUrl"
          :interactive="commit.authorIsGitHubUser"
          :login="commit.author.login"
          :show-username="false"
        />

        <a
          class="min-w-0 truncate font-mono text-body text-muted-foreground underline-offset-4 outline-hidden hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring/30"
          href="#"
          @click="preventPlaceholderNavigation"
        >
          {{ commit.messageHeadline }}
        </a>

        <span class="grid w-[6.5rem] shrink-0 grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 justify-self-end">
          <CommitCiStatusButton
            :label="commit.ciState ? t(`pullRequest.checks.${commit.ciState}`) : ''"
            preserve-space
            :state="commit.ciState"
            @click="openCommitActions(commit)"
          />

          <a
            class="min-w-0 justify-self-end font-mono text-body text-muted-foreground underline-offset-4 outline-hidden hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring/30"
            href="#"
            @click="preventPlaceholderNavigation"
          >
            {{ commit.abbreviatedOid }}
          </a>
        </span>
      </div>
    </div>

    <CommitActionsDialog
      v-if="selectedCommitSha"
      v-model:open="checksDialogOpen"
      :owner="owner"
      :repo="repo"
      :sha="selectedCommitSha"
    />
  </div>
</template>
