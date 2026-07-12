import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'monaco-code-editor.vue'), 'utf8')

describe('monaco code editor enter binding', () => {
  it('yields Enter to the suggest widget while it is open', () => {
    // An unconditional Enter command would shadow Monaco's
    // accept-suggestion-on-Enter whenever the suggest widget shows.
    expect(source).toMatch(/addCommand\(KeyCode\.Enter,[\s\S]*?'!suggestWidgetVisible'\)/)
  })

  it('offers unmodified Tab to host overlays', () => {
    expect(source).toContain("event.keyCode === KeyCode.Tab && !event.shiftKey")
  })
})

describe('monaco code editor cursor overlays', () => {
  it('reports the caret position in viewport coordinates with line height', () => {
    // Teleported overlays (the mention menu) position against the viewport,
    // so the editor must offset Monaco's container-relative coordinates.
    expect(source).toContain('getBoundingClientRect()')
    expect(source).toMatch(/getCursorScreenPosition\(\): \{ top: number, left: number, height: number \} \| null/)
  })

  it('re-notifies cursor listeners when the editor scrolls', () => {
    expect(source).toMatch(/onDidScrollChange\(\(\) => \{\s*\n\s*notifyCursorListeners\(\)/)
  })
})
