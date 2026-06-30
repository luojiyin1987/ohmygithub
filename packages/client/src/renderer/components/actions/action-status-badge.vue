<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Badge } from '@oh-my-github/ui'
import { actionStatusLabelKey, actionStatusTone } from './action-status'
import ActionStatusIcon from './action-status-icon.vue'

const props = withDefaults(defineProps<{
  conclusion: GitHubActionConclusion | null
  size?: 'sm' | 'default'
  status: GitHubActionRunStatus | null
}>(), {
  size: 'sm',
})

const { t, te } = useI18n()

const tone = computed(() => actionStatusTone(props.status, props.conclusion))
const labelKey = computed(() => actionStatusLabelKey(props.status, props.conclusion))
const label = computed(() => {
  if (te(labelKey.value)) return t(labelKey.value)

  return props.conclusion ?? props.status ?? t('actions.statuses.unknown')
})
const variant = computed(() => {
  if (tone.value === 'success') return 'success'
  if (tone.value === 'destructive') return 'destructive'
  if (tone.value === 'warning') return 'warning'
  if (tone.value === 'info') return 'info'

  return 'secondary'
})
</script>

<template>
  <Badge
    :size="size"
    :variant="variant"
  >
    <ActionStatusIcon
      :conclusion="conclusion"
      size="sm"
      :status="status"
    />
    {{ label }}
  </Badge>
</template>
