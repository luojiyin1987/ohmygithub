<script setup lang="ts">
import type { WorkspaceTab } from '@/pages/workspace/types'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Copy, GitCommitHorizontal, ShieldCheck } from 'lucide-vue-next'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
} from '@oh-my-github/ui'
import CommitActionsDialog from '@/components/actions/commit-actions-dialog.vue'
import CommitCiStatusButton from '@/components/actions/commit-ci-status-button.vue'
import { useRepositoryCommitQuery } from '@/composables/github/use-repositories'
import ChangedFilesTree from '@/components/file-tree/changed-files-tree.vue'

const props = defineProps<{
  tab: WorkspaceTab
}>()

const { t } = useI18n()

const owner = computed(() => props.tab.owner ?? '')
const repo = computed(() => props.tab.repo ?? '')
const sha = computed(() => props.tab.commitSha ?? '')
const hasIdentity = computed(() => Boolean(owner.value && repo.value && sha.value))

const commitQuery = useRepositoryCommitQuery(owner, repo, sha, hasIdentity)
const commit = computed(() => commitQuery.data.value ?? null)
const isLoading = computed(() => commitQuery.isLoading.value)
const hasError = computed(() => Boolean(commitQuery.error.value))

const copied = ref(false)
const checksDialogOpen = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

const authorName = computed(() => commit.value?.author.name ?? commit.value?.author.login ?? '')
const authorFallback = computed(() => authorName.value.slice(0, 2).toUpperCase() || '?')
const authoredAt = computed(() =>
  commit.value?.author.date ? formatDate(commit.value.author.date) : ''
)
const bodyText = computed(() => {
  const message = commit.value?.message ?? ''
  const index = message.indexOf('\n')
  return index === -1 ? '' : message.slice(index + 1).trim()
})
const statsSummary = computed(() => {
  const stats = commit.value?.stats
  if (!stats) return ''

  return t('commit.statsSummary', {
    files: commit.value?.files.length ?? 0,
    additions: stats.additions,
    deletions: stats.deletions,
  })
})

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function refetch(): void {
  void commitQuery.refetch()
}

async function copySha(): Promise<void> {
  if (!commit.value) return

  try {
    await navigator.clipboard.writeText(commit.value.sha)
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch {
    // Clipboard unavailable — ignore.
  }
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-background">
    <div class="min-h-0 flex-1 overflow-auto">
      <div class="mx-auto grid w-full max-w-5xl gap-5 p-4 pb-8">
        <div
          v-if="isLoading && !commit"
          class="grid gap-4"
        >
          <Skeleton class="h-7 w-3/4 rounded-md" />
          <Skeleton class="h-28 w-full rounded-xl" />
          <Skeleton class="h-64 w-full rounded-xl" />
        </div>

        <Empty
          v-else-if="!hasIdentity || hasError"
          class="min-h-[20rem] border border-border bg-card"
        >
          <EmptyHeader>
            <EmptyTitle>
              {{ t('commit.error.title') }}
            </EmptyTitle>
            <EmptyDescription>
              {{ hasIdentity ? t('commit.error.description') : t('commit.missing.description') }}
            </EmptyDescription>
            <Button
              v-if="hasIdentity"
              class="justify-self-center"
              size="sm"
              type="button"
              variant="outline"
              @click="refetch"
            >
              {{ t('commit.error.retry') }}
            </Button>
          </EmptyHeader>
        </Empty>

        <template v-else-if="commit">
          <div class="flex min-w-0 items-start gap-2">
            <GitCommitHorizontal
              class="mt-1 size-5 shrink-0 text-muted-foreground"
              :stroke-width="1.75"
            />
            <h1 class="min-w-0 text-heading font-semibold leading-tight text-foreground">
              {{ commit.headline }}
            </h1>
          </div>

          <div class="grid gap-3 rounded-xl border border-border bg-card p-4">
            <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <div class="flex min-w-0 items-center gap-2">
                <Avatar class="size-6">
                  <AvatarImage
                    v-if="commit.author.avatarUrl"
                    :alt="authorName"
                    :src="commit.author.avatarUrl"
                  />
                  <AvatarFallback>{{ authorFallback }}</AvatarFallback>
                </Avatar>
                <span class="truncate text-control font-medium text-foreground">{{ authorName }}</span>
              </div>
              <span
                v-if="authoredAt"
                class="text-body text-muted-foreground"
              >
                {{ t('commit.committed', { date: authoredAt }) }}
              </span>
              <Badge
                v-if="commit.verification?.verified"
                size="sm"
                variant="secondary"
              >
                <ShieldCheck class="size-3.5 text-success" />
                {{ t('commit.verified') }}
              </Badge>
              <CommitCiStatusButton
                v-if="commit.ciState"
                :label="t(`commit.checks.${commit.ciState}`)"
                show-label
                :state="commit.ciState"
                @click="checksDialogOpen = true"
              />
            </div>

            <p
              v-if="bodyText"
              class="whitespace-pre-wrap break-words text-body text-muted-foreground"
            >{{ bodyText }}</p>

            <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-body text-muted-foreground">
              <div class="flex items-center gap-1.5">
                <span>{{ t('commit.commitSha') }}</span>
                <code class="rounded-md bg-muted px-1.5 py-0.5 font-mono tabular-nums text-foreground">{{ commit.shortSha }}</code>
                <Button
                  :aria-label="t('commit.copySha')"
                  class="size-6 text-muted-foreground"
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  @click="copySha"
                >
                  <Check
                    v-if="copied"
                    class="size-3.5 text-success"
                  />
                  <Copy
                    v-else
                    class="size-3.5"
                  />
                </Button>
              </div>

              <span
                v-if="commit.parents.length > 0"
                class="flex items-center gap-1"
              >
                {{ t('commit.parents') }}
                <code
                  v-for="parent in commit.parents"
                  :key="parent.sha"
                  class="rounded bg-muted px-1 py-0.5 font-mono tabular-nums"
                >{{ parent.shortSha }}</code>
              </span>

              <span
                v-if="statsSummary"
                class="tabular-nums"
              >{{ statsSummary }}</span>
            </div>
          </div>

          <div class="grid gap-2">
            <h2 class="text-title font-medium text-foreground">
              {{ t('commit.filesTitle') }}
            </h2>
            <div class="rounded-xl border border-border bg-card p-2">
              <ChangedFilesTree
                :files="commit.files"
                :owner="owner"
                :repo="repo"
              />
            </div>
          </div>
        </template>
      </div>
    </div>

    <CommitActionsDialog
      v-if="commit"
      v-model:open="checksDialogOpen"
      :owner="owner"
      :repo="repo"
      :sha="commit.sha"
    />
  </section>
</template>
