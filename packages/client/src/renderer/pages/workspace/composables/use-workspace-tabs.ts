import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { WorkspaceTab } from '../types'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  DEFAULT_WORKSPACE_URL,
  createWorkspaceTabFromUrl,
  isReservedInternalPath,
  isWorkspaceTabType,
  routeToWorkspaceUrl,
} from '../workspace-url'

const STORAGE_KEY = 'oh-my-github:workspace-tabs:v1'
const STORAGE_VERSION = 1

interface StoredWorkspaceTabs {
  version: 1
  activeUrl: string
  tabs: WorkspaceTab[]
}

export function useWorkspaceTabs() {
  const route = useRoute()
  const router = useRouter()
  const restored = readStoredTabs()
  const tabs = ref<WorkspaceTab[]>(restored?.tabs ?? [createWorkspaceTabFromUrl(DEFAULT_WORKSPACE_URL)])
  const activeUrl = ref(restored?.activeUrl ?? tabs.value[0]?.url ?? DEFAULT_WORKSPACE_URL)

  const activeTab = computed(() => {
    return tabs.value.find((tab) => tab.url === activeUrl.value) ?? tabs.value[0]
  })

  async function selectTab(url: string): Promise<void> {
    await router.push(url)
  }

  async function createTab(): Promise<void> {
    const url = nextDraftUrl(tabs.value)
    await router.push(url)
  }

  async function closeTab(url: string): Promise<void> {
    if (tabs.value.length <= 1) return

    const index = tabs.value.findIndex((tab) => tab.url === url)
    if (index === -1) return

    const nextTabs = tabs.value.filter((tab) => tab.url !== url)
    tabs.value = nextTabs

    if (activeUrl.value === url) {
      const nextTab = nextTabs[Math.min(index, nextTabs.length - 1)] ?? nextTabs[0]
      activeUrl.value = nextTab.url
      persistTabs(tabs.value, activeUrl.value)
      await router.replace(nextTab.url)
      return
    }

    persistTabs(tabs.value, activeUrl.value)
  }

  function applyRoute(nextRoute: RouteLocationNormalizedLoaded): void {
    if (nextRoute.name !== 'workspace' && nextRoute.name !== 'workspace-root') return
    const nextUrl = routeToWorkspaceUrl(nextRoute)

    if (nextUrl === '/') {
      void router.replace(activeUrl.value || DEFAULT_WORKSPACE_URL)
      return
    }

    const tab = createWorkspaceTabFromUrl(nextUrl)
    upsertTab(tab)
    activeUrl.value = tab.url
    persistTabs(tabs.value, activeUrl.value)

    if (tab.url !== nextUrl) {
      void router.replace(tab.url)
    }
  }

  function upsertTab(tab: WorkspaceTab): void {
    const existingIndex = tabs.value.findIndex((item) => item.url === tab.url)
    if (existingIndex === -1) {
      tabs.value = [...tabs.value, tab]
      return
    }

    tabs.value = tabs.value.map((item, index) => index === existingIndex ? tab : item)
  }

  watch(
    () => route.fullPath,
    () => applyRoute(route),
    { immediate: true },
  )

  return {
    activeTab,
    activeUrl,
    closeTab,
    createTab,
    selectTab,
    tabs,
  }
}

function readStoredTabs(): StoredWorkspaceTabs | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.tabs)) {
      return null
    }

    const tabs = dedupeTabs(parsed.tabs.map(coerceStoredTab).filter((tab): tab is WorkspaceTab => Boolean(tab)))
    if (!tabs.length) return null

    const activeUrl = typeof parsed.activeUrl === 'string' ? createWorkspaceTabFromUrl(parsed.activeUrl).url : tabs[0].url
    const activeTab = tabs.find((tab) => tab.url === activeUrl) ?? tabs[0]

    return {
      version: STORAGE_VERSION,
      activeUrl: activeTab.url,
      tabs,
    }
  } catch {
    return null
  }
}

function coerceStoredTab(value: unknown): WorkspaceTab | null {
  if (!isRecord(value)) return null
  if (typeof value.url !== 'string') return null
  if (typeof value.type !== 'string' || !isWorkspaceTabType(value.type)) return null

  const tab = createWorkspaceTabFromUrl(value.url)
  if (!isReservedInternalPath(tab.url) && tab.type !== value.type) return null

  return tab
}

function persistTabs(tabs: WorkspaceTab[], activeUrl: string): void {
  const payload: StoredWorkspaceTabs = {
    version: STORAGE_VERSION,
    activeUrl,
    tabs: dedupeTabs(tabs),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

function dedupeTabs(tabs: WorkspaceTab[]): WorkspaceTab[] {
  const seen = new Set<string>()
  const result: WorkspaceTab[] = []

  for (const tab of tabs) {
    if (seen.has(tab.url)) continue
    seen.add(tab.url)
    result.push(tab)
  }

  return result
}

function nextDraftUrl(tabs: WorkspaceTab[]): string {
  let next = 1
  const used = new Set(
    tabs
      .map((tab) => tab.draftId)
      .filter((id): id is string => Boolean(id)),
  )

  while (used.has(String(next))) {
    next += 1
  }

  return `/draft/${next}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
