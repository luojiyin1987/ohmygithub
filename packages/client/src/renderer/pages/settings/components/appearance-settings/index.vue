<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@oh-my-github/ui'
import {
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_UI_FONT_FAMILY,
  MERMAID_THEMES,
  listBundledShikiThemes,
  type ColorSchemeId,
  type MermaidTheme,
  type ThemePreference,
  useSettingsStore,
} from '../../../../stores/settings'
import CodeThemePreview from './code-theme-preview.vue'
import ColorSchemeSelect from './color-scheme-select.vue'
import FontFamilyInput from './font-family-input.vue'
import FontSizeField from './font-size-field.vue'
import MermaidThemePreview from './mermaid-theme-preview.vue'
import SettingsBlock from './settings-block.vue'
import SettingsRow from './settings-row.vue'
import SettingsSection from './settings-section.vue'
import ShikiThemePicker from './shiki-theme-picker.vue'
import ThemeModeControl from './theme-mode-control.vue'

const { t } = useI18n()
const settingsStore = useSettingsStore()
const {
  codeFontFamily,
  codeFontSizePx,
  colorScheme,
  isDark,
  locale,
  mermaidTheme,
  shikiThemeDark,
  shikiThemeLight,
  theme,
  uiFontFamily,
  uiFontSizePx,
} = storeToRefs(settingsStore)

const shikiThemes = listBundledShikiThemes()
const lightShikiThemeOptions = computed(() =>
  shikiThemes.filter((theme) => theme.type === 'light')
)
const darkShikiThemeOptions = computed(() =>
  shikiThemes.filter((theme) => theme.type === 'dark')
)
const shikiThemeLightSelection = computed<string>({
  get: () => shikiThemeLight.value,
  set: (value) => settingsStore.setShikiTheme('light', value)
})
const shikiThemeDarkSelection = computed<string>({
  get: () => shikiThemeDark.value,
  set: (value) => settingsStore.setShikiTheme('dark', value)
})

const mermaidThemeLabels = computed<Record<MermaidTheme, string>>(() => ({
  auto: t('settings.appearance.mermaidThemes.auto'),
  dark: t('settings.appearance.mermaidThemes.dark'),
  default: t('settings.appearance.mermaidThemes.default'),
  forest: t('settings.appearance.mermaidThemes.forest'),
  neutral: t('settings.appearance.mermaidThemes.neutral')
}))

function setTheme(value: ThemePreference): void {
  settingsStore.setTheme(value)
}

function setColorScheme(value: ColorSchemeId): void {
  settingsStore.setColorScheme(value)
}
</script>

<template>
  <div class="space-y-8">
    <SettingsSection :title="t('settings.appearance.interface')">
      <SettingsRow :label="t('settings.appearance.language')">
        <Select
          :model-value="locale"
          @update:model-value="(value) => value && settingsStore.setLocale(value as 'en' | 'zh')"
        >
          <SelectTrigger
            size="sm"
            class="min-w-36"
          >
            <SelectValue :placeholder="t('settings.appearance.languagePlaceholder')" />
          </SelectTrigger>
          <SelectContent
            align="end"
            :align-offset="0"
          >
            <SelectItem value="en">
              {{ t('settings.appearance.languages.en') }}
            </SelectItem>
            <SelectItem value="zh">
              {{ t('settings.appearance.languages.zh') }}
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>

      <SettingsRow :label="t('settings.appearance.theme')">
        <ThemeModeControl
          :control-label="t('settings.appearance.theme')"
          :model-value="theme"
          @update:model-value="setTheme"
        />
      </SettingsRow>

      <SettingsRow :label="t('settings.appearance.colorScheme')">
        <ColorSchemeSelect
          :is-dark="isDark"
          :model-value="colorScheme"
          @update:model-value="setColorScheme"
        />
      </SettingsRow>
    </SettingsSection>

    <SettingsSection :title="t('settings.appearance.typography')">
      <SettingsRow
        :label="t('settings.appearance.uiFontSize')"
        :description="t('settings.appearance.uiFontSizeDescription')"
      >
        <FontSizeField
          :control-label="t('settings.appearance.uiFontSize')"
          :max="20"
          :min="12"
          :model-value="uiFontSizePx"
          @update:model-value="settingsStore.setUiFontSizePx"
        />
      </SettingsRow>

      <SettingsRow
        :label="t('settings.appearance.codeFontSize')"
        :description="t('settings.appearance.codeFontSizeDescription')"
      >
        <FontSizeField
          :control-label="t('settings.appearance.codeFontSize')"
          :max="20"
          :min="11"
          :model-value="codeFontSizePx"
          @update:model-value="settingsStore.setCodeFontSizePx"
        />
      </SettingsRow>

      <SettingsRow
        :label="t('settings.appearance.uiFontFamily')"
        :description="t('settings.appearance.uiFontFamilyDescription')"
      >
        <FontFamilyInput
          :control-label="t('settings.appearance.uiFontFamily')"
          :model-value="uiFontFamily"
          :placeholder="DEFAULT_UI_FONT_FAMILY"
          @update:model-value="settingsStore.setUiFontFamily"
        />
      </SettingsRow>

      <SettingsRow
        :label="t('settings.appearance.codeFontFamily')"
        :description="t('settings.appearance.codeFontFamilyDescription')"
      >
        <FontFamilyInput
          :control-label="t('settings.appearance.codeFontFamily')"
          :model-value="codeFontFamily"
          :placeholder="DEFAULT_CODE_FONT_FAMILY"
          @update:model-value="settingsStore.setCodeFontFamily"
        />
      </SettingsRow>

      <SettingsBlock
        :label="t('settings.appearance.codeHighlight')"
        :description="t('settings.appearance.codeHighlightDescription')"
      >
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-2">
            <ShikiThemePicker
              v-model="shikiThemeLightSelection"
              :control-label="t('settings.appearance.shikiThemeLight')"
              :empty-text="t('settings.appearance.shikiThemeEmpty')"
              :options="lightShikiThemeOptions"
              :placeholder="t('settings.appearance.shikiThemeLight')"
              :search-placeholder="t('settings.appearance.shikiThemeSearch')"
            />
            <CodeThemePreview :theme="shikiThemeLight" />
          </div>
          <div class="space-y-2">
            <ShikiThemePicker
              v-model="shikiThemeDarkSelection"
              :control-label="t('settings.appearance.shikiThemeDark')"
              :empty-text="t('settings.appearance.shikiThemeEmpty')"
              :options="darkShikiThemeOptions"
              :placeholder="t('settings.appearance.shikiThemeDark')"
              :search-placeholder="t('settings.appearance.shikiThemeSearch')"
            />
            <CodeThemePreview :theme="shikiThemeDark" />
          </div>
        </div>
      </SettingsBlock>
    </SettingsSection>

    <SettingsSection :title="t('settings.appearance.diagrams')">
      <SettingsBlock
        :label="t('settings.appearance.mermaidTheme')"
        :description="t('settings.appearance.mermaidThemeDescription')"
      >
        <template #actions>
          <Select
            :model-value="mermaidTheme"
            @update:model-value="(value) => value && settingsStore.setMermaidTheme(value as MermaidTheme)"
          >
            <SelectTrigger
              size="sm"
              class="min-w-36"
            >
              <SelectValue>
                {{ mermaidThemeLabels[mermaidTheme] }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent
              align="end"
              :align-offset="0"
            >
              <SelectItem
                v-for="value in MERMAID_THEMES"
                :key="value"
                :value="value"
              >
                {{ mermaidThemeLabels[value] }}
              </SelectItem>
            </SelectContent>
          </Select>
        </template>
        <MermaidThemePreview
          :is-dark="isDark"
          :theme="mermaidTheme"
        />
      </SettingsBlock>
    </SettingsSection>
  </div>
</template>
