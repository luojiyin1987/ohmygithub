<script setup lang="ts">
import { computed, watch } from 'vue'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@oh-my-github/ui'
import { useOrganizationsQuery } from '@/composables/github/use-organizations'

interface OwnerOption {
  login: string
  avatarUrl: string
  isOrganization: boolean
}

const props = withDefaults(defineProps<{
  disabled?: boolean
  id?: string
  modelValue: string
  placeholder?: string
  viewer: AuthViewer | null
}>(), {
  disabled: false,
  id: undefined,
  placeholder: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const organizationsQuery = useOrganizationsQuery()

const options = computed<OwnerOption[]>(() => {
  const result: OwnerOption[] = []

  if (props.viewer?.login) {
    result.push({
      login: props.viewer.login,
      avatarUrl: props.viewer.avatarUrl,
      isOrganization: false,
    })
  }

  for (const organization of organizationsQuery.data.value ?? []) {
    if (organization.login !== props.viewer?.login) {
      result.push({
        login: organization.login,
        avatarUrl: organization.avatarUrl,
        isOrganization: true,
      })
    }
  }

  return result
})

const selectedOption = computed(() =>
  options.value.find((option) => option.login === props.modelValue) ?? null)

// Default to the viewer account once it is known and nothing is selected yet.
watch([() => props.viewer, () => props.modelValue], () => {
  if (!props.modelValue && props.viewer?.login) {
    emit('update:modelValue', props.viewer.login)
  }
}, { immediate: true })

function avatarShapeClass(option: OwnerOption): string {
  return option.isOrganization ? 'rounded-md' : 'rounded-full'
}
</script>

<template>
  <Select
    :disabled="disabled"
    :model-value="modelValue"
    @update:model-value="(value) => value && emit('update:modelValue', value as string)"
  >
    <SelectTrigger
      :id="id"
      class="w-full"
    >
      <span class="flex min-w-0 items-center gap-2">
        <Avatar
          v-if="selectedOption"
          class="size-4"
          :class="avatarShapeClass(selectedOption)"
        >
          <AvatarImage
            v-if="selectedOption.avatarUrl"
            :alt="selectedOption.login"
            :src="selectedOption.avatarUrl"
          />
          <AvatarFallback
            class="text-[10px]"
            :class="avatarShapeClass(selectedOption)"
          >
            {{ selectedOption.login.slice(0, 1).toUpperCase() }}
          </AvatarFallback>
        </Avatar>
        <span class="truncate">
          {{ selectedOption?.login ?? placeholder }}
        </span>
      </span>
    </SelectTrigger>
    <SelectContent>
      <SelectItem
        v-for="option in options"
        :key="option.login"
        :value="option.login"
      >
        <span class="flex min-w-0 items-center gap-2">
          <Avatar
            class="size-4"
            :class="avatarShapeClass(option)"
          >
            <AvatarImage
              v-if="option.avatarUrl"
              :alt="option.login"
              :src="option.avatarUrl"
            />
            <AvatarFallback
              class="text-[10px]"
              :class="avatarShapeClass(option)"
            >
              {{ option.login.slice(0, 1).toUpperCase() }}
            </AvatarFallback>
          </Avatar>
          <span class="truncate">{{ option.login }}</span>
        </span>
      </SelectItem>
    </SelectContent>
  </Select>
</template>
