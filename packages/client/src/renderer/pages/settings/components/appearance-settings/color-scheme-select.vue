<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@oh-my-github/ui'
import { colorSchemes, type ColorSchemeId, type ColorSchemeOption } from '@/stores/settings'

const props = defineProps<{
  isDark: boolean
  modelValue: ColorSchemeId
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ColorSchemeId]
}>()

const { t } = useI18n()
const selectedScheme = computed(() =>
  colorSchemes.find((scheme) => scheme.id === props.modelValue) ?? colorSchemes[0]
)

function previewSwatches(scheme: ColorSchemeOption): string[] {
  return props.isDark ? scheme.darkSwatches : scheme.swatches
}
</script>

<template>
  <Select
    :model-value="props.modelValue"
    @update:model-value="(value) => value && emit('update:modelValue', value as ColorSchemeId)"
  >
    <SelectTrigger
      size="sm"
      class="min-w-40"
    >
      <span class="flex min-w-0 items-center gap-1.5">
        <span
          class="flex size-5 shrink-0 items-center justify-center rounded-sm border border-border text-caption font-semibold"
          :style="{ backgroundColor: previewSwatches(selectedScheme)[0] }"
        >
          <span :style="{ color: previewSwatches(selectedScheme)[4] }">Aa</span>
        </span>
        <span class="truncate">
          {{ t(selectedScheme.labelKey) }}
        </span>
      </span>
    </SelectTrigger>
    <SelectContent
      align="end"
      :align-offset="0"
    >
      <SelectItem
        v-for="scheme in colorSchemes"
        :key="scheme.id"
        :value="scheme.id"
      >
        <span class="flex min-w-0 items-center gap-1.5">
          <span
            class="flex size-6 shrink-0 items-center justify-center rounded-sm border border-border text-caption font-semibold"
            :style="{ backgroundColor: previewSwatches(scheme)[0] }"
          >
            <span :style="{ color: previewSwatches(scheme)[4] }">Aa</span>
          </span>
          <span class="truncate">
            {{ t(scheme.labelKey) }}
          </span>
        </span>
      </SelectItem>
    </SelectContent>
  </Select>
</template>
