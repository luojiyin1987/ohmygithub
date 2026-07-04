export function resolveErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message) {
    // IPC errors arrive as "Error invoking remote method '...': Error: <message>".
    return error.message.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '')
  }

  return undefined
}

export function formatDate(value: string | null, locale: string): string {
  if (!value) return ''

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
}
