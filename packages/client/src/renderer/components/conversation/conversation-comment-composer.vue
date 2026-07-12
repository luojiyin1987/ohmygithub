<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Spinner } from '@oh-my-github/ui'
import { Send } from 'lucide-vue-next'
import ConversationMarkdownComposerShell from './conversation-markdown-composer-shell.vue'

const props = withDefaults(defineProps<{
  modelValue: string
  isSubmitting?: boolean
  error?: string | null
  owner?: string | null
  repo?: string | null
  i18nScope?: string
}>(), {
  error: null,
  owner: null,
  repo: null,
  i18nScope: 'issue.comment',
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'submit'): void
}>()

const { t } = useI18n()

const body = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', String(value)),
})
const hasBody = computed(() => body.value.trim().length > 0)
const canSubmit = computed(() => hasBody.value && !props.isSubmitting)

function message(key: string): string {
  return t(`${props.i18nScope}.${key}`)
}

function submitComment(): void {
  if (!canSubmit.value) return

  emit('submit')
}
</script>

<template>
  <form
    class="grid min-w-0 gap-3 rounded-lg border border-border bg-card p-3"
    @submit.prevent="submitComment"
  >
    <ConversationMarkdownComposerShell
      v-model="body"
      :disabled="isSubmitting"
      :i18n-scope="i18nScope"
      :owner="owner"
      :repo="repo"
    />

    <div class="flex min-w-0 items-center justify-between gap-3">
      <p
        v-if="error"
        class="min-w-0 text-body text-destructive"
        role="alert"
      >
        {{ error }}
      </p>
      <span
        v-else
        aria-hidden="true"
      />

      <slot
        :can-submit="canSubmit"
        name="actions"
      >
        <Button
          class="shrink-0"
          :disabled="!canSubmit"
          :loading="isSubmitting"
          loading-mode="manual"
          size="sm"
          type="submit"
        >
          <Spinner
            v-if="isSubmitting"
            class="size-3.5"
          />
          <Send
            v-else
            class="size-3.5"
          />
          <span>{{ message('submit') }}</span>
        </Button>
      </slot>
    </div>
  </form>
</template>
