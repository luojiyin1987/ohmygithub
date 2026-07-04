<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { GitFork } from 'lucide-vue-next'
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Spinner,
} from '@oh-my-github/ui'
import OwnerSelect from '@/components/github/owner-select.vue'

const props = defineProps<{
  open: boolean
  owner: string
  repository: string
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  forked: [fork: GitHubForkedRepository]
}>()

const { t } = useI18n()

const viewer = ref<AuthViewer | null>(null)
const isLoadingOwners = ref(false)
const selectedOwner = ref('')
const forkName = ref('')
const defaultBranchOnly = ref(true)
const isSubmitting = ref(false)
const errorMessage = ref<string | null>(null)

const viewerLogin = computed(() => viewer.value?.login ?? null)
const canSubmit = computed(() =>
  Boolean(selectedOwner.value && forkName.value.trim()) && !isSubmitting.value && !isLoadingOwners.value
)

watch(
  () => props.open,
  (open) => {
    if (open) void prepare()
  }
)

function setOpen(open: boolean): void {
  if (!open && isSubmitting.value) return
  emit('update:open', open)
}

async function prepare(): Promise<void> {
  forkName.value = props.repository
  defaultBranchOnly.value = true
  errorMessage.value = null
  isLoadingOwners.value = true

  try {
    const auth = await window.ohMyGithub.auth.get()

    viewer.value = auth.auth?.viewer ?? null
  } catch {
    viewer.value = null
  } finally {
    selectedOwner.value = viewerLogin.value ?? ''
    isLoadingOwners.value = false
  }
}

async function submit(): Promise<void> {
  const name = forkName.value.trim()
  if (!selectedOwner.value || !name || isSubmitting.value) return

  isSubmitting.value = true
  errorMessage.value = null

  try {
    const fork = await window.ohMyGithub.repositories.fork(props.owner, props.repository, {
      organization: selectedOwner.value === viewerLogin.value ? null : selectedOwner.value,
      name,
      defaultBranchOnly: defaultBranchOnly.value,
    })

    emit('forked', fork)
  } catch (error) {
    errorMessage.value = extractErrorMessage(error) ?? t('repository.fork.error')
  } finally {
    isSubmitting.value = false
  }
}

function extractErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null

  const message = error.message
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .replace(/^Error:\s*/, '')
    .trim()

  return message || null
}
</script>

<template>
  <Dialog
    :open="open"
    @update:open="setOpen"
  >
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t('repository.fork.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('repository.fork.description', { repo: `${owner}/${repository}` }) }}
        </DialogDescription>
      </DialogHeader>

      <form
        class="grid gap-4"
        @submit.prevent="submit"
      >
        <div class="grid gap-1.5">
          <Label for="repository-fork-owner">{{ t('repository.fork.ownerLabel') }}</Label>
          <OwnerSelect
            id="repository-fork-owner"
            v-model="selectedOwner"
            :disabled="isLoadingOwners || isSubmitting"
            :placeholder="t('repository.fork.ownerPlaceholder')"
            :viewer="viewer"
          />
        </div>

        <div class="grid gap-1.5">
          <Label for="repository-fork-name">{{ t('repository.fork.nameLabel') }}</Label>
          <Input
            id="repository-fork-name"
            v-model="forkName"
            autocomplete="off"
            :disabled="isSubmitting"
            spellcheck="false"
          />
        </div>

        <Label class="flex items-center gap-2 font-normal">
          <Checkbox
            :disabled="isSubmitting"
            :model-value="defaultBranchOnly"
            @update:model-value="(value) => defaultBranchOnly = value === true"
          />
          {{ t('repository.fork.defaultBranchOnly') }}
        </Label>

        <p
          v-if="errorMessage"
          class="text-body text-destructive"
        >
          {{ errorMessage }}
        </p>

        <DialogFooter>
          <Button
            :disabled="isSubmitting"
            type="button"
            variant="outline"
            @click="setOpen(false)"
          >
            {{ t('repository.fork.cancel') }}
          </Button>
          <Button
            :disabled="!canSubmit"
            type="submit"
          >
            <Spinner
              v-if="isSubmitting"
              class="size-3.5"
            />
            <GitFork
              v-else
              class="size-3.5"
              :stroke-width="1.75"
            />
            {{ t(isSubmitting ? 'repository.fork.creating' : 'repository.fork.submit') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
