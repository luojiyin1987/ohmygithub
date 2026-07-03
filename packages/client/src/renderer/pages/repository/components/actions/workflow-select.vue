<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SearchableSelect from '@/components/navigation/searchable-select.vue'
import type { SearchableSelectOption } from '@/components/navigation/searchable-select.vue'

const ALL_WORKFLOWS_VALUE = 'all'

const props = defineProps<{
  disabled?: boolean
  modelValue: string
  workflows: GitHubActionWorkflow[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { t } = useI18n()

const options = computed<SearchableSelectOption[]>(() => [
  {
    id: ALL_WORKFLOWS_VALUE,
    label: t('repository.actions.workflows.all'),
    description: t('repository.actions.workflows.allDescription'),
  },
  ...props.workflows.map((workflow) => ({
    id: String(workflow.id),
    label: workflow.name,
    description: workflow.path,
    disabled: workflow.state !== 'active',
  })),
])
</script>

<template>
  <SearchableSelect
    :disabled="disabled"
    :empty-label="t('repository.actions.workflows.empty')"
    :model-value="modelValue"
    :options="options"
    :placeholder="t('repository.actions.workflows.placeholder')"
    :search-placeholder="t('repository.actions.workflows.searchPlaceholder')"
    :select-label="t('repository.actions.workflows.ariaLabel')"
    trigger-class="w-full sm:w-80"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
