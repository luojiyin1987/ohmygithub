<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Spinner } from '@oh-my-github/ui'
import TabSwitcher from '@/components/navigation/tab-switcher.vue'
import {
  useRepositoryAccessOverviewQuery,
  useRepositorySettingsInvalidation,
} from '@/composables/github/use-repository-settings'
import CollaboratorsPanel from './collaborators-panel.vue'
import TeamsPanel from './teams-panel.vue'
import ModerationPanel from './moderation-panel.vue'

const props = defineProps<{
  owner: string
  repo: string
  settingsSub?: string
}>()

const emit = defineEmits<{
  'update:settingsSub': [sub: string]
}>()

const { t } = useI18n()
const { invalidateAccessOverview } = useRepositorySettingsInvalidation()

const hasIdentity = computed(() => Boolean(props.owner && props.repo))
const overviewQuery = useRepositoryAccessOverviewQuery(
  () => props.owner,
  () => props.repo,
  hasIdentity,
)
const overview = computed(() => overviewQuery.data.value ?? null)
const isLoading = computed(() => overviewQuery.isLoading.value)
const hasError = computed(() => Boolean(overviewQuery.error.value))

const activeTab = ref(props.settingsSub ?? 'collaborators')

watch(
  () => props.settingsSub,
  (sub) => {
    if (sub && sub !== activeTab.value) {
      activeTab.value = sub
    }
  },
)

const tabs = computed(() => {
  const items = [
    { id: 'collaborators', label: t('repository.settings.access.tabs.collaborators') },
    { id: 'teams', label: t('repository.settings.access.tabs.teams') },
    { id: 'moderation', label: t('repository.settings.access.tabs.moderation') },
  ]

  if (overview.value && overview.value.ownerType !== 'Organization') {
    return items.filter((item) => item.id !== 'teams')
  }

  return items
})

function setActiveTab(id: string): void {
  activeTab.value = id
  emit('update:settingsSub', id)
}

function refresh(): void {
  invalidateAccessOverview(props.owner, props.repo)
}

function retry(): void {
  void overviewQuery.refetch()
}
</script>

<template>
  <div class="grid gap-4">
    <TabSwitcher
      :active-id="activeTab"
      :navigation-label="t('repository.settings.access.navigation')"
      :tabs="tabs"
      @update:active-id="setActiveTab"
    />

    <div class="mx-auto w-full max-w-3xl space-y-8 px-2">
      <ModerationPanel
        v-if="activeTab === 'moderation'"
        :owner="owner"
        :repo="repo"
      />

    <div
      v-else-if="isLoading"
      class="flex min-h-[12rem] items-center justify-center"
    >
      <Spinner class="size-5 text-muted-foreground" />
    </div>

    <div
      v-else-if="hasError || !overview"
      class="grid min-h-[8rem] place-content-center gap-3 text-center"
    >
      <p class="text-body text-destructive">
        {{ t('repository.settings.access.loadError') }}
      </p>
      <Button
        class="justify-self-center"
        size="sm"
        type="button"
        variant="outline"
        @click="retry"
      >
        {{ t('repository.settings.general.retry') }}
      </Button>
    </div>

    <CollaboratorsPanel
      v-else-if="activeTab === 'collaborators'"
      :overview="overview"
      :owner="owner"
      :repo="repo"
      @refresh="refresh"
    />

      <TeamsPanel
        v-else-if="activeTab === 'teams'"
        :overview="overview"
        :owner="owner"
        :repo="repo"
        @refresh="refresh"
      />
    </div>
  </div>
</template>
