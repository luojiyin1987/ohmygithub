<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Pencil, Plus, Trash2 } from 'lucide-vue-next'
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
} from '@oh-my-github/ui'
import SettingsSection from '@/pages/settings/components/appearance-settings/settings-section.vue'
import {
  createRepositoryVariable,
  deleteRepositorySecret,
  deleteRepositoryVariable,
  updateRepositoryVariable,
  upsertRepositorySecret,
  useRepositorySecretsQuery,
  useRepositorySettingsInvalidation,
  useRepositoryVariablesQuery,
} from '@/composables/github/use-repository-settings'
import { useToast } from '@/composables/use-toast'

const props = defineProps<{
  owner: string
  repo: string
  scope: GitHubRepositorySecretScope
}>()

const { t } = useI18n()
const toast = useToast()
const { invalidateSecrets, invalidateSecurity } = useRepositorySettingsInvalidation()

const hasIdentity = computed(() => Boolean(props.owner && props.repo))

const secretsQuery = useRepositorySecretsQuery(() => props.owner, () => props.repo, () => props.scope, hasIdentity)
const secrets = computed(() => secretsQuery.data.value ?? [])
const isLoadingSecrets = computed(() => secretsQuery.isLoading.value)

const showVariables = computed(() => props.scope === 'actions')
const variablesQuery = useRepositoryVariablesQuery(() => props.owner, () => props.repo, showVariables)
const variables = computed(() => variablesQuery.data.value ?? [])

const isSecretDialogOpen = ref(false)
const secretName = ref('')
const secretNameLocked = ref(false)
const secretValue = ref('')
const isSavingSecret = ref(false)
const secretError = ref<string | null>(null)

const isVariableDialogOpen = ref(false)
const variableName = ref('')
const variableValue = ref('')
const editingVariable = ref<string | null>(null)
const isSavingVariable = ref(false)
const variableError = ref<string | null>(null)

const pending = ref(new Set<string>())

watch(isSecretDialogOpen, (open) => {
  if (!open) {
    secretName.value = ''
    secretValue.value = ''
    secretNameLocked.value = false
    secretError.value = null
  }
})

watch(isVariableDialogOpen, (open) => {
  if (!open) {
    variableName.value = ''
    variableValue.value = ''
    editingVariable.value = null
    variableError.value = null
  }
})

function openNewSecret(): void {
  secretName.value = ''
  secretValue.value = ''
  secretNameLocked.value = false
  secretError.value = null
  isSecretDialogOpen.value = true
}

function openEditSecret(name: string): void {
  secretName.value = name
  secretNameLocked.value = true
  secretValue.value = ''
  secretError.value = null
  isSecretDialogOpen.value = true
}

async function saveSecret(): Promise<void> {
  const name = secretName.value.trim().toUpperCase()
  if (!name || !secretValue.value || isSavingSecret.value) return
  isSavingSecret.value = true
  secretError.value = null

  try {
    await upsertRepositorySecret(props.owner, props.repo, props.scope, name, secretValue.value)
    toast.success(t('repository.settings.secrets.saved', { name }))
    isSecretDialogOpen.value = false
    invalidateSecrets(props.scope, props.owner, props.repo)
  } catch (error) {
    secretError.value = error instanceof Error ? error.message : t('repository.settings.secrets.error')
  } finally {
    isSavingSecret.value = false
  }
}

async function removeSecret(name: string): Promise<void> {
  const key = `secret:${name}`
  if (pending.value.has(key)) return
  pending.value = new Set([...pending.value, key])

  try {
    await deleteRepositorySecret(props.owner, props.repo, props.scope, name)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('repository.settings.secrets.error'))
  } finally {
    const next = new Set(pending.value)
    next.delete(key)
    pending.value = next
    invalidateSecrets(props.scope, props.owner, props.repo)
  }
}

function openNewVariable(): void {
  editingVariable.value = null
  variableName.value = ''
  variableValue.value = ''
  variableError.value = null
  isVariableDialogOpen.value = true
}

function openEditVariable(variable: GitHubRepositoryVariable): void {
  editingVariable.value = variable.name
  variableName.value = variable.name
  variableValue.value = variable.value
  variableError.value = null
  isVariableDialogOpen.value = true
}

async function saveVariable(): Promise<void> {
  const name = variableName.value.trim().toUpperCase()
  if (!name || isSavingVariable.value) return
  isSavingVariable.value = true
  variableError.value = null

  try {
    if (editingVariable.value) {
      await updateRepositoryVariable(props.owner, props.repo, editingVariable.value, variableValue.value)
    } else {
      await createRepositoryVariable(props.owner, props.repo, name, variableValue.value)
    }
    isVariableDialogOpen.value = false
    invalidateSecurity('variables', props.owner, props.repo)
  } catch (error) {
    variableError.value = error instanceof Error ? error.message : t('repository.settings.secrets.error')
  } finally {
    isSavingVariable.value = false
  }
}

async function removeVariable(name: string): Promise<void> {
  const key = `variable:${name}`
  if (pending.value.has(key)) return
  pending.value = new Set([...pending.value, key])

  try {
    await deleteRepositoryVariable(props.owner, props.repo, name)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('repository.settings.secrets.error'))
  } finally {
    const next = new Set(pending.value)
    next.delete(key)
    pending.value = next
    invalidateSecurity('variables', props.owner, props.repo)
  }
}
</script>

<template>
  <div class="space-y-8">
    <SettingsSection :title="t('repository.settings.secrets.secretsTitle')">
      <template #actions>
        <Button
          size="sm"
          type="button"
          variant="outline"
          @click="openNewSecret"
        >
          <Plus class="size-4" />
          {{ t('repository.settings.secrets.save') }}
        </Button>
      </template>

      <div
        v-if="isLoadingSecrets"
        class="flex min-h-[6rem] items-center justify-center"
      >
        <Spinner class="size-4 text-muted-foreground" />
      </div>

      <div
        v-else
        class="divide-y divide-border"
      >
        <p
          v-if="secrets.length === 0"
          class="px-4 py-6 text-center text-body text-muted-foreground"
        >
          {{ t('repository.settings.secrets.empty') }}
        </p>

        <div
          v-for="secret in secrets"
          :key="secret.name"
          class="flex items-center justify-between gap-4 px-4 py-3"
        >
          <div class="grid min-w-0 gap-0.5">
            <span class="truncate font-mono text-control font-medium text-foreground">{{ secret.name }}</span>
            <span
              v-if="secret.updatedAt"
              class="text-caption text-muted-foreground"
            >
              {{ t('repository.settings.secrets.updated', { date: new Date(secret.updatedAt).toLocaleDateString() }) }}
            </span>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Button
              :aria-label="t('repository.settings.secrets.update')"
              size="icon-sm"
              variant="ghost"
              @click="openEditSecret(secret.name)"
            >
              <Pencil class="size-4" />
            </Button>
            <Button
              :aria-label="t('repository.settings.secrets.remove')"
              :disabled="pending.has(`secret:${secret.name}`)"
              size="icon-sm"
              variant="ghost"
              @click="removeSecret(secret.name)"
            >
              <Trash2 class="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </SettingsSection>

    <SettingsSection
      v-if="showVariables"
      :title="t('repository.settings.secrets.variablesTitle')"
    >
      <template #actions>
        <Button
          size="sm"
          type="button"
          variant="outline"
          @click="openNewVariable"
        >
          <Plus class="size-4" />
          {{ t('repository.settings.secrets.addVariable') }}
        </Button>
      </template>

      <div class="divide-y divide-border">
        <p
          v-if="variables.length === 0"
          class="px-4 py-6 text-center text-body text-muted-foreground"
        >
          {{ t('repository.settings.secrets.variablesEmpty') }}
        </p>

        <div
          v-for="variable in variables"
          :key="variable.name"
          class="flex items-center justify-between gap-4 px-4 py-3"
        >
          <div class="grid min-w-0 gap-0.5">
            <span class="truncate font-mono text-control font-medium text-foreground">{{ variable.name }}</span>
            <span class="truncate font-mono text-caption text-muted-foreground">{{ variable.value }}</span>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Button
              :aria-label="t('repository.settings.secrets.updateVariable')"
              size="icon-sm"
              variant="ghost"
              @click="openEditVariable(variable)"
            >
              <Pencil class="size-4" />
            </Button>
            <Button
              :aria-label="t('repository.settings.secrets.removeVariable')"
              :disabled="pending.has(`variable:${variable.name}`)"
              size="icon-sm"
              variant="ghost"
              @click="removeVariable(variable.name)"
            >
              <Trash2 class="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </SettingsSection>

    <Dialog v-model:open="isSecretDialogOpen">
      <DialogContent class="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {{ t(secretNameLocked
              ? 'repository.settings.secrets.update'
              : 'repository.settings.secrets.save') }}
          </DialogTitle>
        </DialogHeader>

        <div class="grid gap-3">
          <div class="grid gap-1.5">
            <Label for="secret-name">{{ t('repository.settings.secrets.namePlaceholder') }}</Label>
            <Input
              id="secret-name"
              v-model="secretName"
              autocomplete="off"
              class="font-mono uppercase"
              :disabled="secretNameLocked"
              spellcheck="false"
            />
          </div>
          <div class="grid gap-1.5">
            <Label for="secret-value">{{ t('repository.settings.secrets.valuePlaceholder') }}</Label>
            <Input
              id="secret-value"
              v-model="secretValue"
              autocomplete="off"
              spellcheck="false"
              type="password"
            />
          </div>

          <p
            v-if="secretError"
            class="text-body text-destructive"
          >
            {{ secretError }}
          </p>
        </div>

        <DialogFooter>
          <Button
            :disabled="isSavingSecret"
            size="sm"
            type="button"
            variant="outline"
            @click="isSecretDialogOpen = false"
          >
            {{ t('repository.settings.general.dangerZone.cancel') }}
          </Button>
          <Button
            :disabled="isSavingSecret || !secretName.trim() || !secretValue"
            size="sm"
            type="button"
            @click="saveSecret"
          >
            <Spinner
              v-if="isSavingSecret"
              class="size-3.5"
            />
            {{ t('repository.settings.secrets.save') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="isVariableDialogOpen">
      <DialogContent class="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {{ t(editingVariable
              ? 'repository.settings.secrets.updateVariable'
              : 'repository.settings.secrets.addVariable') }}
          </DialogTitle>
        </DialogHeader>

        <div class="grid gap-3">
          <div class="grid gap-1.5">
            <Label for="variable-name">{{ t('repository.settings.secrets.namePlaceholder') }}</Label>
            <Input
              id="variable-name"
              v-model="variableName"
              autocomplete="off"
              class="font-mono uppercase"
              :disabled="editingVariable !== null"
              spellcheck="false"
            />
          </div>
          <div class="grid gap-1.5">
            <Label for="variable-value">{{ t('repository.settings.secrets.variableValuePlaceholder') }}</Label>
            <Input
              id="variable-value"
              v-model="variableValue"
              autocomplete="off"
              spellcheck="false"
            />
          </div>

          <p
            v-if="variableError"
            class="text-body text-destructive"
          >
            {{ variableError }}
          </p>
        </div>

        <DialogFooter>
          <Button
            :disabled="isSavingVariable"
            size="sm"
            type="button"
            variant="outline"
            @click="isVariableDialogOpen = false"
          >
            {{ t('repository.settings.general.dangerZone.cancel') }}
          </Button>
          <Button
            :disabled="isSavingVariable || !variableName.trim()"
            size="sm"
            type="button"
            @click="saveVariable"
          >
            <Spinner
              v-if="isSavingVariable"
              class="size-3.5"
            />
            {{ t(editingVariable
              ? 'repository.settings.secrets.updateVariable'
              : 'repository.settings.secrets.addVariable') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
