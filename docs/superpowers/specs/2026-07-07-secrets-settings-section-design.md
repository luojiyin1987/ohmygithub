# Secrets & Variables as a Standalone Repository Settings Section

Date: 2026-07-07

## Goal

"Secrets & variables" currently lives as the third tab inside the repository
Settings → Security section, with an Actions / Codespaces / Dependabot
segmented control nested inside the page. Pull it out as its own settings
section in the sidebar, and promote the three scopes to top-level tabs of the
new page.

## Design

### Navigation

- New settings section id `settingsSecrets`, listed after `settingsSecurity`
  in `REPOSITORY_SETTINGS_SECTION_IDS` (sidebar order: General, Access,
  Automation, Security, Secrets & variables, Integrations).
- Sidebar label: "Secrets & variables" / 「密钥与变量」 (the same label the
  old security tab used).
- Security section keeps only Advanced Security and Deploy keys tabs.

### Page structure

- New `settings/secrets/secrets-section.vue`, modeled on
  `security-section.vue`: a `TabSwitcher` at the top with tabs
  `actions` / `codespaces` / `dependabot`, synced with the `settingsSub`
  URL/tab state.
- `secrets-panel.vue` moves from `settings/security/` to `settings/secrets/`.
  Its internal `SegmentedControl` is removed; the active scope now arrives as
  a `scope` prop from the section. Everything else (secrets list, variables
  list shown only for the actions scope, dialogs) is unchanged.

### URLs

- Query token `settings-secrets`; subpages `['actions', 'codespaces',
  'dependabot']` with `actions` as the default (omitted from the URL).
- `settingsSecurity` subpages shrink to `['advanced-security', 'deploy-keys']`.
- Legacy compatibility: `?tab=settings-security&sub=secrets` (persisted tabs /
  old links) is remapped during parsing to `settingsSecrets` with the default
  sub, so restored sessions land on the new page.

### i18n

- Add `repository.sections.settingsSecrets.title`.
- Move `repository.settings.security.secrets.*` to
  `repository.settings.secrets.*`; the old `scopes` labels become `tabs`
  labels, `scopesLabel` becomes `navigation` (TabSwitcher aria label), and the
  section gets its own `error` string. Remove
  `repository.settings.security.tabs.secrets`.

### Testing

- Extend `workspace-url.test.ts`: round-trip for `settings-secrets` with and
  without a sub page, plus the legacy `settings-security&sub=secrets` remap.
