<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Play } from 'lucide-vue-next'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Spinner,
} from '@oh-my-github/ui'
import GitHubBranchSelect from '@/components/github/github-branch-select.vue'
import { dispatchWorkflow } from '@/composables/github/use-actions'
import { extractIpcErrorMessage } from '../branches/ipc-error'

const props = defineProps<{
  open: boolean
  owner: string
  repo: string
  workflow: GitHubActionWorkflow | null
  defaultBranch: string | null
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  dispatched: [workflow: GitHubActionWorkflow]
}>()

const { t } = useI18n()

const targetRef = ref<string | null>(null)
const isSubmitting = ref(false)
const errorMessage = ref<string | null>(null)

const canSubmit = computed(() => Boolean(props.workflow) && Boolean(targetRef.value) && !isSubmitting.value)

watch(
  () => props.open,
  (open) => {
    if (!open) return

    targetRef.value = props.defaultBranch
    isSubmitting.value = false
    errorMessage.value = null
  },
)

function setOpen(open: boolean): void {
  if (!open && isSubmitting.value) return
  emit('update:open', open)
}

async function submit(): Promise<void> {
  if (!props.workflow || !targetRef.value || isSubmitting.value) return

  isSubmitting.value = true
  errorMessage.value = null

  try {
    await dispatchWorkflow(props.owner, props.repo, props.workflow.id, targetRef.value)
    emit('dispatched', props.workflow)
    emit('update:open', false)
  } catch (error) {
    errorMessage.value = extractIpcErrorMessage(error) ?? t('repository.actions.dispatch.error')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <Dialog
    :open="open"
    @update:open="setOpen"
  >
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t('repository.actions.dispatch.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('repository.actions.dispatch.description', { workflow: workflow?.name ?? '' }) }}
        </DialogDescription>
      </DialogHeader>

      <form
        class="grid gap-4"
        @submit.prevent="submit"
      >
        <div class="grid gap-1.5">
          <Label for="dispatch-workflow-branch">{{ t('repository.actions.dispatch.branchLabel') }}</Label>
          <GitHubBranchSelect
            id="dispatch-workflow-branch"
            v-model="targetRef"
            :default-branch="defaultBranch"
            :owner="owner"
            :repo="repo"
          />
        </div>

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
            {{ t('repository.actions.dispatch.cancel') }}
          </Button>
          <Button
            :disabled="!canSubmit"
            type="submit"
          >
            <Spinner
              v-if="isSubmitting"
              class="size-3.5"
            />
            <Play
              v-else
              class="size-3.5"
              :stroke-width="1.75"
            />
            {{ t('repository.actions.dispatch.submit') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
