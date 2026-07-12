export type MentionQuery = {
  /** Text after `@`, may be empty while the user just typed `@`. */
  query: string
  /** 1-based column of the `@`. */
  startColumn: number
  /** 1-based column of the cursor (exclusive end of the query). */
  endColumn: number
}

// GitHub login shape after `@`: starts alphanumeric, single hyphens only.
// A trailing hyphen stays accepted because the user may still be typing
// (`@ab-` on the way to `@ab-c`); `@-x` and `@a--b` can never become valid.
const MENTION_TAIL = /^@(?:[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9]|$)){0,38})?$/

/**
 * Detect an in-progress `@mention` immediately before the cursor on a line.
 * Returns null for emails, completed mentions, or when `@` is mid-word.
 */
export function detectMentionQuery(
  line: string,
  cursorColumn: number,
): MentionQuery | null {
  if (cursorColumn < 2) return null

  const before = line.slice(0, cursorColumn - 1)
  const atIndex = before.lastIndexOf('@')
  if (atIndex < 0) return null

  const prefix = before.slice(0, atIndex)
  const candidate = before.slice(atIndex)
  if (!MENTION_TAIL.test(candidate)) return null

  // `@` must start the line or follow whitespace / open punctuation — not
  // an email local-part or a word character.
  if (prefix.length > 0 && !/[\s([{]$/.test(prefix)) return null

  return {
    query: candidate.slice(1),
    startColumn: atIndex + 1,
    endColumn: cursorColumn,
  }
}

export function buildMentionInsertText(login: string): string {
  return `@${login} `
}

/** Rendered menu box: w-64 shell around the max-h-64 options list. */
export const MENTION_MENU_WIDTH = 256
export const MENTION_MENU_MAX_HEIGHT = 272
const MENTION_MENU_GAP = 4
const MENTION_MENU_VIEWPORT_MARGIN = 8

export type MentionMenuAnchor = {
  /** Viewport-relative top of the caret's line. */
  top: number
  /** Viewport-relative left of the caret. */
  left: number
  /** Rendered line height, so the menu can sit below the line. */
  height: number
}

export type MentionMenuPlacement = {
  /** Set when the menu opens downward from below the caret line. */
  top: number | null
  /** Set when the menu is bottom-anchored above the caret line instead. */
  bottom: number | null
  left: number
}

/**
 * Position the mention menu against the viewport: below the caret line by
 * default, flipped above it when the space below cannot fit the menu, and
 * clamped so the fixed-width box never leaves the viewport horizontally.
 */
export function computeMentionMenuPlacement(
  anchor: MentionMenuAnchor,
  viewport: { width: number, height: number },
): MentionMenuPlacement {
  const left = Math.min(
    Math.max(MENTION_MENU_VIEWPORT_MARGIN, anchor.left),
    Math.max(MENTION_MENU_VIEWPORT_MARGIN, viewport.width - MENTION_MENU_WIDTH - MENTION_MENU_VIEWPORT_MARGIN),
  )

  const below = anchor.top + anchor.height + MENTION_MENU_GAP
  const spaceBelow = viewport.height - below
  const spaceAbove = anchor.top - MENTION_MENU_GAP
  if (spaceBelow < MENTION_MENU_MAX_HEIGHT && spaceAbove > spaceBelow) {
    return { top: null, bottom: viewport.height - anchor.top + MENTION_MENU_GAP, left }
  }

  return { top: below, bottom: null, left }
}

export type MentionCandidate = {
  login: string
  avatarUrl?: string | null
}

/**
 * Prefer local assignable users that match the typed prefix, then append
 * remote search hits that aren't already listed.
 */
export function mergeMentionCandidates(
  local: MentionCandidate[],
  remote: MentionCandidate[],
  query: string,
  limit = 8,
): MentionCandidate[] {
  const needle = query.trim().toLowerCase()
  const seen = new Set<string>()
  const merged: MentionCandidate[] = []

  for (const candidate of local) {
    const login = candidate.login
    if (needle && !login.toLowerCase().includes(needle)) continue
    const key = login.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(candidate)
    if (merged.length >= limit) return merged
  }

  for (const candidate of remote) {
    const login = candidate.login
    if (needle && !login.toLowerCase().includes(needle)) continue
    const key = login.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(candidate)
    if (merged.length >= limit) break
  }

  return merged
}
