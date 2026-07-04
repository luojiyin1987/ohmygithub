<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search, UserRound, Users } from 'lucide-vue-next'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Skeleton,
  Spinner,
} from '@oh-my-github/ui'
import AppPagination from '@/components/navigation/app-pagination.vue'
import TabSwitcher, { type TabSwitcherItem } from '@/components/navigation/tab-switcher.vue'
import {
  setAccountFollowed,
  useAccountFollowersQuery,
  useAccountFollowingQuery,
  useAccountListInvalidation,
} from '@/composables/github/use-accounts'
import { useToast } from '@/composables/use-toast'

const props = withDefaults(
  defineProps<{
    followersCount: number
    followingCount: number
    isOrganization: boolean
    login: string
    initialTab?: 'followers' | 'following'
  }>(),
  {
    initialTab: 'followers',
  },
)

const emit = defineEmits<{
  selectAccount: [login: string]
}>()

type FollowTabId = 'followers' | 'following'

const PER_PAGE = 20
const SEARCH_DEBOUNCE_MS = 300

const { t } = useI18n()
const toast = useToast()
const { invalidateAccountProfile } = useAccountListInvalidation()

function resolveInitialTab(): FollowTabId {
  if (props.initialTab === 'following' && props.isOrganization) return 'followers'
  return props.initialTab
}

const activeTab = ref<FollowTabId>(resolveInitialTab())
const page = ref(1)
const searchInput = ref('')
const search = ref('')
const followOverrides = ref<Record<string, boolean>>({})
const pendingFollowLogin = ref<string | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | null = null

const hasLogin = computed(() => props.login.trim().length > 0)
const followersQuery = useAccountFollowersQuery(
  () => props.login,
  () => hasLogin.value && activeTab.value === 'followers',
)
const followingQuery = useAccountFollowingQuery(
  () => props.login,
  () => hasLogin.value && !props.isOrganization && activeTab.value === 'following',
)

const activeQuery = computed(() => activeTab.value === 'followers' ? followersQuery : followingQuery)
const result = computed(() => activeQuery.value.data.value ?? null)
const isLoading = computed(() => activeQuery.value.isLoading.value)
const hasError = computed(() => Boolean(activeQuery.value.error.value))
const items = computed(() =>
  (result.value?.items ?? []).map((item) => {
    const override = followOverrides.value[item.login]
    return override === undefined ? item : { ...item, viewerIsFollowing: override }
  })
)
const filteredItems = computed(() => {
  const terms = search.value.toLowerCase()
  if (!terms) return items.value

  return items.value.filter((item) =>
    item.login.toLowerCase().includes(terms)
    || (item.name ?? '').toLowerCase().includes(terms)
    || (item.bio ?? '').toLowerCase().includes(terms)
  )
})
const pagedItems = computed(() => {
  const offset = (page.value - 1) * PER_PAGE
  return filteredItems.value.slice(offset, offset + PER_PAGE)
})
const tabs = computed<TabSwitcherItem[]>(() => {
  const entries: TabSwitcherItem[] = [{
    id: 'followers',
    icon: Users,
    label: t('account.followers.tabs.followers'),
    count: props.followersCount,
  }]

  if (!props.isOrganization) {
    entries.push({
      id: 'following',
      icon: UserRound,
      label: t('account.followers.tabs.following'),
      count: props.followingCount,
    })
  }

  return entries
})

watch(
  () => props.login,
  () => {
    activeTab.value = resolveInitialTab()
    page.value = 1
    searchInput.value = ''
    search.value = ''
    followOverrides.value = {}
  },
)

watch(
  () => props.initialTab,
  () => {
    activeTab.value = resolveInitialTab()
  },
)

watch(activeTab, () => {
  page.value = 1
})

watch(searchInput, (value) => {
  clearSearchTimer()

  searchTimer = setTimeout(() => {
    search.value = value.trim()
    page.value = 1
    searchTimer = null
  }, SEARCH_DEBOUNCE_MS)
})

watch(result, () => {
  followOverrides.value = {}
})

onBeforeUnmount(() => {
  clearSearchTimer()
})

function clearSearchTimer(): void {
  if (!searchTimer) return

  clearTimeout(searchTimer)
  searchTimer = null
}

function fallbackInitials(login: string): string {
  return login.slice(0, 2).toUpperCase()
}

async function toggleFollow(item: GitHubAccountFollowUser): Promise<void> {
  if (pendingFollowLogin.value) return

  const nextFollowing = !(followOverrides.value[item.login] ?? item.viewerIsFollowing)
  pendingFollowLogin.value = item.login
  followOverrides.value = { ...followOverrides.value, [item.login]: nextFollowing }

  try {
    await setAccountFollowed(item.login, nextFollowing)
    invalidateAccountProfile(item.login)
  } catch (error) {
    const { [item.login]: _removed, ...rest } = followOverrides.value
    followOverrides.value = rest
    toast.error(t('account.followers.toasts.errorTitle'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    pendingFollowLogin.value = null
  }
}

function resolveErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined

  const message = error.message
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .replace(/^Error:\s*/, '')
    .trim()

  return message || undefined
}
</script>

<template>
  <section class="grid gap-3">
    <div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <TabSwitcher
        v-if="tabs.length > 1"
        :active-id="activeTab"
        :navigation-label="t('account.followers.tabsLabel')"
        :tabs="tabs"
        @update:active-id="activeTab = $event as FollowTabId"
      />
      <div v-else />

      <InputGroup
        class="w-full sm:max-w-xs"
        size="sm"
      >
        <InputGroupAddon>
          <Search class="size-3.5 text-muted-foreground" />
        </InputGroupAddon>
        <InputGroupInput
          v-model="searchInput"
          :placeholder="t('account.followers.searchPlaceholder')"
          type="search"
        />
      </InputGroup>
    </div>

    <div
      v-if="isLoading && items.length === 0"
      class="grid gap-2"
    >
      <Skeleton
        v-for="index in 6"
        :key="index"
        class="h-16 rounded-lg"
      />
    </div>

    <Empty
      v-else-if="hasError"
      class="min-h-[18rem] border border-border bg-card"
    >
      <EmptyHeader>
        <EmptyTitle>
          {{ t('account.followers.error.title') }}
        </EmptyTitle>
        <EmptyDescription>
          {{ t('account.followers.error.description') }}
        </EmptyDescription>
        <Button
          class="justify-self-center"
          size="sm"
          type="button"
          variant="outline"
          @click="activeQuery.refetch()"
        >
          {{ t('account.error.retry') }}
        </Button>
      </EmptyHeader>
    </Empty>

    <Empty
      v-else-if="filteredItems.length === 0"
      class="min-h-[18rem] border border-border bg-card"
    >
      <EmptyHeader>
        <EmptyTitle>
          {{ t(search
            ? 'account.followers.searchEmpty.title'
            : `account.followers.empty.${activeTab}.title`) }}
        </EmptyTitle>
        <EmptyDescription>
          {{ t(search
            ? 'account.followers.searchEmpty.description'
            : `account.followers.empty.${activeTab}.description`) }}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>

    <template v-else>
      <p
        v-if="result?.truncated"
        class="text-body text-muted-foreground"
      >
        {{ t('account.followers.truncated') }}
      </p>

      <ul class="grid gap-2">
        <li
          v-for="item in pagedItems"
          :key="item.login"
        >
          <div
            class="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-3 outline-hidden transition-colors hover:bg-[color:var(--ui-hover)] focus-visible:bg-[color:var(--ui-hover)] focus-visible:ring-2 focus-visible:ring-ring/30"
            role="button"
            tabindex="0"
            @click="emit('selectAccount', item.login)"
            @keydown.enter.prevent="emit('selectAccount', item.login)"
          >
            <Avatar class="size-10 shrink-0">
              <AvatarImage
                :alt="item.login"
                :src="item.avatarUrl"
              />
              <AvatarFallback class="text-label">
                {{ fallbackInitials(item.login) }}
              </AvatarFallback>
            </Avatar>

            <div class="grid min-w-0 flex-1 gap-0.5">
              <div class="flex min-w-0 items-center gap-2">
                <span class="truncate text-label font-medium text-foreground">
                  {{ item.name || item.login }}
                </span>
                <span class="truncate text-body text-muted-foreground">
                  {{ item.login }}
                </span>
                <Badge
                  v-if="item.isFollowingViewer"
                  class="shrink-0"
                  variant="secondary"
                >
                  {{ t('account.followers.followsYou') }}
                </Badge>
              </div>
              <p
                v-if="item.bio"
                class="truncate text-body text-muted-foreground"
              >
                {{ item.bio }}
              </p>
            </div>

            <Button
              v-if="item.viewerCanFollow && !item.isViewer"
              :aria-pressed="item.viewerIsFollowing"
              class="shrink-0"
              :disabled="pendingFollowLogin !== null"
              size="sm"
              type="button"
              variant="outline"
              @click.stop="toggleFollow(item)"
            >
              <Spinner
                v-if="pendingFollowLogin === item.login"
                class="size-3.5"
              />
              <UserRound
                v-else
                class="size-3.5"
              />
              <span>{{ t(item.viewerIsFollowing ? 'account.actions.unfollow' : 'account.actions.follow') }}</span>
            </Button>
          </div>
        </li>
      </ul>

      <AppPagination
        v-model:page="page"
        :disabled="isLoading"
        hide-when-single-page
        :max-total="Math.max(filteredItems.length, PER_PAGE)"
        :per-page="PER_PAGE"
        summary-key="account.followers.pagination.summary"
        :total-count="filteredItems.length"
      />
    </template>
  </section>
</template>
