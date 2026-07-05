<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Trash2 } from 'lucide-vue-next'
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
  Textarea,
} from '@oh-my-github/ui'
import SettingsSection from '@/pages/settings/components/appearance-settings/settings-section.vue'
import {
  addDeployKey,
  deleteDeployKey,
  useDeployKeysQuery,
  useRepositorySettingsInvalidation,
} from '@/composables/github/use-repository-settings'
import { useToast } from '@/composables/use-toast'

const props = defineProps<{
  owner: string
  repo: string
}>()

const { t } = useI18n()
const toast = useToast()
const { invalidateSecurity } = useRepositorySettingsInvalidation()

const hasIdentity = computed(() => Boolean(props.owner && props.repo))
const query = useDeployKeysQuery(() => props.owner, () => props.repo, hasIdentity)
const keys = computed(() => query.data.value ?? [])
const isLoading = computed(() => query.isLoading.value)

const isAddDialogOpen = ref(false)
const newTitle = ref('')
const newKey = ref('')
const newReadOnly = ref(true)
const isAdding = ref(false)
const addError = ref<string | null>(null)
const pending = ref(new Set<number>())

watch(isAddDialogOpen, (open) => {
  if (open) {
    newTitle.value = ''
    newKey.value = ''
    newReadOnly.value = true
    addError.value = null
  }
})

function refresh(): void {
  invalidateSecurity('deploy-keys', props.owner, props.repo)
}

async function add(): Promise<void> {
  const title = newTitle.value.trim()
  const key = newKey.value.trim()
  if (!title || !key || isAdding.value) return
  isAdding.value = true
  addError.value = null

  try {
    await addDeployKey(props.owner, props.repo, title, key, newReadOnly.value)
    isAddDialogOpen.value = false
    refresh()
  } catch (error) {
    addError.value = error instanceof Error ? error.message : t('repository.settings.security.error')
  } finally {
    isAdding.value = false
  }
}

async function remove(keyId: number): Promise<void> {
  if (pending.value.has(keyId)) return
  pending.value = new Set([...pending.value, keyId])

  try {
    await deleteDeployKey(props.owner, props.repo, keyId)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('repository.settings.security.error'))
  } finally {
    const next = new Set(pending.value)
    next.delete(keyId)
    pending.value = next
    refresh()
  }
}
</script>

<template>
  <SettingsSection :title="t('repository.settings.security.tabs.deployKeys')">
    <template #actions>
      <Button
        size="sm"
        type="button"
        variant="outline"
        @click="isAddDialogOpen = true"
      >
        <Plus class="size-4" />
        {{ t('repository.settings.security.deployKeys.add') }}
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
        v-if="keys.length === 0"
        class="px-4 py-6 text-center text-body text-muted-foreground"
      >
        {{ t('repository.settings.security.deployKeys.empty') }}
      </p>

      <div
        v-for="key in keys"
        :key="key.id"
        class="flex items-center justify-between gap-4 px-4 py-3"
      >
        <div class="grid min-w-0 gap-0.5">
          <span class="truncate text-control font-medium text-foreground">{{ key.title }}</span>
          <span class="truncate font-mono text-caption text-muted-foreground">
            {{ key.key.slice(0, 40) }}… · {{ t(key.readOnly
              ? 'repository.settings.security.deployKeys.readOnlyBadge'
              : 'repository.settings.security.deployKeys.readWriteBadge') }}
          </span>
        </div>
        <Button
          :aria-label="t('repository.settings.security.deployKeys.remove')"
          :disabled="pending.has(key.id)"
          size="icon-sm"
          variant="ghost"
          @click="remove(key.id)"
        >
          <Trash2 class="size-4" />
        </Button>
      </div>
    </div>
  </SettingsSection>

  <Dialog v-model:open="isAddDialogOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t('repository.settings.security.deployKeys.add') }}</DialogTitle>
      </DialogHeader>

      <div class="grid gap-3">
        <div class="grid gap-1.5">
          <Label for="deploy-key-title">{{ t('repository.settings.security.deployKeys.titlePlaceholder') }}</Label>
          <Input
            id="deploy-key-title"
            v-model="newTitle"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <div class="grid gap-1.5">
          <Label for="deploy-key-value">{{ t('repository.settings.security.deployKeys.keyPlaceholder') }}</Label>
          <Textarea
            id="deploy-key-value"
            v-model="newKey"
            rows="3"
            spellcheck="false"
          />
        </div>
        <label class="flex items-center gap-2 text-body text-foreground">
          <Switch v-model="newReadOnly" />
          {{ t('repository.settings.security.deployKeys.readOnly') }}
        </label>

        <p
          v-if="addError"
          class="text-body text-destructive"
        >
          {{ addError }}
        </p>
      </div>

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
          :disabled="isAdding || !newTitle.trim() || !newKey.trim()"
          size="sm"
          type="button"
          @click="add"
        >
          <Spinner
            v-if="isAdding"
            class="size-3.5"
          />
          {{ t('repository.settings.security.deployKeys.add') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
