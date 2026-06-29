<script setup lang="ts">
import type { WorkspaceTab } from '../workspace/types'
import type { PullRequestDetail } from './components/types'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
} from '@oh-my-github/ui'
import { AlertCircle, GitPullRequest } from 'lucide-vue-next'
import {
  ConversationBodyCard,
  ConversationCommentCard,
  ConversationCommentComposer,
  ConversationEventRow,
  ConversationTimeline,
  GitHubActorLink,
} from '../../components'
import {
  createPullRequestComment,
  usePullRequestDetailQuery,
} from '../../composables/github/use-pull-requests'
import PullRequestHeader from './components/pull-request-header.vue'
import PullRequestSidebar from './components/pull-request-sidebar.vue'
import PullRequestCommitGroup from './components/pull-request-commit-group.vue'
import { usePullRequestTimelineItems } from './composables/use-pull-request-timeline-items'

const props = defineProps<{
  tab: WorkspaceTab
}>()

const { t } = useI18n()

const owner = computed(() => props.tab.owner ?? '')
const repo = computed(() => props.tab.repo ?? '')
const number = computed(() => props.tab.number ?? 0)
const repository = computed(() =>
  owner.value && repo.value
    ? `${owner.value}/${repo.value}`
    : props.tab.title
)
const hasIdentity = computed(() =>
  Boolean(owner.value && repo.value && number.value > 0)
)

const pullRequestQuery = usePullRequestDetailQuery(owner, repo, number, hasIdentity)
const pullRequest = computed<PullRequestDetail | null>(() =>
  (pullRequestQuery.data.value ?? null) as PullRequestDetail | null
)
const timelineItems = usePullRequestTimelineItems(pullRequest)
const commentBody = ref('')
const commentError = ref<string | null>(null)
const isSubmittingComment = ref(false)
const isLoading = computed(() => hasIdentity.value && pullRequestQuery.isLoading.value && !pullRequest.value)
const hasError = computed(() => Boolean(pullRequestQuery.error.value))
const showUnavailable = computed(() =>
  hasIdentity.value
  && !isLoading.value
  && !hasError.value
  && !pullRequest.value
)

function retryPullRequest(): void {
  void pullRequestQuery.refetch()
}

async function submitPullRequestComment(): Promise<void> {
  const body = commentBody.value.trim()
  if (!body || isSubmittingComment.value) return

  isSubmittingComment.value = true
  commentError.value = null

  try {
    await createPullRequestComment(owner.value, repo.value, number.value, body)
    commentBody.value = ''
    await pullRequestQuery.refetch()
  } catch {
    commentError.value = t('pullRequest.comment.error')
  } finally {
    isSubmittingComment.value = false
  }
}
</script>

<template>
  <section class="h-full min-h-[34rem] overflow-auto bg-background">
    <div class="mx-auto grid w-full max-w-7xl gap-4 px-4 py-4 lg:px-6">
      <Empty
        v-if="!hasIdentity"
        class="min-h-[24rem] border border-border bg-card"
      >
        <EmptyHeader>
          <EmptyMedia>
            <GitPullRequest class="size-5" />
          </EmptyMedia>
          <EmptyTitle>
            {{ t('pullRequest.empty.missingIdentity.title') }}
          </EmptyTitle>
          <EmptyDescription>
            {{ t('pullRequest.empty.missingIdentity.description') }}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>

      <div
        v-else-if="isLoading"
        class="grid gap-4"
      >
        <div class="grid gap-3 border-b border-border pb-4">
          <div class="flex items-center gap-2">
            <Skeleton class="h-6 w-20 rounded-full" />
            <Skeleton class="h-4 w-40 rounded-md" />
          </div>
          <Skeleton class="h-8 w-4/5 max-w-3xl rounded-md" />
          <Skeleton class="h-4 w-80 max-w-full rounded-md" />
        </div>

        <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <main class="grid min-w-0 gap-4">
            <Skeleton class="h-52 rounded-lg" />
            <Skeleton class="h-72 rounded-lg" />
          </main>
          <aside class="grid content-start gap-3">
            <Skeleton
              v-for="index in 7"
              :key="index"
              class="h-24 rounded-lg"
            />
          </aside>
        </div>
      </div>

      <Empty
        v-else-if="hasError"
        class="min-h-[24rem] border border-border bg-card"
      >
        <EmptyHeader>
          <EmptyMedia>
            <AlertCircle class="size-5" />
          </EmptyMedia>
          <EmptyTitle>
            {{ t('pullRequest.error.title') }}
          </EmptyTitle>
          <EmptyDescription>
            {{ t('pullRequest.error.description') }}
          </EmptyDescription>
          <Button
            class="justify-self-center"
            size="sm"
            type="button"
            variant="outline"
            @click="retryPullRequest"
          >
            {{ t('pullRequest.error.retry') }}
          </Button>
        </EmptyHeader>
      </Empty>

      <Empty
        v-else-if="showUnavailable"
        class="min-h-[24rem] border border-border bg-card"
      >
        <EmptyHeader>
          <EmptyMedia>
            <GitPullRequest class="size-5" />
          </EmptyMedia>
          <EmptyTitle>
            {{ t('pullRequest.empty.unavailable.title') }}
          </EmptyTitle>
          <EmptyDescription>
            {{ t('pullRequest.empty.unavailable.description') }}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>

      <template v-else-if="pullRequest">
        <PullRequestHeader
          :pull-request="pullRequest"
          :repository="repository"
        />

        <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <main class="grid min-w-0 content-start gap-4">
            <ConversationBodyCard
              :actor="pullRequest.author"
              :body="pullRequest.body ?? ''"
              :created-at="pullRequest.createdAt"
              :empty-label="t('pullRequest.empty.body')"
              :owner="owner"
              :repo="repo"
              :reactions="pullRequest.reactions ?? []"
              :updated-at="pullRequest.updatedAt"
            />

            <section class="min-w-0">
              <ConversationTimeline
                :empty-label="t('pullRequest.activity.empty')"
                :items="timelineItems"
              >
                <div class="grid min-w-0 gap-4 pb-0 pl-3 pt-1">
                  <template
                    v-for="item in timelineItems"
                    :key="item.id"
                  >
                    <div
                      v-if="item.kind === 'comment'"
                      class="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-3"
                    >
                      <div class="flex h-10 items-center justify-center">
                        <GitHubActorLink
                          avatar-size="lg"
                          :avatar-url="item.actor.avatarUrl"
                          :login="item.actor.login"
                          :show-username="false"
                        />
                      </div>
                      <ConversationCommentCard
                        :actor="item.actor"
                        :badges="item.badges"
                        :body="item.body"
                        :comment-id="item.commentId"
                        :created-at="item.createdAt"
                        :owner="owner"
                        :repo="repo"
                        :reactions="item.reactions"
                        :show-avatar="false"
                        :updated-at="item.updatedAt"
                      />
                    </div>
                    <PullRequestCommitGroup
                      v-else-if="item.kind === 'commit-group'"
                      :actor="item.actor"
                      :commits="item.commits"
                      :created-at="item.createdAt"
                    />
                    <ConversationEventRow
                      v-else
                      :event="item.event"
                    />
                  </template>
                </div>
              </ConversationTimeline>

              <div class="relative mt-5 min-w-0 pl-2">
                <div
                  class="absolute bottom-full left-7 h-3 w-px bg-border"
                  aria-hidden="true"
                />
                <ConversationCommentComposer
                  v-model="commentBody"
                  :error="commentError"
                  i18n-scope="pullRequest.comment"
                  :is-submitting="isSubmittingComment"
                  :owner="owner"
                  :repo="repo"
                  @submit="submitPullRequestComment"
                />
              </div>
            </section>
          </main>

          <PullRequestSidebar
            class="min-w-0 xl:sticky xl:top-4 xl:self-start"
            :pull-request="pullRequest"
          />
        </div>
      </template>
    </div>
  </section>
</template>
