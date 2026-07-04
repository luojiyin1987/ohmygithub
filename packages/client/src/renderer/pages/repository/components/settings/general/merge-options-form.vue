<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@oh-my-github/ui'
import {
  setDiscussionsEnabled,
  setImmutableReleases,
  setSponsorshipsEnabled,
  updateGeneralSettings,
} from '@/composables/github/use-repository-settings'
import { useToast } from '@/composables/use-toast'
import SettingsToggleRow from './settings-toggle-row.vue'

const props = defineProps<{
  owner: string
  repo: string
  settings: GitHubRepositoryGeneralSettings
}>()

const emit = defineEmits<{
  refresh: []
}>()

const { t } = useI18n()
const toast = useToast()

const pendingKeys = ref(new Set<string>())

const SQUASH_DEFAULT_OPTIONS = [
  'PR_TITLE|PR_BODY',
  'PR_TITLE|COMMIT_MESSAGES',
  'PR_TITLE|BLANK',
  'COMMIT_OR_PR_TITLE|COMMIT_MESSAGES',
] as const

const MERGE_DEFAULT_OPTIONS = [
  'PR_TITLE|PR_BODY',
  'PR_TITLE|BLANK',
  'MERGE_MESSAGE|PR_TITLE',
] as const

const squashDefault = computed(() =>
  `${props.settings.squashMergeCommitTitle ?? 'PR_TITLE'}|${props.settings.squashMergeCommitMessage ?? 'COMMIT_MESSAGES'}`)
const mergeDefault = computed(() =>
  `${props.settings.mergeCommitTitle ?? 'MERGE_MESSAGE'}|${props.settings.mergeCommitMessage ?? 'PR_TITLE'}`)

function isPending(key: string): boolean {
  return pendingKeys.value.has(key)
}

async function run(key: string, action: () => Promise<void>): Promise<void> {
  if (pendingKeys.value.has(key)) return
  pendingKeys.value = new Set([...pendingKeys.value, key])

  try {
    await action()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('repository.settings.general.saveError'))
  } finally {
    const next = new Set(pendingKeys.value)
    next.delete(key)
    pendingKeys.value = next
    emit('refresh')
  }
}

function patchToggle(key: keyof UpdateRepositoryGeneralSettingsInput, value: boolean): void {
  void run(key, () => updateGeneralSettings(props.owner, props.repo, { [key]: value }))
}

function toggleDiscussions(value: boolean): void {
  void run('discussions', () => setDiscussionsEnabled(props.settings.repositoryNodeId, value))
}

function toggleSponsorships(value: boolean): void {
  void run('sponsorships', () => setSponsorshipsEnabled(props.settings.repositoryNodeId, value))
}

function toggleImmutableReleases(value: boolean): void {
  void run('immutableReleases', () => setImmutableReleases(props.owner, props.repo, value))
}

function updateSquashDefault(value: unknown): void {
  if (typeof value !== 'string' || value === squashDefault.value) return
  const [title, message] = value.split('|')
  void run('squashDefaults', () => updateGeneralSettings(props.owner, props.repo, {
    squashMergeCommitTitle: title as GitHubSquashMergeCommitTitle,
    squashMergeCommitMessage: message as GitHubSquashMergeCommitMessage,
  }))
}

function updateMergeDefault(value: unknown): void {
  if (typeof value !== 'string' || value === mergeDefault.value) return
  const [title, message] = value.split('|')
  void run('mergeDefaults', () => updateGeneralSettings(props.owner, props.repo, {
    mergeCommitTitle: title as GitHubMergeCommitTitle,
    mergeCommitMessage: message as GitHubMergeCommitMessage,
  }))
}

function defaultsLabel(prefix: 'squash' | 'merge', option: string): string {
  return t(`repository.settings.general.pullRequests.defaults.${prefix}.${option.replace('|', '_')}`)
}
</script>

<template>
  <section class="grid gap-1">
    <h3 class="text-control font-medium text-foreground">
      {{ t('repository.settings.general.features.title') }}
    </h3>

    <SettingsToggleRow
      :disabled="isPending('hasWiki')"
      :model-value="settings.hasWiki"
      :title="t('repository.settings.general.features.wikis')"
      @update:model-value="patchToggle('hasWiki', $event)"
    />
    <SettingsToggleRow
      :disabled="isPending('hasIssues')"
      :model-value="settings.hasIssues"
      :title="t('repository.settings.general.features.issues')"
      @update:model-value="patchToggle('hasIssues', $event)"
    />
    <SettingsToggleRow
      :disabled="isPending('hasProjects')"
      :model-value="settings.hasProjects"
      :title="t('repository.settings.general.features.projects')"
      @update:model-value="patchToggle('hasProjects', $event)"
    />
    <SettingsToggleRow
      :disabled="isPending('discussions')"
      :model-value="settings.hasDiscussions"
      :title="t('repository.settings.general.features.discussions')"
      @update:model-value="toggleDiscussions"
    />
    <SettingsToggleRow
      :description="settings.hasSponsorships === null
        ? t('repository.settings.general.features.sponsorshipsUnavailable')
        : undefined"
      :disabled="settings.hasSponsorships === null || isPending('sponsorships')"
      :model-value="settings.hasSponsorships === true"
      :title="t('repository.settings.general.features.sponsorships')"
      @update:model-value="toggleSponsorships"
    />
    <SettingsToggleRow
      :disabled="isPending('isTemplate')"
      :model-value="settings.isTemplate"
      :title="t('repository.settings.general.template')"
      @update:model-value="patchToggle('isTemplate', $event)"
    />
    <SettingsToggleRow
      :disabled="isPending('webCommitSignoffRequired')"
      :model-value="settings.webCommitSignoffRequired"
      :title="t('repository.settings.general.signoff')"
      @update:model-value="patchToggle('webCommitSignoffRequired', $event)"
    />

    <h3 class="mt-4 text-control font-medium text-foreground">
      {{ t('repository.settings.general.pullRequests.title') }}
    </h3>

    <SettingsToggleRow
      :disabled="isPending('allowMergeCommit')"
      :model-value="settings.allowMergeCommit"
      :title="t('repository.settings.general.pullRequests.mergeCommits')"
      @update:model-value="patchToggle('allowMergeCommit', $event)"
    />
    <div
      v-if="settings.allowMergeCommit"
      class="flex items-center justify-between gap-6 py-1 pl-4"
    >
      <span class="text-body text-muted-foreground">
        {{ t('repository.settings.general.pullRequests.mergeDefaults') }}
      </span>
      <Select
        :disabled="isPending('mergeDefaults')"
        :model-value="mergeDefault"
        @update:model-value="updateMergeDefault"
      >
        <SelectTrigger class="w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in MERGE_DEFAULT_OPTIONS"
            :key="option"
            :value="option"
          >
            {{ defaultsLabel('merge', option) }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <SettingsToggleRow
      :disabled="isPending('allowSquashMerge')"
      :model-value="settings.allowSquashMerge"
      :title="t('repository.settings.general.pullRequests.squashMerging')"
      @update:model-value="patchToggle('allowSquashMerge', $event)"
    />
    <div
      v-if="settings.allowSquashMerge"
      class="flex items-center justify-between gap-6 py-1 pl-4"
    >
      <span class="text-body text-muted-foreground">
        {{ t('repository.settings.general.pullRequests.squashDefaults') }}
      </span>
      <Select
        :disabled="isPending('squashDefaults')"
        :model-value="squashDefault"
        @update:model-value="updateSquashDefault"
      >
        <SelectTrigger class="w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in SQUASH_DEFAULT_OPTIONS"
            :key="option"
            :value="option"
          >
            {{ defaultsLabel('squash', option) }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <SettingsToggleRow
      :disabled="isPending('allowRebaseMerge')"
      :model-value="settings.allowRebaseMerge"
      :title="t('repository.settings.general.pullRequests.rebaseMerging')"
      @update:model-value="patchToggle('allowRebaseMerge', $event)"
    />
    <SettingsToggleRow
      :disabled="isPending('allowUpdateBranch')"
      :model-value="settings.allowUpdateBranch"
      :title="t('repository.settings.general.pullRequests.updateBranch')"
      @update:model-value="patchToggle('allowUpdateBranch', $event)"
    />
    <SettingsToggleRow
      :disabled="isPending('allowAutoMerge')"
      :model-value="settings.allowAutoMerge"
      :title="t('repository.settings.general.pullRequests.autoMerge')"
      @update:model-value="patchToggle('allowAutoMerge', $event)"
    />
    <SettingsToggleRow
      :disabled="isPending('deleteBranchOnMerge')"
      :model-value="settings.deleteBranchOnMerge"
      :title="t('repository.settings.general.pullRequests.deleteBranchOnMerge')"
      @update:model-value="patchToggle('deleteBranchOnMerge', $event)"
    />

    <template v-if="settings.immutableReleases !== null">
      <h3 class="mt-4 text-control font-medium text-foreground">
        {{ t('repository.settings.general.releases.title') }}
      </h3>

      <SettingsToggleRow
        :description="t('repository.settings.general.releases.immutableHint')"
        :disabled="isPending('immutableReleases')"
        :model-value="settings.immutableReleases === true"
        :title="t('repository.settings.general.releases.immutable')"
        @update:model-value="toggleImmutableReleases"
      />
    </template>
  </section>
</template>
