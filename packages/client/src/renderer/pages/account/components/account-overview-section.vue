<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileText, Pin } from 'lucide-vue-next'
import { GitHubMarkdownRenderer } from '@/components'
import RepositoryCard from '@/components/github/repository-card.vue'
import AccountContributionsCard from './account-contributions-card.vue'

const props = defineProps<{
  contributions: GitHubAccountContributionYear | null
  contributionsHasError: boolean
  contributionsLoading: boolean
  overview: GitHubAccountOverview
  selectedYear: number | null
}>()

const emit = defineEmits<{
  selectRepository: [repository: GitHubAccountRepository]
  'update:selectedYear': [year: number]
}>()

const { t } = useI18n()
const readmeRepository = computed(() =>
  props.overview.profile.type === 'Organization' ? '.github' : props.overview.profile.login
)
const showContributions = computed(() =>
  props.overview.profile.type !== 'Organization' && props.overview.contributionYears.length > 0
)
</script>

<template>
  <section class="grid gap-4">
    <section
      v-if="overview.readme"
      class="overflow-hidden rounded-lg border border-border bg-card"
    >
      <div class="flex min-h-11 items-center gap-2 border-b border-border px-4">
        <FileText class="size-4 text-muted-foreground" />
        <h2 class="select-none truncate text-label font-medium text-foreground">
          {{ t('account.overview.readme') }}
        </h2>
      </div>
      <div class="p-4">
        <GitHubMarkdownRenderer
          v-if="overview.readme.format === 'markdown'"
          :content="overview.readme.content"
          :owner="overview.profile.login"
          :repo="readmeRepository"
        />
        <pre
          v-else
          class="max-h-[34rem] overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-4 font-mono text-body leading-relaxed text-foreground"
        >{{ overview.readme.content }}</pre>
      </div>
    </section>

    <section
      v-if="overview.pinnedRepositories.length > 0"
      class="grid gap-3"
    >
      <div class="flex min-w-0 select-none items-center gap-2">
        <Pin class="size-4 text-muted-foreground" />
        <h2 class="truncate text-label font-medium text-foreground">
          {{ t('account.overview.pinned') }}
        </h2>
      </div>

      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <RepositoryCard
          v-for="repository in overview.pinnedRepositories"
          :key="repository.id || repository.nameWithOwner"
          :repository="repository"
          @select="emit('selectRepository', $event)"
        />
      </div>
    </section>

    <AccountContributionsCard
      v-if="showContributions"
      :contributions="contributions"
      :has-error="contributionsHasError"
      :is-loading="contributionsLoading"
      :selected-year="selectedYear"
      :years="overview.contributionYears"
      @update:selected-year="emit('update:selectedYear', $event)"
    />
  </section>
</template>
