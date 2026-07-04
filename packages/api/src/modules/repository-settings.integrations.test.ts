import { describe, expect, it, vi } from 'vitest'
import type { GitHubOctokit } from '../transport'
import { RepositorySettingsIntegrationsApi } from './repository-settings.integrations'

describe('RepositorySettingsIntegrationsApi', () => {
  it('lists, creates, and deletes autolink references', async () => {
    const { api, request } = createApi()

    const autolinks = await api.listAutolinks({ owner: 'o', repo: 'r' })
    expect(autolinks).toEqual([
      { id: 1, keyPrefix: 'TICKET-', urlTemplate: 'https://jira.example/browse/TICKET-<num>', isAlphanumeric: true },
    ])

    await api.createAutolink({
      owner: 'o',
      repo: 'r',
      keyPrefix: 'ISSUE-',
      urlTemplate: 'https://tracker.example/<num>',
      isAlphanumeric: false,
    })
    expect(request).toHaveBeenCalledWith('POST /repos/{owner}/{repo}/autolinks', {
      owner: 'o',
      repo: 'r',
      key_prefix: 'ISSUE-',
      url_template: 'https://tracker.example/<num>',
      is_alphanumeric: false,
    })

    await api.deleteAutolink({ owner: 'o', repo: 'r', autolinkId: 1 })
    expect(request).toHaveBeenCalledWith('DELETE /repos/{owner}/{repo}/autolinks/{autolink_id}', {
      owner: 'o',
      repo: 'r',
      autolink_id: 1,
    })
  })
})

function createApi() {
  const request = vi.fn(async (route: string) => {
    if (route === 'GET /repos/{owner}/{repo}/autolinks') {
      return {
        data: [
          {
            id: 1,
            key_prefix: 'TICKET-',
            url_template: 'https://jira.example/browse/TICKET-<num>',
            is_alphanumeric: true,
          },
        ],
      }
    }
    return { data: {}, status: 204 }
  })
  const octokit = { request } as unknown as GitHubOctokit

  return { api: new RepositorySettingsIntegrationsApi(octokit), request }
}
