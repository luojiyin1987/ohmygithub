<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, ChevronsUpDown } from 'lucide-vue-next'
import {
  Button,
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@oh-my-github/ui'
import type { BundledShikiTheme } from '../../../../stores/settings'

const props = defineProps<{
  controlLabel: string
  emptyText: string
  options: BundledShikiTheme[]
  placeholder: string
  searchPlaceholder: string
}>()

const model = defineModel<string>({ required: true })
const open = ref(false)
const selectedOption = computed(() =>
  props.options.find((option) => option.id === model.value)
)

function select(value: string): void {
  model.value = value
  open.value = false
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        :aria-label="props.controlLabel"
        class="w-full justify-between"
        size="sm"
        type="button"
        variant="outline"
      >
        <span class="truncate">
          {{ selectedOption?.displayName ?? props.placeholder }}
        </span>
        <ChevronsUpDown class="size-4 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      menu
      align="end"
      :align-offset="0"
      class="w-72 p-0"
    >
      <Command>
        <CommandInput
          :placeholder="props.searchPlaceholder"
          :aria-label="props.searchPlaceholder"
        />
        <CommandList>
          <CommandEmpty class="text-muted-foreground">
            {{ props.emptyText }}
          </CommandEmpty>
          <CommandItem
            v-for="option in props.options"
            :key="option.id"
            :value="option.displayName"
            @select="select(option.id)"
          >
            <span class="min-w-0 flex-1 truncate">
              {{ option.displayName }}
            </span>
            <Check
              v-if="model === option.id"
              class="ml-auto size-4 shrink-0"
            />
          </CommandItem>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
