import { describe, expect, it } from 'vitest'
import {
  buildMarkdownFormatEdit,
  continueMarkdownListLine,
} from './markdown-format-actions'

describe('buildMarkdownFormatEdit', () => {
  it('wraps a selection in bold markers', () => {
    expect(buildMarkdownFormatEdit('bold', 'hello')).toEqual({
      kind: 'wrap',
      before: '**',
      after: '**',
      placeholder: 'bold text',
    })
  })

  it('uses a bold placeholder when nothing is selected', () => {
    expect(buildMarkdownFormatEdit('bold', '')).toEqual({
      kind: 'wrap',
      before: '**',
      after: '**',
      placeholder: 'bold text',
    })
  })

  it('wraps a selection in italic markers', () => {
    expect(buildMarkdownFormatEdit('italic', 'hello')).toEqual({
      kind: 'wrap',
      before: '_',
      after: '_',
      placeholder: 'italic text',
    })
  })

  it('prefixes a heading on empty and existing lines', () => {
    expect(buildMarkdownFormatEdit('heading', '')).toEqual({
      kind: 'replace',
      text: '### ',
    })
    expect(buildMarkdownFormatEdit('heading', 'Title')).toEqual({
      kind: 'replace',
      text: '### Title',
    })
    expect(buildMarkdownFormatEdit('heading', '# Title')).toEqual({
      kind: 'replace',
      text: '### Title',
    })
  })

  it('prefixes each selected line as a quote', () => {
    expect(buildMarkdownFormatEdit('quote', 'a\nb')).toEqual({
      kind: 'replace',
      text: '> a\n> b',
    })
  })

  it('always uses inline backticks for the code action', () => {
    expect(buildMarkdownFormatEdit('code', 'x')).toEqual({
      kind: 'wrap',
      before: '`',
      after: '`',
      placeholder: 'code',
    })
    expect(buildMarkdownFormatEdit('code', 'a\nb')).toEqual({
      kind: 'wrap',
      before: '`',
      after: '`',
      placeholder: 'code',
    })
  })

  it('inserts a fenced code block for the codeBlock action', () => {
    expect(buildMarkdownFormatEdit('codeBlock', '')).toEqual({
      kind: 'wrap',
      before: '```\n',
      after: '\n```',
      placeholder: 'code',
    })
    expect(buildMarkdownFormatEdit('codeBlock', 'a\nb')).toEqual({
      kind: 'replace',
      text: '```\na\nb\n```',
    })
  })

  it('builds a markdown link around the selection or a placeholder', () => {
    expect(buildMarkdownFormatEdit('link', 'docs')).toEqual({
      kind: 'wrap',
      before: '[',
      after: '](url)',
      placeholder: '',
    })
    expect(buildMarkdownFormatEdit('link', '')).toEqual({
      kind: 'wrap',
      before: '[',
      after: '](url)',
      placeholder: 'text',
    })
  })

  it('prefixes unordered and ordered list markers per line', () => {
    expect(buildMarkdownFormatEdit('unorderedList', 'a\nb')).toEqual({
      kind: 'replace',
      text: '- a\n- b',
    })
    expect(buildMarkdownFormatEdit('orderedList', 'a\nb')).toEqual({
      kind: 'replace',
      text: '1. a\n2. b',
    })
  })
})

describe('continueMarkdownListLine', () => {
  it('continues an unordered list with the same marker', () => {
    expect(continueMarkdownListLine('- item')).toEqual({
      type: 'continue',
      insert: '\n- ',
    })
    expect(continueMarkdownListLine('  * item')).toEqual({
      type: 'continue',
      insert: '\n  * ',
    })
  })

  it('continues an ordered list with the next number', () => {
    expect(continueMarkdownListLine('1. item')).toEqual({
      type: 'continue',
      insert: '\n2. ',
    })
    expect(continueMarkdownListLine('  9. item')).toEqual({
      type: 'continue',
      insert: '\n  10. ',
    })
  })

  it('exits the list when the current item is empty', () => {
    expect(continueMarkdownListLine('- ')).toEqual({ type: 'exit' })
    expect(continueMarkdownListLine('1. ')).toEqual({ type: 'exit' })
    expect(continueMarkdownListLine('  2.   ')).toEqual({ type: 'exit' })
  })

  it('returns null for non-list lines', () => {
    expect(continueMarkdownListLine('plain text')).toBeNull()
    expect(continueMarkdownListLine('> quote')).toBeNull()
  })
})
