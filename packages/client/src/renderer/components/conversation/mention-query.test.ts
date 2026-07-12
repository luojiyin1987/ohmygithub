import { describe, expect, it } from 'vitest'
import {
  buildMentionInsertText,
  computeMentionMenuPlacement,
  detectMentionQuery,
  MENTION_MENU_MAX_HEIGHT,
  MENTION_MENU_WIDTH,
  mergeMentionCandidates,
} from './mention-query'

describe('detectMentionQuery', () => {
  it('detects a bare @ at the start of a line', () => {
    expect(detectMentionQuery('@', 2)).toEqual({
      query: '',
      startColumn: 1,
      endColumn: 2,
    })
  })

  it('detects a partial mention after whitespace', () => {
    // Monaco columns are 1-based and point after the last typed char.
    expect(detectMentionQuery('hi @mor', 8)).toEqual({
      query: 'mor',
      startColumn: 4,
      endColumn: 8,
    })
  })

  it('ignores email addresses', () => {
    expect(detectMentionQuery('mail user@ex', 12)).toBeNull()
  })

  it('ignores mentions that are no longer at the cursor', () => {
    expect(detectMentionQuery('@mor hello', 11)).toBeNull()
  })

  it('allows mentions after open punctuation', () => {
    expect(detectMentionQuery('(@ab', 5)).toEqual({
      query: 'ab',
      startColumn: 2,
      endColumn: 5,
    })
  })

  it('rejects logins GitHub can never accept', () => {
    // Leading hyphen and consecutive hyphens are invalid in any login.
    expect(detectMentionQuery('@-foo', 6)).toBeNull()
    expect(detectMentionQuery('@a--b', 6)).toBeNull()
  })

  it('keeps a trailing hyphen while the user is still typing', () => {
    expect(detectMentionQuery('@ab-', 5)).toEqual({
      query: 'ab-',
      startColumn: 1,
      endColumn: 5,
    })
  })
})

describe('buildMentionInsertText', () => {
  it('inserts @login with a trailing space', () => {
    expect(buildMentionInsertText('octocat')).toBe('@octocat ')
  })
})

describe('mergeMentionCandidates', () => {
  it('filters local candidates and appends unique remote hits', () => {
    expect(mergeMentionCandidates(
      [
        { login: 'alice' },
        { login: 'bob' },
        { login: 'carol' },
      ],
      [
        { login: 'bob' },
        { login: 'dave' },
      ],
      'a',
    )).toEqual([
      { login: 'alice' },
      { login: 'carol' },
      { login: 'dave' },
    ])
  })

  it('returns local candidates when the query is empty', () => {
    expect(mergeMentionCandidates(
      [{ login: 'alice' }, { login: 'bob' }],
      [],
      '',
      8,
    )).toEqual([{ login: 'alice' }, { login: 'bob' }])
  })
})

describe('computeMentionMenuPlacement', () => {
  const viewport = { width: 1200, height: 800 }

  it('opens below the caret line when there is room', () => {
    expect(computeMentionMenuPlacement(
      { top: 100, left: 300, height: 20 },
      viewport,
    )).toEqual({ top: 124, bottom: null, left: 300 })
  })

  it('flips above the caret when the space below cannot fit the menu', () => {
    const placement = computeMentionMenuPlacement(
      { top: 700, left: 300, height: 20 },
      viewport,
    )
    expect(placement.top).toBeNull()
    // Bottom-anchored above the caret line: 800 - 700 + 4.
    expect(placement.bottom).toBe(104)
  })

  it('stays below near the top even when neither side fully fits', () => {
    const shortViewport = { width: 1200, height: MENTION_MENU_MAX_HEIGHT }
    expect(computeMentionMenuPlacement(
      { top: 10, left: 300, height: 20 },
      shortViewport,
    ).top).toBe(34)
  })

  it('clamps the menu inside the viewport horizontally', () => {
    expect(computeMentionMenuPlacement(
      { top: 100, left: -50, height: 20 },
      viewport,
    ).left).toBe(8)
    expect(computeMentionMenuPlacement(
      { top: 100, left: 1180, height: 20 },
      viewport,
    ).left).toBe(1200 - MENTION_MENU_WIDTH - 8)
  })
})
