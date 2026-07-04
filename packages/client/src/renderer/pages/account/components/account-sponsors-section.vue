<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Heart, HeartHandshake, Lock } from 'lucide-vue-next'
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
  Skeleton,
} from '@oh-my-github/ui'
import AppPagination from '@/components/navigation/app-pagination.vue'
import TabSwitcher, { type TabSwitcherItem } from '@/components/navigation/tab-switcher.vue'
import {
  useAccountSponsorsSummaryQuery,
  useAccountSponsorshipsQuery,
} from '@/composables/github/use-accounts'

const props = defineProps<{
  isViewerAccount: boolean
  login: string
}>()

const emit = defineEmits<{
  selectAccount: [login: string]
}>()

type SponsorsTabId = 'sponsors' | 'sponsoring'

const PER_PAGE = 20

const { t } = useI18n()

const activeTab = ref<SponsorsTabId>('sponsors')
const sponsorsPage = ref(1)
const sponsoringPage = ref(1)

const hasLogin = computed(() => props.login.trim().length > 0)
const summaryQuery = useAccountSponsorsSummaryQuery(() => props.login, hasLogin)
const summary = computed(() => summaryQuery.data.value ?? null)
const sponsorsQuery = useAccountSponsorshipsQuery(
  () => props.login,
  () => 'maintainer' as const,
  sponsorsPage,
  () => PER_PAGE,
  () => hasLogin.value && activeTab.value === 'sponsors',
)
const sponsoringQuery = useAccountSponsorshipsQuery(
  () => props.login,
  () => 'sponsor' as const,
  sponsoringPage,
  () => PER_PAGE,
  () => hasLogin.value && activeTab.value === 'sponsoring',
)

const activeQuery = computed(() => activeTab.value === 'sponsors' ? sponsorsQuery : sponsoringQuery)
const page = computed({
  get: () => activeTab.value === 'sponsors' ? sponsorsPage.value : sponsoringPage.value,
  set: (value: number) => {
    if (activeTab.value === 'sponsors') {
      sponsorsPage.value = value
    } else {
      sponsoringPage.value = value
    }
  },
})
const result = computed(() => activeQuery.value.data.value ?? null)
const isLoading = computed(() => activeQuery.value.isLoading.value)
const hasError = computed(() => Boolean(activeQuery.value.error.value))
const totalCount = computed(() => result.value?.totalCount ?? 0)
const showNotEnrolled = computed(() =>
  activeTab.value === 'sponsors' && summary.value !== null && !summary.value.hasSponsorsListing
)
const tabs = computed<TabSwitcherItem[]>(() => [
  {
    id: 'sponsors',
    icon: Heart,
    label: t('account.sponsors.tabs.sponsors'),
    count: summary.value?.sponsorsCount ?? null,
  },
  {
    id: 'sponsoring',
    icon: HeartHandshake,
    label: t('account.sponsors.tabs.sponsoring'),
    count: summary.value?.sponsoringCount ?? null,
  },
])

watch(
  () => props.login,
  () => {
    activeTab.value = 'sponsors'
    sponsorsPage.value = 1
    sponsoringPage.value = 1
  },
)

function fallbackInitials(login: string): string {
  return login.slice(0, 2).toUpperCase()
}

function selectSponsorship(item: GitHubAccountSponsorship): void {
  if (item.login) {
    emit('selectAccount', item.login)
  }
}

function sponsorshipKey(item: GitHubAccountSponsorship, index: number): string {
  return item.login ?? `private-${index}`
}
</script>

<template>
  <section class="grid gap-3">
    <TabSwitcher
      :active-id="activeTab"
      :navigation-label="t('account.sponsors.tabsLabel')"
      :tabs="tabs"
      @update:active-id="activeTab = $event as SponsorsTabId"
    />

    <div
      v-if="isLoading && (result?.items ?? []).length === 0"
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
          {{ t('account.sponsors.error.title') }}
        </EmptyTitle>
        <EmptyDescription>
          {{ t('account.sponsors.error.description') }}
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
      v-else-if="(result?.items ?? []).length === 0"
      class="min-h-[18rem] border border-border bg-card"
    >
      <EmptyHeader>
        <EmptyTitle>
          {{ t(showNotEnrolled ? 'account.sponsors.notEnrolled.title' : `account.sponsors.empty.${activeTab}.title`) }}
        </EmptyTitle>
        <EmptyDescription>
          {{ t(showNotEnrolled
            ? 'account.sponsors.notEnrolled.description'
            : `account.sponsors.empty.${activeTab}.description`) }}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>

    <template v-else>
      <ul class="grid gap-2">
        <li
          v-for="(item, index) in result?.items ?? []"
          :key="sponsorshipKey(item, index)"
        >
          <div
            class="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-3"
            :class="item.login
              ? 'cursor-pointer outline-hidden transition-colors hover:bg-[color:var(--ui-hover)] focus-visible:bg-[color:var(--ui-hover)] focus-visible:ring-2 focus-visible:ring-ring/30'
              : ''"
            :role="item.login ? 'button' : undefined"
            :tabindex="item.login ? 0 : undefined"
            @click="selectSponsorship(item)"
            @keydown.enter.prevent="selectSponsorship(item)"
          >
            <Avatar
              v-if="item.login"
              class="size-10 shrink-0"
            >
              <AvatarImage
                :alt="item.login"
                :src="item.avatarUrl ?? ''"
              />
              <AvatarFallback class="text-label">
                {{ fallbackInitials(item.login) }}
              </AvatarFallback>
            </Avatar>
            <div
              v-else
              class="grid size-10 shrink-0 place-items-center rounded-full bg-muted"
            >
              <Lock class="size-4 text-muted-foreground" />
            </div>

            <div class="grid min-w-0 flex-1 gap-0.5">
              <div class="flex min-w-0 items-center gap-2">
                <span class="truncate text-label font-medium text-foreground">
                  {{ item.login ? (item.name || item.login) : t('account.sponsors.privateSponsor') }}
                </span>
                <span
                  v-if="item.login && item.name"
                  class="truncate text-body text-muted-foreground"
                >
                  {{ item.login }}
                </span>
                <Badge
                  v-if="item.isPrivate && item.login"
                  class="shrink-0"
                  variant="outline"
                >
                  <Lock class="size-3" />
                  {{ t('account.sponsors.privateBadge') }}
                </Badge>
              </div>
              <p
                v-if="item.bio"
                class="truncate text-body text-muted-foreground"
              >
                {{ item.bio }}
              </p>
            </div>

            <div
              v-if="isViewerAccount && item.tier"
              class="flex shrink-0 items-center gap-1.5"
            >
              <Badge variant="secondary">
                {{ item.tier.name }}
              </Badge>
              <Badge
                v-if="item.isOneTimePayment"
                variant="outline"
              >
                {{ t('account.sponsors.oneTime') }}
              </Badge>
            </div>
          </div>
        </li>
      </ul>

      <AppPagination
        v-model:page="page"
        :disabled="isLoading"
        :has-next-page="result?.hasNextPage"
        hide-when-single-page
        :max-total="Math.max(totalCount, PER_PAGE)"
        :per-page="PER_PAGE"
        summary-key="account.sponsors.pagination.summary"
        :total-count="totalCount"
      />
    </template>
  </section>
</template>
