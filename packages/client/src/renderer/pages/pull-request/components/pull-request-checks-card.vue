<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { CommitActionsPanel } from '../../../components'

const props = defineProps<{
  open: boolean
  owner: string
  repo: string
  sha: string
}>()

const { t } = useI18n()
const router = useRouter()

const shortSha = computed(() => props.sha.slice(0, 7))

function navigate(url: string): void {
  void router.push(url)
}
</script>

<template>
  <section class="grid gap-3 rounded-lg border border-border bg-card p-4">
    <header class="flex items-center gap-2">
      <h2 class="text-title font-medium text-foreground">
        {{ t('pullRequest.checks.title') }}
      </h2>
      <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-caption text-muted-foreground">
        {{ shortSha }}
      </code>
    </header>

    <CommitActionsPanel
      :open="open"
      :owner="owner"
      :repo="repo"
      :sha="sha"
      @navigate="navigate"
    />
  </section>
</template>
