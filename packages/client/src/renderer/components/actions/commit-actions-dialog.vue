<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@oh-my-github/ui'
import CommitActionsPanel from './commit-actions-panel.vue'

const props = defineProps<{
  open: boolean
  owner: string
  repo: string
  sha: string
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

const { t } = useI18n()
const router = useRouter()

const shortSha = computed(() => props.sha.slice(0, 7))
const commitRef = computed(() => `${props.owner}/${props.repo}@${shortSha.value}`)

function setOpen(open: boolean): void {
  emit('update:open', open)
}

function navigate(url: string): void {
  setOpen(false)
  void router.push(url)
}
</script>

<template>
  <Dialog
    :open="open"
    @update:open="setOpen"
  >
    <DialogContent class="max-h-[min(44rem,calc(100vh-2rem))] overflow-hidden p-0 sm:max-w-3xl">
      <DialogHeader class="border-b border-border px-5 py-4 pr-12">
        <DialogTitle>{{ t('actions.commitChecks.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('actions.commitChecks.description', { ref: commitRef }) }}
        </DialogDescription>
      </DialogHeader>
      <div class="max-h-[min(36rem,calc(100vh-9rem))] overflow-auto p-4">
        <CommitActionsPanel
          :open="open"
          :owner="owner"
          :repo="repo"
          :sha="sha"
          @navigate="navigate"
        />
      </div>
    </DialogContent>
  </Dialog>
</template>
