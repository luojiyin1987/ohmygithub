<script setup lang="ts">
import type { ActivityFeedGroup } from '../activity-helpers'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ChevronDown, ChevronRight } from 'lucide-vue-next'
import GithubActorLink from '@/components/github/github-actor-link.vue'
import { formatRelativeTime } from '@/components/conversation/format'
import { presentFeedGroup } from '../activity-helpers'

const props = defineProps<{
  group: ActivityFeedGroup
}>()

const { locale } = useI18n()
const router = useRouter()
const expanded = ref(false)

const presentation = computed(() => presentFeedGroup(props.group))
const relativeTime = computed(() => formatRelativeTime(props.group.createdAt, { locale: locale.value }))

function onRowClick(): void {
  if (presentation.value.expandable) {
    expanded.value = !expanded.value
  } else if (presentation.value.targetUrl) {
    void router.push(presentation.value.targetUrl)
  }
}

function openChild(url: string | null): void {
  if (url) void router.push(url)
}
</script>

<template>
  <div class="border-b border-border">
    <div
      class="group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
      role="button"
      tabindex="0"
      @click="onRowClick"
      @keydown.enter.prevent="onRowClick"
    >
      <GithubActorLink
        :login="group.actor.login"
        :avatar-url="group.actor.avatarUrl"
        avatar-size="sm"
        :show-username="false"
        class="shrink-0"
      />

      <span class="min-w-0 flex-1 text-label text-foreground">
        <GithubActorLink
          :login="group.actor.login"
          :show-avatar="false"
          class="align-baseline"
        />
        {{ ' ' }}
        <i18n-t
          :keypath="presentation.sentenceKey"
          :plural="presentation.pluralCount ?? undefined"
          scope="global"
          tag="span"
        >
          <template
            v-for="(part, name) in presentation.parts"
            :key="name"
            #[name]
          >
            <span class="font-medium">{{ part.label }}</span>
          </template>
        </i18n-t>
      </span>

      <component
        :is="expanded ? ChevronDown : ChevronRight"
        v-if="presentation.expandable"
        class="size-4 shrink-0 text-muted-foreground"
      />
      <span
        v-if="relativeTime"
        class="shrink-0 text-caption text-muted-foreground"
      >{{ relativeTime }}</span>
    </div>

    <div
      v-if="expanded && presentation.expandable"
      class="grid gap-0.5 pb-2 pl-14 pr-4"
    >
      <button
        v-for="child in presentation.children"
        :key="child.id"
        class="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-label text-foreground transition-colors hover:bg-muted/50"
        type="button"
        @click="openChild(child.part.url)"
      >
        <span class="min-w-0 truncate font-medium">{{ child.part.label }}</span>
        <span class="ml-auto shrink-0 text-caption text-muted-foreground">
          {{ formatRelativeTime(child.createdAt, { locale: locale }) }}
        </span>
      </button>
    </div>
  </div>
</template>
