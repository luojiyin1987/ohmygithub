<script setup lang="ts">
import type {
  WorkspaceBookmark,
  WorkspaceBookmarkFolder,
  WorkspaceSidebarTreeItem,
} from '../types'
import type { CreateBookmarkFolderResult } from '../composables/use-workspace-bookmarks'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Folder, Inbox, Plus, Search } from 'lucide-vue-next'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from '@oh-my-github/ui'
import WorkspaceSidebarTree from './workspace-sidebar-tree.vue'
import WorkspaceUserPanel from './workspace-user-panel.vue'
import { getWorkspaceTabView } from '../tab-presentation'

const props = defineProps<{
  activeUrl: string
  bookmarkFolders: WorkspaceBookmarkFolder[]
  bookmarks: WorkspaceBookmark[]
  createBookmarkFolder: (title: string) => CreateBookmarkFolderResult
  isFullscreen: boolean
  organizations: GitHubOrganization[]
  organizationsError: boolean
  organizationsLoading: boolean
  viewer: AuthViewer | null
  width: number
}>()

const emit = defineEmits<{
  select: [url: string]
  startResize: [event: PointerEvent]
}>()

const { t } = useI18n()
const { state } = useSidebar()
const expandedIds = reactive(new Set<string>())
const visibleCounts = reactive(new Map<string, number>())
const isBookmarkFolderDialogOpen = ref(false)
const bookmarkFolderTitle = ref('')
const bookmarkFolderError = ref<'duplicate' | 'empty' | null>(null)
const hasOrganizations = computed(() => props.organizations.length > 0)
const showOrganizationsLoading = computed(() => props.organizationsLoading && !hasOrganizations.value)
const showOrganizationsError = computed(() => props.organizationsError && !hasOrganizations.value)
const showOrganizationsEmpty = computed(() =>
  !props.organizationsLoading && !props.organizationsError && !hasOrganizations.value,
)
const sidebarStyle = computed<Record<string, string>>(() => ({
  width: `${props.width}px`,
  marginLeft: state.value === 'expanded' ? '0px' : `-${props.width}px`,
  transition: 'margin-left 200ms cubic-bezier(0.32, 0.72, 0, 1)',
}))
const rootBookmarks = computed(() => props.bookmarks.filter((bookmark) => bookmark.folderId === null))
const bookmarkItems = computed<WorkspaceSidebarTreeItem[]>(() => {
  const folderItems = props.bookmarkFolders.map((folder) => {
    const children = props.bookmarks
      .filter((bookmark) => bookmark.folderId === folder.id)
      .map(bookmarkToTreeItem)

    return {
      id: `bookmark-folder:${folder.id}`,
      label: folder.title,
      icon: Folder,
      canExpand: children.length > 0,
      forceExpanded: children.some((child) => child.isActive),
      children,
    }
  })

  return [
    ...folderItems,
    ...rootBookmarks.value.map(bookmarkToTreeItem),
  ]
})
const showBookmarksEmpty = computed(() => props.bookmarkFolders.length === 0 && props.bookmarks.length === 0)
const bookmarkFolderErrorMessage = computed(() => {
  if (!bookmarkFolderError.value) return ''
  return t(`workspace.bookmarks.folderErrors.${bookmarkFolderError.value}`)
})

const organizationItems = computed<WorkspaceSidebarTreeItem[]>(() => {
  return props.organizations.map((organization) => {
    const url = organizationUrl(organization.login)

    return {
      id: `org:${organization.login}`,
      label: organization.login,
      url,
      avatarUrl: organization.avatarUrl,
      avatarFallback: organizationFallback(organization.login),
      isActive: props.activeUrl === url,
      canExpand: true,
      forceExpanded: props.activeUrl.startsWith(`/${organization.login}/`),
      childrenLoader: {
        type: 'organization-repositories',
        owner: organization.login,
      },
    }
  })
})

function organizationUrl(login: string): string {
  return `/${login}?type=org`
}

function organizationFallback(login: string): string {
  return login.slice(0, 1).toUpperCase()
}

function toggleExpanded(id: string): void {
  if (expandedIds.has(id)) {
    expandedIds.delete(id)
    return
  }

  expandedIds.add(id)
}

function setVisibleCount(listId: string, visibleCount: number): void {
  visibleCounts.set(listId, visibleCount)
}

function collectForceExpandedIds(items: WorkspaceSidebarTreeItem[]): string[] {
  const ids: string[] = []

  for (const item of items) {
    if (item.forceExpanded) {
      ids.push(item.id)
    }

    if (item.children?.length) {
      ids.push(...collectForceExpandedIds(item.children))
    }
  }

  return ids
}

function expandActiveAncestors(): void {
  for (const id of collectForceExpandedIds([...bookmarkItems.value, ...organizationItems.value])) {
    expandedIds.add(id)
  }
}

function bookmarkToTreeItem(bookmark: WorkspaceBookmark): WorkspaceSidebarTreeItem {
  const view = getWorkspaceTabView(bookmark)

  return {
    id: `bookmark:${bookmark.id}`,
    label: bookmark.title,
    url: bookmark.url,
    icon: bookmark.avatarUrl ? undefined : view.icon,
    avatarUrl: bookmark.avatarUrl,
    avatarFallback: bookmark.avatarFallback,
    isActive: props.activeUrl === bookmark.url,
  }
}

function submitBookmarkFolder(): void {
  const result = props.createBookmarkFolder(bookmarkFolderTitle.value)

  if (!result.ok) {
    bookmarkFolderError.value = result.reason
    return
  }

  isBookmarkFolderDialogOpen.value = false
}

function resetBookmarkFolderDialog(): void {
  bookmarkFolderTitle.value = ''
  bookmarkFolderError.value = null
}

watch(isBookmarkFolderDialogOpen, (isOpen) => {
  if (!isOpen) {
    resetBookmarkFolderDialog()
  }
})

watch(bookmarkFolderTitle, () => {
  bookmarkFolderError.value = null
})

watch(
  () => [props.activeUrl, bookmarkItems.value, organizationItems.value],
  expandActiveAncestors,
  { immediate: true },
)
</script>

<template>
  <aside
    data-workspace-sidebar
    class="relative flex h-full shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground"
    :style="sidebarStyle"
  >
    <SidebarHeader
      :class="isFullscreen
        ? 'gap-0 px-2 pb-1 pt-0'
        : 'gap-2 px-2 pb-2 pt-0'"
    >
      <div
        aria-hidden="true"
        class="workspace-titlebar-spacer"
        :data-fullscreen="isFullscreen ? 'true' : undefined"
      />
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            class="before:hidden"
            size="sm"
            :tooltip="t('workspace.sidebar.search')"
            type="button"
          >
            <Search />
            <span>{{ t('workspace.sidebar.search') }}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            class="before:hidden"
            size="sm"
            :is-active="activeUrl === '/inbox'"
            :tooltip="t('workspace.sidebar.items.inbox')"
            type="button"
            @click="emit('select', '/inbox')"
          >
            <Inbox />
            <span>{{ t('workspace.sidebar.items.inbox') }}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>

    <SidebarContent>
      <SidebarGroup class="px-2 py-1">
        <div class="flex h-7 items-center gap-1 px-2 pr-1">
          <SidebarGroupLabel class="h-6 flex-1 px-0 text-caption">
            {{ t('workspace.bookmarks.title') }}
          </SidebarGroupLabel>
          <button
            :aria-label="t('workspace.bookmarks.newFolder')"
            class="flex size-5 shrink-0 items-center justify-center text-muted-foreground outline-hidden transition-colors hover:text-foreground focus-visible:text-foreground"
            type="button"
            @click="isBookmarkFolderDialogOpen = true"
          >
            <Plus class="size-3.5" />
          </button>
        </div>

        <SidebarGroupContent>
          <p
            v-if="showBookmarksEmpty"
            class="px-2 py-1.5 text-caption text-muted-foreground"
          >
            {{ t('workspace.bookmarks.empty') }}
          </p>

          <WorkspaceSidebarTree
            v-else
            :active-url="activeUrl"
            :expanded-ids="expandedIds"
            :items="bookmarkItems"
            list-id="bookmarks"
            :visible-counts="visibleCounts"
            @select="emit('select', $event)"
            @show-more="setVisibleCount"
            @toggle="toggleExpanded"
          />
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup class="px-2 py-1">
        <SidebarGroupLabel class="h-6 px-2 text-caption">
          {{ t('workspace.sidebar.groups.organizations') }}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu v-if="showOrganizationsLoading">
            <SidebarMenuItem
              v-for="index in 3"
              :key="index"
            >
              <SidebarMenuSkeleton show-icon />
            </SidebarMenuItem>
          </SidebarMenu>

          <p
            v-else-if="showOrganizationsError"
            class="px-2 py-1.5 text-caption text-muted-foreground"
          >
            {{ t('workspace.sidebar.organizations.error') }}
          </p>

          <p
            v-else-if="showOrganizationsEmpty"
            class="px-2 py-1.5 text-caption text-muted-foreground"
          >
            {{ t('workspace.sidebar.organizations.empty') }}
          </p>

          <WorkspaceSidebarTree
            v-else
            :active-url="activeUrl"
            :expanded-ids="expandedIds"
            :items="organizationItems"
            list-id="organizations"
            :visible-counts="visibleCounts"
            @select="emit('select', $event)"
            @show-more="setVisibleCount"
            @toggle="toggleExpanded"
          />
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>

    <SidebarFooter
      v-if="viewer"
      class="border-t border-border"
    >
      <WorkspaceUserPanel :viewer="viewer" />
    </SidebarFooter>

    <button
      class="group absolute right-0 top-0 z-20 h-full w-1 translate-x-1/2 cursor-col-resize bg-transparent outline-hidden"
      :aria-label="t('workspace.sidebar.resize')"
      role="separator"
      type="button"
      @pointerdown="emit('startResize', $event)"
    >
      <span class="block h-full w-full transition-colors group-hover:bg-border group-focus-visible:bg-sidebar-ring" />
    </button>
  </aside>

  <Dialog v-model:open="isBookmarkFolderDialogOpen">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ t('workspace.bookmarks.newFolder') }}</DialogTitle>
        <DialogDescription class="sr-only">
          {{ t('workspace.bookmarks.newFolderDescription') }}
        </DialogDescription>
      </DialogHeader>

      <form
        class="space-y-4"
        @submit.prevent="submitBookmarkFolder"
      >
        <div class="space-y-2">
          <Label for="workspace-bookmark-folder-title">
            {{ t('workspace.bookmarks.folderName') }}
          </Label>
          <Input
            id="workspace-bookmark-folder-title"
            v-model="bookmarkFolderTitle"
            autocomplete="off"
            :placeholder="t('workspace.bookmarks.folderNamePlaceholder')"
          />
          <p
            v-if="bookmarkFolderErrorMessage"
            class="text-caption text-destructive"
          >
            {{ bookmarkFolderErrorMessage }}
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            @click="isBookmarkFolderDialogOpen = false"
          >
            {{ t('workspace.bookmarks.cancel') }}
          </Button>
          <Button type="submit">
            {{ t('workspace.bookmarks.createFolder') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.workspace-titlebar-spacer {
  height: 2.25rem;
  -webkit-app-region: drag;
}

.workspace-titlebar-spacer[data-fullscreen="true"] {
  height: 0.25rem;
}

:deep([data-workspace-sidebar] [data-sidebar="menu-button"][data-active="true"]::before) {
  display: none !important;
}

:deep([data-workspace-sidebar] [data-sidebar="menu-button"]:focus-visible) {
  box-shadow: none !important;
}
</style>
