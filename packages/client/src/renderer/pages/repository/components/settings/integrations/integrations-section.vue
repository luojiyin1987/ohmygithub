<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ExternalLink, Plus, Trash2 } from 'lucide-vue-next'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Spinner,
  Switch,
} from '@oh-my-github/ui'
import TabSwitcher from '@/components/navigation/tab-switcher.vue'
import SettingsSection from '@/pages/settings/components/appearance-settings/settings-section.vue'
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

const isAddDialogOpen = ref(false)
const newPrefix = ref('')
const newTemplate = ref('')
const newAlphanumeric = ref(true)
const isAdding = ref(false)
const addError = ref<string | null>(null)
const pending = ref(new Set<number>())

watch(isAddDialogOpen, (open) => {
  if (open) {
    newPrefix.value = ''
    newTemplate.value = ''
    newAlphanumeric.value = true
    addError.value = null
  }
})

async function add(): Promise<void> {
  const prefix = newPrefix.value.trim()
  const template = newTemplate.value.trim()
  if (!prefix || !template || isAdding.value) return
  if (!template.includes('<num>')) {
    addError.value = t('repository.settings.integrations.templateInvalid')
    return
  }
  isAdding.value = true
  addError.value = null

  try {
    await createAutolink(props.owner, props.repo, prefix, template, newAlphanumeric.value)
    isAddDialogOpen.value = false
    invalidateAutolinks(props.owner, props.repo)
  } catch (error) {
    addError.value = error instanceof Error ? error.message : t('repository.settings.integrations.error')
  } finally {
    isAdding.value = false
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

    <div
      v-if="activeTab === 'autolinks'"
      class="mx-auto w-full max-w-3xl space-y-3 px-2"
    >
      <SettingsSection :title="t('repository.settings.links.autolinks')">
        <template #actions>
          <Button
            size="sm"
            type="button"
            variant="outline"
            @click="isAddDialogOpen = true"
          >
            <Plus class="size-4" />
            {{ t('repository.settings.integrations.add') }}
          </Button>
        </template>

        <div
          v-if="isLoading"
          class="flex min-h-[6rem] items-center justify-center"
        >
          <Spinner class="size-4 text-muted-foreground" />
        </div>

        <div
          v-else
          class="divide-y divide-border"
        >
          <p
            v-if="autolinks.length === 0"
            class="px-4 py-6 text-center text-body text-muted-foreground"
          >
            {{ t('repository.settings.integrations.empty') }}
          </p>

          <div
            v-for="autolink in autolinks"
            :key="autolink.id"
            class="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div class="grid min-w-0 gap-0.5">
              <span class="truncate font-mono text-control font-medium text-foreground">{{ autolink.keyPrefix }}</span>
              <span class="truncate font-mono text-caption text-muted-foreground">{{ autolink.urlTemplate }}</span>
            </div>
            <Button
              :aria-label="t('repository.settings.integrations.remove')"
              :disabled="pending.has(autolink.id)"
              size="icon-sm"
              variant="ghost"
              @click="remove(autolink.id)"
            >
              <Trash2 class="size-4" />
            </Button>
          </div>
        </div>
      </SettingsSection>

      <p class="select-none px-2 text-caption text-muted-foreground">
        {{ t('repository.settings.integrations.hint') }}
      </p>
    </div>

    <Dialog v-model:open="isAddDialogOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t('repository.settings.integrations.add') }}</DialogTitle>
        </DialogHeader>

        <form
          class="grid gap-3"
          @submit.prevent="add"
        >
          <div class="grid gap-1.5">
            <Label for="autolink-prefix">{{ t('repository.settings.integrations.prefixPlaceholder') }}</Label>
            <Input
              id="autolink-prefix"
              v-model="newPrefix"
              autocomplete="off"
              class="font-mono"
              spellcheck="false"
            />
          </div>
          <div class="grid gap-1.5">
            <Label for="autolink-template">{{ t('repository.settings.integrations.templatePlaceholder') }}</Label>
            <Input
              id="autolink-template"
              v-model="newTemplate"
              autocomplete="off"
              class="font-mono"
              spellcheck="false"
            />
          </div>
          <label class="flex items-center gap-2 text-body text-foreground">
            <Switch v-model="newAlphanumeric" />
            {{ t('repository.settings.integrations.alphanumeric') }}
          </label>

          <p
            v-if="addError"
            class="text-body text-destructive"
          >
            {{ addError }}
          </p>
        </form>

        <DialogFooter>
          <Button
            :disabled="isAdding"
            size="sm"
            type="button"
            variant="outline"
            @click="isAddDialogOpen = false"
          >
            {{ t('repository.settings.general.dangerZone.cancel') }}
          </Button>
          <Button
            :disabled="isAdding || !newPrefix.trim() || !newTemplate.trim()"
            size="sm"
            type="button"
            @click="add"
          >
            <Spinner
              v-if="isAdding"
              class="size-3.5"
            />
            {{ t('repository.settings.integrations.add') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
