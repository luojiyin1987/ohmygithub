<script setup lang="ts">
import type { RepositorySettingsSectionId } from '../types'
import GeneralSection from './general/general-section.vue'
import AccessSection from './access/access-section.vue'
import AutomationSection from './automation/automation-section.vue'
import SecuritySection from './security/security-section.vue'
import IntegrationsSection from './integrations/integrations-section.vue'

defineProps<{
  category: RepositorySettingsSectionId
  owner: string
  repo: string
  settingsSub?: string
}>()

const emit = defineEmits<{
  renamed: [newName: string]
  deleted: []
  'update:settingsSub': [sub: string]
}>()
</script>

<template>
  <GeneralSection
    v-if="category === 'settingsGeneral'"
    :owner="owner"
    :repo="repo"
    @deleted="emit('deleted')"
    @renamed="emit('renamed', $event)"
  />

  <AccessSection
    v-else-if="category === 'settingsAccess'"
    :owner="owner"
    :repo="repo"
    :settings-sub="settingsSub"
    @update:settings-sub="emit('update:settingsSub', $event)"
  />

  <AutomationSection
    v-else-if="category === 'settingsAutomation'"
    :owner="owner"
    :repo="repo"
    :settings-sub="settingsSub"
    @update:settings-sub="emit('update:settingsSub', $event)"
  />

  <SecuritySection
    v-else-if="category === 'settingsSecurity'"
    :owner="owner"
    :repo="repo"
    :settings-sub="settingsSub"
    @update:settings-sub="emit('update:settingsSub', $event)"
  />

  <IntegrationsSection
    v-else
    :owner="owner"
    :repo="repo"
    :settings-sub="settingsSub"
    @update:settings-sub="emit('update:settingsSub', $event)"
  />
</template>
