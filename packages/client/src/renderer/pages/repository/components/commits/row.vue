<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Copy } from 'lucide-vue-next'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
} from '@oh-my-github/ui'
import CommitActionsDialog from '@/components/actions/commit-actions-dialog.vue'
import CommitCiStatusButton from '@/components/actions/commit-ci-status-button.vue'

const props = defineProps<{
  commit: GitHubRepositoryCommit
  owner: string
  repo: string
}>()

const emit = defineEmits<{
  select: [commit: GitHubRepositoryCommit]
}>()

const { t } = useI18n()

const copied = ref(false)
const checksDialogOpen = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

const authorName = computed(() => props.commit.author.name ?? props.commit.author.login ?? '')
const authorFallback = computed(() => authorName.value.slice(0, 2).toUpperCase() || '?')
const committedAt = computed(() =>
  props.commit.committedDate ? formatDate(props.commit.committedDate) : ''
)
const metaText = computed(() => {
  const parts: string[] = []
  if (authorName.value) parts.push(authorName.value)
  if (committedAt.value) parts.push(t('repository.commits.meta.committed', { date: committedAt.value }))
  return parts.join(' · ')
})

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function selectCommit(): void {
  emit('select', props.commit)
}

async function copySha(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.commit.sha)
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch {
    // Clipboard unavailable — ignore.
  }
}

onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer)
})
</script>

<template>
  <div
    class="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4 text-left outline-hidden transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/30"
    role="button"
    tabindex="0"
    @click="selectCommit"
    @keydown.enter.prevent="selectCommit"
    @keydown.space.prevent="selectCommit"
  >
    <Avatar class="size-7 shrink-0">
      <AvatarImage
        v-if="commit.author.avatarUrl"
        :alt="authorName"
        :src="commit.author.avatarUrl"
      />
      <AvatarFallback>{{ authorFallback }}</AvatarFallback>
    </Avatar>

    <div class="grid min-w-0 gap-1">
      <span class="min-w-0 truncate text-control font-medium text-foreground">
        {{ commit.headline }}
      </span>
      <span class="min-w-0 truncate text-body text-muted-foreground">
        {{ metaText }}
      </span>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <span
        v-if="commit.ciState"
        class="flex size-4 items-center justify-center"
      >
        <CommitCiStatusButton
          :label="t(`repository.commits.checks.${commit.ciState}`)"
          :state="commit.ciState"
          @click="checksDialogOpen = true"
        />
      </span>
      <code class="rounded-md bg-muted px-1.5 py-0.5 font-mono text-body tabular-nums text-muted-foreground">
        {{ commit.shortSha }}
      </code>
      <Button
        :aria-label="t('repository.commits.copySha')"
        class="text-muted-foreground"
        size="icon-sm"
        type="button"
        variant="ghost"
        @click.stop="copySha"
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
  </div>

  <CommitActionsDialog
    v-model:open="checksDialogOpen"
    :owner="owner"
    :repo="repo"
    :sha="commit.sha"
  />
</template>
