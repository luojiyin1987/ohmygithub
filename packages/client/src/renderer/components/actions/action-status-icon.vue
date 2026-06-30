<script setup lang="ts">
import type { Component } from 'vue'
import { computed } from 'vue'
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  CircleSlash,
  LoaderCircle,
  XCircle,
} from 'lucide-vue-next'
import { actionStatusTone } from './action-status'

const props = withDefaults(defineProps<{
  conclusion: GitHubActionConclusion | null
  size?: 'sm' | 'md'
  status: GitHubActionRunStatus | null
}>(), {
  size: 'md',
})

const tone = computed(() => actionStatusTone(props.status, props.conclusion))
const icon = computed<Component>(() => {
  if (props.status === 'in_progress') return LoaderCircle
  if (props.status && props.status !== 'completed') return CircleDashed
  if (props.conclusion === 'success') return CheckCircle2
  if (props.conclusion === 'failure' || props.conclusion === 'timed_out') return XCircle
  if (props.conclusion === 'action_required') return AlertTriangle
  if (props.conclusion === 'cancelled' || props.conclusion === 'skipped' || props.conclusion === 'stale') {
    return CircleSlash
  }

  return CircleDot
})
const iconClass = computed(() => [
  props.size === 'sm' ? 'size-3.5' : 'size-4',
  props.status === 'in_progress' ? 'animate-spin' : '',
  {
    success: 'text-success',
    destructive: 'text-destructive',
    warning: 'text-warning',
    info: 'text-info',
    muted: 'text-muted-foreground',
  }[tone.value],
])
</script>

<template>
  <component
    :is="icon"
    :class="iconClass"
    :stroke-width="2"
  />
</template>
