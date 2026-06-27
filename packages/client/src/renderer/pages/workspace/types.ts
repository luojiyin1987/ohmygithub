import type { Component } from 'vue'

export type WorkspaceMessageParams = Record<string, string | number>

export type WorkspaceTabType =
  | 'inbox'
  | 'reviews'
  | 'activity'
  | 'draft'
  | 'account'
  | 'org'
  | 'repo'

export interface WorkspacePanelStat {
  id: string
  labelKey: string
  value?: string
  valueKey?: string
}

export interface WorkspacePanelBlock {
  id: string
  titleKey: string
  descriptionKey: string
  metaKey: string
}

export interface WorkspaceTab {
  url: string
  type: WorkspaceTabType
  title: string
  owner?: string
  repo?: string
  draftId?: string
}

export interface WorkspaceBookmarkFolder {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface WorkspaceBookmark {
  id: string
  url: string
  type: WorkspaceTabType
  title: string
  folderId: string | null
  owner?: string
  repo?: string
  draftId?: string
  avatarUrl?: string
  avatarFallback?: string
}

export interface WorkspaceSidebarTreeItemLoader {
  type: 'organization-repositories'
  owner: string
}

export interface WorkspaceSidebarTreeItem {
  id: string
  label: string
  url?: string
  icon?: Component
  avatarUrl?: string
  avatarFallback?: string
  isActive?: boolean
  canExpand?: boolean
  forceExpanded?: boolean
  children?: WorkspaceSidebarTreeItem[]
  childrenLoader?: WorkspaceSidebarTreeItemLoader
}

export interface WorkspaceTabView {
  tab: WorkspaceTab
  icon: Component
  titleKey?: string
  titleParams?: WorkspaceMessageParams
  title: string
  eyebrowKey: string
  headingKey: string
  headingParams?: WorkspaceMessageParams
  descriptionKey: string
  descriptionParams?: WorkspaceMessageParams
  stats: WorkspacePanelStat[]
  blocks: WorkspacePanelBlock[]
}
