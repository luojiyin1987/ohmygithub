<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ExternalLink, Link2, Trash2 } from 'lucide-vue-next'
import { Button, Input, Spinner, Switch } from '@oh-my-github/ui'
import TabSwitcher from '@/components/navigation/tab-switcher.vue'
import {
  createAutolink,
  deleteAutolink,
  useAutolinksQuery,
  useRepositorySettingsInvalidation,
} from '@/composables/github/use-repository-settings'
import { useToast } from '@/composables/use-toast'

const EXTERNAL_TABS: Record<string, string> = {
  'github-apps': '/installations',
  'email-notifications': '/notifications',
}

const props = defineProps<{
  owner: string
  repo: string
  settingsSub?: string
}>()

const emit = defineEmits<{
  'update:settingsSub': [sub: string]
}>()

const { t } = useI18n()
const toast = useToast()
const { invalidateAutolinks } = useRepositorySettingsInvalidation()

const activeTab = ref(props.settingsSub ?? 'autolinks')

watch(
  () => props.settingsSub,
  (sub) => {
    if (sub && sub !== activeTab.value) {
      activeTab.value = sub
    }
  },
)

const tabs = computed(() => [
  { id: 'autolinks', label: t('repository.settings.links.autolinks') },
  { id: 'github-apps', label: t('repository.settings.links.githubApps'), icon: ExternalLink },
  { id: 'email-notifications', label: t('repository.settings.links.emailNotifications'), icon: ExternalLink },
])

function setActiveTab(id: string): void {
  const externalPath = EXTERNAL_TABS[id]
  if (externalPath) {
    const url = `https://github.com/${encodeURIComponent(props.owner)}/${encodeURIComponent(props.repo)}/settings${externalPath}`
    void window.ohMyGithub?.links?.openExternalUrl(url)
    return
  }

  activeTab.value = id
  emit('update:settingsSub', id)
}

const hasIdentity = computed(() => Boolean(props.owner && props.repo))
const query = useAutolinksQuery(() => props.owner, () => props.repo, hasIdentity)
const autolinks = computed(() => query.data.value ?? [])
const isLoading = computed(() => query.isLoading.value)

const newPrefix = ref('')
const newTemplate = ref('')
const newAlphanumeric = ref(true)
const isAdding = ref(false)
const pending = ref(new Set<number>())

async function add(): Promise<void> {
  const prefix = newPrefix.value.trim()
  const template = newTemplate.value.trim()
  if (!prefix || !template || isAdding.value) return
  if (!template.includes('<num>')) {
    toast.error(t('repository.settings.integrations.templateInvalid'))
    return
  }
  isAdding.value = true

  try {
    await createAutolink(props.owner, props.repo, prefix, template, newAlphanumeric.value)
    newPrefix.value = ''
    newTemplate.value = ''
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('repository.settings.integrations.error'))
  } finally {
    isAdding.value = false
    invalidateAutolinks(props.owner, props.repo)
  }
}

async function remove(autolinkId: number): Promise<void> {
  if (pending.value.has(autolinkId)) return
  pending.value = new Set([...pending.value, autolinkId])

  try {
    await deleteAutolink(props.owner, props.repo, autolinkId)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('repository.settings.integrations.error'))
  } finally {
    const next = new Set(pending.value)
    next.delete(autolinkId)
    pending.value = next
    invalidateAutolinks(props.owner, props.repo)
  }
}
</script>

<template>
  <div class="grid gap-4">
    <TabSwitcher
      :active-id="activeTab"
      :navigation-label="t('repository.settings.integrations.navigation')"
      :tabs="tabs"
      @update:active-id="setActiveTab"
    />

    <template v-if="activeTab === 'autolinks'">
      <p class="text-caption text-muted-foreground">
        {{ t('repository.settings.integrations.hint') }}
      </p>

      <form
        class="grid max-w-xl gap-2"
        @submit.prevent="add"
      >
        <div class="flex items-center gap-2">
          <Input
            v-model="newPrefix"
            autocomplete="off"
            class="w-40 font-mono"
            :placeholder="t('repository.settings.integrations.prefixPlaceholder')"
            spellcheck="false"
          />
          <Input
            v-model="newTemplate"
            autocomplete="off"
            class="flex-1 font-mono"
            :placeholder="t('repository.settings.integrations.templatePlaceholder')"
            spellcheck="false"
          />
        </div>
        <div class="flex items-center justify-between gap-4">
          <label class="flex items-center gap-2 text-body text-foreground">
            <Switch v-model="newAlphanumeric" />
            {{ t('repository.settings.integrations.alphanumeric') }}
          </label>
          <Button
            :disabled="isAdding || !newPrefix.trim() || !newTemplate.trim()"
            size="sm"
            type="submit"
          >
            <Spinner
              v-if="isAdding"
              class="size-3.5"
            />
            <Link2
              v-else
              class="size-3.5"
              :stroke-width="1.75"
            />
            {{ t('repository.settings.integrations.add') }}
          </Button>
        </div>
      </form>

      <div
        v-if="isLoading"
        class="flex min-h-[6rem] items-center justify-center"
      >
        <Spinner class="size-4 text-muted-foreground" />
      </div>

      <div
        v-else-if="autolinks.length > 0"
        class="overflow-hidden rounded-xl border border-border bg-card"
      >
        <div
          v-for="(autolink, index) in autolinks"
          :key="autolink.id"
          :class="[
            'flex items-center justify-between gap-4 px-4 py-2.5',
            index > 0 ? 'border-t border-border' : '',
          ]"
        >
          <div class="grid min-w-0 gap-0.5">
            <span class="truncate font-mono text-body font-medium text-foreground">{{ autolink.keyPrefix }}</span>
            <span class="truncate font-mono text-caption text-muted-foreground">{{ autolink.urlTemplate }}</span>
          </div>
          <Button
            :aria-label="t('repository.settings.integrations.remove')"
            :disabled="pending.has(autolink.id)"
            size="icon-sm"
            type="button"
            variant="outline"
            @click="remove(autolink.id)"
          >
            <Trash2
              class="size-3.5 text-muted-foreground"
              :stroke-width="1.75"
            />
          </Button>
        </div>
      </div>

      <p
        v-else
        class="text-body text-muted-foreground"
      >
        {{ t('repository.settings.integrations.empty') }}
      </p>
    </template>
  </div>
</template>
