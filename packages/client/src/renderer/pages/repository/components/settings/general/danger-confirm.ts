export function isDangerConfirmed(input: string, owner: string, repo: string): boolean {
  return input.trim() === `${owner}/${repo}`
}
