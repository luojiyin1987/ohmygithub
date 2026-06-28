<script setup lang="ts">
import type { Component } from 'vue'
import type { WorkspaceTab } from '../workspace/types'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  Activity,
  Book,
  CircleDot,
  FileText,
  Folder,
  GitFork,
  GitBranch,
  GitPullRequest,
  Eye,
  Settings,
  Shield,
  Star,
  Users,
} from 'lucide-vue-next'
import {
  Button,
  ButtonGroup,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@oh-my-github/ui'

const props = defineProps<{
  tab: WorkspaceTab
}>()

type RepositorySectionId =
  | 'overview'
  | 'files'
  | 'pullRequests'
  | 'issues'
  | 'actions'
  | 'settings'

interface RepositorySection {
  id: RepositorySectionId
  icon: Component
}

const repositorySections: readonly RepositorySection[] = [
  { id: 'overview', icon: Book },
  { id: 'files', icon: Folder },
  { id: 'pullRequests', icon: GitPullRequest },
  { id: 'issues', icon: CircleDot },
  { id: 'actions', icon: Activity },
  { id: 'settings', icon: Settings },
]

type RepositoryActionId = 'star' | 'watch'

const { t } = useI18n()
const router = useRouter()
const activeSection = ref<RepositorySectionId>('overview')
const viewerState = ref<GitHubRepositoryViewerState | null>(null)
const isViewerStateLoading = ref(false)
const pendingRepositoryAction = ref<RepositoryActionId | null>(null)
let viewerStateRequestId = 0

const owner = computed(() => props.tab.owner ?? '')
const repository = computed(() => props.tab.repo ?? props.tab.title)
const activeSectionTitle = computed(() => t(`repository.sections.${activeSection.value}.title`))
const hasRepositoryIdentity = computed(() => Boolean(owner.value && repository.value))
const isStarred = computed(() => viewerState.value?.isStarred ?? false)
const isWatching = computed(() => viewerState.value?.isWatching ?? false)
const starCount = computed(() => viewerState.value?.starCount ?? null)
const formattedStarCount = computed(() => {
  if (starCount.value === null) return '...'

  return new Intl.NumberFormat().format(starCount.value)
})
const starLabel = computed(() => t(isStarred.value ? 'repository.actions.starred' : 'repository.actions.star'))
const watchLabel = computed(() => t(isWatching.value ? 'repository.actions.watching' : 'repository.actions.watch'))
const starButtonDisabled = computed(() =>
  !hasRepositoryIdentity.value || isViewerStateLoading.value || Boolean(pendingRepositoryAction.value)
)
const watchButtonDisabled = computed(() =>
  !hasRepositoryIdentity.value || isViewerStateLoading.value || Boolean(pendingRepositoryAction.value)
)

const summaryItems = computed(() => [
  {
    id: 'visibility',
    icon: Shield,
    label: t('repository.summary.visibility'),
    value: t('repository.values.placeholder'),
  },
  {
    id: 'branches',
    icon: GitBranch,
    label: t('repository.summary.branches'),
    value: t('repository.values.placeholder'),
  },
  {
    id: 'stars',
    icon: Star,
    label: t('repository.summary.stars'),
    value: formattedStarCount.value,
  },
])

const documentItems = computed(() => [
  {
    id: 'readme',
    icon: FileText,
    title: t('repository.documents.readme.title'),
    description: t('repository.documents.readme.description'),
  },
  {
    id: 'license',
    icon: Shield,
    title: t('repository.documents.license.title'),
    description: t('repository.documents.license.description'),
  },
  {
    id: 'contributing',
    icon: Users,
    title: t('repository.documents.contributing.title'),
    description: t('repository.documents.contributing.description'),
  },
])

function openOwner(): void {
  if (!owner.value) return
  void router.push(`/${encodeURIComponent(owner.value)}`)
}

async function loadRepositoryViewerState(): Promise<void> {
  const requestId = ++viewerStateRequestId

  if (!hasRepositoryIdentity.value || !window.ohMyGithub?.repositories) {
    viewerState.value = null
    isViewerStateLoading.value = false
    return
  }

  isViewerStateLoading.value = true

  try {
    const state = await window.ohMyGithub.repositories.getViewerState(owner.value, repository.value)

    if (requestId === viewerStateRequestId) {
      viewerState.value = state
    }
  } catch {
    if (requestId === viewerStateRequestId) {
      viewerState.value = null
    }
  } finally {
    if (requestId === viewerStateRequestId) {
      isViewerStateLoading.value = false
    }
  }
}

async function toggleStarred(): Promise<void> {
  if (!hasRepositoryIdentity.value || pendingRepositoryAction.value || !window.ohMyGithub?.repositories) return

  const nextStarred = !isStarred.value
  pendingRepositoryAction.value = 'star'

  try {
    await window.ohMyGithub.repositories.setStarred(owner.value, repository.value, nextStarred)
    viewerState.value = {
      isStarred: nextStarred,
      isWatching: isWatching.value,
      starCount: Math.max(0, (starCount.value ?? 0) + (nextStarred ? 1 : -1)),
    }
  } catch {
    void loadRepositoryViewerState()
  } finally {
    pendingRepositoryAction.value = null
  }
}

async function toggleWatching(): Promise<void> {
  if (!hasRepositoryIdentity.value || pendingRepositoryAction.value || !window.ohMyGithub?.repositories) return

  const nextWatching = !isWatching.value
  pendingRepositoryAction.value = 'watch'

  try {
    await window.ohMyGithub.repositories.setWatching(owner.value, repository.value, nextWatching)
    viewerState.value = {
      isStarred: isStarred.value,
      isWatching: nextWatching,
      starCount: starCount.value ?? 0,
    }
  } catch {
    void loadRepositoryViewerState()
  } finally {
    pendingRepositoryAction.value = null
  }
}

watch(
  () => props.tab.url,
  () => {
    activeSection.value = 'overview'
  },
)

watch(
  () => [owner.value, repository.value] as const,
  () => {
    void loadRepositoryViewerState()
  },
  { immediate: true },
)
</script>

<template>
  <section class="flex h-full min-h-[34rem] gap-3 bg-background p-3">
    <aside class="flex h-full w-56 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <header class="grid grid-cols-[0.25rem_1rem_minmax(0,1fr)] gap-x-1 px-2 py-3">
        <div class="col-start-2 col-end-4 grid min-w-0 gap-2.5">
          <div class="flex min-w-0 items-center text-control font-medium text-foreground">
            <button
              v-if="owner"
              class="min-w-0 max-w-24 truncate text-left font-normal text-muted-foreground underline-offset-4 outline-hidden hover:underline focus-visible:underline"
              type="button"
              @click="openOwner"
            >
              {{ owner }}
            </button>
            <span
              v-else
              class="truncate"
            >
              {{ t('repository.ownerFallback') }}
            </span>
            <span class="shrink-0 text-muted-foreground">/</span>
            <span class="min-w-0 truncate px-1">{{ repository }}</span>
          </div>

          <ButtonGroup class="justify-self-start">
            <Button
              :aria-label="starLabel"
              :aria-pressed="isStarred"
              :disabled="starButtonDisabled"
              class="h-8 min-w-16 justify-start px-2"
              size="sm"
              type="button"
              variant="outline"
              @click="toggleStarred"
            >
              <Star
                class="size-3.5"
                :class="isStarred ? 'fill-warning text-warning' : 'fill-none text-muted-foreground'"
                :stroke-width="1.75"
              />
              <span class="text-body font-normal tabular-nums text-muted-foreground">
                {{ formattedStarCount }}
              </span>
            </Button>

            <Button
              :aria-label="t('repository.actions.fork')"
              disabled
              class="size-8 text-muted-foreground"
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <GitFork
                class="size-3.5"
                :stroke-width="1.75"
              />
            </Button>

            <Button
              :aria-label="watchLabel"
              :aria-pressed="isWatching"
              :disabled="watchButtonDisabled"
              class="size-8"
              size="icon-sm"
              type="button"
              variant="outline"
              @click="toggleWatching"
            >
              <Eye
                class="size-3.5"
                :class="isWatching ? 'text-foreground' : 'text-muted-foreground'"
                :stroke-width="1.75"
              />
            </Button>
          </ButtonGroup>
        </div>
      </header>

      <nav
        class="grid gap-1 px-2 py-1.5"
        :aria-label="t('repository.sidebar.navigation')"
      >
        <button
          v-for="section in repositorySections"
          :key="section.id"
          :class="[
            'grid h-9 w-full grid-cols-[0.25rem_1rem_minmax(0,1fr)] items-center gap-x-1 rounded-lg pr-2 text-left text-body font-normal outline-hidden transition-colors hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/30',
            activeSection === section.id ? 'text-foreground' : 'text-muted-foreground',
          ]"
          :aria-current="activeSection === section.id ? 'page' : undefined"
          type="button"
          @click="activeSection = section.id"
        >
          <span
            class="h-4 w-0.5 justify-self-center rounded-full"
            :class="activeSection === section.id ? 'bg-muted-foreground' : 'bg-transparent'"
          />
          <component
            :is="section.icon"
            class="size-3.5 justify-self-center"
            :stroke-width="1.75"
          />
          <span class="ml-1 truncate">{{ t(`repository.sections.${section.id}.title`) }}</span>
        </button>
      </nav>
    </aside>

    <main class="min-w-0 flex-1 overflow-auto px-3 py-2">
      <div class="mx-auto grid w-full max-w-5xl gap-5 pb-8">
        <template v-if="activeSection === 'overview'">
          <section class="grid gap-2">
            <h2 class="px-1 text-label font-medium text-muted-foreground">
              {{ t('repository.overview.basicInfo') }}
            </h2>
            <div class="grid gap-2 sm:grid-cols-3">
              <div
                v-for="item in summaryItems"
                :key="item.id"
                class="grid gap-2 rounded-lg border border-border bg-card p-3"
              >
                <div class="flex min-w-0 items-center gap-2 text-body font-medium text-muted-foreground">
                  <component
                    :is="item.icon"
                    class="size-4 shrink-0"
                  />
                  <span class="truncate">{{ item.label }}</span>
                </div>
                <div class="truncate text-control font-semibold text-foreground">
                  {{ item.value }}
                </div>
              </div>
            </div>
          </section>

          <section class="grid gap-2">
            <h2 class="px-1 text-label font-medium text-muted-foreground">
              {{ t('repository.overview.documents') }}
            </h2>
            <div class="grid gap-2 lg:grid-cols-3">
              <article
                v-for="item in documentItems"
                :key="item.id"
                class="grid gap-2 rounded-lg border border-border bg-card p-3"
              >
                <div class="flex min-w-0 items-center gap-2 text-label font-medium text-foreground">
                  <component
                    :is="item.icon"
                    class="size-4 shrink-0 text-muted-foreground"
                  />
                  <span class="truncate">{{ item.title }}</span>
                </div>
                <p class="text-body text-muted-foreground">
                  {{ item.description }}
                </p>
              </article>
            </div>
          </section>
        </template>

        <Empty
          v-else
          class="min-h-[24rem] border border-border bg-card"
        >
          <EmptyHeader>
            <EmptyTitle>
              {{ t('repository.empty.title', { section: activeSectionTitle }) }}
            </EmptyTitle>
            <EmptyDescription>
              {{ t('repository.empty.description') }}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </main>
  </section>
</template>
