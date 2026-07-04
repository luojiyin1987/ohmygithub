import { describe, expect, it } from 'vitest'
import { isDangerConfirmed } from './danger-confirm'

describe('isDangerConfirmed', () => {
  it('requires the exact owner/repo full name', () => {
    expect(isDangerConfirmed('octo-org/hello-world', 'octo-org', 'hello-world')).toBe(true)
    expect(isDangerConfirmed('  octo-org/hello-world  ', 'octo-org', 'hello-world')).toBe(true)
    expect(isDangerConfirmed('octo-org/Hello-World', 'octo-org', 'hello-world')).toBe(false)
    expect(isDangerConfirmed('hello-world', 'octo-org', 'hello-world')).toBe(false)
    expect(isDangerConfirmed('', 'octo-org', 'hello-world')).toBe(false)
  })
})
