export type ActionStatusTone = 'success' | 'destructive' | 'warning' | 'info' | 'muted'

export function actionStatusTone(
  status: GitHubActionRunStatus | null,
  conclusion: GitHubActionConclusion | null,
): ActionStatusTone {
  if (status && status !== 'completed') {
    return status === 'in_progress' ? 'info' : 'warning'
  }

  if (conclusion === 'success') return 'success'
  if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'action_required') {
    return 'destructive'
  }
  if (conclusion === 'cancelled' || conclusion === 'skipped' || conclusion === 'stale' || conclusion === 'neutral') {
    return 'muted'
  }

  return 'muted'
}

export function actionStatusLabelKey(
  status: GitHubActionRunStatus | null,
  conclusion: GitHubActionConclusion | null,
): string {
  if (status && status !== 'completed') {
    return `actions.statuses.${normalizeKey(status)}`
  }

  if (conclusion) {
    return `actions.conclusions.${normalizeKey(conclusion)}`
  }

  if (status) {
    return `actions.statuses.${normalizeKey(status)}`
  }

  return 'actions.statuses.unknown'
}

function normalizeKey(value: string): string {
  return value.replace(/-/g, '_')
}
