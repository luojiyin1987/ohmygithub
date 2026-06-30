import { describe, expect, it } from 'vitest'
import { mapPullRequestProjects } from './pulls'

describe('mapPullRequestProjects', () => {
  it('maps a project item with a single-select field', () => {
    const result = mapPullRequestProjects({
      projectItems: {
        nodes: [
          {
            id: 'item1',
            project: { title: 'Roadmap', url: 'https://github.com/orgs/x/projects/1' },
            fieldValues: { nodes: [{ __typename: 'ProjectV2ItemFieldSingleSelectValue', name: 'High', field: { name: 'Priority' } }] }
          }
        ]
      }
    })
    expect(result).toEqual([
      { id: 'item1', title: 'Roadmap', url: 'https://github.com/orgs/x/projects/1', fields: [{ name: 'Priority', value: 'High' }] }
    ])
  })

  it('returns empty array when no project items', () => {
    expect(mapPullRequestProjects({})).toEqual([])
  })
})
