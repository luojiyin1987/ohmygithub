<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ShieldAlert, UserRound } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { Button } from '@oh-my-github/ui'
import { findMissingScopes, useAuthStateQuery } from '@/composables/github/use-user-settings'

const props = withDefaults(defineProps<{
  requiredScopes?: string[]
}>(), {
  requiredScopes: () => [],
})

const { t } = useI18n()
const router = useRouter()
const { data: authState, isPending } = useAuthStateQuery()

const isAuthenticated = computed(() => Boolean(authState.value?.isAuthenticated))
const missingScopes = computed(() =>
  findMissingScopes(authState.value ?? null, props.requiredScopes),
)

function goToAuth(): void {
  void router.push('/auth')
}
</script>

<template>
  <div
    v-if="isPending"
    class="py-8"
  />
  <div
    v-else-if="!isAuthenticated"
    class="flex flex-col items-center gap-3 rounded-[var(--radius-menu-shell)] border border-border bg-card px-6 py-12 text-center"
  >
    <UserRound class="size-8 text-muted-foreground" />
    <p class="text-body text-muted-foreground">
      {{ t('settings.github.signInRequired') }}
    </p>
    <Button
      size="sm"
      @click="goToAuth"
    >
      {{ t('settings.github.signIn') }}
    </Button>
  </div>
  <div
    v-else
    class="space-y-6"
  >
    <div
      v-if="missingScopes.length > 0"
      class="flex items-start gap-3 rounded-[var(--radius-menu-shell)] border border-amber-500/40 bg-amber-500/10 px-4 py-3"
    >
      <ShieldAlert class="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div class="min-w-0 flex-1">
        <p class="text-control font-medium text-foreground">
          {{ t('settings.github.missingScopesTitle') }}
        </p>
        <p class="mt-0.5 text-body text-muted-foreground">
          {{ t('settings.github.missingScopesDescription', { scopes: missingScopes.join(', ') }) }}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        @click="goToAuth"
      >
        {{ t('settings.github.reauthorize') }}
      </Button>
    </div>
    <slot :missing-scopes="missingScopes" />
  </div>
</template>
