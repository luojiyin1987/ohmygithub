<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Button,
  Input,
  Spinner,
  TagsInput,
  TagsInputInput,
  TagsInputItem,
  TagsInputItemDelete,
  TagsInputItemText,
  Textarea,
} from '@oh-my-github/ui'
import SettingsSection from '@/pages/settings/components/appearance-settings/settings-section.vue'
import SettingsBlock from '@/pages/settings/components/appearance-settings/settings-block.vue'
import SettingsRow from '@/pages/settings/components/appearance-settings/settings-row.vue'
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
  <SettingsSection :title="t('repository.settings.general.basics.title')">
    <template #actions>
      <Button
        v-if="isDirty"
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
    </template>

    <SettingsRow
      :description="t('repository.settings.general.basics.nameHint')"
      :label="t('repository.settings.general.basics.name')"
    >
      <Input
        v-model="name"
        autocomplete="off"
        class="w-64"
        spellcheck="false"
      />
    </SettingsRow>

    <SettingsBlock :label="t('repository.settings.general.basics.description')">
      <Textarea
        v-model="description"
        rows="2"
      />
    </SettingsBlock>

    <SettingsRow :label="t('repository.settings.general.basics.homepage')">
      <Input
        v-model="homepage"
        autocomplete="off"
        class="w-64"
        placeholder="https://"
        spellcheck="false"
        type="url"
      />
    </SettingsRow>

    <SettingsBlock :label="t('repository.settings.general.basics.topics')">
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
    </SettingsBlock>
  </SettingsSection>
</template>
