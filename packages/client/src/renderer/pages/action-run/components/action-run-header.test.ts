import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'action-run-header.vue'), 'utf8')

describe('action run header rerun buttons', () => {
  it('uses a single manual loading icon for run-level rerun actions', () => {
    expect(source).not.toMatch(/:loading="isRerunning(?:Failed|All)Jobs"[\s\S]*?loading-mode="leading"/)
    expect(source).toMatch(/:loading="isRerunningFailedJobs"[\s\S]*?loading-mode="manual"[\s\S]*?<Spinner[\s\S]*?v-if="isRerunningFailedJobs"/)
    expect(source).toMatch(/:loading="isRerunningAllJobs"[\s\S]*?loading-mode="manual"[\s\S]*?<Spinner[\s\S]*?v-if="isRerunningAllJobs"/)
  })
})
