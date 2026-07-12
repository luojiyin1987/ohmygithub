<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { KeyCode, KeyMod } from 'monaco-editor'
import type { MonacoLanguage, MonacoOptions, MonacoTheme } from 'stream-monaco'
import { ensureMonacoWorkers, useMonaco } from 'stream-monaco'
import { useCodeTheme } from '@/components/index'
import { resolveCodeLanguage } from '@/components/index'
import { allSchemeThemes } from '@/components/code/scheme-code-themes'
import { continueMarkdownListLine } from '@/components/conversation/markdown-format-actions'
import { useSettingsStore } from '@/stores/settings'

const props = withDefaults(defineProps<{
  modelValue: string
  filename?: string
  language?: string
  readonly?: boolean
  options?: MonacoOptions
}>(), {
  filename: undefined,
  language: undefined,
  options: undefined,
  readonly: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editorElement = ref<HTMLElement>()
const settingsStore = useSettingsStore()
const { activeThemeName } = useCodeTheme()
let isUpdatingFromOutside = false
/** Returns true when a host overlay (e.g. mention menu) consumed the key. */
let keyInterceptor: ((key: 'Enter' | 'ArrowUp' | 'ArrowDown' | 'Escape') => boolean) | null = null
const cursorListeners = new Set<() => void>()

function resolveLanguage(): MonacoLanguage {
  return resolveCodeLanguage({
    filename: props.filename,
    language: props.language
  }) as MonacoLanguage
}

function notifyCursorListeners(): void {
  for (const listener of cursorListeners) listener()
}

const monaco = useMonaco({
  automaticLayout: true,
  autoScrollInitial: false,
  autoScrollOnUpdate: false,
  fontFamily: settingsStore.codeFontStack,
  fontSize: settingsStore.codeFontSizePx,
  lineHeight: 1.5,
  lineNumbers: 'on',
  minimap: { enabled: false },
  padding: { bottom: 12, top: 12 },
  readOnly: props.readonly,
  renderLineHighlight: 'line',
  scrollBeyondLastLine: false,
  tabSize: 2,
  theme: activeThemeName.value,
  themes: allSchemeThemes as MonacoTheme[],
  wordWrap: 'on',
  ...props.options
})

onMounted(async () => {
  if (!editorElement.value) return

  ensureMonacoWorkers()
  const editor = await monaco.createEditor(editorElement.value, props.modelValue, resolveLanguage())

  editor.onDidChangeModelContent(() => {
    if (isUpdatingFromOutside) return
    emit('update:modelValue', editor.getValue())
    notifyCursorListeners()
  })

  editor.onDidChangeCursorSelection(() => {
    notifyCursorListeners()
  })

  // Cursor overlays are anchored in viewport coordinates, so they must
  // re-measure when the editor content scrolls under a stationary caret.
  editor.onDidScrollChange(() => {
    notifyCursorListeners()
  })

  editor.onKeyDown((event) => {
    if (!keyInterceptor) return

    let key: 'ArrowUp' | 'ArrowDown' | 'Escape' | null = null
    if (event.keyCode === KeyCode.DownArrow) key = 'ArrowDown'
    else if (event.keyCode === KeyCode.UpArrow) key = 'ArrowUp'
    else if (event.keyCode === KeyCode.Escape) key = 'Escape'
    if (!key) return

    if (keyInterceptor(key)) {
      event.preventDefault()
      event.stopPropagation()
    }
  })

  // Enter continues markdown lists (1. / -) the way GitHub's composer does.
  // Mention menus can claim Enter first via setKeyInterceptor. The context
  // guard leaves Enter to Monaco's suggest widget while it is open.
  editor.addCommand(KeyCode.Enter, () => {
    if (keyInterceptor?.('Enter')) return

    if (props.readonly || resolveLanguage() !== 'markdown') {
      editor.trigger('keyboard', 'type', { text: '\n' })
      return
    }

    const model = editor.getModel()
    const selection = editor.getSelection()
    if (!model || !selection || !selection.isEmpty()) {
      editor.trigger('keyboard', 'type', { text: '\n' })
      return
    }

    const lineNumber = selection.startLineNumber
    const line = model.getLineContent(lineNumber)
    const result = continueMarkdownListLine(line)
    if (!result) {
      editor.trigger('keyboard', 'type', { text: '\n' })
      return
    }

    if (result.type === 'exit') {
      editor.executeEdits('markdown-list-exit', [{
        range: {
          startLineNumber: lineNumber,
          startColumn: 1,
          endLineNumber: lineNumber,
          endColumn: line.length + 1,
        },
        text: '',
        forceMoveMarkers: true,
      }])
      editor.focus()
      return
    }

    editor.executeEdits('markdown-list-continue', [{
      range: selection,
      text: result.insert,
      forceMoveMarkers: true,
    }])
    editor.focus()
  }, '!suggestWidgetVisible')

  // Shift+Enter always inserts a plain newline without list continuation.
  editor.addCommand(KeyMod.Shift | KeyCode.Enter, () => {
    editor.trigger('keyboard', 'type', { text: '\n' })
  })
})

onBeforeUnmount(() => {
  monaco.cleanupEditor()
})

watch(
  () => props.modelValue,
  (value) => {
    const editor = monaco.getEditorView()
    if (!editor || editor.getValue() === value) return

    isUpdatingFromOutside = true
    monaco.updateCode(value, resolveLanguage())
    isUpdatingFromOutside = false
  }
)

watch(
  () => props.readonly,
  (readonly) => {
    monaco.getEditorView()?.updateOptions({ readOnly: readonly })
  }
)

watch(
  () => [props.language, props.filename] as const,
  () => {
    monaco.setLanguage(resolveLanguage())
  }
)

watch(activeThemeName, (theme) => {
  void monaco.setTheme(theme as MonacoTheme, true)
})

watch(
  () => settingsStore.codeFontSizePx,
  (fontSize) => {
    monaco.getEditorView()?.updateOptions({ fontSize })
  }
)

watch(
  () => settingsStore.codeFontStack,
  (fontFamily) => {
    monaco.getEditorView()?.updateOptions({ fontFamily })
  }
)

watch(
  () => props.options,
  (options) => {
    if (options) {
      monaco.getEditorView()?.updateOptions(options)
    }
  },
  { deep: true }
)

function focus(): void {
  monaco.getEditorView()?.focus()
}

function getSelectionText(): string {
  const editor = monaco.getEditorView()
  const model = editor?.getModel()
  const selection = editor?.getSelection()
  if (!editor || !model || !selection) return ''
  return model.getValueInRange(selection)
}

function wrapSelection(options: {
  before: string
  after: string
  placeholder?: string
}): void {
  const editor = monaco.getEditorView()
  const model = editor?.getModel()
  const selection = editor?.getSelection()
  if (!editor || !model || !selection || props.readonly) return

  const selected = model.getValueInRange(selection)
  const placeholder = options.placeholder ?? ''
  const inner = selected.length > 0 ? selected : placeholder
  const text = `${options.before}${inner}${options.after}`
  const startOffset = model.getOffsetAt(selection.getStartPosition())

  editor.executeEdits('markdown-wrap', [{
    range: selection,
    text,
    forceMoveMarkers: true,
  }])

  if (selected.length === 0 && placeholder.length > 0) {
    const innerStart = startOffset + options.before.length
    const start = model.getPositionAt(innerStart)
    const end = model.getPositionAt(innerStart + placeholder.length)
    editor.setSelection({
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
    })
  }

  editor.focus()
}

function insertAtCursor(text: string): void {
  const editor = monaco.getEditorView()
  const selection = editor?.getSelection()
  if (!editor || !selection || props.readonly) return

  editor.executeEdits('markdown-insert', [{
    range: selection,
    text,
    forceMoveMarkers: true,
  }])
  editor.focus()
}

function replaceSelection(text: string): void {
  const editor = monaco.getEditorView()
  const selection = editor?.getSelection()
  if (!editor || !selection || props.readonly) return

  editor.executeEdits('markdown-replace', [{
    range: selection,
    text,
    forceMoveMarkers: true,
  }])
  editor.focus()
}

function getCursorContext(): {
  lineNumber: number
  column: number
  lineContent: string
} | null {
  const editor = monaco.getEditorView()
  const model = editor?.getModel()
  const position = editor?.getPosition()
  if (!editor || !model || !position) return null

  return {
    lineNumber: position.lineNumber,
    column: position.column,
    lineContent: model.getLineContent(position.lineNumber),
  }
}

/**
 * Caret position in viewport coordinates, so overlays can render through a
 * teleport and escape the composer's overflow-hidden shell.
 */
function getCursorScreenPosition(): { top: number, left: number, height: number } | null {
  const editor = monaco.getEditorView()
  const position = editor?.getPosition()
  if (!editor || !position || !editorElement.value) return null

  const coords = editor.getScrolledVisiblePosition(position)
  if (!coords) return null

  const hostRect = editorElement.value.getBoundingClientRect()
  return {
    top: hostRect.top + coords.top,
    left: hostRect.left + coords.left,
    height: coords.height,
  }
}

function replaceRange(
  range: {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
  },
  text: string,
): void {
  const editor = monaco.getEditorView()
  if (!editor || props.readonly) return

  editor.executeEdits('markdown-replace-range', [{
    range,
    text,
    forceMoveMarkers: true,
  }])
  editor.focus()
}

function onCursorChange(listener: () => void): () => void {
  cursorListeners.add(listener)
  return () => {
    cursorListeners.delete(listener)
  }
}

function setKeyInterceptor(
  interceptor: ((key: 'Enter' | 'ArrowUp' | 'ArrowDown' | 'Escape') => boolean) | null,
): void {
  keyInterceptor = interceptor
}

defineExpose({
  focus,
  getSelectionText,
  wrapSelection,
  insertAtCursor,
  replaceSelection,
  getCursorContext,
  getCursorScreenPosition,
  replaceRange,
  onCursorChange,
  setKeyInterceptor,
})
</script>

<template>
  <div
    ref="editorElement"
    class="monaco-editor-host min-h-0 w-full overflow-hidden"
  />
</template>

<style scoped>
/* stream-monaco sizes the container to the editor content via inline styles;
   force the editor to fill whatever box the parent gives it instead. */
.monaco-editor-host {
  height: 100% !important;
  max-height: 100% !important;
}

/* Code themes use a transparent background so the editor blends into the
   scheme-tinted panel behind it. */
.monaco-editor-host :deep(.monaco-editor),
.monaco-editor-host :deep(.monaco-editor .margin),
.monaco-editor-host :deep(.monaco-editor-background),
.monaco-editor-host :deep(.monaco-editor .monaco-editor-background) {
  background: transparent !important;
}
</style>
