<script setup lang="ts">
import type { RepositoryOverviewInfoItem, RepositorySectionId } from '@/pages/repository/components/types'
import OverviewDocumentsCard from './overview-documents-card.vue'
import OverviewSummaryCard from './overview-summary-card.vue'

defineProps<{
  activeDocument: GitHubRepositoryDocument | null
  activeDocumentKind: GitHubRepositoryDocumentKind
  availableDocuments: GitHubRepositoryDocument[]
  hasOverviewError: boolean
  isOverviewLoading: boolean
  missingScopesText: string
  owner: string
  overview: GitHubRepositoryOverview | null
  overviewDescription: string
  overviewInfoItems: RepositoryOverviewInfoItem[]
  repo: string
}>()

const emit = defineEmits<{
  'update:activeDocumentKind': [value: GitHubRepositoryDocumentKind]
  viewAllContributors: []
  selectSection: [section: RepositorySectionId]
}>()
</script>

<template>
  <OverviewSummaryCard
    :has-overview-error="hasOverviewError"
    :is-overview-loading="isOverviewLoading"
    :missing-scopes-text="missingScopesText"
    :overview="overview"
    :overview-description="overviewDescription"
    :overview-info-items="overviewInfoItems"
    :owner="owner"
    :repo="repo"
    @select-section="emit('selectSection', $event)"
    @view-all-contributors="emit('viewAllContributors')"
  />

  <OverviewDocumentsCard
    :active-document="activeDocument"
    :active-document-kind="activeDocumentKind"
    :available-documents="availableDocuments"
    :has-overview-error="hasOverviewError"
    :is-overview-loading="isOverviewLoading"
    :owner="owner"
    :overview="overview"
    :repo="repo"
    @update:active-document-kind="emit('update:activeDocumentKind', $event)"
  />
</template>
