import type { ConversationActor } from './types'

const compactDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function formatConversationDate(value?: string | null): string | null {
  const date = parseConversationDate(value)
  if (!date) return value?.trim() || null

  return compactDateFormatter.format(date)
}

export function toConversationDateTime(value?: string | null): string | undefined {
  return parseConversationDate(value)?.toISOString()
}

export function getActorFallback(actor?: ConversationActor | null): string {
  const login = actor?.login.trim()
  if (!login) return '?'

  return login.slice(0, 1).toUpperCase()
}

export function hasRenderableText(value?: string | null): value is string {
  return Boolean(value?.trim())
}

const relativeTimeDivisions: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
]

// 不能用模块级单例 formatter：locale 跟随用户设置动态变化
export function formatRelativeTime(
  value?: string | null,
  options?: { locale?: string; now?: Date },
): string | null {
  const date = parseConversationDate(value)
  if (!date) return null

  const now = options?.now ?? new Date()
  const formatter = new Intl.RelativeTimeFormat(options?.locale, { numeric: 'auto', style: 'narrow' })
  let duration = (date.getTime() - now.getTime()) / 1000

  for (const division of relativeTimeDivisions) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit)
    }
    duration /= division.amount
  }

  return null
}

function parseConversationDate(value?: string | null): Date | null {
  const trimmedValue = value?.trim()
  if (!trimmedValue) return null

  const date = new Date(trimmedValue)
  if (Number.isNaN(date.getTime())) return null

  return date
}
