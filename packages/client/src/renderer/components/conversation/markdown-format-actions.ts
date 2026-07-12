export type MarkdownFormatAction =
  | 'bold'
  | 'italic'
  | 'heading'
  | 'quote'
  | 'code'
  | 'codeBlock'
  | 'link'
  | 'unorderedList'
  | 'orderedList'

export type MarkdownWrapEdit = {
  kind: 'wrap'
  before: string
  after: string
  placeholder: string
}

export type MarkdownReplaceEdit = {
  kind: 'replace'
  text: string
}

export type MarkdownFormatEdit = MarkdownWrapEdit | MarkdownReplaceEdit

export type MarkdownListContinueResult =
  | { type: 'continue', insert: string }
  | { type: 'exit' }

const HEADING_PREFIX = /^#{1,6}\s+/
const UNORDERED_LIST = /^(\s*)([-*+])(\s+)(.*)$/
const ORDERED_LIST = /^(\s*)(\d+)\.(\s+)(.*)$/

function selectedLines(selection: string): string[] {
  if (selection.length === 0) return ['']
  return selection.split('\n')
}

function prefixLines(selection: string, prefixForIndex: (index: number) => string): string {
  return selectedLines(selection)
    .map((line, index) => `${prefixForIndex(index)}${line}`)
    .join('\n')
}

function applyHeading(selection: string): string {
  const lines = selectedLines(selection)
  return lines
    .map((line) => {
      if (HEADING_PREFIX.test(line)) {
        return line.replace(HEADING_PREFIX, '### ')
      }
      return `### ${line}`
    })
    .join('\n')
}

function applyCodeBlock(selection: string): MarkdownFormatEdit {
  if (selection.length > 0) {
    return {
      kind: 'replace',
      text: `\`\`\`\n${selection}\n\`\`\``,
    }
  }

  return {
    kind: 'wrap',
    before: '```\n',
    after: '\n```',
    placeholder: 'code',
  }
}

function applyLink(selection: string): MarkdownFormatEdit {
  if (selection.length > 0) {
    return {
      kind: 'wrap',
      before: '[',
      after: '](url)',
      placeholder: '',
    }
  }

  return {
    kind: 'wrap',
    before: '[',
    after: '](url)',
    placeholder: 'text',
  }
}

/**
 * Pure markdown transforms for the composer toolbar. Callers apply the
 * returned edit through Monaco (`wrapSelection` / `replaceSelection`).
 */
export function buildMarkdownFormatEdit(
  action: MarkdownFormatAction,
  selection: string,
): MarkdownFormatEdit {
  switch (action) {
    case 'bold':
      return {
        kind: 'wrap',
        before: '**',
        after: '**',
        placeholder: 'bold text',
      }
    case 'italic':
      return {
        kind: 'wrap',
        before: '_',
        after: '_',
        placeholder: 'italic text',
      }
    case 'heading':
      return {
        kind: 'replace',
        text: applyHeading(selection),
      }
    case 'quote':
      return {
        kind: 'replace',
        text: prefixLines(selection, () => '> '),
      }
    case 'code':
      return {
        kind: 'wrap',
        before: '`',
        after: '`',
        placeholder: 'code',
      }
    case 'codeBlock':
      return applyCodeBlock(selection)
    case 'link':
      return applyLink(selection)
    case 'unorderedList':
      return {
        kind: 'replace',
        text: prefixLines(selection, () => '- '),
      }
    case 'orderedList':
      return {
        kind: 'replace',
        text: prefixLines(selection, (index) => `${index + 1}. `),
      }
  }
}

/**
 * Decide what Enter should do on a markdown list line.
 * - continue: insert a newline + the next marker
 * - exit: clear an empty list item (leave the list)
 * - null: not a list line
 */
export function continueMarkdownListLine(line: string): MarkdownListContinueResult | null {
  const ordered = line.match(ORDERED_LIST)
  if (ordered) {
    const [, indent, number, space, content] = ordered
    if (content.trim().length === 0) return { type: 'exit' }
    return {
      type: 'continue',
      insert: `\n${indent}${Number(number) + 1}.${space}`,
    }
  }

  const unordered = line.match(UNORDERED_LIST)
  if (unordered) {
    const [, indent, marker, space, content] = unordered
    if (content.trim().length === 0) return { type: 'exit' }
    return {
      type: 'continue',
      insert: `\n${indent}${marker}${space}`,
    }
  }

  return null
}
