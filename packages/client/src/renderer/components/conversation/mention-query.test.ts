import { describe, expect, it } from 'vitest'
import {
  buildMentionInsertText,
  detectMentionQuery,
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
