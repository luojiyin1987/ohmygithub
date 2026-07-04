import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './format'

const now = new Date('2026-07-05T12:00:00Z')

describe('formatRelativeTime', () => {
  it('formats minutes and hours ago in narrow style', () => {
    expect(formatRelativeTime('2026-07-05T11:57:00Z', { locale: 'en', now })).toBe('3m ago')
    expect(formatRelativeTime('2026-07-05T09:00:00Z', { locale: 'en', now })).toBe('3h ago')
  })

  it('uses natural wording for days', () => {
    expect(formatRelativeTime('2026-07-04T11:00:00Z', { locale: 'en', now })).toBe('yesterday')
  })

  it('returns null for missing or invalid input', () => {
    expect(formatRelativeTime(null, { locale: 'en', now })).toBeNull()
    expect(formatRelativeTime('not-a-date', { locale: 'en', now })).toBeNull()
  })
})
