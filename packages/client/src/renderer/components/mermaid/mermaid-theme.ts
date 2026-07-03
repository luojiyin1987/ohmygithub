import type { MermaidTheme } from '@/stores/settings'

const INIT_DIRECTIVE_PREFIX = /^\s*%%\{/

export function resolveMermaidIsDark(theme: MermaidTheme, fallbackIsDark: boolean): boolean {
  if (theme === 'auto') return fallbackIsDark
  return theme === 'dark'
}

export function applyMermaidThemeToSource(source: string, theme: MermaidTheme): string {
  if (theme === 'auto') return source
  if (INIT_DIRECTIVE_PREFIX.test(source)) return source

  return `%%{init: {"theme":"${theme}"}}%%\n${source}`
}
