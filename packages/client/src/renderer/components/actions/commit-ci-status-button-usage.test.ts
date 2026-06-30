import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../..')
const localeRoot = resolve(root, 'i18n/locales')
const sources = [
  readFileSync(resolve(root, 'pages/repository/components/commits/row.vue'), 'utf8'),
  readFileSync(resolve(root, 'pages/commit/commit-page.vue'), 'utf8'),
  readFileSync(resolve(root, 'pages/pull-request/components/pull-request-commit-group.vue'), 'utf8'),
]
const dialogSource = readFileSync(resolve(root, 'components/actions/commit-actions-dialog.vue'), 'utf8')
const locales = {
  en: JSON.parse(readFileSync(resolve(localeRoot, 'en.json'), 'utf8')),
  zh: JSON.parse(readFileSync(resolve(localeRoot, 'zh.json'), 'utf8')),
}

describe('commit ci status actions', () => {
  it('uses the shared clickable status trigger on commit surfaces', () => {
    for (const source of sources) {
      expect(source).toContain('CommitCiStatusButton')
      expect(source).not.toMatch(/ciState === 'success'[\s\S]*ciState === 'failure'[\s\S]*Circle/)
    }
  })

  it('uses the stable dialog content surface for the commit actions popup', () => {
    expect(dialogSource).toContain('DialogContent')
    expect(dialogSource).not.toContain('DialogScrollContent')
  })

  it('compiles the commit action dialog description without linked-message syntax errors', () => {
    for (const [locale, messages] of Object.entries(locales)) {
      const i18n = createI18n({
        legacy: false,
        locale,
        messages: {
          [locale]: messages,
        },
      })

      expect(() => i18n.global.t('actions.commitChecks.description', {
        ref: 'memohai/Memoh@71c683f',
      })).not.toThrow()
      expect(i18n.global.t('actions.commitChecks.description', {
        ref: 'memohai/Memoh@71c683f',
      })).toContain('memohai/Memoh@71c683f')
    }
  })
})
