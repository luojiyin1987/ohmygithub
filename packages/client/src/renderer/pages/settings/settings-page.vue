<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WorkspacePage from '../workspace/workspace-page.vue'
import AppSettingsDialog from './components/app-settings-dialog.vue'
import {
  DEFAULT_SETTINGS_TAB,
  SETTINGS_TAB_IDS,
  type SettingsTabId,
} from './settings-tabs'

const route = useRoute()
const router = useRouter()
const fallbackFullPath = resolveFallbackFullPath()
const activeTab = computed<SettingsTabId>(() => normalizeSettingsTab(route.query.tab))

watch(
  () => route.query.tab,
  (tab) => {
    const normalizedTab = normalizeSettingsTab(tab)
    if (readTabQuery(tab) === normalizedTab) return

    void router.replace({
      path: '/settings',
      query: {
        tab: normalizedTab,
      },
    })
  },
  { immediate: true },
)

function selectSettingsTab(tab: SettingsTabId): void {
  if (readTabQuery(route.query.tab) === tab) return

  void router.replace({
    path: '/settings',
    query: {
      tab,
    },
  })
}

function closeSettings(): void {
  void router.replace(fallbackFullPath)
}

function normalizeSettingsTab(value: unknown): SettingsTabId {
  const tab = readTabQuery(value)
  return SETTINGS_TAB_IDS.has(tab ?? '') ? tab as SettingsTabId : DEFAULT_SETTINGS_TAB
}

function readTabQuery(value: unknown): string | null {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : null
  }

  return typeof value === 'string' ? value : null
}

function resolveFallbackFullPath(): string {
  const state = window.history.state as { back?: unknown } | null
  const back = typeof state?.back === 'string' ? state.back : ''

  if (back && !back.startsWith('/settings') && !back.startsWith('/auth')) {
    return back
  }

  return '/'
}
</script>

<template>
  <WorkspacePage />
  <AppSettingsDialog
    :active-tab="activeTab"
    @close="closeSettings"
    @select-tab="selectSettingsTab"
  />
</template>
