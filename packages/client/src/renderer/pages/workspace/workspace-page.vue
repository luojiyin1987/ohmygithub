<script setup lang="ts">
import type { WorkspaceTab } from './types'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { SidebarInset, SidebarProvider } from '@oh-my-github/ui'
import { useWorkspaceBookmarks } from './composables/use-workspace-bookmarks'
import { useOrganizationsQuery } from '../../composables/github/use-organizations'
import { useRightPanel } from '../../composables/use-right-panel'
import { registerKeyboardShortcutHandler } from '../../keyboard/shortcut-runtime'
import { useWorkspaceTabs } from './composables/use-workspace-tabs'
import { getWorkspaceTabView } from './tab-presentation'
import WorkspaceSidebar from './components/workspace-sidebar.vue'
import WorkspaceSearchDialog from './components/workspace-search-dialog.vue'
import WorkspaceTabs from './components/workspace-tabs.vue'

const SIDEBAR_WIDTH_STORAGE_KEY = 'oh-my-github:workspace-sidebar-width:v1'
const DEFAULT_SIDEBAR_WIDTH = 384
const MIN_SIDEBAR_WIDTH = 240
const MAX_SIDEBAR_WIDTH = 640

const isSidebarOpen = ref(true)
const isSidebarResizing = ref(false)
const isSearchDialogOpen = ref(false)
const isWindowFullscreen = ref(false)
const sidebarWidth = ref(readStoredSidebarWidth())
const viewer = ref<AuthViewer | null>(null)
let stopFullscreenListener: (() => void) | undefined
const shortcutUnregisters: Array<() => void> = []
let resizeStartX = 0
let resizeStartWidth = 0

const route = useRoute()
const { t } = useI18n()
const { toggleRightPanel } = useRightPanel()
const {
  activeTab,
  activeUrl,
  canGoBack,
  canGoForward,
  closeTab,
  createTab,
  goBack,
  goForward,
  replaceActiveTabUrl,
  selectTab,
  tabs,
} = useWorkspaceTabs()

const organizationsQuery = useOrganizationsQuery()
const organizations = computed(() => organizationsQuery.data.value ?? [])
const organizationsLoading = computed(() => organizationsQuery.isLoading.value)
const organizationsError = computed(() => Boolean(organizationsQuery.error.value))
const sidebarWidthValue = computed(() => `${sidebarWidth.value}px`)
const organizationsByLogin = computed(() => {
  return new Map(organizations.value.map((organization) => [organization.login, organization]))
})
const {
  bookmarkedUrls,
  bookmarks,
  createFolder: createBookmarkFolder,
  folders: bookmarkFolders,
  removeBookmark,
  addBookmark,
} = useWorkspaceBookmarks()
const canUseWorkspaceShortcuts = computed(() => route.name !== 'settings' && !isSearchDialogOpen.value)

onMounted(async () => {
  registerWorkspaceShortcuts()

  try {
    const authState = await window.ohMyGithub?.auth?.get?.()
    viewer.value = authState?.auth?.viewer ?? null
  } catch {
    viewer.value = null
  }

  try {
    const state = await window.ohMyGithub?.windowControls?.getState?.()
    isWindowFullscreen.value = Boolean(state?.isFullScreen)
    stopFullscreenListener = window.ohMyGithub?.windowControls?.onFullscreenChange?.((nextState) => {
      isWindowFullscreen.value = nextState.isFullScreen
    })
  } catch {
    isWindowFullscreen.value = false
  }
})

onBeforeUnmount(() => {
  stopFullscreenListener?.()
  stopSidebarResize()
  shortcutUnregisters.splice(0).forEach((unregister) => unregister())
})

function readStoredSidebarWidth(): number {
  const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY))
  return clampSidebarWidth(Number.isFinite(stored) ? stored : DEFAULT_SIDEBAR_WIDTH)
}

function clampSidebarWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)))
}

function setSidebarWidth(width: number): void {
  sidebarWidth.value = clampSidebarWidth(width)
}

function startSidebarResize(event: PointerEvent): void {
  if (!isSidebarOpen.value) return

  event.preventDefault()
  isSidebarResizing.value = true
  resizeStartX = event.clientX
  resizeStartWidth = sidebarWidth.value
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', resizeSidebar)
  window.addEventListener('pointerup', stopSidebarResize, { once: true })
}

function resizeSidebar(event: PointerEvent): void {
  if (!isSidebarResizing.value) return
  setSidebarWidth(resizeStartWidth + event.clientX - resizeStartX)
}

function stopSidebarResize(): void {
  if (!isSidebarResizing.value) return

  isSidebarResizing.value = false
  localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth.value))
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  window.removeEventListener('pointermove', resizeSidebar)
}

function addTabBookmark(input: {
  folderId: string | null
  tab: WorkspaceTab
  title: string
}): void {
  const organization = input.tab.type === 'org' && input.tab.owner
    ? organizationsByLogin.value.get(input.tab.owner)
    : undefined

  addBookmark({
    folderId: input.folderId,
    organization,
    tab: input.tab,
    title: input.title,
  })
}

function openSearchDialog(): void {
  isSearchDialogOpen.value = true
}

function registerWorkspaceShortcuts(): void {
  if (shortcutUnregisters.length > 0) return

  shortcutUnregisters.push(
    registerKeyboardShortcutHandler('workspace.search', () => {
      openSearchDialog()
      return true
    }, { enabled: () => canUseWorkspaceShortcuts.value }),
    registerKeyboardShortcutHandler('workspace.newTab', () => {
      void createTab()
      return true
    }, { enabled: () => canUseWorkspaceShortcuts.value }),
    registerKeyboardShortcutHandler('workspace.closeTab', () => {
      if (tabs.value.length <= 1) return false

      void closeTab(activeUrl.value)
      return true
    }, { enabled: () => canUseWorkspaceShortcuts.value }),
    registerKeyboardShortcutHandler('workspace.goBack', () => {
      if (!canGoBack.value) return false

      void goBack()
      return true
    }, { enabled: () => canUseWorkspaceShortcuts.value }),
    registerKeyboardShortcutHandler('workspace.goForward', () => {
      if (!canGoForward.value) return false

      void goForward()
      return true
    }, { enabled: () => canUseWorkspaceShortcuts.value }),
    registerKeyboardShortcutHandler('workspace.toggleSidebar', () => {
      isSidebarOpen.value = !isSidebarOpen.value
      return true
    }, { enabled: () => canUseWorkspaceShortcuts.value }),
    registerKeyboardShortcutHandler('workspace.toggleRightPanel', () => {
      toggleRightPanel()
      return true
    }, { enabled: () => canUseWorkspaceShortcuts.value }),
    registerKeyboardShortcutHandler('workspace.toggleBookmark', () => toggleActiveBookmark(), {
      enabled: () => canUseWorkspaceShortcuts.value,
    }),
  )
}

function toggleActiveBookmark(): boolean {
  const tab = activeTab.value
  if (!tab) return false

  if (bookmarkedUrls.value.has(tab.url)) {
    removeBookmark(tab.url)
    return true
  }

  addTabBookmark({
    folderId: null,
    tab,
    title: tabTitle(tab),
  })

  return true
}

function tabTitle(tab: WorkspaceTab): string {
  const view = getWorkspaceTabView(tab)
  if (view.titleKey) {
    return t(view.titleKey, view.titleParams ?? {})
  }

  return view.title
}
</script>

<template>
  <SidebarProvider
    v-model:open="isSidebarOpen"
    :width="sidebarWidthValue"
    class="h-full min-h-0 bg-background"
  >
    <WorkspaceSidebar
      :active-url="activeUrl"
      :bookmark-folders="bookmarkFolders"
      :bookmarks="bookmarks"
      :create-bookmark-folder="createBookmarkFolder"
      :is-fullscreen="isWindowFullscreen"
      :organizations="organizations"
      :organizations-error="organizationsError"
      :organizations-loading="organizationsLoading"
      :viewer="viewer"
      :width="sidebarWidth"
      @search="openSearchDialog"
      @select="selectTab"
      @start-resize="startSidebarResize"
    />

    <SidebarInset class="min-w-0 overflow-hidden">
      <div class="flex h-full min-h-0 flex-col bg-background">
        <WorkspaceTabs
          :active-url="activeUrl"
          :bookmark-folders="bookmarkFolders"
          :bookmarks="bookmarks"
          :bookmarked-urls="bookmarkedUrls"
          :can-go-back="canGoBack"
          :can-go-forward="canGoForward"
          :is-fullscreen="isWindowFullscreen"
          :tabs="tabs"
          @back="goBack"
          @bookmark="addTabBookmark"
          @close="closeTab"
          @create="createTab"
          @forward="goForward"
          @replace-active-url="replaceActiveTabUrl"
          @remove-bookmark="removeBookmark"
          @search="openSearchDialog"
          @select="selectTab"
        />
      </div>
    </SidebarInset>

    <WorkspaceSearchDialog
      v-model:open="isSearchDialogOpen"
      @navigate="selectTab"
    />
  </SidebarProvider>
</template>
