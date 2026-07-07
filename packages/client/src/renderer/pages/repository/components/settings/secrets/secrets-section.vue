<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TabSwitcher from '@/components/navigation/tab-switcher.vue'
import SecretsPanel from './secrets-panel.vue'

const SCOPES: readonly GitHubRepositorySecretScope[] = ['actions', 'codespaces', 'dependabot']

const props = defineProps<{
  owner: string
  repo: string
  settingsSub?: string
}>()

const emit = defineEmits<{
  'update:settingsSub': [sub: string]
}>()

const { t } = useI18n()

const activeTab = ref(sanitizeScope(props.settingsSub) ?? 'actions')

watch(
  () => props.settingsSub,
  (sub) => {
    const scope = sanitizeScope(sub)
    if (scope && scope !== activeTab.value) {
      activeTab.value = scope
    }
  },
)

const tabs = computed(() => SCOPES.map((scope) => ({
  id: scope,
  label: t(`repository.settings.secrets.tabs.${scope}`),
})))

function sanitizeScope(value: string | undefined): GitHubRepositorySecretScope | undefined {
  return SCOPES.find((scope) => scope === value)
}

function setActiveTab(id: string): void {
  const scope = sanitizeScope(id)
  if (!scope) return
  activeTab.value = scope
  emit('update:settingsSub', scope)
}
</script>

<template>
  <div class="grid gap-4">
    <TabSwitcher
      :active-id="activeTab"
      :navigation-label="t('repository.settings.secrets.navigation')"
      :tabs="tabs"
      @update:active-id="setActiveTab"
    />

    <div class="mx-auto w-full max-w-3xl space-y-8 px-2">
      <SecretsPanel
        :owner="owner"
        :repo="repo"
        :scope="activeTab"
      />
    </div>
  </div>
</template>
