<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Trash2, UsersRound } from 'lucide-vue-next'
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@oh-my-github/ui'
import { removeTeamAccess, setTeamAccess } from '@/composables/github/use-repository-settings'
import { useToast } from '@/composables/use-toast'

const TEAM_PERMISSIONS = ['pull', 'triage', 'push', 'maintain', 'admin'] as const

const props = defineProps<{
  owner: string
  repo: string
  overview: GitHubRepositoryAccessOverview
}>()

const emit = defineEmits<{
  refresh: []
}>()

const { t } = useI18n()
const toast = useToast()

const newTeamSlug = ref('')
const newPermission = ref<string>('pull')
const isAdding = ref(false)
const pendingKeys = ref(new Set<string>())

function isPending(key: string): boolean {
  return pendingKeys.value.has(key)
}

async function run(key: string, action: () => Promise<void>): Promise<void> {
  if (pendingKeys.value.has(key)) return
  pendingKeys.value = new Set([...pendingKeys.value, key])

  try {
    await action()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('repository.settings.access.error'))
  } finally {
    const next = new Set(pendingKeys.value)
    next.delete(key)
    pendingKeys.value = next
    emit('refresh')
  }
}

async function add(): Promise<void> {
  const slug = newTeamSlug.value.trim()
  if (!slug || isAdding.value) return
  isAdding.value = true

  try {
    await setTeamAccess(props.owner, slug, props.owner, props.repo, newPermission.value)
    newTeamSlug.value = ''
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('repository.settings.access.error'))
  } finally {
    isAdding.value = false
    emit('refresh')
  }
}

function changePermission(slug: string, value: unknown): void {
  if (typeof value !== 'string') return
  void run(`team:${slug}`, () => setTeamAccess(props.owner, slug, props.owner, props.repo, value))
}

function remove(slug: string): void {
  void run(`remove:${slug}`, () => removeTeamAccess(props.owner, slug, props.owner, props.repo))
}
</script>

<template>
  <div class="grid gap-3">
    <form
      class="flex max-w-xl items-center gap-2"
      @submit.prevent="add"
    >
      <Input
        v-model="newTeamSlug"
        autocomplete="off"
        class="flex-1"
        :placeholder="t('repository.settings.access.teams.addPlaceholder')"
        spellcheck="false"
      />
      <Select v-model="newPermission">
        <SelectTrigger class="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="permission in TEAM_PERMISSIONS"
            :key="permission"
            :value="permission"
          >
            {{ t(`repository.settings.access.roles.${permission}`) }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Button
        :disabled="isAdding || !newTeamSlug.trim()"
        size="sm"
        type="submit"
      >
        <Spinner
          v-if="isAdding"
          class="size-3.5"
        />
        <UsersRound
          v-else
          class="size-3.5"
          :stroke-width="1.75"
        />
        {{ t('repository.settings.access.teams.add') }}
      </Button>
    </form>

    <div
      v-if="overview.teams.length > 0"
      class="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div
        v-for="(team, index) in overview.teams"
        :key="team.slug"
        :class="[
          'flex items-center justify-between gap-4 px-4 py-2.5',
          index > 0 ? 'border-t border-border' : '',
        ]"
      >
        <div class="grid min-w-0 gap-0.5">
          <span class="truncate text-body font-medium text-foreground">{{ team.name }}</span>
          <span class="truncate text-caption text-muted-foreground">{{ team.org }}/{{ team.slug }}</span>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Select
            :disabled="isPending(`team:${team.slug}`)"
            :model-value="team.permission"
            @update:model-value="changePermission(team.slug, $event)"
          >
            <SelectTrigger class="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="permission in TEAM_PERMISSIONS"
                :key="permission"
                :value="permission"
              >
                {{ t(`repository.settings.access.roles.${permission}`) }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            :aria-label="t('repository.settings.access.teams.remove')"
            :disabled="isPending(`remove:${team.slug}`)"
            size="icon-sm"
            type="button"
            variant="outline"
            @click="remove(team.slug)"
          >
            <Trash2
              class="size-3.5 text-muted-foreground"
              :stroke-width="1.75"
            />
          </Button>
        </div>
      </div>
    </div>

    <p
      v-else
      class="text-body text-muted-foreground"
    >
      {{ t('repository.settings.access.teams.empty') }}
    </p>
  </div>
</template>
