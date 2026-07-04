<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Button,
  Input,
  Label,
  Spinner,
  TagsInput,
  TagsInputInput,
  TagsInputItem,
  TagsInputItemDelete,
  TagsInputItemText,
  Textarea,
} from '@oh-my-github/ui'
import { replaceTopics, updateGeneralSettings } from '@/composables/github/use-repository-settings'
import { useToast } from '@/composables/use-toast'

const props = defineProps<{
  owner: string
  repo: string
  settings: GitHubRepositoryGeneralSettings
}>()

const emit = defineEmits<{
  saved: []
  renamed: [newName: string]
}>()

const { t } = useI18n()
const toast = useToast()

const name = ref(props.settings.name)
const description = ref(props.settings.description ?? '')
const homepage = ref(props.settings.homepage ?? '')
const topics = ref<string[]>([...props.settings.topics])
const isSaving = ref(false)

watch(
  () => props.settings,
  (settings) => {
    name.value = settings.name
    description.value = settings.description ?? ''
    homepage.value = settings.homepage ?? ''
    topics.value = [...settings.topics]
  },
)

const isDirty = computed(() =>
  name.value.trim() !== props.settings.name
  || description.value.trim() !== (props.settings.description ?? '')
  || homepage.value.trim() !== (props.settings.homepage ?? '')
  || topics.value.join('\n') !== props.settings.topics.join('\n'))

async function save(): Promise<void> {
  if (!isDirty.value || isSaving.value) return
  isSaving.value = true

  const nextName = name.value.trim()
  const renamed = Boolean(nextName) && nextName !== props.settings.name

  try {
    const input: UpdateRepositoryGeneralSettingsInput = {}
    if (renamed) input.name = nextName
    if (description.value.trim() !== (props.settings.description ?? '')) {
      input.description = description.value.trim()
    }
    if (homepage.value.trim() !== (props.settings.homepage ?? '')) {
      input.homepage = homepage.value.trim()
    }

    if (Object.keys(input).length > 0) {
      await updateGeneralSettings(props.owner, props.repo, input)
    }
    if (topics.value.join('\n') !== props.settings.topics.join('\n')) {
      await replaceTopics(props.owner, renamed ? nextName : props.repo, topics.value)
    }

    if (renamed) {
      emit('renamed', nextName)
    }
    emit('saved')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('repository.settings.general.saveError'))
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <section class="grid gap-3">
    <h3 class="text-control font-medium text-foreground">
      {{ t('repository.settings.general.basics.title') }}
    </h3>

    <div class="grid max-w-xl gap-1.5">
      <Label for="repository-settings-name">{{ t('repository.settings.general.basics.name') }}</Label>
      <Input
        id="repository-settings-name"
        v-model="name"
        autocomplete="off"
        spellcheck="false"
      />
      <p class="text-caption text-muted-foreground">
        {{ t('repository.settings.general.basics.nameHint') }}
      </p>
    </div>

    <div class="grid max-w-xl gap-1.5">
      <Label for="repository-settings-description">
        {{ t('repository.settings.general.basics.description') }}
      </Label>
      <Textarea
        id="repository-settings-description"
        v-model="description"
        rows="2"
      />
    </div>

    <div class="grid max-w-xl gap-1.5">
      <Label for="repository-settings-homepage">
        {{ t('repository.settings.general.basics.homepage') }}
      </Label>
      <Input
        id="repository-settings-homepage"
        v-model="homepage"
        autocomplete="off"
        placeholder="https://"
        spellcheck="false"
        type="url"
      />
    </div>

    <div class="grid max-w-xl gap-1.5">
      <Label>{{ t('repository.settings.general.basics.topics') }}</Label>
      <TagsInput v-model="topics">
        <TagsInputItem
          v-for="topic in topics"
          :key="topic"
          :value="topic"
        >
          <TagsInputItemText />
          <TagsInputItemDelete />
        </TagsInputItem>
        <TagsInputInput :placeholder="t('repository.settings.general.basics.topicsPlaceholder')" />
      </TagsInput>
    </div>

    <div
      v-if="isDirty"
      class="flex max-w-xl justify-end"
    >
      <Button
        :disabled="isSaving"
        size="sm"
        type="button"
        @click="save"
      >
        <Spinner
          v-if="isSaving"
          class="size-3.5"
        />
        {{ t('repository.settings.general.basics.save') }}
      </Button>
    </div>
  </section>
</template>
