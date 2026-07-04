<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
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
import {
  clearInteractionLimits,
  setInteractionLimits,
  useInteractionLimitsQuery,
} from '@/composables/github/use-user-settings'
import { useToast } from '@/composables/use-toast'
import SettingsSection from '../appearance-settings/settings-section.vue'
import GithubTabError from './github-tab-error.vue'
import GithubTabShell from './github-tab-shell.vue'
import { formatDate, resolveErrorMessage } from './github-settings-utils'

const NO_LIMIT = 'no_limit'
const LIMIT_GROUPS = ['existing_users', 'contributors_only', 'collaborators_only'] as const
const EXPIRY_OPTIONS = ['one_day', 'three_days', 'one_week', 'one_month', 'six_months'] as const

const { t, locale } = useI18n()
const toast = useToast()
const { data: limits, error: limitsError, isPending, refetch } = useInteractionLimitsQuery()

const selectedLimit = ref<string>(NO_LIMIT)
const selectedExpiry = ref<GitHubInteractionLimitExpiry>('one_day')
const isSaving = ref(false)

const activeLimit = computed(() => limits.value ?? null)
const isDirty = computed(() => selectedLimit.value !== (activeLimit.value?.limit ?? NO_LIMIT))

watch(activeLimit, (value) => {
  selectedLimit.value = value?.limit ?? NO_LIMIT
}, { immediate: true })

async function save(): Promise<void> {
  if (isSaving.value || !isDirty.value) return

  isSaving.value = true

  try {
    if (selectedLimit.value === NO_LIMIT) {
      await clearInteractionLimits()
    } else {
      await setInteractionLimits(
        selectedLimit.value as GitHubInteractionLimitGroup,
        selectedExpiry.value,
      )
    }

    toast.success(t('settings.githubInteractionLimits.toasts.saved'))
    await refetch()
  } catch (error) {
    toast.error(t('settings.githubInteractionLimits.toasts.failed'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <GithubTabShell :required-scopes="['user']">
    <div
      v-if="isPending"
      class="flex justify-center py-12"
    >
      <Spinner class="size-5" />
    </div>
    <GithubTabError
      v-else-if="limitsError"
      :error="limitsError"
      @retry="refetch"
    />
    <template v-else>
      <p class="px-2 text-body text-muted-foreground">
        {{ t('settings.githubInteractionLimits.description') }}
      </p>

      <div
        v-if="activeLimit?.expiresAt"
        class="rounded-[var(--radius-menu-shell)] border border-border bg-muted/40 px-4 py-3 text-body text-muted-foreground"
      >
        {{ t('settings.githubInteractionLimits.activeUntil', {
          limit: t(`settings.githubInteractionLimits.groups.${activeLimit.limit}.label`),
          date: formatDate(activeLimit.expiresAt, locale),
        }) }}
      </div>

      <SettingsSection :title="t('settings.githubInteractionLimits.sections.limits')">
        <RadioGroup
          v-model="selectedLimit"
          class="gap-0 divide-y divide-border"
        >
          <label class="flex items-start gap-3 px-4 py-3">
            <RadioGroupItem
              class="mt-0.5"
              :value="NO_LIMIT"
            />
            <span class="min-w-0">
              <span class="block text-control font-medium text-foreground">
                {{ t('settings.githubInteractionLimits.groups.no_limit.label') }}
              </span>
              <span class="block text-body text-muted-foreground">
                {{ t('settings.githubInteractionLimits.groups.no_limit.description') }}
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
                {{ t(`settings.githubInteractionLimits.groups.${group}.label`) }}
              </span>
              <span class="block text-body text-muted-foreground">
                {{ t(`settings.githubInteractionLimits.groups.${group}.description`) }}
              </span>
            </span>
          </label>
        </RadioGroup>
      </SettingsSection>

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
              {{ t(`settings.githubInteractionLimits.expiry.${option}`) }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          :disabled="isSaving || !isDirty"
          size="sm"
          @click="save"
        >
          <Spinner
            v-if="isSaving"
            class="size-3.5"
          />
          {{ t('settings.githubInteractionLimits.save') }}
        </Button>
      </div>
    </template>
  </GithubTabShell>
</template>
