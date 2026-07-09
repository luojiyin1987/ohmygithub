import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'conversation-markdown-composer-shell.vue'), 'utf8')

describe('conversation markdown composer shell', () => {
  it('renders the markdown formatting toolbar above the editor', () => {
    expect(source).toContain('MarkdownFormatToolbar')
    expect(source).toContain('@action="applyFormatAction"')
  })
})
