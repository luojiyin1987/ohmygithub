<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Spinner,
  useCommand,
} from '@oh-my-github/ui'

const props = defineProps<{
  disabled?: boolean
  inputId?: string
  modelValue: string
  placeholder?: string
}>()

const emit = defineEmits<{
  select: [item: GitHubWorkspaceSearchItem]
  'update:modelValue': [value: string]
}>()

const SEARCH_DEBOUNCE_MS = 300
const MAX_SUGGESTIONS = 5

const { t } = useI18n()
const { filterState } = useCommand()

const suggestions = ref<GitHubWorkspaceSearchItem[]>([])
const isSearching = ref(false)
const hasSearched = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null
let searchSequence = 0
// Programmatic writes to the field (picking a suggestion, external v-model
// resets) must not re-open the suggestion list.
let suppressSearch = false

const showList = computed(() =>
  isSearching.value || suggestions.value.length > 0 || hasSearched.value
)

onMounted(() => {
  if (props.modelValue && props.modelValue !== filterState.search) {
    suppressSearch = true
    filterState.search = props.modelValue
  }
})

watch(
  () => props.modelValue,
  (value) => {
    if (value === filterState.search) return

    suppressSearch = true
    filterState.search = value
  },
)

watch(
  () => filterState.search,
  (value) => {
    emit('update:modelValue', value)

    if (suppressSearch) {
      suppressSearch = false
      clearSuggestions()
      return
    }

    scheduleSearch(value)
  },
)

onBeforeUnmount(() => {
  clearSearchTimer()
})

function scheduleSearch(value: string): void {
  clearSearchTimer()

  const query = value.trim()
  // Email invites have no user to suggest; short input is all noise.
  if (query.length < 2 || query.includes('@')) {
    clearSuggestions()
    return
  }

  searchTimer = setTimeout(() => {
    searchTimer = null
    void runSearch(query)
  }, SEARCH_DEBOUNCE_MS)
}

async function runSearch(query: string): Promise<void> {
  if (!window.ohMyGithub?.search) return

  const sequence = ++searchSequence
  isSearching.value = true

  try {
    const result = await window.ohMyGithub.search.searchWorkspace({
      mode: 'users',
      query,
      page: 1,
      perPage: MAX_SUGGESTIONS,
    })
    if (sequence !== searchSequence) return

    suggestions.value = result.items
    hasSearched.value = true
  } catch {
    if (sequence !== searchSequence) return

    suggestions.value = []
    hasSearched.value = false
  } finally {
    if (sequence === searchSequence) {
      isSearching.value = false
    }
  }
}

function clearSuggestions(): void {
  clearSearchTimer()
  searchSequence += 1
  suggestions.value = []
  hasSearched.value = false
  isSearching.value = false
}

function clearSearchTimer(): void {
  if (!searchTimer) return

  clearTimeout(searchTimer)
  searchTimer = null
}

function selectSuggestion(item: GitHubWorkspaceSearchItem): void {
  suppressSearch = true
  filterState.search = item.title
  clearSuggestions()
  emit('select', item)
}

function fallbackInitials(login: string): string {
  return login.slice(0, 2).toUpperCase()
}
</script>

<template>
  <CommandInput
    :id="inputId"
    :disabled="disabled"
    :placeholder="placeholder"
    :search-icon="false"
    size="sm"
  />

  <CommandList
    v-if="showList"
    class="border-t border-border/40"
  >
    <CommandGroup
      v-if="suggestions.length > 0"
      force-render
    >
      <CommandItem
        v-for="item in suggestions"
        :key="`${item.kind}:${item.id}`"
        class="flex items-center gap-2"
        force-render
        :value="item.title"
        @select="selectSuggestion(item)"
      >
        <Avatar class="size-5 shrink-0">
          <AvatarImage
            :alt="item.title"
            :src="item.avatarUrl ?? ''"
          />
          <AvatarFallback class="text-caption">
            {{ fallbackInitials(item.title) }}
          </AvatarFallback>
        </Avatar>
        <span class="min-w-0 truncate">{{ item.title }}</span>
      </CommandItem>
    </CommandGroup>

    <p
      v-else-if="isSearching"
      class="flex items-center gap-2 px-3.5 py-2.5 text-body text-muted-foreground"
    >
      <Spinner class="size-3.5" />
      {{ t('userSearch.searching') }}
    </p>

    <p
      v-else
      class="px-3.5 py-2.5 text-body text-muted-foreground"
    >
      {{ t('userSearch.empty') }}
    </p>
  </CommandList>
</template>
