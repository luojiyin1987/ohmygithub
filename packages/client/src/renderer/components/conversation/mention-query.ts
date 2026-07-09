export type MentionQuery = {
  /** Text after `@`, may be empty while the user just typed `@`. */
  query: string
  /** 1-based column of the `@`. */
  startColumn: number
  /** 1-based column of the cursor (exclusive end of the query). */
  endColumn: number
}

// GitHub login chars after `@`. Keep it conservative so we don't swallow
// emails (`user@domain`) or markdown that already closed the mention.
const MENTION_TAIL = /^@([a-zA-Z0-9-]{0,39})$/

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
