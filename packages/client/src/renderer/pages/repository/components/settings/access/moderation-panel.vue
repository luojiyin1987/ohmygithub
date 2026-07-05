<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ExternalLink } from 'lucide-vue-next'
import {
  Button,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@oh-my-github/ui'
import SettingsSection from '@/pages/settings/components/appearance-settings/settings-section.vue'
import {
  clearRepositoryInteractionLimits,
  setRepositoryInteractionLimits,
  useRepositoryInteractionLimitsQuery,
  useRepositorySettingsInvalidation,
} from '@/composables/github/use-repository-settings'
import { useToast } from '@/composables/use-toast'

const NO_LIMIT = 'no_limit'
const LIMIT_GROUPS: readonly GitHubInteractionLimitGroup[] = [
  'existing_users',
  'contributors_only',
  'collaborators_only',
]
const EXPIRY_OPTIONS: readonly GitHubInteractionLimitExpiry[] = [
  'one_day',
  'three_days',
  'one_week',
  'one_month',
  'six_months',
]

const props = defineProps<{
  owner: string
  repo: string
}>()

const { t } = useI18n()
const toast = useToast()
const { invalidateInteractionLimits } = useRepositorySettingsInvalidation()

const hasIdentity = computed(() => Boolean(props.owner && props.repo))
const limitsQuery = useRepositoryInteractionLimitsQuery(
  () => props.owner,
  () => props.repo,
  hasIdentity,
)
const limits = computed(() => limitsQuery.data.value ?? null)
const isLoading = computed(() => limitsQuery.isLoading.value)
const isFromOtherLevel = computed(() =>
  Boolean(limits.value && limits.value.origin && limits.value.origin.toLowerCase() !== 'repository'))

const selectedLimit = ref<string>(NO_LIMIT)
const selectedExpiry = ref<GitHubInteractionLimitExpiry>('one_day')
const isSaving = ref(false)

watch(limits, (value) => {
  selectedLimit.value = value?.limit ?? NO_LIMIT
}, { immediate: true })

const isDirty = computed(() => selectedLimit.value !== (limits.value?.limit ?? NO_LIMIT))

async function save(): Promise<void> {
  if (!isDirty.value || isSaving.value) return
  isSaving.value = true

  try {
    if (selectedLimit.value === NO_LIMIT) {
      await clearRepositoryInteractionLimits(props.owner, props.repo)
    } else {
      await setRepositoryInteractionLimits(
        props.owner,
        props.repo,
        selectedLimit.value as GitHubInteractionLimitGroup,
        selectedExpiry.value,
      )
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('repository.settings.access.error'))
  } finally {
    isSaving.value = false
    invalidateInteractionLimits(props.owner, props.repo)
  }
}

function openExternal(path: string): void {
  const url = `https://github.com/${encodeURIComponent(props.owner)}/${encodeURIComponent(props.repo)}/settings${path}`
  void window.ohMyGithub?.links?.openExternalUrl(url)
}
</script>

<template>
  <div class="grid gap-4">
    <div
      v-if="isLoading"
      class="flex min-h-[8rem] items-center justify-center"
    >
      <Spinner class="size-4 text-muted-foreground" />
    </div>

    <template v-else>
      <SettingsSection :title="t('repository.settings.access.moderation.title')">
      <RadioGroup
        v-model="selectedLimit"
        class="grid gap-0 divide-y divide-border"
      >
        <label class="flex items-start gap-3 px-4 py-3">
          <RadioGroupItem
            class="mt-0.5"
            :value="NO_LIMIT"
          />
          <span class="min-w-0">
            <span class="block text-control font-medium text-foreground">
              {{ t('repository.settings.access.moderation.groups.no_limit.label') }}
            </span>
            <span class="block text-body text-muted-foreground">
              {{ t('repository.settings.access.moderation.groups.no_limit.description') }}
            </span>
          </span>
        </label>
        <label
          v-for="group in LIMIT_GROUPS"
          :key="group"
          class="flex items-start gap-3 px-4 py-3"
        >
          <RadioGroupItem
            class="mt-0.5"
            :value="group"
          />
          <span class="min-w-0">
            <span class="block text-control font-medium text-foreground">
              {{ t(`repository.settings.access.moderation.groups.${group}.label`) }}
            </span>
            <span class="block text-body text-muted-foreground">
              {{ t(`repository.settings.access.moderation.groups.${group}.description`) }}
            </span>
          </span>
        </label>
      </RadioGroup>
      </SettingsSection>

      <p
        v-if="isFromOtherLevel"
        class="px-2 text-caption text-warning"
      >
        {{ t('repository.settings.access.moderation.inheritedLimit', { origin: limits?.origin ?? '' }) }}
      </p>

      <div class="flex items-center justify-end gap-3">
        <Select
          v-if="selectedLimit !== NO_LIMIT"
          v-model="selectedExpiry"
        >
          <SelectTrigger class="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in EXPIRY_OPTIONS"
              :key="option"
              :value="option"
            >
              {{ t(`repository.settings.access.moderation.expiry.${option}`) }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          :disabled="isSaving || !isDirty"
          size="sm"
          type="button"
          @click="save"
        >
          <Spinner
            v-if="isSaving"
            class="size-3.5"
          />
          {{ t('repository.settings.access.moderation.save') }}
        </Button>
      </div>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button
          class="inline-flex items-center gap-1 text-caption text-muted-foreground underline-offset-4 outline-hidden hover:underline focus-visible:underline"
          type="button"
          @click="openExternal('/review_limits')"
        >
          {{ t('repository.settings.links.reviewLimits') }}
          <ExternalLink
            class="size-3"
            :stroke-width="1.75"
          />
        </button>
        <button
          class="inline-flex items-center gap-1 text-caption text-muted-foreground underline-offset-4 outline-hidden hover:underline focus-visible:underline"
          type="button"
          @click="openExternal('/reported_content')"
        >
          {{ t('repository.settings.links.reportedContent') }}
          <ExternalLink
            class="size-3"
            :stroke-width="1.75"
          />
        </button>
      </div>
    </template>
  </div>
</template>
