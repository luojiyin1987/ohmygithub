import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'mention-suggestion-menu.vue'), 'utf8')

describe('mention suggestion menu aria structure', () => {
  it('scopes the listbox role to the container that holds the options', () => {
    // A listbox may only contain role="option" children, so the role must sit
    // on the candidates container (gated by v-if) rather than the popup root,
    // where it would wrap the loading/empty paragraphs.
    expect(source).toMatch(
      /v-if="candidates\.length > 0"[\s\S]*?role="listbox"[\s\S]*?<button/,
    )
    expect(source).not.toMatch(/v-if="open"[\s\S]*?role="listbox"[\s\S]*?v-if="candidates/)
  })

  it('exposes loading and empty messages as status text, not bare paragraphs', () => {
    const statusParagraphs = source.match(/<p[\s\S]*?role="status"/g)
    expect(statusParagraphs).toHaveLength(2)
  })
})

describe('mention suggestion menu positioning', () => {
  it('teleports out of the overflow-hidden composer shell', () => {
    // Absolute positioning inside the h-48 editor column gets clipped by the
    // composer root's overflow-hidden once the caret passes mid-editor.
    expect(source).toContain('<Teleport to="body">')
    expect(source).toMatch(/v-if="open"\s+class="fixed /)
    expect(source).not.toMatch(/v-if="open"\s+class="absolute /)
  })

  it('supports the bottom-anchored (flipped-above) placement', () => {
    expect(source).toContain('bottom: number | null')
    expect(source).toMatch(/bottom: props\.bottom === null \? 'auto' : `\$\{props\.bottom\}px`/)
  })
})
